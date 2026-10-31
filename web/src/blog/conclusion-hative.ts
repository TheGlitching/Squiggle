import type { Article } from '../blog';

const article: Article = {
  slug: 'conclusion-hative',
  titre: 'Conclusion hâtive : ce que l’article a vu, ce qu’il conclut',
  titreCourt: 'Conclusion hâtive',
  description:
    'Comment repérer une conclusion hâtive dans un article ? Séparez ce qui a été observé de ce qui est conclu, et mesurez l’écart. Une méthode, un exemple.',
  chapo:
    'Une conclusion hâtive va plus loin que ce que l’article a observé. Pour la repérer, séparez deux phrases : celle qui dit ce qui a été vu, celle qui dit ce qui en est conclu. L’écart entre les deux est ce que l’article vous demande de croire en plus.',
  publie: '2026-10-31',
  notions: ['generalisation-hative', 'correlation-causalite', 'surinterpretation', 'titre-trompeur'],
  corps: [
    {
      encadre: {
        titre: 'L’essentiel',
        points: [
          'Un article conclut toujours. La question est de savoir si ce qu’il a observé suffit à porter sa conclusion.',
          'Une conclusion va trop loin de trois façons : elle parle de plus de monde, elle ajoute une cause, ou elle grossit le résultat.',
          'Le titre garde souvent la conclusion et laisse tomber les précautions du texte.',
          'Une conclusion hâtive n’est pas forcément fausse. Elle n’est pas encore établie.',
        ],
      },
    },
    { sommaire: true },
    { intertitre: 'Un exemple de conclusion hâtive' },
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
    { intertitre: 'La méthode : séparer deux phrases' },
    {
      paragraphe:
        'Le geste tient en trois temps. Il se fait au crayon sur un article imprimé, ou de tête sur un écran.',
    },
    {
      etapes: [
        'Trouvez la phrase qui dit ce que l’article a vu ou mesuré.',
        'Trouvez celle qui dit ce qu’il en conclut.',
        'Écrivez-les l’une sous l’autre, et cherchez ce qu’il faudrait savoir de plus pour passer de la première à la seconde.',
      ],
    },
    {
      paragraphe:
        'Dans l’exemple, la première serait : « Un mercredi, le rayon romans d’une médiathèque était vide. Une bibliothécaire se souvient d’une époque plus animée. » La seconde : « Les jeunes ne lisent plus, à cause des écrans. » Entre les deux, il manque presque tout.',
    },
    { intertitre: 'Ce qui a été observé' },
    {
      paragraphe:
        'La première phrase se juge avec quatre questions. Un lieu, un moment et un témoignage font un bon départ pour un reportage. Ils ne font pas une mesure.',
    },
    {
      liste: [
        'Où l’observation a-t-elle eu lieu ?',
        'Sur qui porte-t-elle ?',
        'Combien de cas a-t-on vus ?',
        'Pendant combien de temps ?',
      ],
    },
    {
      paragraphe:
        'Un rayon vide un mercredi peut s’expliquer de bien des façons : un contrôle le lendemain, ou un nouvel horaire des cours. Et les adolescents qui lisent ne passent pas tous par la médiathèque.',
    },
    { intertitre: 'Trois façons d’aller trop loin' },
    {
      paragraphe:
        'La seconde phrase dépasse la première de trois manières, qui se cumulent souvent dans le même article. Chacune porte un nom dans le glossaire.',
    },
    {
      tableau: {
        legende: 'Les trois façons dont une conclusion dépasse ce qui a été observé',
        colonnes: ['Le saut', 'Dans l’exemple', 'La notion'],
        lignes: [
          [
            'Elle parle de plus de monde',
            'Quelques adolescents absents deviennent « les jeunes ».',
            [{ texte: 'Généralisation hâtive', vers: '/glossaire/generalisation-hative' }],
          ],
          [
            'Elle ajoute une cause',
            'Les écrans se sont répandus pendant que le rayon se vidait, donc ils l’ont vidé.',
            [{ texte: 'Corrélation prise pour causalité', vers: '/glossaire/correlation-causalite' }],
          ],
          [
            'Elle grossit le résultat',
            'Un après-midi calme devient un phénomène qui appelle une action.',
            [{ texte: 'Surinterprétation', vers: '/glossaire/surinterpretation' }],
          ],
        ],
      },
    },
    { sousTitre: 'Plus de monde' },
    {
      paragraphe:
        'Le groupe observé et le groupe dont parle la conclusion ne sont pas les mêmes. Pour parler des jeunes en général, il faudrait en observer beaucoup, choisis pour ressembler à l’ensemble.',
    },
    { sousTitre: 'Une cause en plus' },
    {
      paragraphe:
        'Deux choses qui changent en même temps ne sont pas pour autant cause et effet. Un troisième facteur peut agir sur les deux, ou la coïncidence peut tenir du hasard.',
    },
    { sousTitre: 'Un résultat plus gros' },
    {
      paragraphe:
        'Même une étude sérieuse ne permet souvent qu’une conclusion prudente. Quand l’article en tire une tendance de fond ou un appel à agir, il ajoute ce que l’étude n’a pas montré.',
    },
    { intertitre: 'Les mots qui trahissent le saut' },
    {
      paragraphe: 'Le passage de l’observation à la conclusion laisse des traces dans la phrase. Trois familles de mots sont à relire.',
    },
    {
      liste: [
        'Les mots qui englobent : « les jeunes », « tout le monde », « plus personne », « toujours ».',
        'Les mots qui relient : « donc », « la preuve que », « à cause de », « en sont la cause ».',
        'Les mots qui grossissent : « la fin de », « une génération », « il est temps ».',
      ],
    },
    {
      encadre: {
        titre: 'Relisez le titre',
        points: [
          [
            'C’est souvent là que la conclusion atterrit, sans les précautions du texte. Ici, il affirme comme un fait ce que l’article n’a pas établi : c’est un ',
            { texte: 'titre qui en dit plus que l’article', vers: '/glossaire/titre-trompeur' },
            '.',
          ],
        ],
      },
    },
    { intertitre: 'En une minute, sur n’importe quel article' },
    {
      etapes: [
        'Soulignez la phrase qui dit ce qui a été vu ou mesuré.',
        'Soulignez celle qui dit ce qui est conclu.',
        'Comparez : le même groupe ? une cause ajoutée ? une portée plus grande ?',
        'Relisez le titre : dit-il l’observation, ou la conclusion ?',
      ],
    },
    { intertitre: 'Questions fréquentes' },
    {
      questions: [
        {
          question: 'Une conclusion hâtive est-elle forcément fausse ?',
          reponse:
            'Non. Les adolescents lisent peut-être moins qu’avant. L’article ne le montre pas, c’est tout. Pour le dire, il faudrait compter les lecteurs sur un grand nombre de jeunes et sur plusieurs années. Pour accuser les écrans, il faudrait encore écarter les autres explications.',
        },
        {
          question: 'Conclusion hâtive et généralisation hâtive, est-ce la même chose ?',
          reponse: [
            'Les deux expressions s’emploient souvent l’une pour l’autre. La ',
            { texte: 'généralisation hâtive', vers: '/glossaire/generalisation-hative' },
            ' est un cas précis : tirer une règle sur tout un groupe de quelques cas. Une conclusion peut aussi aller trop vite en ajoutant une cause ou en grossissant un résultat.',
          ],
        },
        {
          question: 'Comment s’exercer ?',
          reponse:
            'Prenez un article court qui conclut quelque chose, et faites l’exercice des deux phrases. Puis réécrivez la conclusion la plus forte que l’observation permet vraiment. Elle est souvent plus modeste, et plus intéressante.',
        },
      ],
    },
    {
      paragraphe:
        'Repérer l’écart ne dit pas qui a raison. Cela dit ce que l’article a prouvé, et ce qu’il vous demande de croire en plus. Vous pouvez faire cette lecture sur l’article que vous avez sous les yeux.',
    },
  ],
};

export default article;
