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

PAPER = (250, 249, 245)  # the panel's newsprint, #faf9f5
# The brand accent, #9061f0: `darkTheme.accent` in src/ui/tokens/colors.ts. It is
# violet because no severity tone is, so the mark never reads as a verdict; the
# paper marks on it hold 3.87:1, above the 3:1 a graphic needs.
ACCENT = (144, 97, 240)

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src/assets")
WEB_OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web/public")

# The store shows the 128px icon from the package, and asks for the artwork to
# occupy 96x96 with transparent padding around it and no edge of its own, so it
# sits at the same visual weight as every other icon on the page. Toolbar sizes
# want the opposite - they are small enough that padding just wastes them - so
# only the 128 is inset.
STORE_ICON_ARTWORK = 96

# A violet badge carries two lines of text and the proofreader's wave under them,
# all in paper, so the icon keeps its contrast on a light and a dark toolbar
# alike; a dark mark on a pale badge dissolves into one of the two. The same
# geometry is inlined by `src/ui/components/SquiggleBadge.tsx` and
# `web/src/components/Brand.tsx`, and `tests/brandMark.test.ts` fails when a copy
# drifts from what this script writes.
BADGE = (4, 4, 124, 124, 30)  # x0, y0, x1, y1, corner radius
BARS = ((30, 30, 98, 43), (30, 52, 80, 65))
WAVE = dict(x0=35, x1=95, y=87, amplitude=7, stroke=10, halves=3)


def wave_halves():
    """The wave as quadratic half-cycles: (control x, control y, end x, end y).

    The first half rises, then they alternate. A quadratic peaks at half its
    control offset, so the control sits at twice the amplitude.
    """
    half = (WAVE["x1"] - WAVE["x0"]) / WAVE["halves"]
    out, x = [], WAVE["x0"]
    for i in range(WAVE["halves"]):
        swing = -2 * WAVE["amplitude"] if i % 2 == 0 else 2 * WAVE["amplitude"]
        out.append((x + half / 2, WAVE["y"] + swing, x + half, WAVE["y"]))
        x += half
    return out


def wave_path():
    """The same curve as an SVG path, so the vector and the raster cannot differ."""
    num = lambda v: ("%.2f" % v).rstrip("0").rstrip(".")
    d = f'M{num(WAVE["x0"])} {num(WAVE["y"])}'
    for (cx, cy, ex, ey) in wave_halves():
        d += f" Q{num(cx)} {num(cy)} {num(ex)} {num(ey)}"
    return d


def wave_points(per_half=120):
    """The wave as a dense polyline in grid units, sampled from the quadratics."""
    pts, x0, y0 = [], WAVE["x0"], WAVE["y"]
    for (cx, cy, ex, ey) in wave_halves():
        for i in range(per_half + 1):
            t = i / per_half
            pts.append(
                (
                    (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t**2 * ex,
                    (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t**2 * ey,
                )
            )
        x0, y0 = ex, ey
    return pts


def inside_bar(x, y, bar):
    """Pill test in grid units: a bar is as round-ended as its SVG rx says."""
    x0, y0, x1, y1 = bar
    r = (y1 - y0) / 2
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    cx = x0 + r if x < x0 + r else (x1 - r if x > x1 - r else x)
    return math.hypot(x - cx, y - (y0 + r)) <= r


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

    for bar in BARS:
        bx0, by0, bx1, by1 = bar
        for py in range(max(0, int(by0 * scale)), min(hi, int(by1 * scale) + 1)):
            row = py * hi
            for px in range(max(0, int(bx0 * scale)), min(hi, int(bx1 * scale) + 1)):
                if inside_bar((px + 0.5) / scale, (py + 0.5) / scale, bar):
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
                    int(ACCENT[0] * (1 - t) + PAPER[0] * t),
                    int(ACCENT[1] * (1 - t) + PAPER[1] * t),
                    int(ACCENT[2] * (1 - t) + PAPER[2] * t),
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


def svg_markup(crop=False):
    """The vector source. `crop` trims the padding so the tile is the whole image.

    The store icon is inset inside the 128 grid; every in-product use wants the
    tile flush to its box, which is the 4..124 window of the same grid.
    """
    x0, y0, x1, y1, r = BADGE
    paper = "#%02x%02x%02x" % PAPER
    accent = "#%02x%02x%02x" % ACCENT
    bars = "".join(
        f'<rect x="{a}" y="{b}" width="{c - a}" height="{d - b}" rx="{(d - b) / 2:g}" fill="{paper}"/>'
        for (a, b, c, d) in BARS
    )
    view = f"{x0} {y0} {x1 - x0} {y1 - y0}" if crop else f"0 0 {GRID} {GRID}"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" role="img" aria-label="Squiggle">'
        f"<title>Squiggle</title>"
        f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" rx="{r}" fill="{accent}"/>'
        + bars
        + f'<path d="{wave_path()}" fill="none" stroke="{paper}" '
        f'stroke-width="{WAVE["stroke"]}" stroke-linecap="round" stroke-linejoin="round"/></svg>\n'
    )


def write_svg(path, crop=False):
    with open(path, "w") as fh:
        fh.write(svg_markup(crop))


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


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)

    for size in (16, 32, 48):
        write_png(os.path.join(OUT, f"icon-{size}.png"), render(size), size)

    # The 128 is the one the store displays, so it follows the store's padding.
    write_png(
        os.path.join(OUT, "icon-128.png"),
        inset(render(STORE_ICON_ARTWORK), STORE_ICON_ARTWORK, 128),
        128,
    )
    write_svg(os.path.join(OUT, "icon.svg"), crop=True)
    print("wrote", ", ".join(f"icon-{s}.png" for s in (16, 32, 48, 128)), "and icon.svg")

    # The website's favicons are the same mark, flush to the box like the 16/32/48.
    os.makedirs(WEB_OUT, exist_ok=True)
    write_svg(os.path.join(WEB_OUT, "favicon.svg"), crop=True)
    write_png(os.path.join(WEB_OUT, "favicon-32.png"), render(32), 32)
    print("wrote web/public/favicon.svg and favicon-32.png")
