import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

import { EXAMPLES, severityColor, totalChars, type ResolvedExample } from '../demo';

const TYPE_MS = 45;
const AFTER_TYPE_MS = 280;
const HOLD_MS = 3200;
const CROSS_MS = 280;
const LINE_STAGGER_MS = 240;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  return reduced;
}

interface BodyProps {
  example: ResolvedExample;
  active: boolean;
  revealed: boolean;
  instant?: boolean;
  onTyped?: () => void;
}

function DemoBody({ example, active, revealed, instant = false, onTyped }: BodyProps) {
  const total = totalChars(example);
  const [count, setCount] = useState(instant ? total : 0);
  const sentenceRef = useRef<HTMLParagraphElement>(null);
  const markRef = useRef<HTMLElement>(null);
  const layerRef = useRef<HTMLSpanElement>(null);
  const onTypedRef = useRef(onTyped);
  onTypedRef.current = onTyped;

  // A new example starts from nothing, unless we are showing a static one.
  useEffect(() => {
    setCount(instant ? total : 0);
  }, [example, instant, total]);

  // Type the sentence out, one character at a time, only while this body is the
  // visible one. The interval is replaced on every example change.
  useEffect(() => {
    if (instant || !active) return;
    let typed = 0;
    let id: number | undefined;
    const tick = () => {
      typed += 1;
      setCount(typed);
      if (typed < total) {
        id = window.setTimeout(tick, TYPE_MS);
      } else {
        id = window.setTimeout(() => onTypedRef.current?.(), AFTER_TYPE_MS);
      }
    };
    id = window.setTimeout(tick, TYPE_MS);
    return () => window.clearTimeout(id);
  }, [active, instant, example, total]);

  // One decorative bar per line box, measured after the text is complete. The
  // bars are absolutely positioned behind the text, so measuring never moves a
  // character and a wrapped passage is swept line by line.
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.textContent = '';
    if (!revealed || count < total) return;
    const sentence = sentenceRef.current;
    const mark = markRef.current;
    if (!sentence || !mark || typeof mark.getClientRects !== 'function') return;
    const box = sentence.getBoundingClientRect();
    Array.from(mark.getClientRects()).forEach((rect, index) => {
      const bar = document.createElement('span');
      bar.className = 'hl-bar';
      bar.style.left = `${rect.left - box.left}px`;
      bar.style.top = `${rect.top - box.top}px`;
      bar.style.width = `${rect.width}px`;
      bar.style.height = `${rect.height}px`;
      if (instant) {
        bar.classList.add('is-visible');
        layer.appendChild(bar);
      } else {
        bar.style.transitionDelay = `${index * LINE_STAGGER_MS}ms`;
        layer.appendChild(bar);
        window.requestAnimationFrame?.(() => bar.classList.add('is-visible'));
      }
    });
  }, [revealed, count, total, instant, example]);

  let remaining = count;
  const pre = example.before.slice(0, remaining);
  remaining = Math.max(0, remaining - example.before.length);
  const marked = example.mark.slice(0, remaining);
  remaining = Math.max(0, remaining - example.mark.length);
  const post = example.after.slice(0, remaining);
  const typing = !instant && count < total;
  const color = severityColor(example.sev);

  return (
    <div
      className={`demo-body ${active ? '' : 'is-out'}`}
      style={{ '--sev-color': color.color, '--sev-tint': color.tint } as CSSProperties}
      data-sev={example.sev}
    >
      <p
        ref={sentenceRef}
        className="relative m-0 min-h-[4em] font-serif text-[1.02rem] leading-[1.65] text-[#cdc8c0]"
      >
        <span ref={layerRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0" />
        <span className="relative z-[1]">
          {pre}
          <mark ref={markRef} className="bg-transparent px-[3px] py-px text-inherit">
            {marked}
          </mark>
          {post}
          {typing ? <span className="caret" /> : null}
        </span>
      </p>

      <div
        className={`mt-4 grid min-h-[5rem] gap-1.5 transition-[opacity,transform] duration-[220ms] ease-out motion-reduce:transition-none ${
          revealed ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
        }`}
      >
        <span
          className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em]"
          style={{ color: 'var(--sev-color)' }}
        >
          <span className="h-[5px] w-[5px] flex-none rounded-[1px]" style={{ background: 'var(--sev-color)' }} />
          {example.cat}
        </span>
        <p className="m-0 text-[0.85rem] leading-normal text-muted">{example.explain}</p>
      </div>
    </div>
  );
}

export function Demo() {
  const reduced = usePrefersReducedMotion();
  const [start] = useState(() => Math.floor(Math.random() * EXAMPLES.length));
  const [active, setActive] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [shown, setShown] = useState<[number, number]>(() => [
    start,
    (start + 1) % EXAMPLES.length,
  ]);

  const handleTyped = useCallback(() => setRevealed(true), []);

  // Hold the revealed example, then crossfade to the other body.
  useEffect(() => {
    if (reduced || !revealed) return;
    const timer = window.setTimeout(() => {
      setActive((current) => 1 - current);
      setRevealed(false);
    }, HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [reduced, revealed]);

  // Once the outgoing body has faded, give it the following example so it is
  // ready to type when its turn comes again.
  useEffect(() => {
    if (reduced) return;
    const outgoing = 1 - active;
    const timer = window.setTimeout(() => {
      setShown((prev) => {
        const next: [number, number] = [prev[0], prev[1]];
        next[outgoing] = (prev[active] + 1) % EXAMPLES.length;
        return next;
      });
    }, CROSS_MS);
    return () => window.clearTimeout(timer);
  }, [active, reduced]);

  const wrapper = 'mt-6 rounded-card border border-border bg-surface p-[18px] text-left';

  if (reduced) {
    return (
      <div className={wrapper} aria-hidden="true">
        <div className="grid">
          <DemoBody example={EXAMPLES[start]} active revealed instant />
        </div>
      </div>
    );
  }

  return (
    <div className={wrapper} aria-hidden="true">
      <div className="grid">
        {[0, 1].map((slot) => (
          <DemoBody
            key={slot}
            example={EXAMPLES[shown[slot]]}
            active={slot === active}
            revealed={revealed && slot === active}
            onTyped={handleTyped}
          />
        ))}
      </div>
    </div>
  );
}

/** The static equivalent of the demo, for screen readers. */
export function DemoText() {
  return (
    <p className="sr-only">
      Démonstration (animée, décorative) : dans une phrase d’article, Squiggle met en évidence le
      passage problématique et en donne la raison, par domaine. Étude non nommée (robustesse
      factuelle). Faux dilemme (solidité logique). Exagération (cadrage et rhétorique). Source
      anonyme (déontologie). Flou de la langue (soin de la langue).
    </p>
  );
}