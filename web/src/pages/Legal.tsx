import type { ReactNode } from 'react';

import { Page } from '../components/Layout';
import { Link } from '../router';

function Todo({ children }: { children: ReactNode }) {
  return <span className="rounded bg-accentSoft px-1.5 py-0.5 font-mono text-xs text-accentInk">{children}</span>;
}

export function Legal() {
  return (
    <Page
      title="Confidentialité et conditions"
      lead="Les règles du service, en français clair. Cette page décrit ce qui est décidé ; les points marqués doivent encore être confirmés avant la mise en ligne."
    >
      <div className="space-y-10 text-sm leading-relaxed">
        <section className="rounded-xl border-2 border-accent bg-accentSoft p-5">
          <h2 className="font-display text-lg font-semibold text-accentInk">À confirmer avant la mise en ligne</h2>
          <p className="mt-2 text-muted">
            Ces éléments sont des emplacements, pas des décisions. Ils doivent être vérifiés par un
            juriste ou tranchés par l’éditeur avant toute ouverture au public.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
            <li>Identité de l’éditeur : <Todo>raison sociale à compléter</Todo>, <Todo>adresse à compléter</Todo>, <Todo>contact à compléter</Todo>.</li>
            <li>Droit applicable et juridiction compétente.</li>
            <li>Durée, reconduction et modalités exactes de résiliation de l’abonnement.</li>
            <li>Droit de rétractation et politique de remboursement.</li>
            <li>Mentions relatives à la TVA et aux prix.</li>
            <li>Consentement parental pour les utilisateurs mineurs, le cas échéant.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">1. Objet</h2>
          <p className="mt-3 text-muted">
            Squiggle est un service qui aide un lecteur à juger de la solidité d’un article de presse.
            Il produit une note et une liste de constats destinés à éclairer votre lecture. Il ne
            conseille pas la publication, ne réécrit aucun article et ne se prononce pas sur la
            véracité d’une personne.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">2. Compte et accès</h2>
          <p className="mt-3 text-muted">
            L’accès se fait par une adresse e-mail vérifiée ou par un compte Google. Vous êtes
            responsable de l’usage fait depuis votre compte. Un compte donne droit à trois analyses
            offertes ; un abonnement mensuel donne droit à dix analyses par jour, comptées sur la
            journée UTC.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">3. Abonnement, paiement et résiliation</h2>
          <p className="mt-3 text-muted">
            Le paiement est traité par Stripe ; nous ne voyons ni ne conservons aucun numéro de carte.
            L’abonnement est mensuel et peut être résilié à tout moment depuis la page « Mon compte »,
            via le portail de gestion Stripe. La résiliation prend effet à la fin de la période en
            cours. Les conditions de prix, de reconduction et de rétractation doivent être confirmées
            par l’éditeur (voir l’encadré ci-dessus).
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">4. Données personnelles</h2>
          <p className="mt-3 text-muted">
            Le détail complet du trajet des données est sur la page{' '}
            <Link to="/transparence" className="underline hover:text-foreground">
              Transparence
            </Link>
            . En résumé : votre navigateur nous envoie le texte de l’article pour l’analyser, il n’est
            jamais conservé ; le rapport est mis en cache sous la seule empreinte de l’adresse de
            l’article ; votre adresse e-mail est conservée tant que le compte existe. Vous pouvez
            demander l’accès, la rectification et la suppression de vos données depuis la page de
            contact.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">5. Usage acceptable</h2>
          <p className="mt-3 text-muted">
            Le service est destiné à un usage personnel de lecture. Il est interdit de le détourner
            pour extraire massivement des contenus, de contourner les quotas, ou d’en faire un usage
            illicite. Un compte qui abuse du service peut être suspendu.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">6. Propriété intellectuelle</h2>
          <p className="mt-3 text-muted">
            Le logiciel de Squiggle est publié sous licence MIT. Les articles analysés appartiennent à
            leurs auteurs et éditeurs ; Squiggle n’en conserve pas le texte et ne le redistribue pas.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">7. Responsabilité</h2>
          <p className="mt-3 text-muted">
            Une analyse est une aide à la lecture, produite en partie par un modèle de langage. Elle
            peut se tromper. Elle ne remplace ni votre jugement, ni l’avis d’un professionnel.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">8. Contact</h2>
          <p className="mt-3 text-muted">
            Pour toute question, réclamation ou demande relative à vos données,{' '}
            <a
              href="https://github.com/TheGlitching/Squiggle/issues"
              className="underline hover:text-foreground"
              rel="noreferrer noopener"
              target="_blank"
            >
              ouvrez un ticket
            </a>
            . L’adresse de contact publiée reste à compléter avant la mise en ligne.
          </p>
        </section>

        <p className="text-xs text-faint">
          Dernière mise à jour : cette page est un brouillon de travail, à valider avant ouverture au
          public.
        </p>
      </div>
    </Page>
  );
}
