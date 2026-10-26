import { Page } from '../components/Layout';
import { Trajet } from '../components/Trajet';
import { HOSTED_ANALYSIS } from '../../../shared/src/hosted/disclosure';

const { modelLabel, inferenceHosts } = HOSTED_ANALYSIS;

/** Who runs the model: the pinned hosts by name, or, until they are pinned, OpenRouter's choice. */
export const INFERENCE_HOSTS_TEXT =
  inferenceHosts.length > 0
    ? inferenceHosts.join(', ')
    : 'des hébergeurs d’inférence choisis par OpenRouter parmi ceux qui servent ce modèle';

/** The inference hosts as a row label: named once pinned, OpenRouter's choice until then. */
export const INFERENCE_HOSTS_LABEL =
  inferenceHosts.length > 0 ? `Hébergeurs d’inférence : ${INFERENCE_HOSTS_TEXT}` : 'Hébergeurs d’inférence (choisis via OpenRouter)';

export const RETENTION = [
  ['Texte de l’article, lu par l’extension ou collé sur le site', 'Mémoire, le temps de l’appel d’audit', 'Jamais écrit'],
  ['Texte collé sur le site, avant l’analyse', 'Votre navigateur, jamais nos serveurs', 'Jusqu’à ce que vous l’effaciez'],
  ['Rapport d’analyse, avec extraits de l’article (cache partagé)', 'Base de données', '30 jours, 500 rapports au plus'],
  ['Analyse en cours (constats, sans l’article)', 'Base de données', '1 heure'],
  ['Journal d’usage : qu’un compte a lancé une analyse, et quand', 'Base de données', '12 mois, sans contenu et sans nommer l’article'],
  ['Compteur d’analyses du jour', 'Base de données', 'Tant que le compte existe'],
  ['Adresse e-mail', 'Base de données', 'Tant que le compte existe'],
  ['Identifiant Google, si connexion Google', 'Base de données', 'Tant que le compte existe'],
  ['Clé publique de votre installation', 'Base de données', 'Tant que vous ne la révoquez pas'],
  ['Jeton d’extension', 'Base de données, en empreinte SHA-256', '90 jours'],
  ['Session web', 'Base de données, en empreinte SHA-256', '30 jours'],
  ['Code de connexion, avec l’adresse IP de la demande', 'Base de données, le code en empreinte SHA-256', '10 minutes'],
  ['Limites de fréquence : une adresse IP ou e-mail et un nombre de demandes dans l’heure', 'Base de données', '2 heures au plus'],
  ['Identifiants Stripe (client, abonnement)', 'Base de données', 'Tant que le compte existe'],
  ['Compteurs de fonctionnement : réponses du cache, échecs par étape d’analyse', 'Base de données', 'Un nombre par jour et par nom d’événement, sans compte et sans article'],
  ['Journaux techniques', 'Cloudflare', 'Aucun texte d’article, aucune adresse d’article en clair'],
] as const;

const SUBPROCESSORS = [
  ['OpenRouter', `Passerelle d’analyse : route chaque requête vers le modèle ${modelLabel}`, 'Le texte de l’article et les extraits des sources citées, sans identité de lecteur'],
  [
    INFERENCE_HOSTS_LABEL,
    `Exécution du modèle ${modelLabel}, un modèle à poids ouverts`,
    'Le texte de l’article et les extraits des sources citées, sans identité de lecteur',
  ],
  ['Google (connexion)', 'Authentification, si vous choisissez « continuer avec Google »', 'Votre identité Google'],
  ['Cloudflare (Workers)', 'Hébergement du serveur', 'Le trafic, sans contenu d’article dans les journaux'],
  ['Neon', 'Base de données', 'Ce que décrit le tableau de conservation'],
  ['Stripe', 'Paiement', 'Votre e-mail et vos données de paiement ; nous ne voyons aucun numéro de carte'],
  ['Brevo', 'Envoi des e-mails de connexion', 'Votre adresse e-mail'],
] as const;

const NEVER = [
  'Aucune donnée n’est vendue.',
  'Aucune donnée n’est utilisée pour entraîner un modèle.',
  'Les données reçues du navigateur ne servent qu’à fournir l’analyse demandée : elles ne sont ni transférées ni utilisées pour autre chose, ni pour de la publicité, ni pour évaluer une solvabilité (exigence « Limited Use » du Chrome Web Store).',
  'Aucune publicité, aucun traceur, aucun mouchard analytique.',
  'Aucun code n’est téléchargé ni exécuté depuis l’extérieur.',
] as const;

const FACTS = [
  [
    'Nous voyons l’article, le temps de l’analyser.',
    'Le texte sert à l’analyse, puis disparaît : aucune table de notre base ne contient de texte d’article. Avec votre propre clé, il part directement chez le fournisseur choisi, jamais chez nous.',
  ],
  [
    'Notre serveur ne va jamais chercher l’article.',
    'Votre navigateur le lui fournit. Un article payant est analysé dans la limite de ce que vous lisez, et l’adresse indiquée à côté d’un texte collé n’est jamais visitée.',
  ],
  [
    'Le rapport est mis en cache et partagé.',
    'Deux lecteurs du même article obtiennent le même rapport, et le second ne consomme rien. Le rapport contient des extraits de l’article (la citation de chaque constat) et un résumé, jamais le texte intégral.',
  ],
] as const;

function Table({ head, rows }: { head: readonly [string, string, string]; rows: ReadonlyArray<readonly [string, string, string]> }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-card bg-surface">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm sm:text-base">
        <thead>
          <tr>
            {head.map((label) => (
              <th key={label} className="px-5 py-4 font-semibold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([first, second, third]) => (
            <tr key={first} className="border-t border-lineSoft align-top">
              <td className="px-5 py-3">{first}</td>
              <td className="px-5 py-3 text-muted">{second}</td>
              <td className="px-5 py-3 text-muted">{third}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Transparence() {
  return (
    <Page title="Transparence" lead="Où va votre article, ce que nous gardons, et à qui. Y compris quand ce n’est pas flatteur.">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-16">
        <section aria-labelledby="trajet-titre">
          <h2 id="trajet-titre" className="m-0 text-2xl font-semibold tracking-tight sm:text-3xl">
            Le trajet d’une analyse
          </h2>
          <div className="mt-6 rounded-card bg-surface p-6 sm:p-8">
            <Trajet />
          </div>
          <p className="mt-6 mb-0 text-base leading-relaxed">
            Le modèle est {modelLabel}, un modèle à poids ouverts, joint par OpenRouter et exécuté par{' '}
            {INFERENCE_HOSTS_TEXT}. Utiliser un modèle à poids ouverts ne signifie pas envoyer le texte vers des
            serveurs en Chine. Squiggle ne traite que des articles publics : le texte de la page que vous lisez, son
            adresse et les pages qu’elle cite. Un texte collé sur le site suit le même trajet. Aucune donnée privée ne
            part vers le modèle, et aucune identité de lecteur n’accompagne une requête.
          </p>
          <dl className="m-0 mt-10 grid gap-8 md:grid-cols-3">
            {FACTS.map(([title, text]) => (
              <div key={title}>
                <dt className="text-lg leading-snug font-semibold">{title}</dt>
                <dd className="m-0 mt-2 text-base leading-relaxed">{text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="conservation-titre">
          <h2 id="conservation-titre" className="m-0 text-2xl font-semibold tracking-tight sm:text-3xl">
            Ce que nous conservons, et combien de temps
          </h2>
          <Table head={['Donnée', 'Où', 'Durée']} rows={RETENTION} />
          <p className="mt-6 mb-0 text-base leading-relaxed">
            Une ligne de journal ne contient qu’un nom d’événement, un nombre, un identifiant opaque ou l’empreinte d’une
            adresse : aucun champ de texte libre n’existe pour y écrire un paragraphe, même par accident. Une requête
            refusée est journalisée par le nom du champ, jamais par sa valeur.
          </p>
          <p className="mt-4 mb-0 text-base leading-relaxed">
            Nous mesurons le lancement avec ce que le serveur détient déjà, jamais avec un traceur : nombre de comptes
            par semaine, analyses terminées, essais menés à terme, abonnements et résiliations (d’après Stripe), réponses
            du cache, échecs par étape, coût moyen d’une analyse. Ce sont des totaux, qui ne désignent ni un lecteur ni
            un article.
          </p>
        </section>

        <section aria-labelledby="sous-traitants-titre">
          <h2 id="sous-traitants-titre" className="m-0 text-2xl font-semibold tracking-tight sm:text-3xl">
            Les sous-traitants
          </h2>
          <Table head={['Sous-traitant', 'Rôle', 'Ce qu’il voit']} rows={SUBPROCESSORS} />
        </section>

        <section aria-labelledby="jamais-titre">
          <h2 id="jamais-titre" className="m-0 text-2xl font-semibold tracking-tight sm:text-3xl">
            Ce qui n’est jamais fait
          </h2>
          <ul className="m-0 mt-6 grid list-none gap-4 p-0">
            {NEVER.map((line) => (
              <li key={line} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 text-base leading-relaxed">
                <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-1 h-5 w-5 text-[#34d399]">
                  <path d="M4 10.5l3.5 3.5L16 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {line}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Page>
  );
}
