import { AnalysisInput } from './types';

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
4. Tu produis UNIQUEMENT du JSON valide conforme au schéma fourni, sans aucun texte introductif ni markdown autour (ou dans un bloc \`\`\`json \`\`\`).`;

/**
 * Generates the user prompt embedding the article data and Fourches Caudines 8-block criteria
 */
export function buildFourchesCaudinesUserPrompt(input: AnalysisInput): string {
  const blocksFormatted = input.blocks
    .map((b) => `[Bloc ID: ${b.id} | Type: ${b.type}]\n${b.text}`)
    .join('\n\n');

  return `Effectue l'audit intégral selon la méthode des 8 blocs des Fourches Caudines sur l'article suivant :

TITRE : ${input.title}
${input.author ? `AUTEUR : ${input.author}` : ''}
${input.publishedAt ? `DATE : ${input.publishedAt}` : ''}
${input.outlet ? `SOURCE / DOMAINE : ${input.outlet}` : ''}
URL : ${input.url}

TEXTE SEGMENTÉ PAR BLOCS :
---
${blocksFormatted}
---

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
