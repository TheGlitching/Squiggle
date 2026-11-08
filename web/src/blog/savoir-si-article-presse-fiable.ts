import type { Article } from '../blog';

const STANFORD = 'https://stanforddaily.com/2017/10/26/fact-checkers-more-likely-than-peer-expert-groups-to-identify-credible-information-determine-gse-researchers/';
const ETUDE = 'https://purl.stanford.edu/yk133ht8603';
const MUNICH = 'https://www.ajp.be/telechargements/droitsdevoirs.pdf';
const CDJM = 'https://cdjm.org/';
const AVIS = 'https://cdjm.org/decisions';

const article: Article = {
  slug: 'savoir-si-article-presse-fiable',
  titre: 'Comment savoir si un article de presse est fiable',
  titreCourt: 'Un article est-il fiable ?',
  description:
    'Savoir si un article de presse est fiable, c’est regarder qui parle, d’où viennent les faits, ce que dit le titre et ce qu’on en dit ailleurs. Cinq questions.',
  chapo:
    'Un article n’est pas fiable parce qu’il vient d’un journal connu, ni douteux parce qu’il vient d’un petit site. Cela se regarde sur le texte lui-même. Cinq questions, qu’on peut poser à n’importe quel article, disent ce qu’on peut lui accorder et ce qui reste à vérifier.',
  publie: '2026-11-08',
  notions: ['chiffre-sans-origine', 'autorite-anonyme', 'titre-trompeur', 'opinion-presentee-comme-fait'],
  corps: [
    {
      essai: {
        texte:
          'Vous avez un article sous les yeux ? Collez son texte : Squiggle surligne les passages à regarder, dit pourquoi, et montre ce qui tient. À vous de conclure.',
        bouton: 'Analyser cet article',
      },
    },
    {
      encadre: {
        titre: 'L’essentiel',
        points: [
          'Regardez le texte autant que la signature : qui parle, d’où viennent ses faits, si le titre dit la même chose que l’article.',
          'Sortez de la page : ouvrir d’autres onglets est le réflexe qui distingue les vérificateurs professionnels.',
          'Concluez point par point. Un article peut être solide sur un fait et fragile sur le suivant.',
        ],
      },
    },
    { sommaire: true },
    { intertitre: 'Un article à tester' },
    { paragraphe: 'Voici un article inventé. Il a l’air sérieux, et rien ne dit qu’il se trompe. Les cinq questions montrent ce qu’il permet vraiment de savoir.' },
    {
      exemple: {
        rubrique: 'Économie',
        titre: [['Le télétravail vide les centres-villes']],
        texte: [
          'Selon une étude récente, ',
          ['un commerce sur trois aurait fermé à cause du télétravail'],
          '. Un commerçant témoigne : « Depuis que les bureaux sont vides, je ne vois plus personne. » La tendance est désormais irréversible, estiment les spécialistes.',
        ],
        lecture:
          'Une étude sans nom, un chiffre sans lieu ni période, une cause affirmée, un seul témoin, des spécialistes anonymes. Rien de tout cela ne prouve que c’est faux. Mais rien ne permet encore de dire que c’est vrai.',
      },
    },
    { intertitre: '1. Qui parle, et à quel titre ?' },
    {
      paragraphe: [
        'Cherchez un nom, une date, une rubrique. Puis le genre du texte : information, tribune, publicité déguisée ? Une tribune a le droit de défendre un avis, à condition de ne pas le faire passer pour un constat : c’est l’',
        { texte: 'opinion présentée comme un fait', vers: '/glossaire/opinion-presentee-comme-fait' },
        '. La ',
        { texte: 'déclaration de Munich', vers: MUNICH },
        ', adoptée en 1971 par des syndicats de journalistes européens, demande de ne jamais confondre le métier de journaliste avec celui de publicitaire ou de propagandiste.',
      ],
    },
    { intertitre: '2. D’où viennent les faits ?' },
    {
      paragraphe: [
        'La même ',
        { texte: 'déclaration', vers: MUNICH },
        ' demande de ne publier que les informations dont l’origine est connue. Une exception existe : le journaliste peut protéger une source confidentielle. Mais une étude a un titre, un chiffre a un auteur et une date. « Une étude récente » est un ',
        { texte: 'chiffre sans origine', vers: '/glossaire/chiffre-sans-origine' },
        ', et « les spécialistes » une ',
        { texte: 'autorité anonyme', vers: '/glossaire/autorite-anonyme' },
        '. Quand une source est citée, allez la voir si l’enjeu le mérite : dit-elle bien cela ?',
      ],
    },
    { intertitre: '3. Le titre dit-il ce que dit l’article ?' },
    {
      paragraphe: [
        'Relisez le titre après le texte. Notre exemple écrit « vide les centres-villes » là où le texte dit « aurait fermé » : le conditionnel a disparu, et c’est un ',
        { texte: 'titre trompeur', vers: '/glossaire/titre-trompeur' },
        '. Le titre affirme aussi une cause : deux choses qui arrivent ensemble ne se causent pas forcément, c’est la ',
        { texte: 'corrélation prise pour une causalité', vers: '/glossaire/correlation-causalite' },
        '. Le titre n’est pas toujours écrit par l’auteur du texte : ne jugez pas l’un sur l’autre, mais ne vous arrêtez pas au premier.',
      ],
    },
    { intertitre: '4. Qu’en dit-on ailleurs ?' },
    {
      paragraphe: [
        'C’est le geste le plus rentable. ',
        { texte: 'Une étude de l’université Stanford', vers: ETUDE },
        ' a observé 10 vérificateurs professionnels, 10 historiens et 25 étudiants évaluant des sources en ligne. Les vérificateurs ont fait mieux, et d’une façon simple : ',
        { texte: 'ils quittaient la page pour ouvrir d’autres onglets', vers: STANFORD },
        ' et chercher du contexte, là où les autres restaient concentrés sur la page elle-même.',
      ],
    },
    {
      paragraphe:
        'Ouvrez donc un onglet. Cherchez l’étude par son sujet, le chiffre, le nom de l’auteur ou du site. D’autres rédactions rapportent-elles le même fait, en remontant à la même source ? Attention : dix articles qui reprennent la même dépêche ne font qu’une seule source.',
    },
    { intertitre: '5. Que fait le journal de ses erreurs ?' },
    {
      paragraphe: [
        'Tout le monde se trompe. La ',
        { texte: 'déclaration de Munich', vers: MUNICH },
        ' demande de rectifier toute information publiée qui se révèle inexacte : un rectificatif visible est plutôt bon signe. En France, ',
        { texte: 'tout citoyen peut saisir le CDJM', vers: CDJM },
        ', le Conseil de déontologie journalistique et de médiation, au sujet d’un contenu qu’il juge problématique. Ses ',
        { texte: 'avis sont publiés', vers: AVIS },
        ' et classent chaque plainte en fondée, partiellement fondée ou non fondée. Lire ceux qui concernent un titre renseigne mieux que sa réputation.',
      ],
    },
    { intertitre: 'Les cinq questions à garder' },
    {
      etapes: [
        'Qui parle, et s’agit-il d’une information ou d’une opinion ?',
        'D’où viennent les faits et les chiffres ? Peut-on remonter à la source ?',
        'Le titre dit-il la même chose que le texte ?',
        'Que trouve-t-on en ouvrant un autre onglet ?',
        'Que fait ce journal quand il se trompe ?',
      ],
    },
    { intertitre: 'Ce qui rassure à tort' },
    {
      tableau: {
        legende: 'Ce qui rassure à tort, et ce qui renseigne vraiment',
        colonnes: ['Ce qu’on regarde', 'Ce que cela vaut'],
        lignes: [
          ['Un beau site, un logo soigné', 'Cela se fabrique en une journée. Cherchez qui édite le site.'],
          ['Beaucoup de partages', 'Cela dit qu’un texte plaît, pas qu’il est exact.'],
          ['Un ton sûr de lui', 'Un article solide dit souvent ce qu’il ne sait pas.'],
          ['Un article qui va dans mon sens', 'C’est justement celui-là qu’on vérifie le moins.'],
        ],
      },
    },
    { intertitre: 'Questions fréquentes' },
    {
      questions: [
        {
          question: 'Un article sans source est-il faux ?',
          reponse:
            'Non. Il est invérifiable tel quel, ce qui n’est pas la même chose. Vous pouvez chercher ailleurs, ou garder la réserve : « c’est peut-être vrai, je ne sais pas d’où ça vient ».',
        },
        {
          question: 'Un article fiable est-il forcément vrai ?',
          reponse:
            'Non plus. Un article honnête et bien sourcé peut se tromper, et un article mal fait peut avoir raison. Ces questions disent ce qu’on peut accorder au texte, pas la vérité de ce qu’il raconte.',
        },
        {
          question: 'Et si l’article s’appuie sur un sondage ?',
          reponse: [
            'Il y a quatre questions de plus, dans ',
            { texte: 'notre méthode pour lire un sondage', vers: '/blog/sondage-quatre-questions' },
            '.',
          ],
        },
        {
          question: 'Et pour un discours politique ?',
          reponse: [
            'Les mêmes questions valent, à condition de les poser à tous les camps : ',
            { texte: 'nous l’avons fait sur deux discours inventés de bords opposés', vers: '/presidentielle' },
            '.',
          ],
        },
      ],
    },
    { intertitre: 'Sources' },
    {
      liste: [
        [{ texte: 'Sam Wineburg et Sarah McGrew, Lateral Reading: Reading Less and Learning More When Evaluating Digital Information, université Stanford', vers: ETUDE }],
        [{ texte: 'The Stanford Daily, compte rendu de cette étude', vers: STANFORD }],
        [{ texte: 'Déclaration des devoirs et des droits des journalistes, Munich, 1971', vers: MUNICH }],
        [{ texte: 'Conseil de déontologie journalistique et de médiation (CDJM)', vers: CDJM }],
      ],
    },
  ],
};

export default article;
