import type { Article } from '../blog';

const article: Article = {
  slug: 'conclusion-hative',
  titre: 'Conclusion hâtive : ce que l’article a vu, et ce qu’il en conclut',
  description:
    'Comment repérer une conclusion hâtive dans un article ? Séparez ce qui a été observé de ce qui est conclu, et mesurez l’écart. Une méthode, un exemple.',
  chapo:
    'Tout article finit par conclure. La question n’est pas de savoir s’il a le droit de le faire, mais jusqu’où ce qu’il a observé lui permet d’aller. Une conclusion hâtive se repère en posant les deux côte à côte.',
  publie: '2026-11-02',
  notions: ['generalisation-hative', 'correlation-causalite', 'surinterpretation', 'titre-trompeur'],
  corps: [
    {
      paragraphe:
        'Voici un article inventé, du genre qu’on lit souvent dans les pages locales. Rien n’y est faux à première vue : la journaliste est allée sur place et a interrogé quelqu’un.',
    },
    {
      exemple: {
        rubrique: 'Vie locale',
        titre: [['Les adolescents ont lâché les livres']],
        texte: [
          'Mercredi après-midi, le rayon romans de la médiathèque était désert. « Avant, ils venaient en groupe après les cours », se souvient une bibliothécaire. ',
          ['Les jeunes ne lisent plus, et les écrans en sont la cause'],
          '. Il est temps d’agir.',
        ],
        lecture:
          'Une médiathèque, un après-midi, un souvenir : c’est ce qui a été observé. L’article en tire une règle sur tous les jeunes, lui donne une cause, puis en fait un appel à agir. Chaque pas va un peu plus loin que le précédent.',
      },
    },
    { intertitre: 'Le geste : séparer deux phrases' },
    {
      paragraphe:
        'Cherchez d’abord la phrase qui dit ce que l’article a vu ou mesuré. Cherchez ensuite celle qui dit ce qu’il en conclut. Écrites l’une sous l’autre, elles montrent tout de suite la distance à parcourir entre les deux.',
    },
    {
      paragraphe:
        'Dans l’exemple, la première serait : « Un mercredi, le rayon romans d’une médiathèque était vide. Une bibliothécaire se souvient d’une époque plus animée. » La seconde : « Les jeunes ne lisent plus, à cause des écrans. » Entre les deux, il manque presque tout.',
    },
    { intertitre: 'Ce qui a été observé' },
    {
      paragraphe:
        'Posez quatre questions à la première phrase. Où l’observation a-t-elle eu lieu ? Sur qui ? Combien de cas ? Pendant combien de temps ? Un lieu, un moment et un témoignage font un bon point de départ pour un reportage. Ils ne font pas une mesure.',
    },
    {
      paragraphe:
        'Un rayon vide un mercredi peut s’expliquer de bien des façons : un contrôle le lendemain, ou un nouvel horaire des cours. Et les adolescents qui lisent ne passent pas tous par la médiathèque.',
    },
    { intertitre: 'Trois façons d’aller trop loin' },
    {
      paragraphe: [
        'La conclusion peut d’abord porter sur bien plus de monde que ceux qu’on a observés. Les quelques adolescents absents d’une médiathèque deviennent « les jeunes » : c’est une ',
        { texte: 'généralisation hâtive', vers: '/glossaire/generalisation-hative' },
        '.',
      ],
    },
    {
      paragraphe: [
        'Elle peut ensuite ajouter une cause que rien ne montre. Que les écrans se soient répandus pendant que le rayon se vidait ne prouve pas que l’un explique l’autre. Deux choses qui changent en même temps ne sont pas pour autant cause et effet : c’est la ',
        { texte: 'corrélation prise pour causalité', vers: '/glossaire/correlation-causalite' },
        '.',
      ],
    },
    {
      paragraphe: [
        'Elle peut enfin grossir le résultat. Même une vraie étude, sérieuse, ne permet souvent qu’une conclusion prudente et limitée. Quand l’article en tire une tendance de fond ou un appel à agir, c’est une ',
        { texte: 'surinterprétation', vers: '/glossaire/surinterpretation' },
        '.',
      ],
    },
    { intertitre: 'Les mots du saut' },
    {
      paragraphe:
        'Le passage de l’observation à la conclusion laisse des traces dans la phrase. Des mots qui englobent : « les jeunes », « tout le monde », « plus personne », « toujours ». Des mots qui relient : « donc », « la preuve que », « à cause de », « en sont la cause ». Et des mots qui grossissent : « la fin de », « une génération », « il est temps ».',
    },
    {
      paragraphe: [
        'Relisez aussi le titre. C’est souvent là que la conclusion atterrit, sans les précautions du texte. Ici, il affirme comme un fait ce que l’article n’a pas établi : c’est un ',
        { texte: 'titre qui en dit plus que l’article', vers: '/glossaire/titre-trompeur' },
        '.',
      ],
    },
    { intertitre: 'En une minute, sur n’importe quel article' },
    {
      liste: [
        'Soulignez la phrase qui dit ce qui a été vu ou mesuré.',
        'Soulignez celle qui dit ce qui est conclu.',
        'Comparez : le même groupe ? une cause ajoutée ? une portée plus grande ?',
        'Relisez le titre : dit-il l’observation, ou la conclusion ?',
      ],
    },
    { intertitre: 'Une conclusion hâtive n’est pas forcément fausse' },
    {
      paragraphe:
        'Les adolescents lisent peut-être moins qu’avant. L’article ne le montre pas, c’est tout. Pour le dire, il faudrait compter les lecteurs sur un grand nombre de jeunes, et sur plusieurs années. Pour accuser les écrans, il faudrait encore écarter les autres explications.',
    },
    {
      paragraphe:
        'Repérer l’écart ne dit donc pas qui a raison. Cela dit ce que l’article a prouvé, et ce qu’il vous demande de croire en plus. Vous pouvez faire cette lecture sur l’article que vous avez sous les yeux.',
    },
  ],
};

export default article;
