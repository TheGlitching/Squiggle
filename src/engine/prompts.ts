import { AnalysisInput, FactualClaim } from './types';

export const FOURCHES_CAUDINES_SYSTEM_PROMPT = `Tu es le moteur de relecture critique et d'audit éditorial « Fourches Caudines ».
Ton rôle est d'analyser avec une rigueur absolue un article de presse selon les standards d'évaluation des rédactions de presse d'investigation.
Tu dois évaluer, corriger et auditer le texte sur quatre dimensions fondamentales : exactitude formelle, solidité du fond, cohérence éditoriale et respect du lecteur.

Tu agis comme un exosquelette intellectuel bienveillant mais intraitable pour le lecteur :
1. Tu vérifies les faits, chiffres, dates, sources et citations.
2. Tu traques sans pitié les failles logiques (sophismes, généralisations hâtives, faux dilemmes, épouvantails, attaques ad hominem, confusions corrélation/causalité).
3. Tu évalues le cadrage, l'angle, la nuance et la contextualisation.
4. Tu valorises également les points forts lorsque l'argumentation ou la rigueur est exemplaire.

DIRECTIVES ABSOLUES DE RÉPONSE :
1. Tu t'adresses toujours au LECTEUR avec un ton pédagogique, précis, équilibré et neutre (jamais au journaliste).
2. Pour chaque finding (remarque sur le texte), tu DOIS fournir une citation EXACTE et LITTÉRALE ('quote') tirée fidèlement du texte (≤ 25 mots), ainsi que l'identifiant exact du bloc 'blockId' correspondant.
3. Si le texte dépasse 50/100, tu DOIS obligatoirement inclure au moins un point fort (category: 'point-fort').
4. Tu produis UNIQUEMENT du JSON valide conforme au schéma fourni, sans aucun texte introductif ni markdown autour (ou dans un bloc \`\`\`json \`\`\`).
5. Un finding factuel ne peut affirmer qu'une assertion est fausse ou non étayée que s'il cite une source à l'appui ; à défaut de source, formule-le comme une réserve non vérifiée. Tu ne dois JAMAIS qualifier une affirmation de 'source-absente' si l'article la fait suivre d'un lien hypertexte : consulte la section SOURCES CITÉES PAR L'ARTICLE avant de conclure à une absence de source.`;

/**
 * Shared block formatting reused by every prompt that embeds the article text,
 * so the extraction, judgement and audit prompts stay in lockstep with each
 * other's view of a block.
 */
function formatBlocksForPrompt(input: AnalysisInput): string {
  return input.blocks
    .map((b) => `[Bloc ID: ${b.id} | Type: ${b.type}]\n${b.text}`)
    .join('\n\n');
}

export const FOURCHES_CAUDINES_CLAIM_EXTRACTION_SYSTEM_PROMPT = `Tu es l'étape d'extraction de faits vérifiables du moteur « Fourches Caudines ».
Ton unique rôle est de repérer, dans un article segmenté par blocs, les affirmations FACTUELLES et VÉRIFIABLES (chiffres, dates, événements, déclarations attribuées, statistiques).
Tu EXCLUS systématiquement les opinions, prédictions, jugements de valeur, tournures rhétoriques et généralités qui ne peuvent pas être confrontées à une source.
Tu produis UNIQUEMENT du JSON valide, sans texte introductif ni markdown autour.`;

/**
 * Generates the user prompt for the claim-extraction stage: lists at most
 * `maxClaims` checkable assertions with their literal quote and block id.
 */
export function buildClaimExtractionUserPrompt(input: AnalysisInput, maxClaims: number): string {
  const blocksFormatted = formatBlocksForPrompt(input);

  return `Repère au maximum ${maxClaims} affirmations factuelles vérifiables dans l'article suivant. Une affirmation vérifiable a une valeur de vérité tranchable par une recherche (un chiffre, une date, un fait rapporté, une citation attribuée) ; une opinion, une prédiction ou un jugement de valeur n'en est PAS une et doit être ignoré.

TITRE : ${input.title}
URL : ${input.url}

TEXTE SEGMENTÉ PAR BLOCS :
${blocksFormatted}

FORMAT JSON STRICT ATTENDU :
{
  "claims": [
    {
      "blockId": "block_id_exact",
      "quote": "citation littérale exacte du texte portant l'affirmation",
      "claim": "l'affirmation reformulée de façon autonome et cherchable"
    }
  ]
}
Si aucune affirmation vérifiable n'est trouvée, renvoie { "claims": [] }.`;
}

export const FOURCHES_CAUDINES_CLAIM_JUDGEMENT_SYSTEM_PROMPT = `Tu es l'étape de vérification factuelle du moteur « Fourches Caudines ».
On te donne une affirmation, les résultats de recherche web obtenus pour elle, et les sources que l'article lui-même cite en lien hypertexte.
Tu ne peux répondre 'confirmed' ou 'contradicted' QUE si au moins une source fournie (recherche ou article) étaye explicitement ce verdict ; toute source utilisée DOIT figurer dans 'sources'.
Si les preuves manquent, sont insuffisantes ou ambiguës, tu réponds 'unverified' et tu l'expliques dans 'rationale' : tu n'inventes JAMAIS une confirmation ou une contradiction sans preuve.
Tu produis UNIQUEMENT du JSON valide, sans texte introductif ni markdown autour.`;

/**
 * Generates the user prompt for the per-claim judgement stage, embedding
 * the search results and the article's own cited sources for that block.
 */
export function buildClaimJudgementUserPrompt(
  claim: { quote: string; claim: string },
  searchResults: { title: string; url: string; snippet: string }[],
  articleSources: { href: string; domain: string; text: string }[]
): string {
  const searchFormatted = searchResults.length
    ? searchResults.map((r) => `- ${r.title} (${r.url})\n  ${r.snippet}`).join('\n')
    : '(aucun résultat de recherche)';
  const articleFormatted = articleSources.length
    ? articleSources.map((s) => `- ${s.text} -> ${s.href} (${s.domain})`).join('\n')
    : '(aucune source citée par l\'article pour ce passage)';

  return `AFFIRMATION À VÉRIFIER : ${claim.claim}
CITATION EXACTE DANS L'ARTICLE : ${claim.quote}

RÉSULTATS DE RECHERCHE (ce sont les seuls extraits que tu peux lire ; tu peux t'appuyer uniquement sur le texte affiché ci-dessous, jamais sur un titre ou une URL seuls) :
${searchFormatted}

SOURCES CITÉES PAR L'ARTICLE POUR CE PASSAGE :
${articleFormatted}

FORMAT JSON STRICT ATTENDU :
{
  "verification": "confirmed" | "contradicted" | "unverified",
  "sources": [
    { "title": "titre de la source", "url": "https://...", "quote": "extrait pertinent", "origin": "article" | "search" }
  ],
  "rationale": "justification courte du verdict, y compris si tu n'as pas pu vérifier"
}`;
}

export const FOURCHES_CAUDINES_CLAIM_GROUNDED_JUDGEMENT_SYSTEM_PROMPT = `Tu es l'étape de vérification factuelle du moteur « Fourches Caudines », en mode recherche intégrée.
Effectue toi-même les recherches nécessaires avant de répondre, puis vérifie l'affirmation donnée à la lumière des pages que tu as réellement consultées et des sources que l'article cite en lien hypertexte.
Tu ne peux répondre 'confirmed' ou 'contradicted' QUE si au moins une page consultée ou une source de l'article étaye explicitement ce verdict ; cite dans 'sources' chaque source que tu as effectivement lue et utilisée pour juger.
Si les preuves manquent, sont insuffisantes ou ambiguës, tu réponds 'unverified' et tu l'expliques dans 'rationale' : tu n'inventes JAMAIS une confirmation ou une contradiction sans preuve.
Tu produis UNIQUEMENT du JSON valide, sans texte introductif ni markdown autour.`;

/**
 * Generates the user prompt for the grounded judgement stage: no search
 * results are embedded because the provider runs its own searches inside
 * this same call, so only the claim and the article's own cited sources are
 * handed over.
 */
export function buildClaimGroundedJudgementUserPrompt(
  claim: { quote: string; claim: string },
  articleSources: { href: string; domain: string; text: string }[]
): string {
  const articleFormatted = articleSources.length
    ? articleSources.map((s) => `- ${s.text} -> ${s.href} (${s.domain})`).join('\n')
    : '(aucune source citée par l\'article pour ce passage)';

  return `AFFIRMATION À VÉRIFIER : ${claim.claim}
CITATION EXACTE DANS L'ARTICLE : ${claim.quote}

Recherche sur le web les sources nécessaires pour vérifier cette affirmation avant de répondre.

SOURCES CITÉES PAR L'ARTICLE POUR CE PASSAGE :
${articleFormatted}

FORMAT JSON STRICT ATTENDU :
{
  "verification": "confirmed" | "contradicted" | "unverified",
  "sources": [
    { "title": "titre de la source", "url": "https://...", "quote": "extrait pertinent", "origin": "article" | "search" }
  ],
  "rationale": "justification courte du verdict, y compris si tu n'as pas pu vérifier"
}`;
}

/**
 * Evidence gathered by the research stage, rendered into the audit prompt so
 * the model judges facts against what was actually found rather than being
 * ordered to "verify" with nothing to verify against.
 */
export interface ResearchEvidenceForPrompt {
  citedSources: { href: string; domain: string; text: string }[];
  claims: FactualClaim[];
}

function formatCitedSourcesSection(citedSources: ResearchEvidenceForPrompt['citedSources']): string {
  if (!citedSources.length) return '';
  const lines = citedSources.map((s) => `- ${s.text || s.domain} -> ${s.href} (${s.domain})`).join('\n');
  return `\n\nSOURCES CITÉES PAR L'ARTICLE :\n${lines}`;
}

function formatFactualVerificationsSection(claims: FactualClaim[]): string {
  if (!claims.length) return '';
  const lines = claims
    .map((c) => {
      const sources = c.sources.length
        ? c.sources.map((s) => `    - [${s.origin}] ${s.title} : ${s.url}`).join('\n')
        : '    - (aucune source)';
      return `- Affirmation : ${c.claim}\n  Citation : "${c.quote}" (bloc ${c.blockId})\n  Verdict recherche : ${c.verification}${c.rationale ? ` (${c.rationale})` : ''}\n${sources}`;
    })
    .join('\n');
  return `\n\nVÉRIFICATIONS FACTUELLES :\n${lines}`;
}

/**
 * Generates the user prompt embedding the article data and Fourches Caudines 8-block criteria
 */
export function buildFourchesCaudinesUserPrompt(input: AnalysisInput, evidence?: ResearchEvidenceForPrompt): string {
  const blocksFormatted = formatBlocksForPrompt(input);
  const citedSourcesSection = formatCitedSourcesSection(evidence?.citedSources ?? []);
  const factualVerificationsSection = formatFactualVerificationsSection(evidence?.claims ?? []);

  return `Effectue l'audit intégral selon la méthode des 8 blocs des Fourches Caudines sur l'article suivant :

TITRE : ${input.title}
${input.author ? `AUTEUR : ${input.author}` : ''}
${input.publishedAt ? `DATE : ${input.publishedAt}` : ''}
${input.outlet ? `SOURCE / DOMAINE : ${input.outlet}` : ''}
URL : ${input.url}

TEXTE SEGMENTÉ PAR BLOCS :
---
${blocksFormatted}
---${citedSourcesSection}${factualVerificationsSection}

GRILLE D'ÉVALUATION ET CRITÈRES DE NOTATION SUR 100 POINTS :
Tu dois noter obligatoirement chacun des 10 domaines suivants :
1. "orthographe_grammaire" (Max 5 pts) : Exactitude linguistique, propreté syntaxique, ponctuation.
2. "clarte_lisibilite" (Max 10 pts) : Pédagogie, clarté, vulgarisation du jargon, progressivité.
3. "structure_progression" (Max 10 pts) : Titre, introduction sans préambule scolaire, transitions, conclusion active.
4. "solidite_logique" (Max 15 pts) : Cohérence, nuances, absence de sophismes / épouvantails / faux dilemmes / confusions corrélation-causalité.
5. "robustesse_factuelle" (Max 20 pts) : Chiffres précis, dates, citations sourcées, distinction faits/opinions.
6. "coherence_editoriale" (Max 15 pts) : 6 axes (constructif, accrocheur, iconoclaste, narratif, accessible, éthique).
7. "angle_impact" (Max 10 pts) : Originalité, promesse tenue, netteté de l'angle.
8. "connexion_quotidien" (Max 5 pts) : Impact tangible pour le lecteur (« Pourquoi cela me concerne-t-il ? »).
9. "preservation_voix" (Max 5 pts) : Rythme, style vivant, absence de formules automatiques (« force est de constater », etc.).
10. "format_calibrage" (Max 5 pts) : Densité, équilibre longueur/fond sans redondances.

FORMAT JSON STRICT ATTENDU :
{
  "verdict": "publier" | "publier_apres_corrections_mineures" | "reviser_avant_publication" | "bloquer",
  "summary": "Synthèse exécutive du diagnostic en 2 à 4 phrases percutantes et pédagogiques.",
  "scores": [
    {
      "domain": "orthographe_grammaire",
      "score": 4.5,
      "strengths": ["Ponctuation soignée"],
      "weaknesses": ["Quelques tournures lourdes"]
    },
    ... (pour les 10 domaines)
  ],
  "findings": [
    {
      "blockId": "block_id_exact",
      "quote": "citation littérale exacte du texte",
      "category": "sophisme" | "affirmation-non-etayee" | "surinterpretation" | "source-absente" | "cadrage" | "point-fort",
      "severity": 1 | 2 | 3,
      "label": "Nom de la remarque (ex: Corrélation prise pour causalité)",
      "explanation": "Explication pédagogique pour le lecteur en 1 à 3 phrases.",
      "suggestion": "Piste de reformulation ou nuance recommandée",
      "confidence": 0.95
    }
  ],
  "editorialAxes": {
    "constructif": true,
    "accrocheur": true,
    "iconoclaste": false,
    "narratif": true,
    "accessible": true,
    "ethique": true,
    "notes": "Bilan rapide sur les 6 axes"
  },
  "revisionPlan": {
    "priority1_blocking": [
      {
        "problem": "Affirmation catégorique non vérifiable",
        "reason": "Induit le lecteur en erreur sur un chiffre clé",
        "action": "Indiquer la source ou supprimer l'affirmation",
        "blockId": "bloc_id",
        "quote": "extrait"
      }
    ],
    "priority2_major": [],
    "priority3_editorial_optimizations": []
  },
  "editorialOptimizations": {
    "title": "Proposition d'optimisation de titre éventuelle",
    "hook": "Optimisation de l'accroche",
    "angle": "Recentrage d'angle",
    "narration": "Conseil narratif",
    "conclusion": "Ouverture constructive"
  }
}`;
}
