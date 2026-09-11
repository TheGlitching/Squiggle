import { Link } from '../router';

const STEPS = [
  {
    title: 'Vous ouvrez l’article',
    text: 'Squiggle lit la page que vous lisez déjà, dans votre navigateur. Il n’a pas besoin de la copier ailleurs.',
  },
  {
    title: 'Il confronte le texte aux sources',
    text: 'Chaque affirmation factuelle est recherchée, chaque lien cité est lu, et ce qui résiste est distingué de ce qui ne résiste pas.',
  },
  {
    title: 'Vous lisez la note et les constats',
    text: 'Une note sur 100, les cinq domaines qui la composent, et pour chaque faiblesse la phrase exacte à laquelle elle se rapporte.',
  },
];

export function Accueil() {
  return (
    <div>
      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid w-full max-w-5xl gap-10 px-5 py-16 sm:py-24 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-accent">
              Lecture critique assistée
            </p>
            <h1 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Sachez ce que vaut ce que vous lisez.
            </h1>
            <p className="mt-5 max-w-prose text-lg text-muted">
              Squiggle examine un article de presse et vous dit ce qui tient : les faits réellement
              sourcés, les affirmations qui ne le sont pas, ce que les preuves contredisent et où le
              vocabulaire fait le travail à la place des faits.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/connexion"
                className="rounded-lg bg-accent px-5 py-3 font-medium text-white shadow-sm hover:bg-accentHover"
              >
                Créer un compte gratuit
              </Link>
              <Link
                to="/tarifs"
                className="rounded-lg border border-border bg-surface px-5 py-3 font-medium hover:border-accent hover:text-accent"
              >
                Voir les tarifs
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted">
              3 analyses offertes. Sans carte bancaire, sans publicité, sans traceur.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
            <p className="font-mono text-xs uppercase tracking-widest text-muted">Exemple de note</p>
            <p className="mt-3 font-serif text-6xl font-semibold text-accent">68</p>
            <p className="text-sm text-muted">Fragile — deux affirmations non étayées, un cadrage orienté.</p>
            <ul className="mt-6 space-y-3 text-sm">
              <li className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <span>Robustesse factuelle</span>
                <span className="font-mono text-muted">24 / 35</span>
              </li>
              <li className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <span>Solidité logique</span>
                <span className="font-mono text-muted">19 / 25</span>
              </li>
              <li className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <span>Cadrage et rhétorique</span>
                <span className="font-mono text-muted">14 / 25</span>
              </li>
            </ul>
            <p className="mt-5 text-xs text-faint">Exemple illustratif, pas une analyse réelle.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-5 py-16">
        <h2 className="font-display text-2xl font-semibold tracking-tight">Comment ça marche</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title} className="rounded-xl border border-border bg-surface p-6">
              <span className="font-mono text-sm text-accent">0{index + 1}</span>
              <h3 className="mt-3 font-display text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="tarifs" className="border-y border-border bg-surface">
        <div className="mx-auto w-full max-w-3xl px-5 py-16 text-center">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Tarifs</h2>
          <p className="mt-3 text-muted">
            Commencez gratuitement. Abonnez-vous seulement si Squiggle vous sert.
          </p>
          <div className="mt-8 grid gap-6 text-left sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background p-6">
              <h3 className="font-display text-lg font-semibold">Découverte</h3>
              <p className="mt-2 font-serif text-3xl font-semibold">3 analyses</p>
              <p className="mt-1 text-sm text-muted">offertes, sans limite de temps</p>
              <ul className="mt-5 space-y-2 text-sm text-muted">
                <li>Les cinq domaines et la note sur 100</li>
                <li>Les constats reliés aux phrases concernées</li>
                <li>Aucune carte bancaire demandée</li>
              </ul>
              <Link
                to="/connexion"
                className="mt-6 block rounded-lg border border-border bg-surface px-4 py-2.5 text-center font-medium hover:border-accent hover:text-accent"
              >
                Commencer
              </Link>
            </div>
            <div className="rounded-2xl border-2 border-accent bg-background p-6">
              <h3 className="font-display text-lg font-semibold">Abonnement mensuel</h3>
              <p className="mt-2 font-serif text-3xl font-semibold">10 analyses / jour</p>
              <p className="mt-1 text-sm text-muted">
                Le montant exact est affiché avant le paiement.
              </p>
              <ul className="mt-5 space-y-2 text-sm text-muted">
                <li>Tout de l’offre Découverte</li>
                <li>Le compteur repart chaque jour</li>
                <li>Résiliable à tout moment, en ligne</li>
              </ul>
              <Link
                to="/connexion"
                className="mt-6 block rounded-lg bg-accent px-4 py-2.5 text-center font-medium text-white hover:bg-accentHover"
              >
                S’abonner
              </Link>
            </div>
          </div>
          <p className="mt-6 text-sm text-muted">
            Un compte Google ou une adresse e-mail suffit. Aucun engagement.
          </p>
        </div>
      </section>
    </div>
  );
}
