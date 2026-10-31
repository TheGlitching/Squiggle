import { SquiggleMark } from '../components/Iso';
import { Page } from '../components/Layout';
import { Trajet } from '../components/Trajet';
import { Link } from '../router';
import { HOSTED_ANALYSIS } from '../../../shared/src/hosted/disclosure';

const { inferenceHosts, webSearch } = HOSTED_ANALYSIS;

/**
 * Who runs the model and who runs the web searches, for the privacy policy,
 * which must name its processors: the hosts every hosted request is
 * pinned to, and the search engine. This page describes them without naming
 * them, because the model changes.
 */
export const INFERENCE_HOSTS_LABEL = `Hébergeurs du modèle : ${inferenceHosts.map((host) => host.name).join(', ')}`;
export const WEB_SEARCH_LABEL = `Recherche web : ${webSearch.name}`;

export const RETENTION = [
  [
    'Texte de l’article, lu par l’extension ou collé sur le site',
    'Mémoire, le temps de l’appel d’audit',
    'Jamais écrit',
  ],
  [
    'Texte collé sur le site, avant l’analyse',
    'Votre navigateur, jamais nos serveurs',
    'Jusqu’à ce que vous l’effaciez',
  ],
  [
    'Captures d’écran et PDF importés sur le site, partagés vers l’appli, ou lus par l’extension',
    'Votre appareil, qui en lit le texte ; aucune image, aucun fichier n’est envoyé',
    'Le temps de la lecture',
  ],
  [
    'Séance du mode classe : l’article et sa préparation',
    'L’onglet de votre navigateur, et le fichier de séance que vous téléchargez ; jamais nos serveurs',
    'Jusqu’à la fermeture de l’onglet ; le fichier, tant que vous le gardez',
  ],
  [
    'Rapport d’analyse, avec extraits de l’article (cache partagé)',
    'Base de données',
    '30 jours, 500 rapports au plus',
  ],
  ['Analyse en cours (constats, sans l’article)', 'Base de données', '1 heure'],
  [
    'Journal d’usage : qu’un compte a lancé une analyse, et quand',
    'Base de données',
    '12 mois, sans contenu et sans nommer l’article',
  ],
  ['Compteur d’analyses du jour', 'Base de données', 'Tant que le compte existe'],
  ['Adresse e-mail', 'Base de données', 'Tant que le compte existe'],
  ['Identifiant Google, si connexion Google', 'Base de données', 'Tant que le compte existe'],
  ['Clé publique de votre installation', 'Base de données', 'Tant que vous ne la révoquez pas'],
  ['Jeton d’extension', 'Base de données, en empreinte SHA-256', '90 jours'],
  ['Session web', 'Base de données, en empreinte SHA-256', '30 jours'],
  ['Code de connexion, avec l’adresse IP de la demande', 'Base de données, le code en empreinte SHA-256', '10 minutes'],
  [
    'Limites de fréquence : une adresse IP ou e-mail et un nombre de demandes dans l’heure',
    'Base de données',
    '2 heures au plus',
  ],
  [
    'Analyse sans compte : l’empreinte SHA-256 de votre adresse IP et l’heure de l’analyse, pour s’en tenir à une seule',
    'Base de données',
    '90 jours après l’analyse',
  ],
  ['Identifiants Stripe (client, abonnement)', 'Base de données', 'Tant que le compte existe'],
  [
    'Compteurs de fonctionnement et d’audience : réponses du cache, échecs par étape d’analyse, visites par un lien de campagne, boutons utilisés, constats signalés comme erronés (catégorie et motif)',
    'Base de données',
    'Un nombre par jour et par nom d’événement, sans compte et sans article',
  ],
  ['Journaux techniques', 'Cloudflare', 'Aucun texte d’article, aucune adresse d’article en clair'],
] as const;

const SUBPROCESSORS = [
  [
    'Fournisseur du modèle d’IA',
    'Exécution de l’analyse par un modèle d’IA, en Europe en priorité, aux États-Unis en secours',
    'Le texte de l’article et les extraits des sources citées, sans identité de lecteur',
  ],
  [
    'Moteur de recherche web',
    'Recherches de l’étape de vérification, depuis les États-Unis',
    'Les requêtes de recherche rédigées par le modèle à partir des constats, jamais l’article ni votre identité',
  ],
  ['Google (connexion)', 'Authentification, si vous choisissez « continuer avec Google »', 'Votre identité Google'],
  [
    'Cloudflare (Workers, Web Analytics)',
    'Hébergement du serveur et du site, mesure d’audience du site',
    'Le trafic, sans contenu d’article dans les journaux ; pour l’audience, des totaux sans cookie ni empreinte',
  ],
  ['Neon', 'Base de données', 'Ce que décrit le tableau de conservation'],
  ['Stripe', 'Paiement', 'Votre e-mail et vos données de paiement ; nous ne voyons aucun numéro de carte'],
  ['Brevo', 'Envoi des e-mails de connexion', 'Votre adresse e-mail'],
] as const;

/** A table that stays a table on a wide screen and becomes one block per row on a phone. */
function Table({
  head,
  rows,
  strong = false,
}: {
  head: readonly string[];
  rows: ReadonlyArray<readonly string[]>;
  strong?: boolean;
}) {
  return (
    <table className="w-full border-collapse text-left text-base max-md:block">
      <thead className="text-muted max-md:sr-only">
        <tr>
          {head.map((h) => (
            <th key={h} className="border-b border-border py-3 pr-6 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="max-md:block">
        {rows.map((row) => (
          <tr key={row[0]} className="border-b border-lineSoft align-top max-md:block max-md:py-4">
            {row.map((cell, i) => (
              <td
                key={i}
                data-label={head[i]}
                className={`py-3 pr-6 max-md:block max-md:py-1 max-md:pr-0 ${
                  i === 0
                    ? `text-foreground ${strong ? 'font-medium' : ''} max-md:font-medium`
                    : 'text-muted max-md:before:mr-2 max-md:before:text-faint max-md:before:content-[attr(data-label)_":"]'
                }`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const H2_PAGE = 'm-0 font-display text-3xl leading-tight font-semibold tracking-[-0.02em] md:text-4xl';

export function Transparence() {
  return (
    <Page
      wide
      title="Transparence"
      lead="Où va votre article, ce que nous gardons, et à qui. Y compris quand ce n’est pas flatteur."
    >
      <div className="grid gap-16 md:gap-20">
        <section aria-labelledby="trajet-titre">
          <h2 id="trajet-titre" className={H2_PAGE}>
            Le trajet d’une analyse
          </h2>
          <div className="mt-8">
            <Trajet
              label="Le trajet d’une analyse"
              nodes={[
                { name: 'Votre navigateur', note: 'la page lue, ou le texte collé' },
                { name: 'Notre serveur', note: 'ne garde pas le texte' },
                { name: 'Un modèle d’IA', note: 'en Europe en priorité, aux États-Unis en secours' },
              ]}
              links={['le texte de l’article', 'sans votre identité']}
            />
          </div>
          <p className="mt-8 mb-0 max-w-[55ch] text-lg leading-relaxed text-muted">
            L’analyse est confiée à un modèle d’IA, choisi pour la qualité de son raisonnement, sa vitesse et son coût,
            et remplacé quand un meilleur apparaît. Squiggle ne traite que des articles publics : la page que vous
            lisez, son adresse et les pages qu’elle cite. Un texte collé sur le site suit le même trajet, et aucune
            identité de lecteur n’accompagne une requête. Le modèle tourne en Europe en priorité, chez un hébergeur
            européen, et aux États-Unis en secours seulement quand celui-ci ne peut pas répondre ; jamais en Chine. Les
            recherches web de l’étape de vérification passent par un moteur de recherche établi aux États-Unis, qui
            reçoit les requêtes de recherche, jamais l’article ni votre identité.
            Ces prestataires sont nommés dans la{' '}
            <Link to="/confidentialite" className="underline underline-offset-4 hover:text-foreground">
              politique de confidentialité
            </Link>
            , avec les garanties de leurs transferts.
          </p>
          <dl className="mt-10 grid gap-8 md:grid-cols-2 md:gap-10">
            <div>
              <dt className="font-display text-lg font-semibold">Nous voyons l’article, le temps de l’analyser.</dt>
              <dd className="mt-2 ml-0 text-base leading-relaxed text-muted">
                Le texte sert à l’audit et disparaît à la fin de la requête : aucune table de notre base ne contient de
                texte d’article. Avec votre propre clé, il ne passe pas par nous.
              </dd>
            </div>
            <div>
              <dt className="font-display text-lg font-semibold">Notre serveur ne va jamais chercher l’article.</dt>
              <dd className="mt-2 ml-0 text-base leading-relaxed text-muted">
                Votre navigateur le lui fournit. Un article payant est donc analysé dans la limite de ce que vous lisez.
                L’adresse indiquée à côté d’un texte collé n’est jamais visitée.
              </dd>
            </div>
            <div>
              <dt className="font-display text-lg font-semibold">Le rapport est mis en cache et partagé.</dt>
              <dd className="mt-2 ml-0 text-base leading-relaxed text-muted">
                Deux lecteurs du même article obtiennent le même rapport, et le second ne consomme rien. Le rapport
                contient des extraits de l’article (la citation de chaque constat) et un diagnostic de quelques
                phrases, jamais le texte intégral.
              </dd>
            </div>
            <div>
              <dt className="font-display text-lg font-semibold">Un lien partagé seul retrouve un rapport.</dt>
              <dd className="mt-2 ml-0 text-base leading-relaxed text-muted">
                Partagé depuis l’appli d’un journal ou de YouTube, un lien affiche le rapport qu’un lecteur a déjà fait
                avec l’extension, sur la page même, jamais sur un texte collé, qui pourrait être inventé. Notre serveur
                ne visite pas ce lien : il cherche parmi ses rapports. Pour ne pas léser l’éditeur, ce rapport s’ouvre
                sur un lien vers l’article chez lui, ne garde que de courtes citations (25 mots au plus chacune, une
                faible part du texte en tout) et ne résume pas l’article : il dit comment le texte argumente, pas ce
                qu’il raconte.
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="conservation-titre">
          <h2 id="conservation-titre" className={H2_PAGE}>
            Ce que nous conservons, et combien de temps
          </h2>
          <div className="mt-8">
            <Table head={['Donnée', 'Où', 'Durée']} rows={RETENTION} />
          </div>
          <p className="mt-6 mb-0 max-w-[55ch] text-base leading-relaxed text-muted">
            Une ligne de journal ne peut contenir qu’un nom d’événement, un nombre, un identifiant opaque ou l’empreinte
            d’une adresse : aucun champ de texte libre. Une requête refusée est journalisée par le nom du champ, jamais
            par sa valeur. Nos mesures sont des totaux par jour comptés sur le serveur, jamais par un traceur, et ne
            désignent ni un lecteur ni un article : combien de visites arrivent par un lien de campagne connu, combien
            de fois quelques boutons sont utilisés, sans cookie, sans identifiant et sans adresse IP. La fréquentation
            du site, elle, est mesurée par Cloudflare Web Analytics : sans cookie, sans empreinte, sans rien enregistrer
            dans votre navigateur, en données agrégées.
          </p>
        </section>

        <section aria-labelledby="sous-traitants-titre">
          <h2 id="sous-traitants-titre" className={H2_PAGE}>
            Les sous-traitants
          </h2>
          <div className="mt-8">
            <Table head={['Sous-traitant', 'Rôle', 'Ce qu’il voit']} rows={SUBPROCESSORS} strong />
          </div>
        </section>

        <section aria-labelledby="jamais-titre">
          <h2 id="jamais-titre" className={H2_PAGE}>
            Ce qui n’est jamais fait
          </h2>
          <ul className="mt-6 grid max-w-[55ch] list-none gap-3 p-0 text-lg leading-relaxed">
            {[
              'Aucune donnée n’est vendue.',
              'Aucune donnée n’est utilisée pour entraîner un modèle.',
              'Les données reçues du navigateur ne servent qu’à fournir l’analyse demandée : elles ne sont ni transférées ni utilisées pour autre chose, ni pour de la publicité, ni pour évaluer une solvabilité (exigence « Limited Use » du Chrome Web Store).',
              'Aucune publicité, aucun traceur : la mesure d’audience ne dépose aucun cookie.',
              'Aucun code n’est téléchargé ni exécuté depuis l’extérieur.',
            ].map((text) => (
              <li key={text} className="flex gap-3">
                <SquiggleMark />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Page>
  );
}
