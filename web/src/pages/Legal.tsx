/**
 * The four legal pages, each at a stable public URL (the privacy policy's is
 * declared to Google for the OAuth consent screen and to the extension stores):
 *
 *   /mentions-legales  publisher and host (LCEN, art. 6 III)
 *   /cgv               conditions of sale (Code de la consommation)
 *   /confidentialite   privacy policy (RGPD, art. 13)
 *   /conditions        terms of use: what a report is, and how to contest one
 *
 * Retention periods are not restated here: the privacy policy renders the
 * table the transparency page publishes, which follows `server/src/usage/limits.ts`
 * and the TTLs of the auth rows. A value not decided yet is a visible
 * `PENDING_…` marker, never a plausible guess.
 */
import type { ReactNode } from 'react';

import { CONTACT_EMAIL, CONTACT_URL, Page } from '../components/Layout';
import { DAILY_ANALYSES, FREE_ANALYSES, PRICE_MONTHLY, VAT_NOTE } from '../offer';
import { Link } from '../router';
import { INFERENCE_HOSTS_LABEL, RETENTION } from './Transparence';

const UPDATED = '23 octobre 2026';

const EDITEUR = {
  name: 'Denis Fonteneau',
  form: 'entrepreneur individuel (micro-entreprise)',
  siren: '830 369 922',
  siret: '830 369 922 00042',
  ape: '62.01Z (programmation informatique)',
  address: '100 avenue de Saint-Mandé, 75012 Paris, France',
};

/** A value that must still be decided: shown, never guessed. */
function Pending({ children }: { children: ReactNode }) {
  return <span className="rounded-sm bg-warningSoft px-1.5 py-0.5 font-mono text-xs text-warningInk">{children}</span>;
}

function Mail() {
  return (
    <a href={CONTACT_URL} className="underline hover:text-foreground">
      {CONTACT_EMAIL}
    </a>
  );
}

function A({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="underline hover:text-foreground">
      {children}
    </Link>
  );
}

function Article({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="m-0 font-display text-2xl font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-muted">{children}</div>
    </section>
  );
}

function LegalPage({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <Page eyebrow="Informations légales" title={title} lead={lead}>
      <div className="space-y-10 text-base leading-relaxed">
        {children}
        <p className="text-sm text-muted">Dernière mise à jour : {UPDATED}.</p>
      </div>
    </Page>
  );
}

function Identity() {
  return (
    <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[max-content_1fr]">
      <dt className="font-medium text-foreground">Éditeur</dt>
      <dd>
        {EDITEUR.name}, {EDITEUR.form}
      </dd>
      <dt className="font-medium text-foreground">Adresse</dt>
      <dd>{EDITEUR.address}</dd>
      <dt className="font-medium text-foreground">SIREN</dt>
      <dd>{EDITEUR.siren}</dd>
      <dt className="font-medium text-foreground">SIRET</dt>
      <dd>{EDITEUR.siret}</dd>
      <dt className="font-medium text-foreground">Code APE</dt>
      <dd>{EDITEUR.ape}</dd>
      <dt className="font-medium text-foreground">TVA</dt>
      <dd>Franchise en base, pas de numéro de TVA intracommunautaire ({VAT_NOTE})</dd>
      <dt className="font-medium text-foreground">E-mail</dt>
      <dd>
        <Mail />
      </dd>
      <dt className="font-medium text-foreground">Téléphone</dt>
      <dd>
        <Pending>PENDING_TELEPHONE_EDITEUR</Pending>
      </dd>
    </dl>
  );
}

export function MentionsLegales() {
  return (
    <LegalPage
      title="Mentions légales"
      lead="Qui édite Squiggle et qui l’héberge (loi n° 2004-575 du 21 juin 2004 pour la confiance dans l’économie numérique, art. 6 III)."
    >
      <Article title="Éditeur du site et du service">
        <Identity />
        <p>Directeur de la publication : {EDITEUR.name}.</p>
      </Article>

      <Article title="Hébergeur">
        <p>
          Cloudflare, Inc., 101 Townsend Street, San Francisco, CA 94107, États-Unis. Téléphone : <span className="whitespace-nowrap">+1 650 319 8930</span>.
          Site : cloudflare.com.
        </p>
      </Article>

      <Article title="Propriété intellectuelle">
        <p>
          Le code source de Squiggle est publié sous licence MIT. Le nom, le logo et les textes de ce site restent la
          propriété de l’éditeur. Les articles analysés appartiennent à leurs auteurs et éditeurs.
        </p>
      </Article>

      <Article title="Signaler un contenu">
        <p>
          Pour signaler un contenu illicite ou contester un rapport, écrivez à <Mail /> en indiquant l’adresse de la
          page concernée. La procédure est décrite dans les <A to="/conditions">conditions d’utilisation</A>.
        </p>
      </Article>
    </LegalPage>
  );
}

export function Cgv() {
  return (
    <LegalPage
      title="Conditions de vente"
      lead="Ce que vous achetez, à quel prix, et comment vous en sortir. Ces conditions s’appliquent à l’abonnement vendu sur squiggle.fr."
    >
      <Article title="1. Vendeur">
        <Identity />
      </Article>

      <Article title="2. Le service">
        <p>
          Squiggle analyse la rigueur d’un article de presse que vous lisez et produit un rapport (voir les{' '}
          <A to="/conditions">conditions d’utilisation</A>). Un compte donne droit à {FREE_ANALYSES} analyses offertes,
          sans carte bancaire. L’abonnement donne droit à {DAILY_ANALYSES} analyses par jour, comptées sur la journée UTC.
          Un rapport déjà présent dans le cache partagé est servi sans consommer d’analyse.
        </p>
        <p>
          L’extension reste gratuite avec votre propre clé d’API auprès d’un fournisseur de modèle : ce mode n’est pas
          vendu et ces conditions de vente ne s’y appliquent pas.
        </p>
      </Article>

      <Article title="3. Prix">
        <p>
          {PRICE_MONTHLY} par mois, prix net et définitif ({VAT_NOTE}). Aucun autre frais n’est facturé. Le prix est
          affiché avant le paiement ; un changement de prix ne s’applique pas à la période en cours et vous est annoncé par
          e-mail au moins 30 jours avant de s’appliquer, avec la possibilité de résilier avant.
        </p>
      </Article>

      <Article title="4. Commande et paiement">
        <p>
          L’abonnement se souscrit depuis la page « Mon compte », une fois connecté. Le paiement est traité par Stripe ;
          nous ne voyons ni ne conservons aucun numéro de carte. Le contrat est conclu à la confirmation du paiement, et le reçu
          de chaque paiement vous est envoyé par e-mail.
        </p>
      </Article>

      <Article title="5. Durée et renouvellement">
        <p>
          L’abonnement est mensuel, sans engagement. Il se renouvelle automatiquement chaque mois à la date anniversaire
          et le prix est prélevé à chaque renouvellement, jusqu’à la résiliation. La prochaine échéance est affichée sur
          la page « Mon compte ».
        </p>
      </Article>

      <Article title="6. Droit de rétractation">
        <p>
          Vous disposez de 14 jours à compter de la souscription pour vous rétracter, sans avoir à vous justifier
          (art. L221-18 du code de la consommation).
        </p>
        <p>
          Le service commence dès le paiement. Pour cela, avant de payer, vous demandez expressément qu’il commence
          immédiatement, en cochant la case prévue (art. L221-25). Si vous vous rétractez ensuite dans les 14 jours,
          nous vous remboursons le prix payé, déduction faite de la part correspondant aux jours d’abonnement écoulés
          jusqu’à votre rétractation. Le remboursement est fait sur le moyen de paiement utilisé, dans les 14 jours
          suivant votre demande.
        </p>
        <p>
          Pour vous rétracter, écrivez à <Mail /> une déclaration sans ambiguïté, par exemple en reprenant le modèle
          ci-dessous.
        </p>
        <blockquote className="rounded-xl border border-border bg-surface p-5 text-sm">
          <p className="font-medium text-foreground">Formulaire de rétractation</p>
          <p className="mt-2">
            À l’attention de {EDITEUR.name}, {EDITEUR.address}, {CONTACT_EMAIL} : je vous notifie par la présente ma
            rétractation du contrat portant sur l’abonnement Squiggle, souscrit le [date], par le compte [adresse
            e-mail]. Nom du consommateur, date.
          </p>
        </blockquote>
      </Article>

      <Article title="7. Résiliation">
        <p>
          Vous pouvez résilier à tout moment, en ligne, sans frais (art. L215-1-1). Depuis la page{' '}
          <A to="/compte">Mon compte</A>, le bouton « Gérer ou résilier mon abonnement » ouvre le portail Stripe, où
          « Annuler l’abonnement » puis la confirmation terminent la résiliation. Elle prend effet à la fin de la période
          déjà payée : vous gardez vos analyses jusque-là, et rien n’est plus prélevé. Supprimer votre compte résilie
          aussi l’abonnement, immédiatement.
        </p>
        <p>
          Nous pouvons suspendre un compte qui enfreint les <A to="/conditions">conditions d’utilisation</A>, après vous
          en avoir informé par e-mail, sauf urgence ; la période en cours est alors remboursée au prorata.
        </p>
      </Article>

      <Article title="8. Garanties et responsabilité">
        <p>
          Vous bénéficiez de la garantie légale de conformité des contenus et services numériques (art. L224-25-1 et
          suivants du code de la consommation). Un rapport est une aide à la lecture, produite en partie par un modèle de
          langage : il peut se tromper, et ne garantit pas la véracité d’un article.
        </p>
      </Article>

      <Article title="9. Mineurs">
        <p>
          L’abonnement est réservé aux personnes majeures. Un mineur ne peut le souscrire qu’avec l’autorisation de son
          représentant légal, qui en est alors responsable. Un mineur de moins de 15 ans ne crée un compte qu’avec
          l’accord de son représentant légal.
        </p>
      </Article>

      <Article title="10. Réclamations et médiation">
        <p>
          Pour toute réclamation, écrivez d’abord à <Mail /> : nous répondons sous 30 jours. Si le litige n’est pas résolu,
          vous pouvez recourir gratuitement au médiateur de la consommation (art. L612-1) :{' '}
          <Pending>PENDING_MEDIATEUR_CONSOMMATION</Pending>.
        </p>
      </Article>

      <Article title="11. Droit applicable">
        <p>
          Ces conditions sont soumises au droit français. À défaut de solution amiable, le litige relève des tribunaux
          compétents selon les règles de droit commun ; en tant que consommateur, vous pouvez saisir le tribunal de votre
          domicile.
        </p>
      </Article>
    </LegalPage>
  );
}

const PROCESSING = [
  ['Créer et faire fonctionner votre compte (connexion, sessions, extension connectée)', 'Exécution du contrat (art. 6.1.b)'],
  ['Produire l’analyse demandée et tenir le quota du jour', 'Exécution du contrat (art. 6.1.b)'],
  ['Encaisser l’abonnement et tenir le journal d’usage, preuve de ce qui a été fourni', 'Exécution du contrat (art. 6.1.b)'],
  ['Conserver les pièces de facturation', 'Obligation légale (art. 6.1.c)'],
  ['Protéger le service contre les abus : limites de fréquence, signature des requêtes, journaux techniques', 'Intérêt légitime (art. 6.1.f) : la sécurité du service'],
  ['Répondre à vos demandes et réclamations', 'Exécution du contrat (art. 6.1.b), ou intérêt légitime si vous n’êtes pas client'],
] as const;

const TRANSFERS = [
  ['OpenRouter, Inc.', 'États-Unis', 'Clauses contractuelles types de la Commission européenne, dans l’accord de traitement d’OpenRouter'],
  [
    INFERENCE_HOSTS_LABEL,
    'Selon l’hébergeur, hors UE possible',
    'Engagements d’OpenRouter envers ses fournisseurs ; aucune identité de lecteur n’est transmise',
  ],
  ['Cloudflare, Inc. (hébergement)', 'États-Unis et réseau mondial', 'Data Privacy Framework UE-États-Unis et clauses contractuelles types'],
  ['Stripe (paiement)', 'Irlande, et États-Unis pour Stripe, Inc.', 'Data Privacy Framework UE-États-Unis et clauses contractuelles types'],
  ['Google (connexion, si vous la choisissez)', 'États-Unis', 'Data Privacy Framework UE-États-Unis'],
  ['Neon, Inc. (base de données)', 'États-Unis', 'Clauses contractuelles types, dans l’accord de traitement de Neon'],
  ['Brevo (e-mails de connexion)', 'France', 'Aucun transfert hors UE'],
] as const;

function Table({ head, rows }: { head: readonly string[]; rows: readonly (readonly string[])[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="border-t border-border align-top">
              {row.map((cell, i) => (
                <td key={i} className={`px-4 py-3 ${i === 0 ? 'text-foreground' : 'text-muted'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Confidentialite() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      lead="Ce que Squiggle fait de vos données personnelles, pourquoi, combien de temps, et comment exercer vos droits (RGPD, art. 13)."
    >
      <Article title="1. Responsable du traitement">
        <p>
          {EDITEUR.name}, {EDITEUR.form}, {EDITEUR.address}. Contact pour toute question relative à vos données : <Mail />.
        </p>
        <p>
          Avec votre propre clé d’API, l’extension n’envoie rien à nos serveurs : l’article part directement de votre
          navigateur vers le fournisseur que vous avez choisi, qui en est seul destinataire. Cette politique concerne le
          site squiggle.fr et le mode hébergé, avec un compte.
        </p>
      </Article>

      <Article title="2. Ce que nous traitons, et sur quelle base">
        <p>
          Vos données personnelles sont votre adresse e-mail, votre identifiant Google si vous vous connectez avec Google,
          vos identifiants Stripe, l’adresse IP d’une demande (pour les limites de fréquence) et le journal de vos
          analyses, qui note qu’une analyse a eu lieu et quand, jamais laquelle. Le texte des articles n’est jamais
          conservé, et aucune identité de lecteur n’accompagne une requête vers le modèle.
        </p>
        <p>
          Un texte que vous collez sur la page « Analyser un texte » est traité exactement comme l’article que lit
          l’extension : il transite par notre serveur et par le fournisseur du modèle le temps de l’analyse, puis n’est
          pas conservé. L’adresse que vous indiquez à côté reste une simple mention : elle n’est jamais visitée. Avant
          l’analyse, le texte attend dans votre navigateur, jamais sur nos serveurs, jusqu’à ce que vous l’effaciez.
        </p>
        <Table head={['Finalité', 'Base légale (RGPD)']} rows={PROCESSING} />
        <p>Aucune donnée n’est vendue, utilisée pour de la publicité, pour un profilage, ni pour entraîner un modèle.</p>
      </Article>

      <Article title="3. Combien de temps">
        <Table head={['Donnée', 'Où', 'Durée']} rows={RETENTION} />
        <p>
          Les pièces de facturation (paiements, reçus) sont conservées chez Stripe pendant 10 ans (art. L123-22 du code de commerce), y compris
          après la suppression du compte. Les purges tournent automatiquement : chaque heure pour les données de courte
          durée et le journal d’usage, chaque jour pour les rapports.
        </p>
      </Article>

      <Article title="4. Destinataires et transferts hors de l’Union européenne">
        <p>
          Seuls nos sous-traitants reçoivent des données, chacun pour son rôle, décrit sur la page{' '}
          <A to="/transparence">Transparence</A>. Certains sont établis hors de l’Union européenne :
        </p>
        <Table head={['Destinataire', 'Pays', 'Garantie']} rows={TRANSFERS} />
      </Article>

      <Article title="5. Vos droits">
        <p>
          Vous avez un droit d’accès, de rectification, d’effacement, de limitation, de portabilité et d’opposition au
          traitement fondé sur l’intérêt légitime. Depuis la page <A to="/compte">Mon compte</A>, vous changez votre
          adresse, révoquez une extension connectée et supprimez votre compte, ce qui efface aussitôt tout ce qui y est
          rattaché. Pour le reste, écrivez à <Mail /> : nous répondons sous un mois.
        </p>
        <p>
          Vous pouvez introduire une réclamation auprès de la CNIL, 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07,
          cnil.fr.
        </p>
      </Article>

      <Article title="6. Cookies et traceurs">
        <p>
          Le site dépose un seul cookie, la session de connexion, strictement nécessaire au service : il n’appelle pas
          votre consentement. Il garde aussi dans votre navigateur le texte que vous collez pour l’analyser et, si vous
          l’installez sur votre écran d’accueil, ses propres fichiers pour s’ouvrir sans attendre ; ni l’un ni l’autre
          ne sert à vous suivre. Aucun traceur publicitaire ou analytique n’est utilisé, sur le site comme dans
          l’extension.
        </p>
      </Article>
    </LegalPage>
  );
}

export function Conditions() {
  return (
    <LegalPage
      title="Conditions d’utilisation"
      lead="Ce qu’est un rapport Squiggle, ce qu’il n’est pas, et comment le contester. Créer un compte vaut acceptation de ces conditions."
    >
      <Article title="1. Ce qu’est un rapport">
        <p>
          Un rapport est l’analyse d’un texte : la façon dont un article étaye ce qu’il affirme. Il relève des
          affirmations, regarde si l’article cite ses sources et si ces sources disent ce qu’il leur fait dire, et signale
          les procédés qui affaiblissent un raisonnement. Il porte sur le texte que votre navigateur a transmis, tel
          qu’il était au moment de l’analyse : la page que vous lisiez, dans la limite de ce que vous pouviez en lire,
          ou le texte que vous avez collé sur le site.
        </p>
      </Article>

      <Article title="2. Ce qu’un rapport n’est pas">
        <p>
          Ce n’est pas un verdict sur une personne, un auteur ou une publication, ni un jugement sur la vérité de ce que
          l’article raconte. Un article bien étayé peut se tromper, un article mal étayé peut dire vrai. Le rapport est
          produit en partie par un modèle de langage : il peut se tromper, et ne remplace ni votre jugement, ni l’avis
          d’un professionnel.
        </p>
      </Article>

      <Article title="3. Le cache partagé">
        <p>
          Un rapport est mis en cache 30 jours et servi à tout lecteur dont la page, ou le texte collé, donne le même
          texte. Il ne cite que de
          courts extraits de l’article, pour montrer ce qu’il discute ; il n’en reproduit jamais le texte intégral.
        </p>
      </Article>

      <Article title="4. Éditeurs et auteurs : contester un rapport">
        <p>
          Un éditeur ou un auteur qui estime qu’un rapport déforme son article peut le contester en écrivant à <Mail />,
          avec l’adresse de l’article et ce qui lui paraît inexact. Nous examinons chaque demande et y répondons sous 30
          jours. Un rapport qui lit mal le texte est retiré du cache partagé, et une erreur qui se répète est corrigée
          dans les consignes d’analyse, qui sont publiques.
        </p>
      </Article>

      <Article title="5. Votre compte et l’usage acceptable">
        <p>
          L’accès se fait par une adresse e-mail vérifiée ou par un compte Google ; vous êtes responsable de l’usage fait
          depuis votre compte. Le service est destiné à la lecture : il est interdit de s’en servir pour extraire
          massivement des contenus, de contourner les quotas ou les limites de fréquence, ou d’en faire un usage illicite.
          Un compte qui enfreint ces règles peut être suspendu, dans les conditions des{' '}
          <A to="/cgv">conditions de vente</A>.
        </p>
      </Article>

      <Article title="6. Disponibilité et évolution">
        <p>
          Nous faisons notre possible pour que le service soit disponible, sans le garantir sans interruption. Une
          modification de ces conditions vous est annoncée par e-mail avant de s’appliquer.
        </p>
      </Article>

      <Article title="7. Droit applicable">
        <p>Ces conditions sont soumises au droit français.</p>
      </Article>
    </LegalPage>
  );
}
