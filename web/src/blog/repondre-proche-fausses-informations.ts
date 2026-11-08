import type { Article } from '../blog';

const HANDBOOK = 'https://sks.to/db2020';
const FUTURA = 'https://www.futura-sciences.com/sante/actualites/psychologie-repas-noel-conseils-specialistes-discuter-complotistes-ou-pas-95668/';
const LADN = 'https://www.ladn.eu/media-mutants/presse-et-nouvelles-ecritures/comment-reagir-face-proches-adeptes-theories-complot/';
const CLEMI = 'https://www.clemi.fr/sites/default/files/clemi/Muscler_Esprit_Critique.pdf';

const article: Article = {
  slug: 'repondre-proche-fausses-informations',
  titre: 'Comment répondre à un proche qui envoie de fausses informations',
  titreRecherche: 'Comment répondre à un proche qui envoie de fausses infos',
  titreCourt: 'Répondre à un proche',
  description:
    'Répondre à un proche qui envoie de fausses informations, c’est d’abord choisir : laisser passer, poser une question ou corriger. Cinq gestes, des phrases.',
  chapo:
    'Un message douteux arrive dans le groupe de famille, et il vient de quelqu’un qu’on aime. Se taire agace, corriger peut fâcher. Voici ce que disent les travaux et les chercheurs sur la question, et ce qu’on peut écrire concrètement. Sans promesse : personne ne peut garantir de faire changer un avis.',
  publie: '2026-11-08',
  notions: ['autorite-anonyme', 'appel-a-la-popularite', 'affirmation-non-etayee', 'appel-a-l-emotion'],
  corps: [
    {
      essai: {
        texte:
          'Ce message ou cet article vous laisse un doute ? Collez-le : Squiggle montre ce qu’il affirme, qui le dit et ce qui manque. Vous saurez mieux quoi répondre.',
        bouton: 'Analyser le message reçu',
      },
    },
    {
      encadre: {
        titre: 'L’essentiel',
        points: [
          'Vous pouvez ne pas répondre : un message qui ne circule pas et ne fait de tort à personne ne demande pas toujours une correction.',
          'Si vous répondez, commencez par une question plutôt que par un démenti, et de préférence à deux, pas devant tout le groupe.',
          'Votre but peut être de garder le lien et de dire ce qui est exact. Convaincre, ce n’est pas garanti.',
        ],
      },
    },
    { sommaire: true },
    { intertitre: 'Un message comme on en reçoit' },
    { paragraphe: 'Voici un texte inventé, du genre de ceux qui font le tour des groupes de famille.' },
    {
      exemple: {
        rubrique: 'Vie locale',
        titre: ['Ce que votre mairie ne vous dira pas sur les nouveaux compteurs d’eau'],
        texte: [
          'Un technicien, qui préfère rester anonyme, le confirme : ',
          ['ces compteurs enregistrent tout ce qui se passe chez vous'],
          '. Tout le monde le sait dans le métier, mais personne n’ose le dire. Faites suivre avant que ce message soit supprimé.',
        ],
        lecture:
          'Le message ne nomme ni le technicien, ni la ville, ni le modèle de compteur : rien ne peut être vérifié. « Tout le monde le sait » tient lieu de preuve, et « avant que ce message soit supprimé » pousse à partager avant de vérifier.',
      },
    },
    { intertitre: 'Avant de répondre : faut-il répondre ?' },
    {
      paragraphe: [
        'Le ',
        { texte: 'Debunking Handbook 2020', vers: HANDBOOK },
        ', un guide écrit par une vingtaine de chercheurs, conseille de choisir ses batailles : si une fausse information ne se répand pas et ne risque pas de nuire, la corriger peut ne servir à rien. Trois questions aident à décider.',
      ],
    },
    {
      liste: [
        'Ce message peut-il faire du tort : à la santé de quelqu’un, à son argent, à une personne qu’il vise ?',
        'Qui le lit : un groupe où d’autres pourraient le croire, ou vous seul ?',
        'Avez-vous l’énergie de cet échange aujourd’hui ? Répondre plus tard reste possible.',
      ],
    },
    {
      paragraphe: [
        'Et si la conviction est très forte ? Interrogé par ',
        { texte: 'Futura', vers: FUTURA },
        ', un enseignant-chercheur en psychologie sociale de l’université de Fribourg juge peu utile d’entamer une discussion sérieuse quand elle mènerait à la dispute. Il propose plutôt l’humour, et de changer de sujet.',
      ],
    },
    { intertitre: 'Cinq gestes si vous répondez' },
    {
      etapes: [
        'Vérifiez d’abord pour vous-même : qui parle, d’où vient le chiffre, ce qui manque.',
        'Répondez à deux si vous le pouvez, et sans mépris.',
        'Posez une vraie question : pourquoi ce sujet compte-t-il autant ?',
        'Dites ce qui est exact avant ce qui est faux.',
        'Expliquez le piège en une phrase, puis arrêtez-vous.',
      ],
    },
    {
      paragraphe: [
        'Pour vérifier, les questions sont dans ',
        { texte: 'notre méthode pour juger un article', vers: '/blog/savoir-si-article-presse-fiable' },
        '. Sur le mépris, ',
        { texte: 'un guide du CLEMI', vers: CLEMI },
        ', écrit pour des parents face à leur enfant, pose cette règle d’abord : ne pas apparaître méprisant. La question vient d’un chercheur en neurosciences, ',
        { texte: 'dans le même article de Futura', vers: FUTURA },
        ', qui suggère de demander à la personne pourquoi ce sujet suscite autant de colère, plutôt que de débattre des faits. Commencer par ce qui est exact, si cela tient en quelques mots clairs, est le premier conseil du ',
        { texte: 'Debunking Handbook', vers: HANDBOOK },
        '.',
      ],
    },
    { intertitre: 'Des phrases à essayer' },
    { paragraphe: 'Ce ne sont pas des recettes : prenez vos propres mots. L’idée est de parler du message, pas de la personne.' },
    {
      tableau: {
        legende: 'Des phrases qui ferment la discussion, et d’autres pour la garder ouverte',
        colonnes: ['Plutôt que', 'Essayez'],
        lignes: [
          ['« C’est faux, encore une fake news. »', '« Je n’avais pas vu ça. Tu l’as eu par qui ? »'],
          ['« Tu crois vraiment tout ce que tu lis ? »', '« Qu’est-ce qui t’a marqué là-dedans ? »'],
          ['« Il n’y a aucune preuve. »', '« Il ne cite ni nom ni étude. Tu sais d’où ça vient ? »'],
          ['« Tiens, la preuve que tu as tort. »', '« J’ai cherché de mon côté, voilà ce que j’ai trouvé. Je te mets le lien si ça t’intéresse. »'],
        ],
      },
    },
    { intertitre: 'Si vous corrigez : le fait, le piège, le fait' },
    {
      paragraphe: [
        'Le ',
        { texte: 'Debunking Handbook', vers: HANDBOOK },
        ' propose un ordre : le fait, l’annonce de l’erreur, l’explication de ce qui trompe, puis le fait de nouveau, pour que ce soit lui qu’on retienne. Sur notre exemple, en imaginant que la notice du compteur dise ce qu’il relève :',
      ],
    },
    {
      liste: [
        'Le fait : « D’après la notice, ce compteur relève la consommation d’eau, rien d’autre. »',
        'L’erreur annoncée : « Le message que tu as reçu dit qu’il enregistre tout ce qui se passe chez nous. »',
        'Ce qui trompe : « Il ne cite qu’un technicien sans nom, alors on ne peut rien vérifier. »',
        'Le fait, encore : « Ce qu’on sait, c’est qu’il mesure l’eau. »',
      ],
    },
    { intertitre: 'Ce qu’on peut attendre, et ce qu’on ne peut pas' },
    {
      paragraphe: [
        'Corriger n’est pas inutile. Le ',
        { texte: 'Debunking Handbook', vers: HANDBOOK },
        ' indique que l’effet boomerang, quand une correction renforce la croyance, n’arrive qu’occasionnellement : ce n’est pas une raison de se taire. Il rappelle aussi qu’une fausse information continue souvent d’influencer les gens même après une correction acceptée, et que l’effet d’une correction s’estompe avec le temps.',
      ],
    },
    {
      paragraphe: [
        'Autrement dit, une réponse réussie n’a pas forcément l’air d’une victoire. Parmi les proches qui témoignent dans ',
        { texte: 'un article de L’ADN', vers: LADN },
        ', l’un répond point par point et reconnaît que c’est long et peu efficace, un autre décrit une famille qui a cessé de débattre parce que la confrontation envenimait tout. Le chercheur cité par Futura le dit à sa façon : le but n’est pas forcément de convaincre, mais d’apprendre à connaître son interlocuteur.',
      ],
    },
    { intertitre: 'Questions fréquentes' },
    {
      questions: [
        {
          question: 'Mon proche est complotiste : est-ce que ça change quelque chose ?',
          reponse: [
            'Le mot lui-même ferme souvent la discussion : mieux vaut parler du message que coller une étiquette. Et un débat de faits n’est pas toujours à votre avantage : selon le même chercheur, ',
            { texte: 'interrogé par Futura', vers: FUTURA },
            ', une personne très investie connaît souvent mieux son sujet que vous. D’où l’intérêt des questions.',
          ],
        },
        {
          question: 'Faut-il lui envoyer le rapport Squiggle ?',
          reponse:
            'Plutôt pas tout de suite : reçu sans un mot, il peut se lire comme un verdict. Servez-vous-en pour préparer ce que vous voulez dire. Chaque constat cite la phrase qu’il vise : c’est cette phrase que vous pouvez montrer, avec votre question.',
        },
        {
          question: 'Et s’il ne change pas d’avis ?',
          reponse:
            'C’est le cas le plus probable sur le moment, et ce n’est pas un échec : vous avez dit ce que vous saviez, et le lien est intact. La conversation pourra reprendre une autre fois.',
        },
      ],
    },
    { intertitre: 'Sources' },
    {
      liste: [
        [{ texte: 'Stephan Lewandowsky et al., The Debunking Handbook 2020', vers: HANDBOOK }],
        [{ texte: 'Futura, conseils de deux chercheurs de l’université de Fribourg pour discuter avec un proche complotiste', vers: FUTURA }],
        [{ texte: 'L’ADN, témoignages de proches confrontés aux théories du complot', vers: LADN }],
        [{ texte: 'CLEMI, Comment « muscler » l’esprit critique de vos enfants', vers: CLEMI }],
      ],
    },
  ],
};

export default article;
