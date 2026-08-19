export interface DemoArticle {
  url: string;
  title: string;
  author: string;
  publishedAt: string;
  outlet: string;
  leadParagraph: string;
  fullText: string;
  blocks: Array<{
    id: string;
    type: 'heading' | 'paragraph' | 'quote' | 'caption' | 'list-item';
    text: string;
    charStart: number;
  }>;
}

export const DEMO_ARTICLE: DemoArticle = {
  url: 'https://demo.medias-critiques.fr/articles/ia-revolution-education-mirage-ou-progression',
  title: 'L’intelligence artificielle à l’école : le miracle annoncé ou la faillite programmée du sens critique ?',
  author: 'Camille Desmoulins',
  publishedAt: '2026-03-12',
  outlet: 'La Revue Éducative',
  leadParagraph: 'Alors que 95 % des établissements scolaires adoptent massivement des assistants génératifs, les experts tirent la sonnette d’alarme sur une baisse irréversible des capacités cognitives.',
  fullText: `L’intelligence artificielle à l’école : le miracle annoncé ou la faillite programmée du sens critique ?

Alors que 95 % des établissements scolaires adoptent massivement des assistants génératifs, les experts tirent la sonnette d’alarme sur une baisse irréversible des capacités cognitives des élèves.

Une étude récente et incontestable menée sur 50 000 élèves prouve sans le moindre doute que l'usage quotidien des agents conversationnels divise par deux le temps de lecture autonome et anéantit la capacité de mémorisation à long terme. C'est l'évidence même : toute technologie numérique déployée en classe conduit inéluctablement à un nivellement par le bas de notre jeunesse.

Comme l'affirmait déjà un éminent pédagogue anonyme lors d'un colloque ministériel en 2024 : « Laisser un écran guider une dissertation revient à confier la direction d'un orchestre symphonique à un automate sans âme. » Face à ce constat accablant, deux choix seulement s'offrent à notre société : soit nous bannissons totalement l'IA de l'enceinte républicaine pour préserver les Lumières, soit nous capitulons devant laSilicon Valley en acceptant la fin de la pensée humaine.

Pourtant, plusieurs académies pilotes qui ont intégré des modules d'explication critique des algorithmes et de détection des biais constatent des progrès méthodologiques chez 68 % de leurs élèves de terminale. Ces résultats encourageants démontrent qu'un usage encadré, transparent et doublé d'une formation rigoureuse des enseignants permet de transformer un risque technologique en un puissant levier d'apprentissage dialectique.`,
  blocks: [
    {
      id: 'b1_title',
      type: 'heading',
      text: 'L’intelligence artificielle à l’école : le miracle annoncé ou la faillite programmée du sens critique ?',
      charStart: 0
    },
    {
      id: 'b2_intro',
      type: 'paragraph',
      text: 'Alors que 95 % des établissements scolaires adoptent massivement des assistants génératifs, les experts tirent la sonnette d’alarme sur une baisse irréversible des capacités cognitives des élèves.',
      charStart: 104
    },
    {
      id: 'b3_study',
      type: 'paragraph',
      text: 'Une étude récente et incontestable menée sur 50 000 élèves prouve sans le moindre doute que l\'usage quotidien des agents conversationnels divise par deux le temps de lecture autonome et anéantit la capacité de mémorisation à long terme. C\'est l\'évidence même : toute technologie numérique déployée en classe conduit inéluctablement à un nivellement par le bas de notre jeunesse.',
      charStart: 295
    },
    {
      id: 'b4_quote_dilemma',
      type: 'paragraph',
      text: 'Comme l\'affirmait déjà un éminent pédagogue anonyme lors d\'un colloque ministériel en 2024 : « Laisser un écran guider une dissertation revient à confier la direction d\'un orchestre symphonique à un automate sans âme. » Face à ce constat accablant, deux choix seulement s\'offrent à notre société : soit nous bannissons totalement l\'IA de l\'enceinte républicaine pour préserver les Lumières, soit nous capitulons devant laSilicon Valley en acceptant la fin de la pensée humaine.',
      charStart: 686
    },
    {
      id: 'b5_nuance_solution',
      type: 'paragraph',
      text: 'Pourtant, plusieurs académies pilotes qui ont intégré des modules d\'explication critique des algorithmes et de détection des biais constatent des progrès méthodologiques chez 68 % de leurs élèves de terminale. Ces résultats encourageants démontrent qu\'un usage encadré, transparent et doublé d\'une formation rigoureuse des enseignants permet de transformer un risque technologique en un puissant levier d\'apprentissage dialectique.',
      charStart: 1184
    }
  ]
};

export const DEMO_FOURCHES_CAUDINES_REPORT = {
  schemaVersion: 1,
  score: 45,
  scoreBand: 'problematique',
  summary: "L'article pose un débat d'intérêt public réel, mais sa première partie ne tient pas : un taux d'adoption et une étude de 50 000 élèves sont avancés comme des faits établis sans la moindre source, et le texte referme le débat sur un faux dilemme binaire. Le dernier paragraphe apporte heureusement un contrepoint constructif et nuancé, mais ne suffit pas à compenser ces défauts majeurs.",
  categories: [
    {
      domain: 'robustesse_factuelle',
      label: 'Robustesse factuelle et sourcing',
      score: 10.5,
      maxScore: 35,
      strengths: ['Mention de données d’expérimentation académique dans le dernier paragraphe.'],
      weaknesses: ['Le chiffre de « 95 % » et « l’étude sur 50 000 élèves » sont avancés comme des faits établis sans référence, institut ni méthodologie : ce défaut pèse sur la note du domaine.']
    },
    {
      domain: 'solidite_logique',
      label: 'Solidité logique et argumentative',
      score: 17,
      maxScore: 25,
      strengths: ['Présence d’un contre-exemple appuyé sur des données d’académies pilotes.'],
      weaknesses: ['Généralisation hâtive assimilant tout usage numérique en classe à un nivellement par le bas.']
    },
    {
      domain: 'cadrage_manipulation',
      label: 'Cadrage et procédés rhétoriques',
      score: 12.5,
      maxScore: 25,
      strengths: ['Le dernier paragraphe rouvre un débat que le texte avait refermé trop tôt.'],
      weaknesses: ['Faux dilemme manichéen (« soit bannir totalement, soit capituler ») qui occulte toute position intermédiaire : ce défaut pèse sur la note du domaine.']
    },
    {
      domain: 'deontologie',
      label: 'Déontologie et transparence',
      score: 6,
      maxScore: 10,
      strengths: ['Le commentaire de l’auteur reste globalement distinct du récit des faits.'],
      weaknesses: ['La citation d’un « éminent pédagogue anonyme » n’est attribuée à personne d’identifiable.']
    },
    {
      domain: 'orthographe_grammaire',
      label: 'Soin de la langue',
      score: 4.5,
      maxScore: 5,
      strengths: ['Syntaxe soignée et vocabulaire riche.'],
      weaknesses: ['Espace manquant dans « laSilicon Valley ».']
    }
  ],
  findings: [
    {
      id: 'f_source_95pct',
      blockId: 'b2_intro',
      quote: 'Alors que 95 % des établissements scolaires adoptent massivement des assistants génératifs',
      charStart: 104,
      charEnd: 200,
      category: 'source-absente',
      severity: 2,
      label: 'Chiffre d’adoption non sourcé',
      explanation: 'Un taux de 95 % d’adoption constitue une affirmation statistique majeure présentée sans aucune source officielle (MENJ, DEPP, OCDE) : vous ne pouvez pas vérifier d’où il vient.',
      confidence: 0.96,
      verification: 'non-sourcee'
    },
    {
      id: 'f_study_hyperbole',
      blockId: 'b3_study',
      quote: 'Une étude récente et incontestable menée sur 50 000 élèves prouve sans le moindre doute',
      charStart: 295,
      charEnd: 387,
      category: 'affirmation-non-etayee',
      severity: 3,
      label: 'Affirmation d’infaillibilité sans référence',
      explanation: 'Cette étude est présentée comme un fait établi sans qu’aucun laboratoire, auteur ou revue à comité de lecture ne soit nommé : rien ne permet au lecteur de la retrouver ni de la vérifier.',
      confidence: 0.98
    },
    {
      id: 'f_generalization_inevitable',
      blockId: 'b3_study',
      quote: 'toute technologie numérique déployée en classe conduit inéluctablement à un nivellement par le bas',
      charStart: 574,
      charEnd: 673,
      category: 'sophisme',
      severity: 2,
      label: 'Généralisation hâtive et déterminisme technologique',
      explanation: 'Le texte vous présente un lien de causalité automatique et absolu sans démonstration : c’est le sophisme de la pente savonneuse.',
      confidence: 0.92
    },
    {
      id: 'f_false_dilemma',
      blockId: 'b4_quote_dilemma',
      quote: 'soit nous bannissons totalement l\'IA de l\'enceinte républicaine pour préserver les Lumières, soit nous capitulons devant laSilicon Valley',
      charStart: 902,
      charEnd: 1045,
      category: 'cadrage',
      severity: 3,
      label: 'Faux dilemme manichéen',
      explanation: 'L’article vous réduit les alternatives à deux postures extrêmes et opposées, occultant délibérément les voies intermédiaires de régulation et d’apprentissage critique : un vrai débat nuancé est présenté comme déjà tranché entre deux camps.',
      confidence: 0.99
    },
    {
      id: 'f_positive_point',
      blockId: 'b5_nuance_solution',
      quote: 'plusieurs académies pilotes qui ont intégré des modules d\'explication critique des algorithmes et de détection des biais constatent des progrès méthodologiques chez 68 % de leurs élèves',
      charStart: 1194,
      charEnd: 1378,
      category: 'point-fort',
      severity: 1,
      label: 'Apport de données empiriques et perspective constructive',
      explanation: 'Le texte démontre une réelle capacité à dépasser la polémique stérile en présentant des pistes concrètes d’expérimentation pédagogique évaluées sur le terrain.',
      confidence: 0.95
    }
  ],
  meta: {
    model: 'demo-fixture-v1',
    promptVersion: '1.0.0-fourches-caudines',
    analyzedAt: '2026-03-12T14:30:00.000Z',
    durationMs: 1420,
    textLengthChars: 1618,
    blocksCount: 5
  }
};