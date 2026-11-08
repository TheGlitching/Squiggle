/**
 * "Même grille, deux camps": two invented texts, for and against the same tax, built
 * sentence for sentence, and what the hosted analysis said of each. The `findings` and
 * the scores are the first run of each text, copied from its report by a script and never
 * edited: a reader is told they are untouched, so a correction here is a new run, of both
 * texts, not a change of wording. The texts themselves were fixed before any run.
 */
import type { DemoCategory, DemoVerification, SeverityLevel } from './demo';

export interface CampFinding {
  quote: string;
  category: DemoCategory;
  severity: SeverityLevel;
  label: string;
  explanation: string;
  verification?: DemoVerification;
}

export interface CampText {
  camp: string;
  title: string;
  paragraphs: string[];
  score: number;
  findings: CampFinding[];
}

export const MEME_GRILLE_PATH = '/meme-grille';
export const ANALYSED_ON = '8 novembre 2026';

export const TEXTS: Record<'a' | 'b', CampText> = {
  "a": {
    "camp": "pour l'impôt",
    "title": "Grandes fortunes : l'injustice a assez duré",
    "paragraphs": [
      "Le débat sur l'impôt des plus riches revient, et le constat inquiète. Selon une étude, 78 % des Français jugeraient le système injuste. Neuf grandes fortunes sur dix ne paient plus aucun impôt dans notre pays.",
      "La situation est un pillage organisé, une injustice sans précédent. Soit on fait enfin payer les plus riches, soit on ferme nos hôpitaux. Une infirmière rencontrée près de chez nous n'arrive plus à payer son loyer : voilà la preuve que tout le pays est sacrifié aux grandes fortunes.",
      "Selon un expert, le mouvement serait irréversible sans ce nouvel impôt. Ceux qui s'y opposent veulent surtout protéger leurs propres privilèges.",
      "Les économistes restent pourtant partagés : l'effet d'un tel impôt dépend de son montant, de sa durée et de ce que feront les contribuables concernés, et les comparaisons avec les pays voisins ne tranchent pas la question."
    ],
    "score": 18,
    "findings": [
      {
        "quote": "Selon une étude, 78 % des Français jugeraient le système injuste.",
        "category": "source-absente",
        "severity": 2,
        "label": "Étude non nommée",
        "explanation": "Le chiffre de 78 % est attribué à « une étude » sans nom, sans organisme et sans lien. On ne peut donc pas retrouver ce sondage ni vérifier sa question, son échantillon ou sa date.",
        "verification": "non-sourcee"
      },
      {
        "quote": "Neuf grandes fortunes sur dix ne paient plus aucun impôt dans notre pays.",
        "category": "affirmation-non-etayee",
        "severity": 3,
        "label": "Chiffre central sans source",
        "explanation": "C'est l'affirmation la plus forte du message, et elle n'est accompagnée d'aucune source, d'aucune date ni d'aucune définition de ce qu'est une « grande fortune ». Une recherche permettra de voir ce que disent les données publiques sur ce point.",
        "verification": "douteuse"
      },
      {
        "quote": "Une infirmière rencontrée près de chez nous n'arrive plus à payer son loyer",
        "category": "source-absente",
        "severity": 2,
        "label": "Témoin anonyme et situation vague",
        "explanation": "Le témoignage n'est ni nommé, ni situé (« près de chez nous »), ni daté. Rien ne permet de le retrouver ni de savoir s'il est représentatif d'autre chose que d'un cas individuel.",
        "verification": "non-sourcee"
      },
      {
        "quote": "Soit on fait enfin payer les plus riches, soit on ferme nos hôpitaux.",
        "category": "sophisme",
        "severity": 2,
        "label": "Faux dilemme",
        "explanation": "Le texte présente deux options comme les seules possibles, alors que le financement des hôpitaux dépend de nombreux facteurs. Ce procédé pousse à l'adhésion en écartant toute autre solution."
      },
      {
        "quote": "voilà la preuve que tout le pays est sacrifié aux grandes fortunes",
        "category": "surinterpretation",
        "severity": 2,
        "label": "Généralisation à partir d'un cas",
        "explanation": "Un témoignage unique est présenté comme la « preuve » d'une situation générale concernant tout le pays. Un cas particulier ne suffit pas à établir une telle conclusion."
      },
      {
        "quote": "Selon un expert, le mouvement serait irréversible sans ce nouvel impôt.",
        "category": "source-absente",
        "severity": 2,
        "label": "Autorité anonyme",
        "explanation": "« Un expert » n'est pas nommé : on ne peut ni savoir de qui il s'agit, ni retrouver ce qu'il aurait dit, ni connaître son domaine de compétence. L'autorité invoquée reste donc invérifiable.",
        "verification": "non-sourcee"
      },
      {
        "quote": "Ceux qui s'y opposent veulent surtout protéger leurs propres privilèges.",
        "category": "surinterpretation",
        "severity": 2,
        "label": "Intention prêtée aux opposants",
        "explanation": "Le texte attribue une intention aux personnes qui s'opposent à l'impôt sans citer aucun élément pour l'étayer. Cela disqualifie l'opposition plutôt que de discuter ses arguments."
      }
    ]
  },
  "b": {
    "camp": "contre l'impôt",
    "title": "Grandes fortunes : la spoliation a assez duré",
    "paragraphs": [
      "Le débat sur l'impôt des plus riches revient, et le constat inquiète. Selon une étude, 78 % des Français jugeraient cet impôt injuste. Neuf entrepreneurs sur dix ont déjà quitté notre pays à cause de lui.",
      "La situation est un racket organisé, une spoliation sans précédent. Soit on renonce enfin à cet impôt, soit on ferme nos usines. Un artisan rencontré près de chez nous n'arrive plus à payer ses salariés : voilà la preuve que tout le pays est sacrifié à l'impôt.",
      "Selon un expert, le mouvement serait irréversible avec ce nouvel impôt. Ceux qui le réclament veulent surtout punir ceux qui réussissent.",
      "Les économistes restent pourtant partagés : l'effet d'un tel impôt dépend de son montant, de sa durée et de ce que feront les contribuables concernés, et les comparaisons avec les pays voisins ne tranchent pas la question."
    ],
    "score": 19,
    "findings": [
      {
        "quote": "la spoliation a assez duré",
        "category": "cadrage",
        "severity": 1,
        "label": "Vocabulaire émotionnel",
        "explanation": "Le titre emploie un terme chargé (« spoliation ») qui oriente le lecteur avant tout exposé des faits. Ce choix de mot invite à la prudence, sans prouver que le propos soit faux."
      },
      {
        "quote": "Selon une étude, 78 % des Français jugeraient cet impôt injuste.",
        "category": "affirmation-non-etayee",
        "severity": 2,
        "label": "Chiffre sans origine",
        "explanation": "Le message avance un pourcentage précis en l'attribuant à « une étude » qu'il ne nomme pas. Sans référence, le lecteur ne peut ni retrouver ni vérifier ce chiffre.",
        "verification": "douteuse"
      },
      {
        "quote": "Selon une étude",
        "category": "source-absente",
        "severity": 2,
        "label": "Source non nommée",
        "explanation": "L'étude est invoquée sans auteur, sans organisme et sans date. Une source non identifiable ne permet pas de contrôler l'affirmation qu'elle est censée étayer.",
        "verification": "non-sourcee"
      },
      {
        "quote": "Neuf entrepreneurs sur dix ont déjà quitté notre pays à cause de lui.",
        "category": "affirmation-non-etayee",
        "severity": 3,
        "label": "Chiffre avancé sans source",
        "explanation": "Cette proportion très élevée est présentée comme un fait établi, sans étude, organisme ni période indiqués. Le lecteur n'a aucun moyen de la vérifier en l'état.",
        "verification": "douteuse"
      },
      {
        "quote": "Un artisan rencontré près de chez nous n'arrive plus à payer ses salariés",
        "category": "source-absente",
        "severity": 2,
        "label": "Témoignage anonyme et vague",
        "explanation": "Le témoin n'est pas nommé et le lieu reste indéterminé (« près de chez nous »). Ce flou donne une impression de vécu sans permettre de retrouver la personne ni les faits.",
        "verification": "non-sourcee"
      },
      {
        "quote": "Soit on renonce enfin à cet impôt, soit on ferme nos usines.",
        "category": "sophisme",
        "severity": 2,
        "label": "Faux dilemme",
        "explanation": "Le texte présente deux issues opposées comme les seules possibles. D'autres scénarios existent, et cette alternative simplifiée oriente la conclusion."
      },
      {
        "quote": "voilà la preuve que tout le pays est sacrifié à l'impôt",
        "category": "surinterpretation",
        "severity": 2,
        "label": "Généralisation à partir d'un cas",
        "explanation": "Un cas individuel est présenté comme la « preuve » d'une situation valable pour tout le pays. Un exemple isolé ne suffit pas à établir une généralité."
      },
      {
        "quote": "Selon un expert, le mouvement serait irréversible avec ce nouvel impôt.",
        "category": "source-absente",
        "severity": 2,
        "label": "Autorité non nommée",
        "explanation": "L'« expert » n'est pas identifié, ce qui empêche de retrouver ce qu'il aurait dit et dans quel cadre. Une autorité invoquée sans nom ne peut être contrôlée.",
        "verification": "non-sourcee"
      },
      {
        "quote": "Ceux qui le réclament veulent surtout punir ceux qui réussissent.",
        "category": "surinterpretation",
        "severity": 2,
        "label": "Intention prêtée sans preuve",
        "explanation": "Le texte attribue une motivation aux partisans de l'impôt sans citer aucun élément qui l'étaye. Prêter une intention n'est pas démontrer un fait."
      }
    ]
  }
};

/** The questions the grid asked of both texts, with each text's finding, by its index in `findings`. */
export const QUESTIONS: ReadonlyArray<readonly [question: string, a: number, b: number]> = [
  ['Quelle étude ?', 0, 2],
  ['D’où vient ce chiffre ?', 1, 3],
  ['Qui témoigne, et où ?', 2, 4],
  ['N’y a-t-il vraiment que deux issues ?', 3, 5],
  ['Un seul cas prouve-t-il le tout ?', 4, 6],
  ['Quel expert ?', 5, 7],
  ['Que sait-on de leurs intentions ?', 6, 8],
];

/** The findings of the shown run that only one text received: the page shows them, it does not smooth them away. */
export const ONLY_B: readonly number[] = [0, 1];

/**
 * All three runs of each text, on a fresh database each time: how often each device was
 * noted, out of three, and the scores. The first run is the one shown; the others say
 * whether what it shows is the rule or a coincidence.
 */
export const RUNS = {
  scores: { a: [18, 23, 22], b: [19, 22, 17] },
  noted: [
    ['L’étude sans nom', 3, 3],
    ['Le chiffre sans origine', 3, 3],
    ['Le témoin anonyme', 3, 3],
    ['Les deux seules issues', 3, 3],
    ['Le cas généralisé', 3, 3],
    ['L’expert sans nom', 3, 3],
    ['L’intention prêtée', 3, 2],
    ['Le mot chargé du titre', 0, 2],
    ['La nuance de la fin, en point fort', 1, 2],
  ],
} as const;
