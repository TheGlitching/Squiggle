import { Page } from '../components/Layout';
import { HOSTED_ANALYSIS } from '../../../shared/src/hosted/disclosure';

const { modelLabel, inferenceHosts } = HOSTED_ANALYSIS;

/** Who runs the model: the pinned hosts by name, or, until they are pinned, OpenRouter's choice. */
export const INFERENCE_HOSTS_TEXT =
  inferenceHosts.length > 0
    ? inferenceHosts.join(', ')
    : 'des hébergeurs d’inférence choisis par OpenRouter parmi ceux qui servent ce modèle';

const RETENTION = [
  ['Texte de l’article', 'Mémoire, le temps de l’appel d’audit', 'Jamais écrit'],
  ['Rapport d’analyse, avec extraits de l’article (cache partagé)', 'Base de données', '30 jours, 500 rapports au plus'],
  ['Analyse en cours (constats, sans l’article)', 'Base de données', '1 heure'],
  ['Journal d’usage : qu’un compte a lancé une analyse, et quand', 'Base de données', '12 mois, sans contenu et sans nommer l’article'],
  ['Adresse e-mail', 'Base de données', 'Tant que le compte existe'],
  ['Identifiant Google, si connexion Google', 'Base de données', 'Tant que le compte existe'],
  ['Clé publique de votre installation', 'Base de données', 'Tant que vous ne la révoquez pas'],
  ['Jeton d’extension', 'Base de données, en empreinte SHA-256', '90 jours'],
  ['Session web', 'Base de données, en empreinte SHA-256', '30 jours'],
  ['Code de connexion', 'Base de données, en empreinte SHA-256', '10 minutes'],
  ['Identifiants Stripe (client, abonnement)', 'Base de données', 'Tant que le compte existe'],
  ['Compteurs de fonctionnement : réponses du cache, échecs par étape d’analyse', 'Base de données', 'Un nombre par jour et par nom d’événement, sans compte et sans article'],
  ['Journaux techniques', 'Cloudflare', 'Aucun texte d’article, aucune adresse d’article en clair'],
] as const;

const SUBPROCESSORS = [
  ['OpenRouter', `Passerelle d’analyse : route chaque requête vers le modèle ${modelLabel}`, 'Le texte de l’article et les extraits des sources citées, sans identité de lecteur'],
  [
    inferenceHosts.length > 0 ? `Hébergeurs d’inférence : ${INFERENCE_HOSTS_TEXT}` : 'Hébergeurs d’inférence (choisis via OpenRouter)',
    `Exécution du modèle ${modelLabel}, un modèle à poids ouverts`,
    'Le texte de l’article et les extraits des sources citées, sans identité de lecteur',
  ],
  ['Google (connexion)', 'Authentification, si vous choisissez « continuer avec Google »', 'Votre identité Google'],
  ['Cloudflare (Workers)', 'Hébergement du serveur', 'Le trafic, sans contenu d’article dans les journaux'],
  ['Neon', 'Base de données', 'Ce que décrit le tableau de conservation'],
  ['Stripe', 'Paiement', 'Votre e-mail et vos données de paiement ; nous ne voyons aucun numéro de carte'],
  ['Brevo', 'Envoi des e-mails de connexion', 'Votre adresse e-mail'],
] as const;

export function Transparence() {
  return (
    <Page
      title="Transparence"
      lead="Où va votre article, ce que nous gardons, et à qui. Cette page ne bouge pas au rythme du produit : elle décrit le trajet réel des données, y compris quand il n’est pas flatteur."
    >
      <div className="space-y-10">
        <section>
          <h2 className="font-display text-xl font-semibold">Le trajet d’une analyse</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface p-6">
            <p className="font-mono text-sm">
              votre navigateur <span className="text-accent">──(le texte de l’article)──▶</span> notre
              serveur <span className="text-accent">──▶</span> OpenRouter{' '}
              <span className="text-accent">──▶</span> {modelLabel}
            </p>
          </div>
          <p className="mt-4 text-sm text-muted">
            L’analyse tourne sur {modelLabel}, un modèle à poids ouverts, choisi pour le meilleur
            équilibre entre vitesse, qualité de raisonnement et coût. Il est exécuté par{' '}
            {INFERENCE_HOSTS_TEXT}. Utiliser un modèle à poids ouverts ne signifie pas envoyer le
            texte vers des serveurs en Chine. Squiggle ne traite que des articles publics : le texte
            de la page que vous lisez, son adresse et les pages qu’elle cite. Aucune donnée privée
            ne part vers le modèle, et aucune identité de lecteur n’accompagne une requête.
          </p>
          <dl className="mt-5 space-y-3 text-sm">
            <div>
              <dt className="font-medium">Nous voyons l’article, le temps de l’analyser.</dt>
              <dd className="text-muted">
                C’est la différence avec le mode « clé personnelle ». Le texte sert à l’appel d’audit
                et disparaît à la fin de cette requête : aucune table de notre base ne contient de
                texte d’article.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Notre serveur ne va jamais chercher l’article lui-même.</dt>
              <dd className="text-muted">
                C’est votre navigateur qui le lui fournit, depuis la page que vous lisez. Un article
                payant est donc analysé exactement dans la limite de ce que vous pouvez lire. Notre
                adresse n’apparaît dans les journaux d’aucun éditeur.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Le rapport est mis en cache et partagé.</dt>
              <dd className="text-muted">
                Deux lecteurs du même article obtiennent le même rapport, et le second ne consomme
                aucun crédit. Le rapport contient des extraits de l’article (la citation de chaque constat) et un résumé. Ce que nous ne gardons jamais, c’est le texte intégral.
              </dd>
            </div>
          </dl>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">Ce que nous conservons, et combien de temps</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Donnée</th>
                  <th className="px-4 py-3 font-medium">Où</th>
                  <th className="px-4 py-3 font-medium">Durée</th>
                </tr>
              </thead>
              <tbody>
                {RETENTION.map(([data, where, duration]) => (
                  <tr key={data} className="border-t border-border align-top">
                    <td className="px-4 py-3">{data}</td>
                    <td className="px-4 py-3 text-muted">{where}</td>
                    <td className="px-4 py-3 text-muted">{duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-muted">
            Une ligne de journal ne peut contenir qu’un nom d’événement, un nombre, un identifiant
            opaque ou l’empreinte d’une adresse : il n’existe aucun champ de texte libre où écrire un
            paragraphe, même par accident. Une requête refusée est journalisée par le nom du champ,
            jamais par sa valeur.
          </p>
          <p className="mt-4 text-sm text-muted">
            Nous mesurons le lancement avec ce que le serveur détient déjà, jamais avec un traceur
            dans l’extension ou sur le site : nombre de comptes par semaine, part de comptes ayant
            terminé une analyse, essais menés à leur terme, abonnements et résiliations (d’après
            Stripe), réponses du cache, échecs par étape, coût moyen d’une analyse. Ce sont des
            totaux : aucun ne désigne un lecteur ou un article, et ils ne sont consultables que par
            nous.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">Les sous-traitants</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Sous-traitant</th>
                  <th className="px-4 py-3 font-medium">Rôle</th>
                  <th className="px-4 py-3 font-medium">Ce qu’il voit</th>
                </tr>
              </thead>
              <tbody>
                {SUBPROCESSORS.map(([name, role, sees]) => (
                  <tr key={name} className="border-t border-border align-top">
                    <td className="px-4 py-3 font-medium">{name}</td>
                    <td className="px-4 py-3 text-muted">{role}</td>
                    <td className="px-4 py-3 text-muted">{sees}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">Ce qui n’est jamais fait</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted">
            <li>Aucune donnée n’est vendue.</li>
            <li>Aucune donnée n’est utilisée pour entraîner un modèle.</li>
            <li>
              Les données reçues du navigateur ne servent qu’à fournir l’analyse demandée : elles ne
              sont ni transférées ni utilisées pour autre chose, ni pour de la publicité, ni pour
              évaluer une solvabilité (exigence « Limited Use » du Chrome Web Store).
            </li>
            <li>Aucune publicité, aucun traceur, aucun mouchard analytique.</li>
            <li>Aucun code n’est téléchargé ni exécuté depuis l’extérieur.</li>
          </ul>
        </section>
      </div>
    </Page>
  );
}
