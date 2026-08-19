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
  score: 62,
  scoreBand: 'fragile',
  verdict: 'reviser_avant_publication',
  summary: "L'article pose un débat d'intérêt public crucial avec une réelle tension éditoriale, mais présente de sévères fragilités méthodologiques dans sa première partie : chiffre d'adoption non sourcé, étude sensationnaliste non référencée, et faux dilemme caricatural. Le dernier paragraphe apporte heureusement un contrepoint constructif et nuancé.",
  categories: [
    {
      domain: 'orthographe_grammaire',
      label: 'Orthographe, grammaire, syntaxe, ponctuation',
      score: 4.5,
      maxScore: 5,
      strengths: ['Syntaxe soignée et vocabulaire riche.'],
      weaknesses: ['Espace manquant dans « laSilicon Valley ».']
    },
    {
      domain: 'clarte_lisibilite',
      label: 'Clarté et lisibilité',
      score: 8.5,
      maxScore: 10,
      strengths: ['Expression limpide et découpage clair en paragraphes thématiques.'],
      weaknesses: ['Quelques formules hyperboliques qui nuisent à la précision.']
    },
    {
      domain: 'structure_progression',
      label: 'Structure et progression',
      score: 7.0,
      maxScore: 10,
      strengths: ['Titre accrocheur et chute constructive.'],
      weaknesses: ['Rupture brutale de ton entre le réquisitoire du milieu et la nuance finale.']
    },
    {
      domain: 'solidite_logique',
      label: 'Solidité logique et argumentative',
      score: 6.5,
      maxScore: 15,
      strengths: ['Présence d’un contre-exemple appuyé sur des données d’académies pilotes.'],
      weaknesses: ['Faux dilemme (« soit bannir totalement, soit capituler ») et généralisation hâtive.']
    },
    {
      domain: 'robustesse_factuelle',
      label: 'Robustesse factuelle et sourcing',
      score: 8.5,
      maxScore: 20,
      strengths: ['Mention de données d’expérimentation académique.'],
      weaknesses: ['Le chiffre de « 95 % » et « l’étude sur 50 000 élèves » sont dépourvus de référence ou lien.']
    },
    {
      domain: 'coherence_editoriale',
      label: 'Cohérence éditoriale (6 axes)',
      score: 10.5,
      maxScore: 15,
      strengths: ['Axe constructif et accrocheur bien tenus en conclusion.'],
      weaknesses: ['Axe éthique perfectible en raison du recours à une citation anonyme invérifiable.']
    },
    {
      domain: 'angle_impact',
      label: 'Angle et impact éditorial',
      score: 7.5,
      maxScore: 10,
      strengths: ['Sujet d’actualité prégnant touchant à la fois l’école et les technologies.'],
      weaknesses: ['Tendance initiale au catastrophisme avant d’amorcer la nuance.']
    },
    {
      domain: 'connexion_quotidien',
      label: 'Connexion au quotidien et utilité lecteur',
      score: 4.0,
      maxScore: 5,
      strengths: ['Questionne directement l’expérience des parents, élèves et enseignants.'],
      weaknesses: ['Manque d’exemples d’exercices pratiques ou d’usages concrets en classe.']
    },
    {
      domain: 'preservation_voix',
      label: 'Préservation de la voix d’auteur et style',
      score: 3.5,
      maxScore: 5,
      strengths: ['Rythme soutenu et verve polémique entraînante.'],
      weaknesses: ['Formules toutes faites (« c’est l’évidence même », « constat accablant »).']
    },
    {
      domain: 'format_calibrage',
      label: 'Format et calibrage',
      score: 4.5,
      maxScore: 5,
      strengths: ['Format court et percutant adapté à une tribune ou chronique.'],
      weaknesses: []
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
      explanation: 'Un taux de 95 % d’adoption constitue une affirmation statistique majeure nécessitant impérativement une source officielle (MENJ, DEPP, OCDE).',
      suggestion: 'Préciser la source de l’enquête ou reformuler (« selon une estimation récente... »).',
      confidence: 0.96
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
      explanation: 'Aucune étude scientifique ne peut être qualifiée d’« incontestable » sans nommer le laboratoire, les auteurs ou la revue à comité de lecture.',
      suggestion: 'Citer expressément les auteurs et l’année de publication de cette étude.',
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
      explanation: 'Affirmer un lien de causalité automatique et absolu sans démonstration relève du sophisme de la pente savonneuse.',
      suggestion: 'Nuancer le propos en précisant les conditions pédagogiques d’usage.',
      confidence: 0.92
    },
    {
      id: 'f_false_dilemma',
      blockId: 'b4_quote_dilemma',
      quote: 'soit nous bannissons totalement l\'IA de l\'enceinte républicaine pour préserver les Lumières, soit nous capitulons devant laSilicon Valley',
      charStart: 902,
      charEnd: 1045,
      category: 'sophisme',
      severity: 3,
      label: 'Faux dilemme manichéen',
      explanation: 'L’auteur réduit abusivement les alternatives à deux postures extrêmes et opposées, occultant délibérément les voies de régulation et d’apprentissage critique.',
      suggestion: 'Intégrer les approches intermédiaires d’éducation aux médias et à l’algorithmique.',
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
      suggestion: 'Conserver et développer davantage cet angle constructif.',
      confidence: 0.95
    }
  ],
  editorialAxes: {
    constructif: true,
    accrocheur: true,
    iconoclaste: false,
    narratif: true,
    accessible: true,
    ethique: false,
    notes: 'Manque de rigueur déontologique sur les sources de la première partie, bien rattrapé par l’axe constructif de la conclusion.'
  },
  revisionPlan: {
    priority1_blocking: [
      {
        id: 'rev_1',
        problem: 'Étude majeure non nommée et chiffre de 95 % invérifiable',
        reason: 'Risque de désinformation et de perte totale de crédibilité auprès des lecteurs avertis',
        action: 'Ajouter les hyperliens ou références précises des deux études mentionnées',
        blockId: 'b3_study',
        quote: 'Une étude récente et incontestable menée sur 50 000 élèves'
      },
      {
        id: 'rev_2',
        problem: 'Faux dilemme binaire',
        reason: 'Raisonnement fallacieux qui affaiblit la portée démonstrative de la tribune',
        action: 'Reformuler le paragraphe 4 en présentant la diversité des choix pédagogiques possibles',
        blockId: 'b4_quote_dilemma',
        quote: 'deux choix seulement s\'offrent à notre société : soit nous bannissons totalement...'
      }
    ],
    priority2_major: [
      {
        id: 'rev_3',
        problem: 'Citation anonyme non vérifiable',
        reason: 'L’autorité de l’argument repose sur un intervenant sans identité vérifiable',
        action: 'Identifier clairement la personne citée ou supprimer les guillemets',
        blockId: 'b4_quote_dilemma'
      }
    ],
    priority3_editorial_optimizations: [
      {
        id: 'rev_4',
        problem: 'Coquille typographique',
        reason: 'Espace manquant dans « laSilicon Valley »',
        action: 'Corriger en « la Silicon Valley »',
        blockId: 'b4_quote_dilemma'
      }
    ]
  },
  editorialOptimizations: {
    title: 'IA à l’école : comment dépasser la panique morale pour former l’esprit critique des élèves',
    hook: 'Entre mirage du progrès instantané et angoisse de la dépendance cognitive, l’école fait face à un défi pédagogique sans précédent.',
    angle: 'Axer la réflexion sur la formation méthodologique plutôt que sur la vaine tentative d’interdiction technique.',
    narration: 'Articuler dès l’introduction les observations de terrain des enseignants avec les données réelles de la recherche.',
    conclusion: 'Réaffirmer la mission fondamentale de l’école : faire de l’IA un objet d’étude critique plutôt qu’un substitut à la pensée.'
  },
  meta: {
    model: 'demo-fixture-v1',
    promptVersion: '1.0.0-fourches-caudines',
    analyzedAt: '2026-03-12T14:30:00.000Z',
    durationMs: 1420,
    textLengthChars: 1618,
    blocksCount: 5
  }
};