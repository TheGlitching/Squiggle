import type { Article } from '../blog';

const article: Article = {
  slug: 'sondage-quatre-questions',
  titre: 'Un sondage dans un article : les quatre questions à poser',
  titreCourt: 'Un sondage dans un article',
  description:
    'Un pourcentage en titre, et l’article bâti dessus. Qui a posé la question, à qui, laquelle, et que dit vraiment la réponse ? Une méthode en quatre questions.',
  chapo:
    'Un chiffre en titre, un article construit autour, et l’impression que la question est tranchée. Avant de le croire ou de le rejeter, quatre questions suffisent pour savoir ce qu’il mesure vraiment.',
  publie: '2026-11-06',
  notions: ['chiffre-sans-origine', 'generalisation-hative', 'appel-a-la-popularite', 'titre-trompeur'],
  corps: [
    {
      paragraphe:
        'Un sondage est une mesure : une question posée à un groupe de personnes, à un moment donné. Ce n’est ni une preuve ni un mensonge. Tout dépend de ce que l’article en fait, et un lecteur pressé n’a souvent que le titre pour en juger. Voici un article inventé, du genre qu’on croise chaque semaine.',
    },
    {
      exemple: {
        rubrique: 'Éducation',
        titre: [['Les parents ne veulent plus des devoirs']],
        texte: [
          'Selon un sondage publié cette semaine, ',
          ['61 % des parents jugent les devoirs inutiles'],
          '. Le message est clair : il est temps de les supprimer.',
        ],
        lecture:
          'Le titre parle de tous les parents, le texte d’un sondage dont on ne sait rien, et la conclusion passe d’une opinion à une décision. Les quatre questions ci-dessous défont ces trois glissements un par un.',
      },
    },
    { intertitre: '1. Qui a posé la question ?' },
    {
      paragraphe: [
        'Un institut, une association, un syndicat, un média, une marque ? Le commanditaire n’invalide pas le résultat, mais il dit qui avait intérêt à le publier. Un chiffre sans nom d’institut ni date est un ',
        { texte: 'chiffre sans origine', vers: '/glossaire/chiffre-sans-origine' },
        ' : on ne peut ni le vérifier ni le comparer.',
      ],
    },
    { intertitre: '2. À qui l’a-t-on posée ?' },
    {
      paragraphe: [
        '« Les parents », c’est qui ? Un échantillon construit pour ressembler à la population, ou les lecteurs d’un site qui ont bien voulu cliquer ? Combien de personnes ? Un sondage en ligne ouvert à tous mesure l’avis de ceux qui ont répondu, pas celui de tout le monde. Passer de l’un à l’autre, c’est une ',
        { texte: 'généralisation hâtive', vers: '/glossaire/generalisation-hative' },
        '.',
      ],
    },
    { intertitre: '3. Quelle question exactement ?' },
    {
      paragraphe:
        '« Les devoirs sont-ils utiles ? » et « Les devoirs, tels qu’ils sont donnés aujourd’hui, aident-ils votre enfant ? » ne mesurent pas la même chose. Une question peut orienter la réponse par ses mots ou par les choix qu’elle propose. Si l’article ne cite pas la question, on ne sait pas ce que le chiffre résume.',
    },
    { intertitre: '4. Que dit vraiment la réponse ?' },
    {
      paragraphe: [
        'Un sondage d’opinion mesure ce que des gens pensent, pas ce qui est vrai. Que des parents jugent les devoirs inutiles est une information sur les parents ; cela ne dit pas si les devoirs aident les élèves. Faire du nombre une preuve, c’est un ',
        { texte: 'appel à la popularité', vers: '/glossaire/appel-a-la-popularite' },
        '. Et quand le titre affirme plus que le sondage, c’est un ',
        { texte: 'titre trompeur', vers: '/glossaire/titre-trompeur' },
        '.',
      ],
    },
    { intertitre: 'En une minute, sur n’importe quel article' },
    {
      liste: [
        'Cherchez le nom de l’institut et la date de l’enquête.',
        'Cherchez le nombre de personnes interrogées et la façon dont elles ont été choisies.',
        'Cherchez la question posée, mot pour mot.',
        'Relisez le titre : dit-il ce que le sondage mesure, ou ce que l’article voudrait en conclure ?',
      ],
    },
    {
      paragraphe:
        'Si l’une de ces réponses manque, le chiffre n’est pas faux pour autant. Il est simplement impossible à juger tel quel, et c’est cela qu’il faut retenir de l’article.',
    },
  ],
};

export default article;
