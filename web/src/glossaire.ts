/**
 * The glossary: the names of what goes wrong in an article, one page each, and
 * the matcher that ties a report's finding to the page that explains it.
 *
 * A finding's label is free text written by the model ("Faux dilemme manichéen",
 * "Étude non nommée"), so the link is found by pattern on the label, then by the
 * finding's category. Every example is a made-up article: no real outlet and no
 * real person is ever named, because a page that criticised one would be a public
 * verdict on it.
 */
import { CATEGORY_LABELS, DOMAINS, type DemoCategory } from './demo';

export type Famille = 'raisonnement' | 'faits' | 'cadrage' | 'preuves';

export const FAMILLES: ReadonlyArray<{ id: Famille; titre: string; intro: string }> = [
  {
    id: 'raisonnement',
    titre: 'Raisonnements qui déraillent',
    intro:
      'Les faits peuvent être exacts et la conclusion fausse : c’est le chemin de l’un à l’autre qui ne tient pas. On les appelle aussi des sophismes.',
  },
  {
    id: 'faits',
    titre: 'Ce que l’on fait dire aux faits',
    intro: 'Des faits exacts, mais triés, poussés trop loin, ou lus avec l’envie d’y croire.',
  },
  {
    id: 'cadrage',
    titre: 'Procédés de cadrage',
    intro: 'Le titre, les mots, les voix retenues : tout ce qui oriente le jugement sans rien prouver.',
  },
  {
    id: 'preuves',
    titre: 'Preuves et sources',
    intro: 'Ce que l’article affirme, et ce qu’il donne au lecteur pour le vérifier.',
  },
];

export interface Reference {
  texte: string;
  url?: string;
}

/** A run of text; a one-element array is the passage the example highlights. */
export type Segments = ReadonlyArray<string | readonly [string]>;

export interface Notion {
  slug: string;
  nom: string;
  aussi?: string[];
  famille: Famille;
  /** One sentence: the index card, and the page's description for search engines. */
  resume: string;
  definition: string[];
  exemple: { rubrique: string; titre: Segments; texte: Segments; lecture: string };
  /** More made-up sentences, from everyday life and public debate: the « X exemple » a search asks for. */
  exemples?: ReadonlyArray<{ cadre: string; phrase: string; lecture: string }>;
  /** The page's description for search engines, where the summary alone would not make one click. */
  description?: string;
  reperer: string[];
  /** The category a report files it under. */
  categorie: Exclude<DemoCategory, 'point-fort'>;
  /** How a report shows it, where the category alone would say it wrong. */
  signale?: string;
  question: string;
  voisines: string[];
  references?: Reference[];
  /** Matched against a finding's folded label: lower case, no accents, straight apostrophes. */
  motif: RegExp;
}

const LOCKE: Reference = {
  texte:
    'John Locke, Essai sur l’entendement humain, 1690, livre IV, chapitre 17 : il y décrit l’argument ad hominem et l’appel au respect dû aux personnes en vue, l’ad verecundiam.',
};
const MUNICH: Reference = {
  texte: 'Déclaration des devoirs et des droits des journalistes, dite charte de Munich, 1971.',
};

export const NOTIONS: readonly Notion[] = [
  {
    slug: 'faux-dilemme',
    nom: 'Faux dilemme',
    aussi: ['Fausse alternative'],
    famille: 'raisonnement',
    resume: 'Présenter deux options comme les seules possibles, alors que d’autres existent.',
    definition: [
      'Un faux dilemme réduit une question à deux réponses, souvent une acceptable et une repoussante, puis pousse le lecteur vers la première. Les autres possibilités, les solutions intermédiaires, le « un peu des deux », disparaissent du texte.',
      'Il y a parfois vraiment deux options. Le sophisme commence quand l’article l’affirme sans le montrer.',
    ],
    exemple: {
      rubrique: 'Tribune',
      titre: ['Écrans : il faut choisir'],
      texte: [
        'Les familles n’ont plus le choix. ',
        ['Soit on interdit le téléphone avant quinze ans, soit on accepte de sacrifier une génération.'],
        ' Le reste n’est que bavardage.',
      ],
      lecture:
        'Entre l’interdiction totale et le sacrifice d’une génération, il existe tout un éventail, des règles d’usage à l’accompagnement des parents. Le texte écarte ces solutions d’un mot, « bavardage », au lieu de dire pourquoi elles ne suffiraient pas.',
    },
    reperer: [
      'Une construction en « soit… soit… », « ou bien… ou bien… », « c’est X ou Y ».',
      'L’une des deux options est si repoussante que personne ne la choisirait.',
      'Les solutions intermédiaires ne sont ni citées ni réfutées.',
    ],
    categorie: 'sophisme',
    question:
      'Trouvez au moins deux options que l’article ne mentionne pas. Pourquoi, à votre avis, l’auteur ne les cite-t-il pas ?',
    voisines: ['pente-savonneuse', 'homme-de-paille', 'appel-a-l-emotion'],
    motif: /dilemme|fausse alternative|alternative binaire|manichee|tout ou rien/,
  },
  {
    slug: 'homme-de-paille',
    nom: 'Homme de paille',
    aussi: ['Épouvantail', 'Sophisme de l’épouvantail'],
    famille: 'raisonnement',
    resume: 'Déformer la position de quelqu’un pour la réfuter plus facilement.',
    definition: [
      'L’homme de paille consiste à répondre non pas à ce que l’autre a dit, mais à une version simplifiée, exagérée ou caricaturée de ce qu’il a dit. Cette version est facile à démolir, et le lecteur repart avec l’impression que la vraie position a été réfutée.',
      'L’image est celle d’un mannequin bourré de paille : on peut le frapper autant qu’on veut, il ne se défend pas.',
    ],
    exemple: {
      rubrique: 'Éditorial',
      titre: ['Les vélos contre les commerçants'],
      texte: [
        'Les partisans de la piste cyclable rue du Marché ',
        ['veulent tout simplement chasser les voitures du centre-ville et tuer le commerce'],
        '. Il faudrait pourtant que quelqu’un pense aux commerçants.',
      ],
      lecture:
        'Une piste cyclable dans une rue n’est pas l’interdiction des voitures en ville. L’éditorial prête au camp d’en face une position extrême qu’il ne cite nulle part, puis la combat. Le lecteur ne saura pas ce que les partisans de la piste proposent vraiment.',
    },
    reperer: [
      'La position adverse est résumée, jamais citée.',
      'Des tournures comme « tout simplement », « en réalité, ils veulent », « autrement dit ».',
      'La version résumée est plus extrême que ce qu’on peut raisonnablement défendre.',
    ],
    categorie: 'sophisme',
    question:
      'Écrivez en une phrase ce que les partisans de la piste pourraient réellement défendre. L’argument de l’éditorial tient-il encore face à cette version ?',
    voisines: ['proces-d-intention', 'faux-dilemme', 'citation-tronquee'],
    motif: /homme de paille|epouvantail|caricatur|position deformee|deformation de/,
  },
  {
    slug: 'ad-hominem',
    nom: 'Attaque ad hominem',
    aussi: ['Ad hominem', 'Attaque contre la personne'],
    famille: 'raisonnement',
    resume: 'Disqualifier un argument en attaquant la personne qui le porte.',
    definition: [
      'L’argument ad hominem ne discute pas ce que dit quelqu’un : il s’en prend à qui il est. Son âge, son métier, son passé, ses fréquentations ou son physique remplacent la réponse.',
      'Un fait sur la personne compte parfois vraiment, un conflit d’intérêts par exemple. Il doit alors être établi et relié à l’argument, pas lancé pour discréditer.',
    ],
    exemple: {
      rubrique: 'Société',
      titre: ['Le rapport sur les cantines'],
      texte: [
        'Le rapport recommande de servir davantage de repas végétariens. ',
        ['Faut-il rappeler que sa principale autrice n’a jamais tenu une cuisine de sa vie ?'],
        ' Les parents apprécieront.',
      ],
      lecture:
        'Savoir si l’autrice a déjà cuisiné ne dit rien de la qualité des données du rapport. L’article ne discute ni ses chiffres ni ses recommandations : il cherche à faire douter de la personne pour ne pas avoir à répondre sur le fond.',
    },
    reperer: [
      'Le texte parle de la personne au moment où l’on attendait une réponse sur le fond.',
      'Des détails biographiques sans lien avec la question posée.',
      'L’argument adverse n’est jamais examiné.',
    ],
    categorie: 'sophisme',
    question:
      'Si le même rapport avait été signé par une cheffe étoilée, ses chiffres seraient-ils plus justes ? Que faudrait-il vérifier à la place ?',
    voisines: ['proces-d-intention', 'homme-de-paille', 'argument-d-autorite'],
    references: [LOCKE],
    motif: /ad hominem|attaque (personnelle|contre la personne|de la personne)|disqualifi/,
  },
  {
    slug: 'correlation-causalite',
    nom: 'Corrélation prise pour causalité',
    aussi: ['Corrélation n’est pas causalité', 'Effet cigogne', 'Post hoc'],
    famille: 'raisonnement',
    resume: 'Conclure qu’une chose cause l’autre parce qu’elles vont ensemble.',
    description:
      'Corrélation ou causalité : comment repérer la confusion dans un article ? Définition, trois exemples et les verbes qui trahissent le saut.',
    definition: [
      'Deux phénomènes qui évoluent ensemble sont corrélés. Cela ne prouve pas que l’un provoque l’autre : un troisième facteur peut agir sur les deux, la cause peut aller dans l’autre sens, ou la coïncidence peut tenir du hasard.',
      'Une variante, dite post hoc, tient pour cause ce qui est seulement arrivé avant : « après cela, donc à cause de cela ».',
    ],
    exemple: {
      rubrique: 'Santé',
      titre: ['Le café, secret de la réussite scolaire ?'],
      texte: [
        'Selon une enquête menée dans trois lycées, ',
        ['les élèves qui boivent du café ont de meilleures notes : le café rendrait donc plus performant'],
        '. De quoi revoir les menus de la cafétéria.',
      ],
      lecture:
        'Les élèves qui boivent du café sont peut-être plus âgés, ou révisent plus tard le soir. L’enquête montre que les deux vont ensemble, pas que l’un cause l’autre. Le conditionnel « rendrait » ne corrige pas le saut : le titre et la chute le tiennent pour acquis.',
    },
    exemples: [
      {
        cadre: 'L’effet cigogne',
        phrase:
          'Dans les communes où nichent le plus de cigognes, on compte aussi le plus de naissances : les cigognes apportent donc les bébés.',
        lecture:
          'L’exemple qui a donné son nom à l’effet. Un troisième facteur, comme la taille de la commune ou son caractère rural, peut faire varier les nids et les naissances ensemble, sans que l’un agisse sur l’autre.',
      },
      {
        cadre: 'Dans la vie courante',
        phrase: 'Depuis que je porte ce bracelet magnétique, mon mal de dos a disparu.',
        lecture:
          'Après, donc à cause : c’est le post hoc. Beaucoup de douleurs passent d’elles-mêmes en quelques semaines. Seule une comparaison avec des personnes sans bracelet dirait s’il y est pour quelque chose.',
      },
      {
        cadre: 'Dans un débat public',
        phrase: 'Les villes qui ont le plus de policiers ont aussi le plus de délits : la police attire la délinquance.',
        lecture:
          'La cause va sans doute dans l’autre sens : on affecte plus de policiers là où il y a plus de délits. Et une grande ville a plus des deux. Le lien existe, la conclusion le lit à l’envers.',
      },
    ],
    reperer: [
      'Des verbes de cause (« provoque », « rend », « fait baisser ») appuyés sur une simple comparaison de groupes.',
      'Aucune mention d’un autre facteur qui pourrait expliquer les deux.',
      'Une enquête ou une étude d’observation présentée comme une expérience.',
    ],
    categorie: 'sophisme',
    question:
      'Proposez une autre explication au lien entre café et bonnes notes. Quelle expérience faudrait-il mener pour trancher ?',
    voisines: ['surinterpretation', 'generalisation-hative', 'chiffre-sans-origine'],
    references: [
      { texte: 'Tyler Vigen, Spurious Correlations, Hachette Books, 2015 : un recueil de corrélations parfaites et absurdes.' },
    ],
    motif: /correlation|causal|post hoc|lien de cause|effet cigogne/,
  },
  {
    slug: 'generalisation-hative',
    nom: 'Généralisation hâtive',
    aussi: ['Généralisation abusive', 'Conclusion hâtive'],
    famille: 'raisonnement',
    resume: 'Tirer une règle générale de quelques cas, parfois d’un seul.',
    description:
      'Comment reconnaître une généralisation hâtive, ou conclusion hâtive, dans un article ? Définition, trois exemples et les mots qui la trahissent.',
    definition: [
      'La généralisation hâtive part d’un petit nombre d’exemples, souvent frappants, et en tire une conclusion sur tout un groupe. Un témoignage devient une tendance, trois cas deviennent « les jeunes », « les médecins », « les habitants ».',
      'Les psychologues Amos Tversky et Daniel Kahneman ont montré en 1971 que nous attendons des petits échantillons qu’ils ressemblent à l’ensemble, ce qui rend ce raccourci très naturel.',
    ],
    exemple: {
      rubrique: 'Reportage',
      titre: ['Le télétravail a vidé les bureaux'],
      texte: [
        'Dans l’agence que nous avons visitée, trois salariés sur quatre ne viennent plus qu’une fois par semaine. ',
        ['Les Français ont tourné le dos au bureau'],
        ', et rien ne les fera revenir.',
      ],
      lecture:
        'Une agence, quatre salariés : c’est un point de départ pour un reportage, pas une mesure de ce que font « les Français ». Pour parler du pays entier, il faudrait une enquête sur un échantillon large et représentatif.',
    },
    exemples: [
      {
        cadre: 'Dans la vie courante',
        phrase: 'J’ai eu deux pannes avec cette marque de voiture : elles ne valent rien.',
        lecture:
          'Deux voitures, c’est l’expérience d’un conducteur, pas la fiabilité d’une marque qui en vend des centaines de milliers. Les chiffres de pannes sur l’ensemble des véhicules pourraient dire la même chose, mais sur une vraie base.',
      },
      {
        cadre: 'Dans un micro-trottoir',
        phrase: 'Nous avons interrogé dix passants : la réforme est massivement rejetée par les Français.',
        lecture:
          'Dix passants, dans une rue, à une heure donnée, ne représentent pas le pays. Un micro-trottoir montre des avis, il ne mesure pas une opinion : c’est le rôle d’un sondage sur un échantillon construit pour cela.',
      },
      {
        cadre: 'Après un fait divers',
        phrase: 'Encore un accident de trottinette ce week-end : ces engins sont devenus un danger public.',
        lecture:
          'Un accident, même grave, ne dit pas si la trottinette est plus dangereuse que le vélo ou la voiture. Il faudrait compter les accidents par trajet ou par kilomètre parcouru, sur toute une année.',
      },
    ],
    reperer: [
      'Un passage brusque de « ici », « chez eux » à « les Français », « tout le monde ».',
      'Des mots comme « tous », « toujours », « plus personne ».',
      'La conclusion porte sur un groupe bien plus large que celui qui a été observé.',
    ],
    categorie: 'sophisme',
    question:
      'Combien de personnes l’article a-t-il réellement observées ? Combien en faudrait-il, et choisies comment, pour parler des « Français » ?',
    voisines: ['cherry-picking', 'chiffre-sans-origine', 'correlation-causalite'],
    references: [
      {
        texte: 'Amos Tversky et Daniel Kahneman, « Belief in the law of small numbers », Psychological Bulletin, 1971.',
        url: 'https://doi.org/10.1037/h0031322',
      },
    ],
    motif: /generalisation|generalise|cas isole|anecdot|conclusion hative/,
  },
  {
    slug: 'pente-savonneuse',
    nom: 'Pente savonneuse',
    aussi: ['Pente glissante', 'Effet domino'],
    famille: 'raisonnement',
    resume: 'Affirmer qu’un premier pas mènera forcément, de proche en proche, à une catastrophe.',
    definition: [
      'La pente savonneuse annonce qu’une mesure modeste entraînera une suite d’autres, chacune pire que la précédente, jusqu’à un résultat inacceptable. Le lecteur, effrayé par l’arrivée, rejette le point de départ.',
      'Certaines chaînes de conséquences sont réelles. Le raisonnement devient fautif quand chaque marche est affirmée sans être démontrée, et que l’arrivée est présentée comme inévitable.',
    ],
    exemple: {
      rubrique: 'Opinion',
      titre: ['Le stationnement payant, et après ?'],
      texte: [
        'La mairie veut rendre payantes cent places du centre. ',
        ['Aujourd’hui le stationnement, demain la circulation, après-demain l’interdiction pure et simple de la voiture'],
        '. Il faut dire non dès maintenant.',
      ],
      lecture:
        'Rien dans le texte n’explique pourquoi cent places payantes mèneraient à interdire la voiture : chaque étape est simplement annoncée. Le lecteur est invité à juger la dernière, la plus inquiétante, au lieu de la mesure réellement proposée.',
    },
    reperer: [
      'Des enchaînements « aujourd’hui… demain… après-demain », « c’est la porte ouverte à… ».',
      'Les étapes intermédiaires ne sont ni sourcées ni expliquées.',
      'La mesure discutée est petite, la conséquence annoncée est énorme.',
    ],
    categorie: 'sophisme',
    question:
      'Reprenez chaque étape de la chaîne. Laquelle vous paraît la moins probable ? Que faudrait-il pour qu’elle se produise ?',
    voisines: ['faux-dilemme', 'appel-a-l-emotion', 'surinterpretation'],
    references: [{ texte: 'Douglas Walton, Slippery Slope Arguments, Oxford University Press, 1992.' }],
    motif: /pente (savonneuse|glissante)|engrenage|effet domino|reaction en chaine|porte ouverte/,
  },
  {
    slug: 'argument-d-autorite',
    nom: 'Argument d’autorité',
    aussi: ['Appel à l’autorité', 'Ad verecundiam'],
    famille: 'raisonnement',
    resume: 'Tenir une affirmation pour vraie parce qu’une personne prestigieuse l’a dite.',
    definition: [
      'L’argument d’autorité remplace la preuve par le prestige de celui qui parle, un titre ou un prix. Il trompe d’autant plus que cette personne s’exprime hors de son domaine.',
      'S’appuyer sur des experts n’a rien de fautif, c’est même souvent ce qu’il y a de plus raisonnable. La question est de savoir s’ils sont compétents sur ce sujet précis, et si ce qu’ils disent est étayé.',
    ],
    exemple: {
      rubrique: 'Économie',
      titre: ['Faut-il acheter de l’or ?'],
      texte: [
        'L’or va doubler d’ici deux ans. ',
        ['C’est en tout cas l’avis d’un prix Nobel de médecine, qui y a placé l’essentiel de son épargne'],
        '. Difficile de faire plus sérieux.',
      ],
      lecture:
        'Un prix Nobel de médecine n’a aucune compétence particulière pour prédire le cours de l’or. L’article ne donne pas un argument sur le marché lui-même : tout repose sur le prestige d’un titre obtenu dans un autre domaine.',
    },
    reperer: [
      'Le titre de la personne est mis en avant plus que ses arguments.',
      'Son domaine d’expertise ne correspond pas au sujet traité.',
      'Une formule clôt la discussion : « difficile de contester », « quand on sait qui le dit ».',
    ],
    categorie: 'sophisme',
    question:
      'Sur quel sujet ce prix Nobel serait-il un bon témoin ? Qui faudrait-il interroger sur le cours de l’or, et que faudrait-il lui demander ?',
    voisines: ['autorite-anonyme', 'appel-a-la-popularite', 'ad-hominem'],
    references: [LOCKE],
    motif: /argument d'autorite|appel a l'autorite|ad verecundiam|autorite (invoquee|mal placee|hors|incompetente)|prestige/,
  },
  {
    slug: 'appel-a-la-popularite',
    nom: 'Appel à la popularité',
    aussi: ['Ad populum', 'Appel au sens commun'],
    famille: 'raisonnement',
    resume: 'Présenter une idée comme vraie parce que beaucoup de gens y croient.',
    definition: [
      'L’appel à la popularité fait du nombre une preuve : « tout le monde le sait », « les Français l’ont compris », « le bon sens le dit ». Qu’une opinion soit répandue renseigne sur l’opinion, pas sur la réalité qu’elle décrit.',
      'Le procédé est efficace parce qu’il met le lecteur mal à l’aise : douter, c’est se mettre à part.',
    ],
    exemple: {
      rubrique: 'Tribune',
      titre: ['Les devoirs, une évidence'],
      texte: [
        'Inutile de chercher des études compliquées. ',
        ['Tous les parents le savent : sans devoirs à la maison, les enfants n’apprennent rien'],
        '. Le bon sens a parlé.',
      ],
      lecture:
        'Que beaucoup de parents le pensent n’établit pas que c’est vrai, et l’article ne dit même pas d’où il tient que « tous » le pensent. Il écarte d’avance les « études compliquées », c’est-à-dire précisément ce qui permettrait de vérifier.',
    },
    reperer: [
      '« Tout le monde sait », « chacun a compris », « le bon sens ».',
      'Un sondage d’opinion utilisé pour trancher une question de fait.',
      'Les études et les preuves sont écartées comme inutiles ou suspectes.',
    ],
    categorie: 'sophisme',
    question:
      'Citez une idée que presque tout le monde a crue pendant longtemps et qui s’est révélée fausse. Qu’est-ce qui a permis de le savoir ?',
    voisines: ['argument-d-autorite', 'opinion-presentee-comme-fait', 'biais-de-confirmation'],
    motif: /popularit|ad populum|sens commun|bon sens|tout le monde|majorite/,
  },
  {
    slug: 'fausse-analogie',
    nom: 'Fausse analogie',
    aussi: ['Comparaison trompeuse', 'Amalgame'],
    famille: 'raisonnement',
    resume: 'Rapprocher deux situations qui se ressemblent en surface pour conclure de l’une à l’autre.',
    definition: [
      'Une analogie aide à comprendre en rapprochant une situation nouvelle d’une situation connue. Elle devient fausse quand les deux situations diffèrent justement sur le point qui compte, et que l’article conclut quand même de l’une à l’autre.',
      'L’image est souvent choisie pour son effet : une mesure comparée à une dictature, une entreprise à une famille, le budget d’un État à celui d’un ménage.',
    ],
    exemple: {
      rubrique: 'Éditorial',
      titre: ['La dette, ce fardeau'],
      texte: [
        'Aucune famille ne peut dépenser plus qu’elle ne gagne. ',
        ['L’État est comme un ménage : s’il vit à crédit, il finira à la rue'],
        '. Il est temps de couper dans les dépenses.',
      ],
      lecture:
        'Un État ne part pas à la retraite, lève l’impôt et emprunte sur des durées qu’aucun ménage ne connaît. Ces différences touchent exactement la question posée, celle de la dette. On peut défendre des économies avec d’autres arguments ; celui-ci ne les porte pas.',
    },
    reperer: [
      '« X, c’est comme Y », « exactement comme », « rien d’autre que ».',
      'La comparaison sert de conclusion au lieu d’illustrer un raisonnement.',
      'En quoi les deux situations diffèrent-elles, et cette différence change-t-elle tout ?',
    ],
    categorie: 'sophisme',
    question: 'Listez trois différences entre un État et un ménage. Laquelle compte le plus pour la question de la dette ?',
    voisines: ['generalisation-hative', 'vocabulaire-charge', 'homme-de-paille'],
    motif: /analogie|comparaison (abusive|trompeuse|boiteuse|douteuse|fallacieuse)|amalgame/,
  },
  {
    slug: 'cherry-picking',
    nom: 'Sélection des faits',
    aussi: ['Cherry picking', 'Cueillette de cerises'],
    famille: 'faits',
    resume: 'Ne retenir que les faits qui vont dans le sens voulu et taire les autres.',
    definition: [
      'La sélection des faits ne ment pas forcément : chaque élément cité peut être exact. C’est le tri qui trompe. L’article montre l’année record et oublie les dix autres, cite l’étude favorable et passe sous silence celles qui la contredisent.',
      'Le nom anglais vient de la cueillette : on ne ramasse que les plus belles cerises, et le panier donne une fausse idée de l’arbre.',
    ],
    exemple: {
      rubrique: 'Ville',
      titre: ['La délinquance explose'],
      texte: [
        'Les chiffres du commissariat sont sans appel : ',
        ['les cambriolages ont bondi de 40 % entre mars et avril'],
        '. Le quartier n’est plus sûr.',
      ],
      lecture:
        'Entre deux mois qui se suivent, on trouve presque toujours une hausse quelque part. L’article ne dit rien de l’année entière, ni des années précédentes, ni du nombre réel de cambriolages : 40 %, cela peut vouloir dire sept au lieu de cinq.',
    },
    reperer: [
      'Une période de comparaison courte, ou choisie sans explication.',
      'Un seul exemple, une seule étude, là où le sujet en compte beaucoup.',
      'Les données qui iraient dans l’autre sens ne sont jamais évoquées, même pour être écartées.',
    ],
    categorie: 'cadrage',
    question:
      'Quelles données faudrait-il ajouter pour savoir si le quartier est vraiment devenu moins sûr ? Où pourrait-on les trouver ?',
    voisines: ['chiffre-sans-origine', 'citation-tronquee', 'biais-de-confirmation'],
    references: [
      {
        texte: `${MUNICH.texte} Elle demande de ne pas supprimer les informations essentielles.`,
      },
    ],
    motif: /cherry|cueillette|selection (des faits|des donnees|partielle|biaisee)|selecti|omission|contexte (manquant|omis|absent)|passe sous silence/,
  },
  {
    slug: 'biais-de-confirmation',
    nom: 'Biais de confirmation',
    famille: 'faits',
    resume: 'Retenir ce qui confirme ce que l’on pense déjà, et négliger le reste.',
    definition: [
      'Le biais de confirmation est une tendance que nous partageons tous : nous cherchons, remarquons et retenons plus volontiers les informations qui vont dans le sens de nos convictions. Une preuve contraire nous paraît plus fragile, une preuve favorable plus solide.',
      'C’est un trait du lecteur, pas un défaut de l’article. Mais un article peut le nourrir, en ne montrant qu’un côté de la question à ceux qui en sont déjà convaincus.',
    ],
    exemple: {
      rubrique: 'Sciences',
      titre: ['Les ondes, enfin la preuve ?'],
      texte: [
        'Nos lecteurs nous l’écrivaient depuis des années. ',
        ['Une nouvelle étude confirme enfin ce que beaucoup ressentaient : les antennes perturbent le sommeil'],
        '. Les autres travaux n’avaient sans doute pas posé les bonnes questions.',
      ],
      lecture:
        'Le texte accueille l’étude parce qu’elle confirme ce que « beaucoup ressentaient », et écarte les autres sans les examiner. Une étude seule, contredite par d’autres, demande au contraire d’être regardée de près : sa méthode, et ce qu’en disent les travaux qui l’ont précédée.',
    },
    reperer: [
      '« Enfin la preuve », « comme on s’en doutait », « confirme ce que l’on savait ».',
      'Une étude favorable mise en avant, les études contraires balayées sans examen.',
      'Et pour vous : l’article vous fait plaisir ? C’est le moment de le relire plus lentement.',
    ],
    categorie: 'cadrage',
    signale:
      'Squiggle juge le texte, jamais le lecteur : il ne signale donc pas un « biais de confirmation » en tant que tel. Il relève ce qui le nourrit, une sélection des faits, une étude unique présentée comme décisive, des travaux contraires écartés sans examen.',
    question:
      'Pensez à une opinion à laquelle vous tenez. Quelle information vous ferait changer d’avis ? Où iriez-vous la chercher ?',
    voisines: ['cherry-picking', 'appel-a-la-popularite', 'surinterpretation'],
    references: [
      {
        texte:
          'Raymond S. Nickerson, « Confirmation Bias: A Ubiquitous Phenomenon in Many Guises », Review of General Psychology, 1998.',
        url: 'https://doi.org/10.1037/1089-2680.2.2.175',
      },
    ],
    motif: /biais de confirmation|chambre d'echo/,
  },
  {
    slug: 'surinterpretation',
    nom: 'Surinterprétation',
    aussi: ['Conclusion qui dépasse les données'],
    famille: 'faits',
    resume: 'Tirer d’une étude ou d’un fait une conclusion plus large ou plus forte que ce qu’ils permettent.',
    definition: [
      'La surinterprétation part d’un résultat réel et le pousse trop loin : un essai sur des souris devient un traitement, un effet modeste une révolution. Chaque pas paraît petit, mais à l’arrivée la conclusion ne repose plus sur rien.',
      'En 2014, une équipe de l’université de Cardiff a comparé des communiqués de presse universitaires sur la santé aux articles qui en ont été tirés : une bonne part des exagérations relevées dans la presse figurait déjà dans les communiqués.',
    ],
    exemple: {
      rubrique: 'Sciences',
      titre: ['Une appli contre la dépression'],
      texte: [
        'Dans une étude menée auprès de 40 volontaires pendant trois semaines, ',
        ['l’application a fait reculer les symptômes : la fin des antidépresseurs est peut-être proche'],
        '.',
      ],
      lecture:
        'Quarante volontaires, trois semaines, et rien sur un groupe de comparaison : c’est un premier résultat, intéressant mais fragile. Pour parler de « la fin des antidépresseurs », il faudrait franchir des étapes que l’étude n’a pas franchies : plus de patients, plus longtemps, face à un traitement existant.',
    },
    reperer: [
      'Comparez la taille et la durée de l’étude à l’ampleur de la conclusion.',
      'Un passage de l’animal à l’humain, du petit groupe à tout le monde, de « associé à » à « provoque ».',
      'Des mots comme « révolution », « percée », « la fin de ».',
    ],
    categorie: 'surinterpretation',
    question:
      'Qu’est-ce que cette étude permet vraiment de dire ? Écrivez la conclusion la plus forte que vous pouvez défendre avec ses seuls résultats.',
    voisines: ['titre-trompeur', 'correlation-causalite', 'generalisation-hative'],
    references: [
      {
        texte:
          'Petroc Sumner et al., « The association between exaggeration in health related science news and academic press releases », BMJ, 2014.',
        url: 'https://doi.org/10.1136/bmj.g7015',
      },
    ],
    motif: /surinterpret|extrapol|conclusion (excessive|abusive)|depasse|surestim|portee/,
  },
  {
    slug: 'titre-trompeur',
    nom: 'Titre qui en dit plus que l’article',
    aussi: ['Titre trompeur', 'Chapô qui surinterprète'],
    famille: 'cadrage',
    resume: 'Un titre ou un chapô qui affirme plus, ou autre chose, que ce que le texte démontre.',
    definition: [
      'Le titre est souvent la seule partie lue : une étude de 2016 sur les liens partagés sur Twitter a trouvé qu’une grande partie n’était jamais ouverte. Quand le titre force le trait, change une hypothèse en certitude ou un cas en tendance, beaucoup de lecteurs garderont cette version, même si l’article la nuance plus bas.',
      'Ce n’est pas toujours le fait de l’auteur de l’article : dans beaucoup de rédactions, le titre est écrit par quelqu’un d’autre. Pour le lecteur, l’effet est le même.',
    ],
    exemple: {
      rubrique: 'Santé',
      titre: [['Le chocolat noir protège du cancer']],
      texte: [
        'Une équipe de chercheurs a nourri des souris au cacao pendant six mois. Leurs tumeurs ont grossi moins vite. Les auteurs précisent qu’aucun effet n’a été mesuré chez l’humain et qu’il faudra d’autres essais.',
      ],
      lecture:
        'L’article est prudent, son titre ne l’est pas. Une expérience sur des souris devient une protection pour tout le monde, au présent de vérité générale. Le lecteur pressé, qui ne lit que le titre, repart avec une certitude que les chercheurs n’ont pas.',
    },
    reperer: [
      'Comparez le verbe du titre à celui de la conclusion : « protège » contre « a ralenti chez la souris ».',
      'Cherchez dans le texte les réserves (échantillon, animaux, premier résultat) absentes du titre.',
      'Un point d’interrogation ou des guillemets peuvent laisser entendre ce que l’article ne dit pas.',
    ],
    categorie: 'cadrage',
    question:
      'Réécrivez le titre pour qu’il dise exactement ce que l’article établit. Est-il encore aussi accrocheur ?',
    voisines: ['surinterpretation', 'vocabulaire-charge', 'correlation-causalite'],
    references: [
      {
        texte:
          'Ullrich Ecker et al., « The effects of subtle misinformation in news headlines », Journal of Experimental Psychology: Applied, 2014 : un titre trompeur oriente le souvenir et le jugement, même quand l’article est exact.',
        url: 'https://doi.org/10.1037/xap0000028',
      },
      {
        texte:
          'Maksym Gabielkov et al., « Social Clicks: What and Who Gets Read on Twitter? », ACM SIGMETRICS, 2016.',
        url: 'https://doi.org/10.1145/2896377.2901462',
      },
    ],
    motif: /titre|chapo|chapeau|accroche|clickbait|putaclic/,
  },
  {
    slug: 'vocabulaire-charge',
    nom: 'Vocabulaire chargé',
    aussi: ['Mots chargés', 'Hyperbole', 'Exagération'],
    famille: 'cadrage',
    resume: 'Des mots choisis pour faire ressentir un jugement plutôt que pour décrire.',
    definition: [
      'Pour un même fait, il existe des mots qui décrivent et des mots qui jugent : « manifestants » ou « casseurs », « réforme » ou « saccage », « hausse » ou « flambée ». Le vocabulaire chargé fait passer une appréciation sans l’argumenter, et le lecteur la reçoit comme une description.',
      'En 1974, les psychologues Elizabeth Loftus et John Palmer ont montré qu’en changeant un seul verbe dans une question sur un accident filmé, on changeait la vitesse dont les témoins se souvenaient.',
    ],
    exemple: {
      rubrique: 'Ville',
      titre: ['Le budget des écoles'],
      texte: [
        'Le conseil municipal a voté le budget. ',
        ['Les écoles subissent un véritable massacre budgétaire'],
        ', avec des crédits en baisse de 2 % sur un an.',
      ],
      lecture:
        'Une baisse de 2 % peut se discuter, et l’article a le droit de la juger. Mais « massacre » fait le travail que devraient faire les faits : ce qui sera supprimé, pour combien d’élèves, avec quelles conséquences. Ici, le mot remplace l’argument.',
    },
    reperer: [
      'Remplacez le mot par un équivalent neutre : la phrase dit-elle encore la même chose ?',
      'Des superlatifs, des images guerrières ou médicales (« hémorragie », « asphyxie ») pour des faits mesurables.',
      'Un écart entre la force du mot et la taille du chiffre qui l’accompagne.',
    ],
    categorie: 'cadrage',
    question:
      'Réécrivez la phrase avec des mots neutres, puis avec des mots chargés dans l’autre sens. Laquelle des trois versions est la plus juste ?',
    voisines: ['euphemisme', 'appel-a-l-emotion', 'opinion-presentee-comme-fait'],
    references: [
      {
        texte:
          'Elizabeth Loftus et John Palmer, « Reconstruction of automobile destruction », Journal of Verbal Learning and Verbal Behavior, 1974.',
        url: 'https://doi.org/10.1016/S0022-5371(74)80011-3',
      },
    ],
    motif: /vocabulaire|lexique|termes? charge|mots? charge|connot|hyperbol|exager|emphati|formule appuyee|superlatif|dramatis|sensationnal/,
  },
  {
    slug: 'euphemisme',
    nom: 'Euphémisme',
    aussi: ['Langue de bois', 'Atténuation'],
    famille: 'cadrage',
    resume: 'Des mots choisis pour adoucir un fait et le rendre plus acceptable.',
    definition: [
      'L’euphémisme est l’envers du vocabulaire chargé : il atténue. Un « plan de sauvegarde de l’emploi » supprime des postes, un « ajustement tarifaire » augmente les prix, des « dommages collatéraux » sont des victimes. Le lecteur reçoit le fait, mais sans son poids.',
      'George Orwell en a fait la critique en 1946 dans « Politics and the English Language » : une langue vague permet de dire des choses graves sans les faire voir.',
    ],
    exemple: {
      rubrique: 'Entreprises',
      titre: ['Une usine se réorganise'],
      texte: [
        'Le groupe annonce ',
        ['une optimisation de ses effectifs sur le site'],
        ', qui lui permettra de gagner en agilité.',
      ],
      lecture:
        'Derrière « optimisation des effectifs », il y a sans doute des suppressions de postes, mais l’article ne dit ni combien, ni lesquels, ni ce que deviendront les salariés. Il reprend la formule de l’entreprise sans la traduire.',
    },
    reperer: [
      'Des mots abstraits (« ajustement », « rationalisation », « optimisation ») là où l’on attend un chiffre.',
      'Le vocabulaire d’un communiqué repris tel quel, sans guillemets.',
      'La question à se poser : concrètement, qu’est-ce qui change, et pour qui ?',
    ],
    categorie: 'cadrage',
    question:
      'Traduisez « optimisation des effectifs » en langage courant. Quelles questions l’auteur de l’article aurait-il pu poser à l’entreprise ?',
    voisines: ['vocabulaire-charge', 'opinion-presentee-comme-fait', 'autorite-anonyme'],
    references: [
      { texte: 'George Orwell, « Politics and the English Language », 1946.' },
      {
        texte:
          'Amos Tversky et Daniel Kahneman, « The Framing of Decisions and the Psychology of Choice », Science, 1981 : la même issue, décrite en vies sauvées ou en vies perdues, ne fait pas faire les mêmes choix.',
        url: 'https://doi.org/10.1126/science.7455683',
      },
    ],
    motif: /euphemi|attenu|litote|edulcor|minimis|langue de bois/,
  },
  {
    slug: 'opinion-presentee-comme-fait',
    nom: 'Opinion présentée comme un fait',
    famille: 'cadrage',
    resume: 'Un jugement formulé avec la grammaire d’un fait établi.',
    definition: [
      'Un fait se vérifie : une date, un chiffre, une décision. Une opinion s’argumente : ce qui est bon, juste, souhaitable. Un article peut défendre des opinions, à condition qu’on les reconnaisse comme telles. Le problème commence quand un jugement prend la forme d’un constat, au présent de l’indicatif, sans « selon » ni « à mon sens ».',
      'Dans une tribune signée, l’opinion est attendue. Dans un article d’information, elle devrait être attribuée à quelqu’un.',
    ],
    exemple: {
      rubrique: 'Culture',
      titre: ['Le nouveau musée ouvre ses portes'],
      texte: [
        'Le bâtiment a coûté 30 millions d’euros et accueillera ses premiers visiteurs samedi. ',
        ['C’est une réussite architecturale qui fera date'],
        ', et une excellente nouvelle pour la région.',
      ],
      lecture:
        'Le coût et la date d’ouverture sont des faits. « Une réussite qui fera date » est un jugement, et même une prédiction : il n’est attribué à personne, ni à un critique, ni à un architecte, ni à des visiteurs. Il est donné au lecteur comme un acquis, dans un article qui se présente comme de l’information.',
    },
    reperer: [
      'Des mots de valeur (« réussite », « échec », « excellente ») sans personne pour les porter.',
      'Une prédiction au futur de certitude : « fera date », « changera tout ».',
      'Le genre de l’article : information, analyse ou tribune ? Une opinion n’y a pas la même place.',
    ],
    categorie: 'cadrage',
    question:
      'Classez chaque phrase de l’exemple : fait vérifiable ou opinion ? Comment réécrire l’opinion pour qu’on sache qui la porte ?',
    voisines: ['vocabulaire-charge', 'debat-presente-comme-clos', 'affirmation-non-etayee'],
    references: [
      {
        texte: 'Pew Research Center, « Distinguishing Between Factual and Opinion Statements in the News », 2018.',
        url: 'https://www.pewresearch.org/journalism/2018/06/18/distinguishing-between-factual-and-opinion-statements-in-the-news/',
      },
    ],
    motif: /opinion|jugement de valeur|subjectiv|editorialis/,
  },
  {
    slug: 'citation-tronquee',
    nom: 'Citation tronquée',
    aussi: ['Citation hors contexte', 'Citation sélective'],
    famille: 'cadrage',
    resume: 'Une citation coupée ou sortie de son contexte, qui fait dire à quelqu’un autre chose que ce qu’il a dit.',
    description:
      'Comment reconnaître une citation tronquée ou sortie de son contexte ? Définition, trois exemples et les signes qui la trahissent dans un article.',
    definition: [
      'Des guillemets donnent une impression d’exactitude : ce sont les mots mêmes de la personne. Mais on peut couper une phrase, retirer la réserve qui suivait, la déplacer d’un sujet à un autre, et lui faire dire l’inverse.',
      'Les chartes de déontologie des journalistes, dont la charte de Munich de 1971, demandent de ne pas altérer les textes et les documents.',
    ],
    exemple: {
      rubrique: 'Politique locale',
      titre: ['La maire et les impôts'],
      texte: [
        'Interrogée sur la taxe foncière, la maire a déclaré : « ',
        ['Nous allons augmenter les impôts'],
        ' ». Les propriétaires sont prévenus.',
      ],
      lecture:
        'Supposons que la phrase complète ait été : « Nous allons augmenter les impôts si l’État supprime sa dotation, ce que nous ne souhaitons pas. » La citation est exacte mot pour mot, et pourtant elle trompe : la condition a disparu. Sans l’enregistrement ou le texte intégral, le lecteur ne peut pas le savoir.',
    },
    exemples: [
      {
        cadre: 'Sur une affiche de film',
        phrase:
          'L’affiche cite une critique : « Un film magnifique ». La phrase complète était : « Un film magnifique pendant dix minutes, puis interminable. »',
        lecture:
          'Chaque mot cité est exact, et pourtant l’avis est inversé. C’est la forme la plus simple de la citation tronquée : garder le compliment, couper la réserve.',
      },
      {
        cadre: 'Dans un débat',
        phrase:
          'Le ministre l’a reconnu lui-même : « la situation est grave ». Il avait dit : « Certains répètent que la situation est grave ; les chiffres montrent qu’elle s’améliore. »',
        lecture:
          'Le ministre rapportait l’avis des autres pour le contester. En gardant quatre mots, on lui fait dire le contraire de ce qu’il soutenait.',
      },
      {
        cadre: 'Sur un réseau social',
        phrase:
          'Une chercheuse le dit : « Les écrans ne sont pas le problème ». Sa phrase continuait : « en soi ; c’est leur usage le soir qui abîme le sommeil. »',
        lecture:
          'La coupe transforme une mise en garde précise en feu vert. La citation circule sans date ni lien vers l’entretien, si bien que personne ne peut lire la suite.',
      },
    ],
    reperer: [
      'Une citation très courte, isolée, sur un sujet sensible.',
      'Des guillemets qui s’ouvrent ou se ferment au milieu d’une phrase, ou des points de suspension […].',
      'Ni lien vers l’intervention complète, ni date, ni contexte.',
    ],
    categorie: 'cadrage',
    question:
      'Retrouvez une déclaration publique complète sur un sujet d’actualité, puis comparez-la à la façon dont deux articles la citent. Qu’est-ce qui a été coupé ?',
    voisines: ['cherry-picking', 'homme-de-paille', 'autorite-anonyme'],
    references: [MUNICH],
    motif: /citation (tronquee|selective|sortie|hors|partielle|deformee|amputee)|hors contexte|sortie de son contexte|propos tronques/,
  },
  {
    slug: 'debat-presente-comme-clos',
    nom: 'Débat présenté comme tranché',
    aussi: ['Question ouverte présentée comme réglée'],
    famille: 'cadrage',
    resume: 'Une question que les spécialistes discutent encore, présentée comme réglée.',
    definition: [
      'Sur certains sujets, les spécialistes ne sont pas d’accord : les données manquent, les études divergent, les valeurs en jeu diffèrent. Un article qui présente l’une des positions comme « ce que montrent les études » ou comme une évidence cache ce désaccord au lecteur.',
      'C’est le miroir du faux équilibre, qui fait l’inverse : il donne l’apparence d’un débat à une question que les spécialistes ont tranchée.',
    ],
    exemple: {
      rubrique: 'Éducation',
      titre: ['Les classes de niveau, la solution'],
      texte: [
        'Le ministère réfléchit à regrouper les élèves par niveau. ',
        ['Les études l’ont montré : c’est la meilleure méthode pour faire progresser tout le monde'],
        '. Il ne reste qu’à l’appliquer.',
      ],
      lecture:
        'Les effets des groupes de niveau sont discutés depuis longtemps par les chercheurs en éducation, avec des résultats qui varient selon les élèves concernés. « Les études » ne sont ni nommées ni résumées, et rien n’indique au lecteur que certaines concluent autrement.',
    },
    reperer: [
      '« Les études ont montré », « la science dit », « tout le monde s’accorde », sans étude citée.',
      'Aucune voix discordante, même pour la réfuter.',
      'Le vocabulaire de l’évidence (« il ne reste qu’à ») sur un choix de politique publique.',
    ],
    categorie: 'cadrage',
    question:
      'Cherchez deux sources sérieuses qui ne concluent pas la même chose sur ce sujet. Comment l’article aurait-il pu rendre compte de ce désaccord ?',
    voisines: ['faux-equilibre', 'autorite-anonyme', 'opinion-presentee-comme-fait'],
    motif: /debat (clos|tranche|occulte)|presentee? comme (tranchee?|reglee?|acquise?)|consensus (affirme|presente|exagere|suppose|invoque)|controverse (occultee|ignoree|passee sous silence)/,
  },
  {
    slug: 'faux-equilibre',
    nom: 'Faux équilibre',
    aussi: ['Fausse symétrie'],
    famille: 'cadrage',
    resume: 'Donner le même poids à deux positions alors que les preuves penchent nettement d’un côté.',
    definition: [
      'Le faux équilibre part d’une bonne intention : donner la parole aux deux camps. Mais quand les preuves et la très grande majorité des spécialistes sont d’un côté, présenter les deux positions à égalité fait croire au lecteur que la question est ouverte.',
      'Maxwell et Jules Boykoff ont décrit ce travers en 2004 dans la couverture du changement climatique par de grands journaux américains : l’équilibre des points de vue y masquait l’accord des scientifiques sur le rôle des activités humaines.',
    ],
    exemple: {
      rubrique: 'Santé',
      titre: ['Vaccins et autisme : le débat continue'],
      texte: [
        'Pour le pédiatre que nous avons interrogé, aucun lien n’existe. ',
        ['Pour une mère rencontrée à la sortie de l’école, le doute est permis. Chacun se fera son opinion'],
        '.',
      ],
      lecture:
        'Le lien entre vaccins et autisme a été étudié sur plus d’un million d’enfants, et les grandes études ne l’ont pas trouvé. Mettre côte à côte un pédiatre et une impression personnelle, puis laisser « chacun se faire son opinion », donne l’image d’une question ouverte alors qu’elle ne l’est plus.',
    },
    reperer: [
      'Deux avis présentés à égalité, sans dire lequel les preuves soutiennent.',
      'Un spécialiste face à un témoignage, comme s’ils pesaient la même chose.',
      'Des titres en « le débat continue » ou « la polémique enfle » sur des questions que la recherche a tranchées.',
    ],
    categorie: 'cadrage',
    question:
      'Comment un article peut-il donner la parole à une personne qui doute, sans laisser croire que la science hésite ?',
    voisines: ['debat-presente-comme-clos', 'argument-d-autorite', 'titre-trompeur'],
    references: [
      {
        texte:
          'Maxwell T. Boykoff et Jules M. Boykoff, « Balance as bias: global warming and the US prestige press », Global Environmental Change, 2004.',
        url: 'https://doi.org/10.1016/j.gloenvcha.2003.10.001',
      },
    ],
    motif: /faux equilibre|fausse symetrie|equilibre artificiel|fausse controverse|controverse (artificielle|fabriquee)/,
  },
  {
    slug: 'appel-a-l-emotion',
    nom: 'Appel à l’émotion',
    aussi: ['Appel à la peur', 'Pathos'],
    famille: 'cadrage',
    resume: 'Faire réagir le lecteur par la peur, la colère ou la pitié plutôt que par des preuves.',
    definition: [
      'Un article peut émouvoir : un drame est un drame, et le raconter avec justesse fait partie du métier. L’appel à l’émotion commence quand l’émotion remplace la démonstration, quand l’indignation ou la peur doivent suffire à faire accepter une conclusion.',
      'La peur est le levier le plus courant, parce qu’elle pousse à décider vite.',
    ],
    exemple: {
      rubrique: 'Faits divers',
      titre: ['Le carrefour de la peur'],
      texte: [
        'Hier soir, un adolescent a été légèrement blessé au carrefour des Tilleuls. ',
        ['Combien d’enfants faudra-t-il encore sacrifier avant que la mairie se réveille ?'],
        ' Chaque parent tremble désormais en voyant partir le sien.',
      ],
      lecture:
        'L’accident est réel, la question de la sécurité du carrefour aussi. Mais l’article ne dit pas combien d’accidents y ont eu lieu, ni s’ils sont plus nombreux qu’avant. « Sacrifier », « trembler » : le texte demande au lecteur de ressentir, pas de juger sur des faits.',
    },
    reperer: [
      'Des questions qui accusent : « combien faudra-t-il encore… ».',
      'Des mots de peur, de colère ou de pitié là où l’on attend des chiffres.',
      'Un cas unique et poignant qui tient lieu de démonstration.',
    ],
    categorie: 'cadrage',
    question:
      'Retirez les mots qui expriment une émotion. Que reste-t-il comme information ? Est-ce assez pour conclure que le carrefour est dangereux ?',
    voisines: ['vocabulaire-charge', 'generalisation-hative', 'pente-savonneuse'],
    motif: /emotion|peur|pathos|indignation|pitie|compassion|anxiogene/,
  },
  {
    slug: 'proces-d-intention',
    nom: 'Procès d’intention',
    aussi: ['Procès en intention'],
    famille: 'cadrage',
    resume: 'Prêter à quelqu’un des motivations cachées sans apporter de preuve.',
    description:
      'Comment reconnaître un procès d’intention dans un article ? Définition, trois exemples et les mots qui le trahissent.',
    definition: [
      'Le procès d’intention ne discute pas ce que quelqu’un fait ou dit : il affirme savoir pourquoi il le fait. « En réalité, il cherche à… », « derrière cette mesure se cache… ». Les intentions d’une personne sont presque toujours invérifiables, et c’est justement ce qui rend l’accusation difficile à contester.',
      'Un article peut rapporter que quelqu’un est soupçonné d’arrière-pensées. Il dit alors qui le soupçonne, sur quels éléments, et laisse la personne répondre.',
    ],
    exemple: {
      rubrique: 'Politique',
      titre: ['Les bus gratuits pour les lycéens'],
      texte: [
        'Le président de la région a annoncé la gratuité des bus pour les lycéens. ',
        ['Une mesure qui vise surtout à séduire les familles à six mois des élections'],
        '.',
      ],
      lecture:
        'La date des élections est un fait, et l’article peut la rappeler. Mais il affirme connaître l’intention réelle de la mesure, sans citer personne ni apporter d’élément. Le lecteur ne saura rien des raisons avancées par la région, ni de ce que la mesure coûte et change.',
    },
    exemples: [
      {
        cadre: 'Au travail',
        phrase: 'Si la directrice propose le télétravail le vendredi, c’est surtout pour pouvoir supprimer des bureaux.',
        lecture:
          'Peut-être, mais rien ne le montre. La phrase remplace la question utile, « le télétravail du vendredi est-il une bonne idée ? », par une accusation sur ce que pense la directrice, que personne ne peut vérifier.',
      },
      {
        cadre: 'Dans un débat télévisé',
        phrase: 'Mon adversaire ne défend pas l’écologie, il défend sa carrière.',
        lecture:
          'L’orateur ne répond à aucune des propositions de l’autre : il affirme connaître ses vraies raisons. Même intéressées, ces propositions resteraient à discuter pour ce qu’elles sont.',
      },
      {
        cadre: 'Sur un réseau social',
        phrase: 'Cette association ne publie ses chiffres sur la pauvreté que pour réclamer plus de subventions.',
        lecture:
          'Qu’une association ait intérêt à un chiffre mérite d’être dit. Mais l’intérêt ne rend pas le chiffre faux : c’est sa méthode qu’il faut vérifier, pas le motif qu’il faut deviner.',
      },
    ],
    reperer: [
      '« En réalité », « surtout », « ce qu’il cherche vraiment », « derrière cette décision ».',
      'Une intention affirmée, jamais attribuée à une source.',
      'La personne visée n’a pas la parole pour s’expliquer.',
    ],
    categorie: 'cadrage',
    signale:
      'La grille de Squiggle en fait un critère de son domaine « Déontologie et transparence » : aucun procès d’intention qui ne soit étayé. Dans un rapport, le constat est le plus souvent rangé en « Cadrage ».',
    question:
      'Quelles autres raisons la région pourrait-elle avoir pour cette mesure ? Comment l’auteur de l’article pourrait-il vérifier laquelle est la bonne ?',
    voisines: ['ad-hominem', 'homme-de-paille', 'opinion-presentee-comme-fait'],
    motif: /proces (d'|en )intention|intentions? (pretee|supposee|attribuee|cachee)|arriere-pensee|motivations? (pretee|supposee|cachee)/,
  },
  {
    slug: 'autorite-anonyme',
    nom: 'Autorité non nommée',
    aussi: ['Source anonyme', 'Selon des experts'],
    famille: 'preuves',
    resume: '« Des experts », « une étude » : une autorité invoquée sans que l’on sache qui parle.',
    definition: [
      '« Selon des experts », « une étude récente montre », « les spécialistes s’accordent » : ces formules donnent du poids à une affirmation, mais le lecteur ne peut ni vérifier ni juger. Qui sont ces experts, dans quel domaine, avec quels intérêts ?',
      'Garder une source anonyme peut être légitime, pour protéger quelqu’un qui risque sa place ou sa sécurité. L’article le dit alors, et explique pourquoi on peut s’y fier. Une étude, elle, n’a aucune raison d’être anonyme.',
    ],
    exemple: {
      rubrique: 'Alimentation',
      titre: ['Le petit-déjeuner, repas inutile ?'],
      texte: [
        'Sauter le petit-déjeuner n’aurait aucun effet sur la santé. ',
        ['C’est ce qu’affirment de nombreux nutritionnistes'],
        ', de plus en plus écoutés.',
      ],
      lecture:
        '« De nombreux nutritionnistes » : combien, lesquels, sur la foi de quels travaux ? L’article n’en nomme aucun. Le lecteur doit croire sur parole une affirmation de santé, sans pouvoir remonter à la source.',
    },
    reperer: [
      '« Selon des experts », « des spécialistes », « une étude », « des sources concordantes », sans nom.',
      'Aucun lien, aucune référence, aucune date.',
      'Pour une source protégée : l’article explique-t-il pourquoi elle reste anonyme ?',
    ],
    categorie: 'cadrage',
    signale:
      'Dans un rapport, Squiggle le range en « Cadrage » quand c’est une voix qui reste sans nom, et en « Source absente » quand c’est une étude ou un document que l’on ne peut pas retrouver.',
    question: 'Que faudrait-il savoir de ces nutritionnistes pour accorder du crédit à ce qu’ils disent ?',
    voisines: ['argument-d-autorite', 'source-absente', 'chiffre-sans-origine'],
    references: [{ texte: `${MUNICH.texte} Elle demande de ne publier que des informations dont l’origine est connue.` }],
    motif: /autorite (non nommee|anonyme|vague|non identifiee)|experts? (anonymes?|non nommes?|non identifies?)|anonym|non nomme|non identifi|selon des|sources? vague/,
  },
  {
    slug: 'source-absente',
    nom: 'Source absente',
    aussi: ['Affirmation non sourcée'],
    famille: 'preuves',
    resume: 'Un fait vérifiable avancé sans dire d’où il vient.',
    definition: [
      'Un article d’information s’appuie sur des faits, et chaque fait a une origine : un document, une personne, une base de données, ce que l’auteur a vu lui-même. Quand cette origine manque, le lecteur ne peut pas vérifier : il doit faire confiance.',
      'Une affirmation peut être exacte sans être sourcée. Le constat ne dit pas qu’elle est fausse, seulement que l’article ne donne pas les moyens de la vérifier.',
    ],
    exemple: {
      rubrique: 'Transports',
      titre: ['Le train de nuit revient'],
      texte: [
        'La ligne reprendra du service au printemps. ',
        ['Elle avait été fermée parce qu’elle perdait plusieurs millions d’euros par an'],
        ', une page que la région veut tourner.',
      ],
      lecture:
        'Le chiffre est peut-être exact. Mais d’où vient-il : d’un rapport, de la région, de l’exploitant ? L’article l’avance comme une évidence, et le lecteur n’a aucun moyen de le retrouver ni de savoir comment il a été calculé.',
    },
    reperer: [
      'Un fait précis (chiffre, date, décision, événement) sans « selon », sans lien, sans document.',
      'Des tournures impersonnelles : « on sait que », « il est établi que ».',
      'Une affirmation qui serait facile à sourcer, et ne l’est pas.',
    ],
    categorie: 'source-absente',
    signale:
      'Dans un rapport, Squiggle le range en « Source absente », dans la robustesse factuelle, avec l’état « Non sourcée dans l’article ». Ce n’est pas une accusation : c’est un constat sur le sourcing, distinct de « Douteuse », que Squiggle réserve aux affirmations que des sources consultées contredisent.',
    question:
      'Choisissez trois faits dans un article du jour. Pour chacun, l’article dit-il d’où il vient ? Comment pourriez-vous le vérifier ?',
    voisines: ['affirmation-non-etayee', 'chiffre-sans-origine', 'autorite-anonyme'],
    references: [{ texte: `${MUNICH.texte} Elle demande de ne publier que des informations dont l’origine est connue.` }],
    motif: /source (absente|manquante)|sans source|non source|aucune source|absence de source|sans reference|reference absente/,
  },
  {
    slug: 'affirmation-non-etayee',
    nom: 'Affirmation non étayée',
    aussi: ['Affirmation gratuite', 'Affirmation sans preuve'],
    famille: 'preuves',
    resume: 'Une affirmation importante avancée sans preuve ni raisonnement pour la soutenir.',
    description:
      'Comment reconnaître une affirmation non étayée dans un article ? Définition, trois exemples et les formules qui la trahissent, comme « chacun sait ».',
    definition: [
      'Une affirmation non étayée n’est pas forcément fausse. Elle est posée là, sans donnée, sans exemple, sans source et sans raisonnement qui permettrait au lecteur de l’accepter autrement que sur parole.',
      'Plus une affirmation est forte ou surprenante, plus elle demande d’appui. Celle qui porte toute la conclusion de l’article en demande le plus.',
    ],
    exemple: {
      rubrique: 'Numérique',
      titre: ['L’école à l’heure des tablettes'],
      texte: [
        'Le département équipera tous les collégiens à la rentrée. ',
        ['Il est désormais admis que les tablettes améliorent la concentration des élèves'],
        ', ce qui justifie largement la dépense.',
      ],
      lecture:
        '« Il est désormais admis » : par qui, sur la foi de quoi ? L’article n’en dit rien, alors que toute la justification de la dépense repose sur cette phrase. Si elle tombe, l’argument tombe avec elle.',
    },
    exemples: [
      {
        cadre: 'Dans une conversation',
        phrase: 'Tout le monde sait que le sucre rend les enfants surexcités.',
        lecture:
          'L’idée est si répandue qu’elle passe sans preuve. Or des études ont donné du sucre ou un placebo à des enfants, sans que les adultes sachent lequel, et n’ont pas trouvé l’effet attendu.',
      },
      {
        cadre: 'Dans une tribune',
        phrase: 'La hausse de la délinquance s’explique évidemment par le laxisme des juges.',
        lecture:
          'Deux affirmations en une : que la délinquance augmente, et que les juges en sont la cause. Aucune n’est appuyée par un chiffre ou un exemple, et « évidemment » tient lieu de preuve.',
      },
      {
        cadre: 'Au conseil municipal',
        phrase: 'Ce nouveau parking va relancer le commerce du centre-ville, c’est une certitude.',
        lecture:
          'Peut-être. Mais quel commerce, de combien, en combien de temps ? Ni étude de fréquentation ni exemple d’une autre ville : le mot « certitude » remplace l’argument.',
      },
    ],
    reperer: [
      '« Il est admis que », « chacun sait que », « il est évident que ».',
      'L’affirmation centrale de l’article est celle qui a le moins d’appui.',
      'Ni chiffre, ni exemple, ni source autour de la phrase.',
    ],
    categorie: 'affirmation-non-etayee',
    signale:
      'Dans un rapport, Squiggle le range en « Affirmation non étayée », dans la robustesse factuelle. Quand l’affirmation peut se vérifier, il cherche ce que des sources en disent et l’indique : vérifiée, douteuse, ou non vérifiable telle qu’écrite. Il ne remplace jamais un fait par celui qu’il croit exact.',
    question:
      'Quelle preuve vous convaincrait que les tablettes améliorent la concentration ? Comment faudrait-il mesurer cet effet ?',
    voisines: ['source-absente', 'debat-presente-comme-clos', 'surinterpretation'],
    motif: /non etaye|sans preuve|infonde|gratuite|non demontr|sans fondement|non justifi|peremptoire|infaillib|non prouve/,
  },
  {
    slug: 'chiffre-sans-origine',
    nom: 'Chiffre sans origine',
    aussi: ['Chiffre non sourcé', 'Statistique sans méthode'],
    famille: 'preuves',
    resume: 'Un chiffre donné sans institut, sans date, sans périmètre ni méthode.',
    definition: [
      'Un chiffre impressionne : il a l’air précis, mesuré, objectif. Mais un pourcentage ne veut rien dire tant qu’on ne sait pas qui l’a mesuré, quand, sur qui et comment. « 68 % des jeunes » : quels jeunes, combien de personnes interrogées, avec quelle question ?',
      'Pour les sondages liés aux élections, la loi du 19 juillet 1977 impose d’ailleurs de publier avec les résultats le nom de l’institut, les dates de l’enquête et le nombre de personnes interrogées.',
    ],
    exemple: {
      rubrique: 'Société',
      titre: ['Les jeunes et l’info'],
      texte: [
        'Le constat est inquiétant : ',
        ['68 % des jeunes ne font plus confiance aux médias'],
        '. Un chiffre qui devrait alerter les rédactions.',
      ],
      lecture:
        'Qui a mesuré ces 68 %, et quand ? Les « jeunes », ce sont les 15-24 ans, les lycéens, les moins de 35 ans ? Quelle question leur a-t-on posée ? Sans ces informations, le chiffre ne peut être ni vérifié ni comparé.',
    },
    reperer: [
      'Un pourcentage ou un nombre sans institut, sans année, sans taille d’échantillon.',
      'Un groupe flou : « les jeunes », « les Français », « les salariés ».',
      'Ni la question posée, ni la méthode : sondage en ligne, enquête, estimation ?',
    ],
    categorie: 'source-absente',
    question:
      'Faites la liste des quatre informations qui manquent pour comprendre ce chiffre. Où chercheriez-vous l’enquête d’origine ?',
    voisines: ['source-absente', 'cherry-picking', 'generalisation-hative'],
    references: [
      { texte: 'Loi n° 77-808 du 19 juillet 1977 relative à la publication et à la diffusion de certains sondages d’opinion.' },
      { texte: 'Darrell Huff, How to Lie with Statistics, 1954.' },
    ],
    motif: /(chiffre|statistique|donnee|pourcentage|sondage|enquete)s?\b.*\b(non|sans|absente?|flou|vague|imprecis|inverifi|introuvable)|methodolog|sans methode|perimetre/,
  },
];

/** The order a finding's label is tried in: the specific names before the general ones they overlap. */
const MATCH_ORDER = [
  'chiffre-sans-origine',
  'citation-tronquee',
  'autorite-anonyme',
  'titre-trompeur',
  'surinterpretation',
];

const BY_SLUG = new Map(NOTIONS.map((notion) => [notion.slug, notion]));
const MATCHING = [
  ...MATCH_ORDER.map((slug) => BY_SLUG.get(slug)!),
  ...NOTIONS.filter((notion) => !MATCH_ORDER.includes(notion.slug)),
];

export function notion(slug: string): Notion | undefined {
  return BY_SLUG.get(slug);
}

export function famille(id: Famille) {
  return FAMILLES.find((item) => item.id === id)!;
}

export const glossaryPath = (slug: string) => `/glossaire/${slug}`;

/** What a pattern sees: lower case, no accents, straight apostrophes, single spaces. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Where a finding no pattern names goes: its category's own notion, or the family it belongs to. */
const CATEGORY_FALLBACK: Record<Notion['categorie'], string | Famille> = {
  sophisme: 'raisonnement',
  cadrage: 'cadrage',
  surinterpretation: 'surinterpretation',
  'affirmation-non-etayee': 'affirmation-non-etayee',
  'source-absente': 'source-absente',
};

/**
 * The glossary page a finding links to: the notion its label names, else the
 * page or family its category belongs to. A strength names nothing that goes wrong.
 */
export function glossaryLink(finding: { label: string; category: string }): { to: string; label: string } | null {
  const folded = fold(finding.label);
  const fallback = CATEGORY_FALLBACK[finding.category as Notion['categorie']];
  if (!fallback) return null;
  const named = MATCHING.find((item) => item.motif.test(folded)) ?? BY_SLUG.get(fallback);
  if (named) return { to: glossaryPath(named.slug), label: `Glossaire : ${named.nom}` };
  const { id, titre } = famille(fallback as Famille);
  return { to: `/glossaire#${id}`, label: `Glossaire : ${titre.charAt(0).toLowerCase()}${titre.slice(1)}` };
}

/** The domain of the grid a category scores in, as the landing names it (`DOMAINS`). */
const DOMAIN_OF: Record<Notion['categorie'], string> = {
  sophisme: DOMAINS[1][0],
  'affirmation-non-etayee': DOMAINS[0][0],
  'source-absente': DOMAINS[0][0],
  surinterpretation: DOMAINS[2][0],
  cadrage: DOMAINS[2][0],
};

export function howReported(item: Notion): string {
  return (
    item.signale ??
    `Dans un rapport, Squiggle le range en « ${CATEGORY_LABELS[item.categorie]} » et le compte dans le domaine « ${DOMAIN_OF[item.categorie]} ». Le constat cite la phrase exacte et explique en quelques lignes ce qui cloche.`
  );
}

/** French typography: a non-breaking space where a line must not break before `:;?!»` or after `«`. */
export function typo(text: string): string {
  return text.replace(/ ([:;?!»])/g, ' $1').replace(/« /g, '« ');
}
