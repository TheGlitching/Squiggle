/**
 * Fig. 1, the reading: an article lies on the table, Squiggle's tile passes
 * over it, and each fragile passage is marked as it goes; the report card
 * beside it fills in. Pressing "Relire" runs it; the drawing is the same five
 * passages and the same 61 as the example in the hero.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";

import {
  DOMAINS,
  EXAMPLES,
  HERO_REPORT,
  SEVERITY_COLORS,
  type HighlightSeverity,
} from "../demo";
import { useInView } from "../inView";
import { Box, Plate, projection } from "./Iso";

const p = projection(311, 112);
const SCORE = HERO_REPORT.marks.reduce((sum, mark) => sum + mark, 0);
const FRAGILE = EXAMPLES.filter(
  (example) => example.category !== "point-fort",
).length;

/** The sheet's text lines: [width] per line, in lid units. */
const LINES = [164, 150, 164, 120, 164, 158, 164, 96, 164, 140, 72];
const LINE_Y = (index: number) => 62 + index * 15;

/** Where each passage sits on the sheet: line, start, width, in the order the tile reaches them. */
const MARKS: Array<{
  line: number;
  x: number;
  w: number;
  tone: HighlightSeverity;
}> = [
  { line: 1, x: 70, w: 44, tone: EXAMPLES[0].sev },
  { line: 2, x: 18, w: 96, tone: EXAMPLES[1].sev },
  { line: 4, x: 92, w: 72, tone: EXAMPLES[2].sev },
  { line: 6, x: 18, w: 132, tone: EXAMPLES[3].sev },
  { line: 8, x: 18, w: 52, tone: EXAMPLES[4].sev },
  { line: 9, x: 40, w: 100, tone: EXAMPLES[5].sev },
];

/** The tile's travel along the sheet, in lid units. */
const TRAVEL = 128;
const RUN_MS = 1700;

type Stage = "idle" | "running" | "done";

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function FigRelecture() {
  const [stage, setStage] = useState<Stage>("idle");
  const [shown, setShown] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // It reads once by itself when it comes into view; with reduced motion it waits to be asked.
  const stageRef = useRef<Stage>(stage);
  stageRef.current = stage;
  const seen = useInView<HTMLDivElement>(() => {
    if (stageRef.current === "idle" && !reducedMotion())
      timer.current = window.setTimeout(run, 400);
  }, 0.5);

  // The score counts up while the tile reads, so the card fills in step with the sheet.
  useEffect(() => {
    if (stage === "idle") return setShown(0);
    if (stage === "done") return setShown(SCORE);
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / RUN_MS);
      setShown(Math.round(SCORE * t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [stage]);

  function run() {
    window.clearTimeout(timer.current);
    if (stage !== "idle") return setStage("idle");
    if (reducedMotion()) return setStage("done");
    setStage("running");
    timer.current = window.setTimeout(() => setStage("done"), RUN_MS + 120);
  }

  const [dx, dy] = p.shift(0, stage === "idle" ? 0 : TRAVEL, 0);
  const travel = { transform: `translate(${dx}px, ${dy}px)` } as CSSProperties;
  const readout =
    stage === "idle"
      ? "Pas encore relu"
      : stage === "running"
        ? "Relecture en cours…"
        : `${FRAGILE} passages fragiles, 1 point fort · ${SCORE} sur 100`;

  return (
    <div ref={seen}>
      <Plate
        label="Figure : la relecture d’un article par Squiggle"
        readout={readout}
        control={
          <button
            type="button"
            onClick={run}
            className="iso-button"
            aria-pressed={stage !== "idle"}
          >
            {stage === "idle" ? "Relire l’article" : "Recommencer"}
          </button>
        }
      >
        <svg
          viewBox="0 0 540 370"
          className={`iso block h-auto w-full ${stage === "idle" ? "" : "is-on"} ${stage === "running" ? "is-running" : ""}`}
          role="img"
          aria-label={`Un article posé à plat. Squiggle le parcourt, surligne ${FRAGILE} passages fragiles et un point fort, et note l’article ${SCORE} sur 100.`}
        >
          {/* The article, flat on the table. */}
          <Box
            p={p}
            x={0}
            y={0}
            z={0}
            w={200}
            d={260}
            h={4}
            r={6}
            lid="iso-face iso-paper"
            top={
              <>
                <rect
                  x={18}
                  y={20}
                  width={130}
                  height={10}
                  rx={3}
                  className="iso-ink"
                />
                <rect
                  x={18}
                  y={35}
                  width={84}
                  height={10}
                  rx={3}
                  className="iso-ink"
                />
                {LINES.map((width, index) => (
                  <rect
                    key={index}
                    x={18}
                    y={LINE_Y(index)}
                    width={width}
                    height={5}
                    rx={2.5}
                    className="iso-text"
                  />
                ))}
                {MARKS.map((mark, index) => {
                  const { color, tint } = SEVERITY_COLORS[mark.tone];
                  return (
                    <g
                      key={index}
                      className="iso-mark"
                      style={
                        {
                          "--delay": `${180 + (index * RUN_MS) / MARKS.length}ms`,
                        } as CSSProperties
                      }
                    >
                      <rect
                        x={mark.x - 2}
                        y={LINE_Y(mark.line) - 4}
                        width={mark.w + 4}
                        height={12}
                        rx={3}
                        fill={tint}
                      />
                      <rect
                        x={mark.x - 2}
                        y={LINE_Y(mark.line) + 7}
                        width={mark.w + 4}
                        height={1.8}
                        fill={color}
                      />
                    </g>
                  );
                })}
              </>
            }
          />

          {/* The line being read, under the tile. */}
          <g className="iso-travel" style={travel}>
            <g transform={p.top(0, 100, 4)}>
              <rect
                x={8}
                y={0}
                width={184}
                height={14}
                rx={4}
                className="iso-beam"
              />
            </g>
            <Box
              p={p}
              x={40}
              y={84}
              z={42}
              w={56}
              d={44}
              h={8}
              r={10}
              lid="iso-face iso-accent"
              top={
                <g transform="translate(10 7) scale(0.3)">
                  <rect
                    x={26}
                    y={26}
                    width={68}
                    height={13}
                    rx={6.5}
                    className="iso-glyph"
                  />
                  <rect
                    x={26}
                    y={48}
                    width={50}
                    height={13}
                    rx={6.5}
                    className="iso-glyph"
                  />
                  <path
                    d="M31 83 Q41 69 51 83 Q61 97 71 83 Q81 69 91 83"
                    fill="none"
                    strokeWidth={10}
                    strokeLinecap="round"
                    className="iso-glyph-line"
                  />
                </g>
              }
            />
          </g>

          {/* The report card, standing beside the article. */}
          <Box
            p={p}
            x={232}
            y={20}
            z={0}
            w={10}
            d={190}
            h={210}
            r={8}
            side={
              <g className="iso-card">
                <text x={18} y={58} className="iso-score">
                  {stage === "idle" ? "–" : shown}
                </text>
                <text x={18} y={78} className="iso-small">
                  sur 100
                </text>
                <text
                  x={18}
                  y={102}
                  className="iso-band"
                  fill={SEVERITY_COLORS.warning.text}
                >
                  {stage === "done" ? "Article fragile" : " "}
                </text>
                {DOMAINS.map(([label, weight], index) => (
                  <g
                    key={label}
                    transform={`translate(18 ${124 + index * 15})`}
                  >
                    <rect
                      width={154}
                      height={5}
                      rx={2.5}
                      className="iso-track"
                    />
                    <rect
                      width={154}
                      height={5}
                      rx={2.5}
                      className="iso-fill"
                      style={
                        {
                          "--fill": `${(HERO_REPORT.marks[index] / weight).toFixed(3)}`,
                          "--delay": `${300 + index * 160}ms`,
                        } as CSSProperties
                      }
                    />
                  </g>
                ))}
              </g>
            }
          />

          {/* The key that starts it. */}
          <g
            className={`iso-press ${stage !== "idle" ? "down" : ""}`}
            onClick={run}
            aria-hidden="true"
          >
            <Box
              p={p}
              x={12}
              y={292}
              z={0}
              w={74}
              d={34}
              h={12}
              r={6}
              top={
                <text x={14} y={22} className="iso-key-label">
                  Relire
                </text>
              }
            />
          </g>
        </svg>
      </Plate>
    </div>
  );
}
