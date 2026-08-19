#!/usr/bin/env python3
"""Rasterise the Squiggle mark to PNG with real alpha, using only the stdlib.

No SVG rasteriser is installed here and headless Chrome refused, but the mark is
flat geometry - a rounded badge, two text bars and a wave - so rendering it
directly is cheaper and more predictable than more browser plumbing.

Everything is authored once in a 128-unit square and scaled exactly once, at
draw time. Edges come from supersampling and a box downsample rather than
hand-rolled coverage maths, which is what keeps the 16px rendering readable.
"""
import math
import os
import struct
import zlib

GRID = 128  # the single coordinate space the mark is authored in
SS = 4      # supersample factor, averaged away before writing

PAPER = (251, 249, 245)  # the panel's newsprint
CARMINE = (158, 42, 43)  # the editorial red pen

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src/assets")
STORE_OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "store")

# The store shows the 128px icon from the package, and asks for the artwork to
# occupy 96x96 with transparent padding around it and no edge of its own, so it
# sits at the same visual weight as every other icon on the page. Toolbar sizes
# want the opposite - they are small enough that padding just wastes them - so
# only the 128 is inset.
STORE_ICON_ARTWORK = 96

# A carmine badge carries the bars and the wave in paper, so the icon keeps its
# contrast on a light and a dark toolbar alike; a dark mark on a pale badge
# dissolves into one of the two.
BADGE = (4, 4, 124, 124, 30)  # x0, y0, x1, y1, corner radius
BARS = ((30, 42, 98, 54), (30, 64, 78, 76))
WAVE = dict(x0=28, x1=100, y=99, amplitude=8, stroke=10, cycles=1.5)


def wave_points(samples=320):
    """The proofreader's wave, as a dense polyline in grid units."""
    span = WAVE["x1"] - WAVE["x0"]
    return [
        (
            WAVE["x0"] + span * (i / samples),
            WAVE["y"] + WAVE["amplitude"] * math.sin((i / samples) * WAVE["cycles"] * 2 * math.pi),
        )
        for i in range(samples + 1)
    ]


def inside_badge(x, y):
    """Rounded-rectangle test in grid units."""
    x0, y0, x1, y1, r = BADGE
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    cx = x0 + r if x < x0 + r else (x1 - r if x > x1 - r else x)
    cy = y0 + r if y < y0 + r else (y1 - r if y > y1 - r else y)
    if cx == x or cy == y:
        return True
    return math.hypot(x - cx, y - cy) <= r


def render(size):
    """An RGBA pixel list, size x size, antialiased by supersampling."""
    hi = size * SS
    scale = hi / GRID
    badge = bytearray(hi * hi)
    marks = bytearray(hi * hi)

    for py in range(hi):
        gy = (py + 0.5) / scale
        row = py * hi
        for px in range(hi):
            if inside_badge((px + 0.5) / scale, gy):
                badge[row + px] = 1

    for (bx0, by0, bx1, by1) in BARS:
        for py in range(max(0, int(by0 * scale)), min(hi, int(by1 * scale) + 1)):
            row = py * hi
            for px in range(max(0, int(bx0 * scale)), min(hi, int(bx1 * scale) + 1)):
                marks[row + px] = 1

    # Stamp a disc along the wave: the curve has a few hundred samples, the
    # canvas has far more, so walking the curve is the cheaper direction.
    radius = (WAVE["stroke"] / 2) * scale
    reach = int(math.ceil(radius))
    for (gx, gy) in wave_points():
        cx, cy = gx * scale, gy * scale
        for dy in range(-reach, reach + 1):
            py = int(cy) + dy
            if not 0 <= py < hi:
                continue
            row = py * hi
            for dx in range(-reach, reach + 1):
                px = int(cx) + dx
                if 0 <= px < hi and math.hypot(dx, dy) <= radius:
                    marks[row + px] = 1

    area = SS * SS
    out = []
    for y in range(size):
        for x in range(size):
            cover = mark = 0
            for sy in range(SS):
                row = (y * SS + sy) * hi
                for sx in range(SS):
                    i = row + x * SS + sx
                    if badge[i]:
                        cover += 1
                        if marks[i]:
                            mark += 1
            if cover == 0:
                out.append((0, 0, 0, 0))
                continue
            t = mark / cover
            out.append(
                (
                    int(CARMINE[0] * (1 - t) + PAPER[0] * t),
                    int(CARMINE[1] * (1 - t) + PAPER[1] * t),
                    int(CARMINE[2] * (1 - t) + PAPER[2] * t),
                    int(255 * cover / area),
                )
            )
    return out


def write_png(path, pixels, width, height=None):
    """Colour type 6: four bytes per pixel, matching the IHDR it declares."""
    height = width if height is None else height
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0, once per scanline
        for x in range(width):
            raw += bytes(pixels[y * width + x])

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    with open(path, "wb") as fh:
        fh.write(
            b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
            + chunk(b"IEND", b"")
        )


def write_svg(path):
    """The vector source, so the mark can be re-scaled without re-authoring."""
    x0, y0, x1, y1, r = BADGE
    paper = "#%02X%02X%02X" % PAPER
    bars = "".join(
        f'<rect x="{a}" y="{b}" width="{c - a}" height="{d - b}" rx="{(d - b) / 2}" fill="{paper}"/>'
        for (a, b, c, d) in BARS
    )
    # The wave is drawn as a chain of quadratic half-cycles, so a fractional
    # cycle count is expressed as an odd number of halves.
    halves = round(WAVE["cycles"] * 2)
    half = (WAVE["x1"] - WAVE["x0"]) / halves
    swing = WAVE["amplitude"] * 2
    path_d = f'M{WAVE["x0"]} {WAVE["y"]} ' + " ".join(
        f'q{half / 2} {-swing if i % 2 == 0 else swing} {half} 0' for i in range(halves)
    )
    with open(path, "w") as fh:
        fh.write(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {GRID} {GRID}">'
            f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" rx="{r}" '
            f'fill="#%02X%02X%02X"/>' % CARMINE
            + bars
            + f'<path d="{path_d}" fill="none" stroke="{paper}" '
            f'stroke-width="{WAVE["stroke"]}" stroke-linecap="round"/></svg>\n'
        )


def inset(pixels, artwork_size, canvas_size):
    """Centre a rendered mark on a larger transparent canvas.

    The store asks for the artwork to occupy 96 of a 128px image so every listing
    icon carries the same visual weight, and for the image to bring no edge of its
    own. Rendering small and padding is what produces that, rather than scaling a
    full-bleed icon down and leaving it flush to the border.
    """
    pad = (canvas_size - artwork_size) // 2
    out = [(0, 0, 0, 0)] * (canvas_size * canvas_size)
    for y in range(artwork_size):
        for x in range(artwork_size):
            out[(y + pad) * canvas_size + (x + pad)] = pixels[y * artwork_size + x]
    return out


def render_promo(width, height, mark_height):
    """A promotional tile: the mark in paper, on a full bleed of carmine.

    The store's guidance for these is to communicate the brand rather than show
    the interface, to avoid text, to fill the region, and to survive being halved.
    A saturated field carrying only the mark does all four, and needs no badge
    outline because the field already is the badge.
    """
    ss = 2
    hi_w, hi_h = width * ss, height * ss
    scale = (mark_height * ss) / GRID
    off_x = (hi_w - GRID * scale) / 2
    off_y = (hi_h - GRID * scale) / 2

    marks = bytearray(hi_w * hi_h)

    for (bx0, by0, bx1, by1) in BARS:
        for py in range(int(off_y + by0 * scale), int(off_y + by1 * scale) + 1):
            if not 0 <= py < hi_h:
                continue
            row = py * hi_w
            for px in range(int(off_x + bx0 * scale), int(off_x + bx1 * scale) + 1):
                if 0 <= px < hi_w:
                    marks[row + px] = 1

    radius = (WAVE["stroke"] / 2) * scale
    reach = int(math.ceil(radius))
    for (gx, gy) in wave_points():
        cx, cy = off_x + gx * scale, off_y + gy * scale
        for dy in range(-reach, reach + 1):
            py = int(cy) + dy
            if not 0 <= py < hi_h:
                continue
            row = py * hi_w
            for dx in range(-reach, reach + 1):
                px = int(cx) + dx
                if 0 <= px < hi_w and math.hypot(dx, dy) <= radius:
                    marks[row + px] = 1

    area = ss * ss
    out = []
    for y in range(height):
        for x in range(width):
            mark = 0
            for sy in range(ss):
                row = (y * ss + sy) * hi_w
                for sx in range(ss):
                    if marks[row + x * ss + sx]:
                        mark += 1
            t = mark / area
            out.append(
                (
                    int(CARMINE[0] * (1 - t) + PAPER[0] * t),
                    int(CARMINE[1] * (1 - t) + PAPER[1] * t),
                    int(CARMINE[2] * (1 - t) + PAPER[2] * t),
                    255,
                )
            )
    return out


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(STORE_OUT, exist_ok=True)

    for size in (16, 32, 48):
        write_png(os.path.join(OUT, f"icon-{size}.png"), render(size), size)

    # The 128 is the one the store displays, so it follows the store's padding.
    write_png(
        os.path.join(OUT, "icon-128.png"),
        inset(render(STORE_ICON_ARTWORK), STORE_ICON_ARTWORK, 128),
        128,
    )
    write_svg(os.path.join(OUT, "icon.svg"))
    print("wrote", ", ".join(f"icon-{s}.png" for s in (16, 32, 48, 128)), "and icon.svg")

    for (w, h, mark, name) in ((440, 280, 205, "promo-small-440x280"), (1400, 560, 410, "promo-marquee-1400x560")):
        write_png(os.path.join(STORE_OUT, f"{name}.png"), render_promo(w, h, mark), w, h)
        print(f"wrote store/{name}.png")
