import { BrandLockup } from '../components/Brand';
import { Demo, DemoText } from '../components/Demo';
import { CHROME_URL, FIREFOX_URL, installUrlFor } from '../install';
import { Link } from '../router';

const GITHUB_URL = 'https://github.com/TheGlitching/Squiggle';

const PERKS = [
  '10 analyses par jour',
  'Aucune publicité',
  'Aucun traceur',
  'Tout reste privé',
  'Sécurisé',
];

const PRIMARY_BUTTON =
  'flex items-center justify-center gap-2 rounded-control bg-accent px-[18px] py-[14px] text-[15px] font-semibold text-white transition-[transform,background-color,border-color,color] duration-[160ms] ease-out hover:bg-accentHover active:scale-[0.97] motion-reduce:active:scale-100';
const SECONDARY_BUTTON =
  'flex items-center justify-center gap-2 rounded-control border border-border bg-transparent px-[18px] py-[14px] text-[15px] font-medium text-foreground transition-[transform,background-color,border-color,color] duration-[160ms] ease-out hover:border-accent hover:text-accentInk active:scale-[0.97] motion-reduce:active:scale-100';
const QUIET_LINK =
  'border-b border-[#4a4742] pb-px text-muted transition-colors duration-[160ms] ease-out hover:border-accent hover:text-accentInk';

export function Accueil() {
  const installUrl = installUrlFor(typeof navigator === 'undefined' ? '' : navigator.userAgent);

  return (
    <div className="flex min-h-screen flex-col px-6 py-10 text-foreground max-[380px]:px-5 max-[380px]:py-7">
      <main className="mx-auto w-full max-w-hero">
        <header className="mb-[26px] flex items-center justify-between gap-4">
          <Link to="/" aria-label="Squiggle, accueil">
            <BrandLockup />
          </Link>
          <Link to="/connexion" className={`flex-none font-mono text-xs tracking-[0.06em] ${QUIET_LINK}`}>
            Se connecter
          </Link>
        </header>

        <p className="mt-[22px] max-w-[34ch] text-[1.02rem] leading-normal text-muted">
          Analyse l’article que vous lisez et montre ce qui ne tient pas.
        </p>

        <Demo />
        <DemoText />

        <div className="mt-[30px] grid gap-3">
          <div className="grid gap-[9px]">
            {installUrl ? (
              <a href={installUrl} className={PRIMARY_BUTTON}>
                Installer l’extension
              </a>
            ) : (
              <p className="m-0 text-center text-[12.5px] leading-normal text-faint">
                Disponible pour{' '}
                <a href={CHROME_URL} className={QUIET_LINK}>
                  Chrome
                </a>{' '}
                et{' '}
                <a href={FIREFOX_URL} className={QUIET_LINK}>
                  Firefox
                </a>
                .
              </p>
            )}
            <p className="m-0 text-center text-[12.5px] leading-[1.4] text-faint">
              Gratuit à vie avec votre propre clé API.
            </p>
          </div>

          <Link to="/connexion" className={SECONDARY_BUTTON}>
            S’abonner : 0,16 €/jour
          </Link>
        </div>
        <p className="mt-2.5 text-center text-[12.5px] leading-[1.4] text-faint">
          soit 4,99 €/mois, sans engagement
        </p>

        <ul className="mt-[18px] grid list-none gap-[9px] p-0 pl-0.5">
          {PERKS.map((perk) => (
            <li key={perk} className="flex items-center gap-2.5 text-sm text-muted">
              <span aria-hidden="true" className="h-[5px] w-[5px] flex-none rounded-[1px] bg-accent" />
              {perk}
            </li>
          ))}
        </ul>

        <p className="mt-[34px] border-t border-lineSoft pt-5 text-[13px] text-faint">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className={QUIET_LINK}
          >
            Tout est ouvert. Le code source est sur GitHub{' '}
            <span aria-hidden="true" className="font-mono">
              ↗
            </span>
          </a>
        </p>
      </main>
    </div>
  );
}