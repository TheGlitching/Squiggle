/**
 * The store images. A screenshot is a caption band in the site's type and
 * drawings over a browser window, and the window holds two live pages: the
 * analysed article (`page.html`) and the extension's panel (`panel.html`). The
 * promotional tiles are the mark and the site's hero drawing, with no sentence,
 * as the Chrome Web Store asks of images it shows in every locale.
 *
 * Query: `asset=promo-small|promo-marquee|shot-1..5`.
 */
import '../../web/src/index.css';

import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { Badge } from '../../web/src/components/Brand';
import { DeviceFigure, HeroFigure, StepFigure } from '../../web/src/components/Iso';

interface Shot {
  title: string;
  lead: string;
  figure: ReactNode;
  /** Query strings for the panel and the article. */
  panel: string;
  page: string;
  /** The two ways to start, side by side, in place of the browser window. */
  paths?: boolean;
}

/** One idea per image, in the order the listing tells the story. */
const SHOTS: Record<string, Shot> = {
  'shot-1': {
    title: 'Un deuxième avis sur votre lecture.',
    lead: 'Un clic sur l’article ouvert : les passages fragiles surlignés, leur raison, et une note sur 100.',
    figure: <HeroFigure pins={false} />,
    panel: 'state=report',
    page: '',
  },
  'shot-2': {
    title: 'Chaque constat pointe sa phrase.',
    lead: 'Choisissez un constat : le passage s’éclaire dans l’article. Vous jugez sur pièces.',
    figure: <StepFigure step="rapport" />,
    panel: 'state=report&select=f2',
    page: 'active=f2',
  },
  'shot-3': {
    title: 'Les chiffres confrontés aux sources.',
    lead: 'Avant de mettre un fait en doute, Squiggle lit les sources. Si elles donnent raison à l’article, le doute est retiré.',
    figure: <StepFigure step="sources" />,
    panel: 'state=report&select=f4',
    page: 'active=f4',
  },
  'shot-4': {
    title: 'Cinq questions pour chaque article.',
    lead: 'Faits, logique, cadrage, déontologie et langue : une note par domaine, ce qui tient et ce qui pèche.',
    figure: <StepFigure step="lecture" />,
    panel: 'state=report&expand=robustesse_factuelle&scroll=section:has([data-tour="domain-scores"])',
    page: '',
  },
  'shot-5': {
    title: 'Votre clé, ou un compte.',
    lead: 'Gratuit avec votre propre clé d’API, ou sans réglage avec un compte Squiggle. Rien n’est lu avant votre clic.',
    figure: <DeviceFigure device="navigateur" />,
    panel: 'state=ownkey',
    page: '',
    paths: true,
  },
};

const asset = new URLSearchParams(location.search).get('asset') ?? 'shot-1';

/**
 * A region of the real panel, cut out and enlarged. The offsets are the panel's own
 * layout at 392px (`panel.html?state=ownkey`); the own-key cut starts below its section
 * header and inside its border, whose title the card already says, and stops above the model field, so no
 * model name reaches the listing.
 */
function PanelCut({
  panel,
  top,
  bottom,
  left,
  scale,
}: {
  panel: string;
  top: number;
  bottom: number;
  left: number;
  scale: number;
}) {
  const width = 392 - 2 * left;
  return (
    <div
      className="relative overflow-hidden rounded-[10px]"
      style={{ width: width * scale, height: (bottom - top) * scale }}
    >
      <iframe
        title="Squiggle"
        src={`panel.html?${panel}`}
        className="absolute top-0 left-0 h-[800px] w-[392px] origin-top-left border-0"
        style={{ transform: `scale(${scale}) translate(${-left}px, ${-top}px)` }}
      />
    </div>
  );
}

/** One way to start: what it costs, in a line, over the part of the panel that does it. */
function Path({ kicker, title, text, children }: { kicker: string; title: string; text: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-border bg-surface p-7">
      <p className="m-0 font-sans text-[15px] font-bold tracking-[0.08em] text-accentInk uppercase">{kicker}</p>
      <h2 className="m-0 font-display text-[32px] leading-tight font-semibold tracking-[-0.02em] text-foreground">{title}</h2>
      <p className="m-0 mb-3 text-[19px] leading-snug text-muted">{text}</p>
      <div className="flex flex-1 items-center justify-center">{children}</div>
    </div>
  );
}

function Paths({ panel }: { panel: string }) {
  return (
    <div className="absolute top-[232px] right-[56px] left-[56px] grid grid-cols-2 items-stretch gap-8">
      <Path
        kicker="Gratuit"
        title="Avec votre propre clé d’API"
        text="Anthropic, OpenAI, Google Gemini ou OpenRouter. La clé reste dans votre navigateur."
      >
        <PanelCut panel={panel} top={442} bottom={644} left={28} scale={1.4} />
      </Path>
      <Path
        kicker="Sans réglage"
        title="Avec un compte Squiggle"
        text="3 analyses offertes, sans carte bancaire. Ensuite 4,99 € par mois, sans engagement."
      >
        <PanelCut panel={panel} top={182} bottom={342} left={16} scale={1.4} />
      </Path>
    </div>
  );
}

/** The browser around the two pages: tab strip, address bar, side panel header. */
function Browser({ panel, page }: { panel: string; page: string }) {
  return (
    <div className="absolute top-[212px] right-[40px] left-[40px] h-[640px] overflow-hidden rounded-t-[14px] border border-b-0 border-[#3a3a42] bg-[#1d1d21] shadow-[0_-24px_80px_-24px_rgba(144,97,240,0.45)]">
      <div className="flex h-[46px] items-center gap-4 border-b border-[#2a2a2f] px-4">
        <span className="flex gap-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-3 w-3 rounded-full bg-[#3a3a42]" />
          ))}
        </span>
        <span className="flex h-[30px] flex-1 items-center rounded-full bg-[#121215] px-4 font-sans text-[14px] text-[#a3a1a6]">
          kiosque.example/societe/lecture-une-generation-perdue
        </span>
        <span className="rounded-md bg-[#2c2c33] p-1">
          <Badge className="block h-[22px] w-[22px]" />
        </span>
      </div>
      <div className="flex h-[594px]">
        <iframe title="Article" src={`page.html?${page}`} className="h-full min-w-0 flex-1 border-0 bg-white" />
        <div className="flex w-[392px] shrink-0 flex-col border-l border-[#2a2a2f]">
          <div className="flex h-[36px] items-center gap-2 bg-[#1d1d21] px-3 font-sans text-[13px] text-[#c9c6bf]">
            <Badge className="h-4 w-4" />
            Squiggle
          </div>
          <iframe title="Squiggle" src={`panel.html?${panel}`} className="min-h-0 w-full flex-1 border-0" />
        </div>
      </div>
    </div>
  );
}

function Screenshot({ shot }: { shot: Shot }) {
  return (
    <div className="relative h-[800px] w-[1280px] overflow-hidden bg-background">
      <div className="absolute top-[44px] left-[56px] w-[780px]">
        <h1 className="m-0 font-display text-[50px] leading-[1.02] font-semibold tracking-[-0.035em] text-foreground">
          {shot.title}
        </h1>
        <p className="mt-4 mb-0 max-w-[720px] text-[23px] leading-snug text-muted text-pretty">{shot.lead}</p>
      </div>
      {/* Held to the band above the window, whatever the drawing's proportions. */}
      <div className="absolute top-[18px] right-[64px] flex h-[180px] w-[250px] justify-center [&>svg]:h-full [&>svg]:w-auto">
        {shot.figure}
      </div>
      {shot.paths ? <Paths panel={shot.panel} /> : <Browser panel={shot.panel} page={shot.page} />}
    </div>
  );
}

function Promo({ width, height }: { width: number; height: number }) {
  const marquee = width > 1000;
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden bg-background"
      style={{
        width,
        height,
        backgroundImage:
          'radial-gradient(ellipse at 62% 58%, rgba(144, 97, 240, 0.55), rgba(144, 97, 240, 0.12) 45%, transparent 70%)',
      }}
    >
      {marquee ? (
        <div className="flex w-full items-center justify-between px-[120px]">
          <span className="flex items-center gap-7">
            <Badge className="h-[132px] w-[132px]" />
            <span className="font-display text-[112px] leading-none font-semibold tracking-[-0.04em] text-foreground">
              squiggle
            </span>
          </span>
          <div className="w-[560px]">
            <HeroFigure pins={false} />
          </div>
        </div>
      ) : (
        <div className="flex w-full items-center justify-between pr-[18px] pl-[44px]">
          <Badge className="h-[84px] w-[84px] shrink-0" />
          <div className="w-[290px]">
            <HeroFigure pins={false} />
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  if (asset === 'promo-small') return <Promo width={440} height={280} />;
  if (asset === 'promo-marquee') return <Promo width={1400} height={560} />;
  return <Screenshot shot={SHOTS[asset]} />;
}

async function main() {
  document.body.style.margin = '0';
  createRoot(document.getElementById('frame')!).render(<App />);
  await new Promise((frame) => setTimeout(frame, 0));
  // The two pages in the window report when they have finished drawing.
  const frames = [...document.querySelectorAll('iframe')];
  for (let i = 0; i < 400; i += 1) {
    const states = frames.map((f) => f.contentDocument?.documentElement?.dataset.ready);
    if (states.includes('error')) throw new Error('a page in the window failed to render');
    if (states.every((s) => s === 'true')) break;
    await new Promise((tick) => setTimeout(tick, 25));
  }
  await document.fonts.ready;
  document.documentElement.dataset.ready = 'true';
}

main().catch((err) => {
  document.documentElement.dataset.ready = 'error';
  console.error(err);
});
