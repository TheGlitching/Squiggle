/**
 * What each public page says about itself to search engines and link previews.
 *
 * The build (`vite.config.ts`) writes one HTML file per page with this head and the
 * page rendered inside it, and lists the pages in `sitemap.xml`, because a crawler or
 * a link preview reads the HTML the server sends and never runs the app. In the
 * browser, `App` only takes the title from here.
 */
import { CONTACT_EMAIL } from './components/Layout';
import { GITHUB_URL, PRICE_MONTHLY, TAGLINE } from './offer';
import { BLOG_PATH, FEED_PATH, PUBLISHED, article, blogPath, type Article } from './blog';
import { NOTIONS, famille, glossaryPath, notion } from './glossaire';
import { CHROME_URL, FIREFOX_URL } from './install';
import { SHORTCUT_PUBLISHED } from './shortcut';

export const ORIGIN = 'https://squiggle.fr';

const HOME_TITLE = `Squiggle : ${TAGLINE.charAt(0).toLowerCase()}${TAGLINE.slice(1, -1)}`;

/** What a page's own share image says (`src/share.tsx` draws it). */
export interface ShareCard {
  kicker: string;
  title: string;
  text: string;
  /** The site drawing beside the text. */
  figure?: 'classe' | 'lecture' | 'rapport' | 'sources' | 'ouvrir' | 'telecharger';
  /** The title marked as the product marks a passage: a glossary notion's name. */
  mark?: boolean;
}

export interface PublicPage {
  path: string;
  title: string;
  description: string;
  /** Structured data (schema.org) for a page that defines something, the glossary's. */
  jsonLd?: object;
  /** Its own share image; without one, a page shares the home page's. */
  share?: ShareCard;
  /** The day it last changed, `YYYY-MM-DD`, where it is known for sure: the blog's. */
  lastmod?: string;
}

const GLOSSARY = `${ORIGIN}/glossaire`;
const TERM_SET = { '@type': 'DefinedTermSet', '@id': `${GLOSSARY}#glossaire`, name: 'Glossaire de l’esprit critique', url: GLOSSARY };

/** The trail a notion page shows above its title (`NotionPage`), for the results that still print one. */
const breadcrumb = (trail: ReadonlyArray<readonly [string, string?]>) => ({
  '@type': 'BreadcrumbList',
  itemListElement: trail.map(([name, url], index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name,
    ...(url ? { item: url } : {}),
  })),
});

/** The glossary: its index as a `DefinedTermSet`, and each notion as a `DefinedTerm` of it. */
const GLOSSARY_PAGES: PublicPage[] = [
  {
    path: '/glossaire',
    title: 'Glossaire de l’esprit critique : sophismes, biais et procédés, expliqués simplement - Squiggle',
    description:
      'Faux dilemme, homme de paille, chiffre sans origine… Les 25 notions que nomment les rapports Squiggle, avec un exemple et une question pour la classe.',
    share: {
      kicker: 'Glossaire de l’esprit critique',
      title: 'Sophismes, biais et procédés, expliqués simplement',
      text: `Les ${NOTIONS.length} notions que nomment les rapports Squiggle, chacune avec un exemple et une question pour la classe.`,
      figure: 'lecture',
    },
    jsonLd: {
      '@context': 'https://schema.org',
      ...TERM_SET,
      description: 'Les sophismes, procédés de cadrage et défauts de sourcing que nomment les rapports Squiggle.',
      inLanguage: 'fr',
      hasDefinedTerm: NOTIONS.map((notion) => ({
        '@type': 'DefinedTerm',
        name: notion.nom,
        url: `${ORIGIN}${glossaryPath(notion.slug)}`,
      })),
    },
  },
  ...NOTIONS.map((notion) => ({
    path: glossaryPath(notion.slug),
    title: `${notion.nom} : définition et ${notion.exemples ? 'exemples' : 'exemple'} - Squiggle`,
    description: notion.description ?? `${notion.resume} Définition, exemple, comment le repérer.`,
    share: {
      kicker: `Glossaire de l’esprit critique · ${famille(notion.famille).titre}`,
      title: notion.nom,
      text: notion.resume,
      mark: true,
    },
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'DefinedTerm',
          '@id': `${ORIGIN}${glossaryPath(notion.slug)}#notion`,
          name: notion.nom,
          ...(notion.aussi ? { alternateName: notion.aussi } : {}),
          description: notion.definition[0],
          url: `${ORIGIN}${glossaryPath(notion.slug)}`,
          inLanguage: 'fr',
          inDefinedTermSet: TERM_SET,
        },
        breadcrumb([
          ['Glossaire', GLOSSARY],
          [famille(notion.famille).titre, `${GLOSSARY}#${notion.famille}`],
          [notion.nom],
        ]),
      ],
    },
  })),
];

/** A printable or classroom page for teachers: what it is to a search engine. No rich result is promised. */
const learningResource = (path: string, name: string, description: string, type: string) => ({
  '@context': 'https://schema.org',
  '@type': 'LearningResource',
  name,
  description,
  url: `${ORIGIN}${path}`,
  inLanguage: 'fr',
  learningResourceType: type,
  educationalLevel: ['Collège', 'Lycée'],
  audience: { '@type': 'EducationalAudience', educationalRole: 'teacher' },
  isAccessibleForFree: true,
});

const BLOG_TITLE = 'Le blog de Squiggle';
const ORGANISATION = { '@type': 'Organization', '@id': `${ORIGIN}/#organisation`, name: 'Squiggle', url: `${ORIGIN}/` };

/**
 * The blog: its index, and each article with an `Article` schema. Its author is
 * Squiggle: the site names no person. Nothing at all until one article is published.
 */
export function blogPages(articles: readonly Article[]): PublicPage[] {
  if (!articles.length) return [];
  const lastmod = (item: Article) => item.misAJour ?? item.publie;
  return [
    {
      path: BLOG_PATH,
      title: `${BLOG_TITLE} : des méthodes pour lire un article avec un œil critique`,
      description:
        'Repérer un chiffre sans origine, un titre trompeur, un procès d’intention : des méthodes de lecture, chacune sur un exemple inventé.',
      share: {
        kicker: BLOG_TITLE,
        title: 'Des méthodes pour lire un article avec un œil critique',
        text: 'Chacune sur un exemple inventé, avec les notions du glossaire qu’elle met en jeu.',
        figure: 'lecture',
      },
      lastmod: articles.map(lastmod).sort().at(-1),
    },
    ...articles.map((item) => {
      const url = `${ORIGIN}${blogPath(item.slug)}`;
      const page: PublicPage = {
        path: blogPath(item.slug),
        title: `${item.titre} - Squiggle`,
        description: item.description,
        // The chapo would not fit under a title of three lines: the card says what the page is.
        share: { kicker: BLOG_TITLE, title: item.titre, text: 'Une méthode de lecture, sur un article inventé.', figure: 'lecture' },
        lastmod: lastmod(item),
      };
      page.jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: item.titre,
        description: item.description,
        url,
        mainEntityOfPage: url,
        image: `${ORIGIN}${shareImagePath(page)}`,
        datePublished: item.publie,
        dateModified: lastmod(item),
        inLanguage: 'fr',
        author: ORGANISATION,
        publisher: { ...ORGANISATION, logo: { '@type': 'ImageObject', url: `${ORIGIN}/icons/icon-512.png` } },
        about: item.notions.map((slug) => ({
          '@type': 'DefinedTerm',
          name: notion(slug)!.nom,
          url: `${ORIGIN}${glossaryPath(slug)}`,
        })),
      };
      return page;
    }),
  ];
}

/** Every page worth finding from a search. `/tarifs` is the home page's pricing anchor, not a page. */
export const PUBLIC_PAGES: readonly PublicPage[] = [
  {
    path: '/',
    title: HOME_TITLE,
    description:
      'Squiggle surligne les passages fragiles de l’article que vous lisez, dit pourquoi et montre ce qui est solide. 3 analyses offertes.',
  },
  {
    path: '/analyser',
    title: 'Analyser un article - Squiggle',
    description:
      'Collez le texte d’un article : Squiggle surligne ses passages fragiles et dit pourquoi, en une à deux minutes. Rien à installer.',
    share: {
      kicker: 'Analyser un article',
      title: 'Collez un article, voyez ses passages fragiles',
      text: 'Squiggle dit pourquoi chacun l’est, en une à deux minutes. Rien à installer.',
      figure: 'rapport',
    },
  },
  ...(SHORTCUT_PUBLISHED
    ? [
        {
          path: '/raccourci',
          title: 'Analyser avec Squiggle sur iPhone : le raccourci - Squiggle',
          description:
            'Un article dans Safari ou des captures d’une appli de presse : partagez-les vers Squiggle, l’analyse s’ouvre avec le texte. Rien à copier.',
        },
      ]
    : []),
  {
    path: '/favori',
    // The page's title is the bookmark's name: the browser fills it in when the page is saved.
    title: 'Analyser avec Squiggle',
    description:
      'Sur téléphone, analysez d’un geste l’article ouvert dans le navigateur : le favori lit son texte dans la page. Chrome Android et Safari iPhone.',
  },
  {
    path: '/enseignants',
    title: 'Squiggle pour les enseignants',
    description:
      'Un article de l’actualité, relu sous les yeux de la classe : vous préparez chez vous, vous révélez l’analyse au tableau. Gratuit avec une adresse académique.',
    share: {
      kicker: 'Squiggle pour les enseignants',
      title: 'Un article de l’actualité, relu sous les yeux de la classe',
      text: 'Vous préparez chez vous, vous révélez l’analyse au tableau.',
      figure: 'classe',
    },
  },
  {
    path: '/enseignants/fiche-activite',
    title: 'Fiche d’activité : ce qui fragilise un article - Squiggle',
    description:
      'Une séance d’éducation aux médias de 55 minutes, de la 4e à la terminale : objectifs, déroulé, variantes. Deux pages A4 à imprimer.',
    jsonLd: learningResource(
      '/enseignants/fiche-activite',
      'Fiche d’activité : ce qui fragilise un article',
      'Une séance d’éducation aux médias de 55 minutes, de la 4e à la terminale.',
      'Fiche d’activité',
    ),
    share: {
      kicker: 'Fiche d’activité',
      title: 'Ce qui fragilise un article',
      text: 'Une séance d’éducation aux médias de 55 minutes, de la 4e à la terminale.',
      figure: 'classe',
    },
  },
  {
    path: '/enseignants/grille-lecture',
    title: 'Grille de lecture : cinq raisons de douter d’un article - Squiggle',
    description:
      'Une grille à photocopier pour chaque élève : cinq raisons de douter d’un article, avec un exemple chacune. Sert avec n’importe quel article.',
    jsonLd: learningResource(
      '/enseignants/grille-lecture',
      'Grille de lecture : cinq raisons de douter d’un article',
      'Une page à photocopier pour chaque élève : cinq raisons de douter d’un article, avec un exemple chacune.',
      'Grille de lecture',
    ),
    share: {
      kicker: 'Grille de lecture',
      title: 'Cinq raisons de douter d’un article',
      text: 'Une page à photocopier pour chaque élève, avec un exemple pour chaque raison.',
      figure: 'classe',
    },
  },
  {
    path: '/enseignants/exercices',
    title: 'Exercices d’esprit critique pour la classe - Squiggle',
    description: `${NOTIONS.length} exercices d’esprit critique pour une séance d’éducation aux médias : un passage d’article inventé, une question pour la classe, une fiche.`,
    share: {
      kicker: 'Exercices d’esprit critique',
      title: `${NOTIONS.length} questions pour la classe`,
      text: 'Une par notion du glossaire, chacune sur un passage d’article inventé.',
      figure: 'classe',
    },
    jsonLd: learningResource(
      '/enseignants/exercices',
      'Exercices d’esprit critique',
      `${NOTIONS.length} questions pour la classe, une par sophisme, biais ou procédé du glossaire, chacune sur un passage d’article inventé.`,
      'Exercice',
    ),
  },
  {
    path: '/classe',
    title: 'Le mode classe - Squiggle',
    description:
      'Ouvrez votre fichier de séance sur l’ordinateur de la classe, sans compte, et révélez l’analyse au tableau constat par constat.',
    share: {
      kicker: 'Le mode classe',
      title: 'Révélez l’analyse au tableau, constat par constat',
      text: 'Votre fichier de séance s’ouvre sur l’ordinateur de la classe, sans compte.',
      figure: 'ouvrir',
    },
  },
  {
    path: '/classe/mode-emploi',
    title: 'Mode d’emploi du mode classe - Squiggle',
    description:
      'Une séance avec Squiggle en six étapes, sur une page à imprimer : préparer chez soi, télécharger la séance, l’ouvrir en classe, projeter.',
    share: {
      kicker: 'Mode d’emploi du mode classe',
      title: 'Une séance avec Squiggle en six étapes',
      text: 'Préparer chez soi, télécharger la séance, l’ouvrir en classe, projeter.',
      figure: 'telecharger',
    },
  },
  {
    path: '/transparence',
    title: 'Transparence - Squiggle',
    description:
      'Où va votre article quand Squiggle l’analyse, ce que nous gardons, combien de temps, et à qui nous le confions.',
    share: {
      kicker: 'Transparence',
      title: 'Où va votre article quand Squiggle l’analyse',
      text: 'Ce que nous gardons, combien de temps, et à qui nous le confions.',
      figure: 'sources',
    },
  },
  {
    path: '/confidentialite',
    title: 'Politique de confidentialité - Squiggle',
    description:
      'Ce que Squiggle fait de vos données personnelles, pourquoi, combien de temps, et comment exercer vos droits (RGPD, art. 13).',
  },
  {
    path: '/conditions',
    title: 'Conditions d’utilisation - Squiggle',
    description: 'Ce qu’est un rapport Squiggle, ce qu’il n’est pas, et comment le contester.',
  },
  {
    path: '/cgv',
    title: 'Conditions de vente - Squiggle',
    description: 'Ce que vous achetez avec l’abonnement Squiggle, à quel prix, et comment vous en sortir.',
  },
  {
    path: '/mentions-legales',
    title: 'Mentions légales - Squiggle',
    description: 'Qui édite Squiggle et qui l’héberge.',
  },
  ...GLOSSARY_PAGES,
  ...blogPages(PUBLISHED),
];

/**
 * Pages no search should find, which still name their tab: the classroom's board
 * and sheets only show a session open in this browser, and a teacher picks the
 * board's window out by its name when moving it to the projector.
 */
const APP_TITLES: Record<string, string> = {
  '/classe/tableau': 'Tableau - Squiggle',
  '/classe/fiche': 'Fiche élève - Squiggle',
  '/classe/corrige': 'Corrigé - Squiggle',
  '/favori/essai': 'Testez votre favori - Squiggle',
};

/**
 * Every other address the app answers (`App.tsx`): the build writes each one a page
 * that no search indexes, and any address that is neither one of these nor a public
 * page is answered with `404.html` and a 404 status.
 */
export const APP_PATHS: readonly string[] = [
  ...Object.keys(APP_TITLES),
  '/connexion',
  '/magic-link',
  '/compte',
  '/account',
  '/pont',
  '/legal',
  // Without its signed file, /raccourci only sends the reader on to /favori.
  ...(SHORTCUT_PUBLISHED ? [] : ['/raccourci']),
];

export const NOT_FOUND_TITLE = 'Page introuvable - Squiggle';

/** The title a path shows in the browser tab; any other app page (account, sign-in) keeps the site's. */
export function titleFor(path: string): string {
  const page = PUBLIC_PAGES.find((item) => item.path === path);
  if (page) return page.title;
  if (APP_TITLES[path]) return APP_TITLES[path];
  // A draft, which only the dev server shows.
  const draft = path.startsWith(`${BLOG_PATH}/`) ? article(path.slice(BLOG_PATH.length + 1)) : undefined;
  if (draft) return `${draft.titre} - Squiggle`;
  return APP_PATHS.includes(path) || path === '/tarifs' ? PUBLIC_PAGES[0].title : NOT_FOUND_TITLE;
}

const escape = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** Who publishes the site and what it sells, for the home page only. No FAQPage: Google no longer shows it. */
function structuredData(): string {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${ORIGIN}/#organisation`,
        name: 'Squiggle',
        url: `${ORIGIN}/`,
        logo: `${ORIGIN}/icons/icon-512.png`,
        email: CONTACT_EMAIL,
        sameAs: [GITHUB_URL],
      },
      {
        '@type': 'WebSite',
        '@id': `${ORIGIN}/#site`,
        name: 'Squiggle',
        url: `${ORIGIN}/`,
        inLanguage: 'fr',
        publisher: { '@id': `${ORIGIN}/#organisation` },
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Squiggle',
        url: `${ORIGIN}/`,
        description: PUBLIC_PAGES[0].description,
        applicationCategory: 'BrowserApplication',
        operatingSystem: 'Chrome, Firefox, Web',
        inLanguage: 'fr',
        downloadUrl: [CHROME_URL, FIREFOX_URL],
        publisher: { '@id': `${ORIGIN}/#organisation` },
        offers: [
          {
            '@type': 'Offer',
            name: 'Extension avec votre propre clé d’IA',
            price: '0',
            priceCurrency: 'EUR',
          },
          {
            '@type': 'Offer',
            name: 'Abonnement mensuel',
            price: PRICE_MONTHLY.replace(/[^\d,]/g, '').replace(',', '.'),
            priceCurrency: 'EUR',
          },
        ],
      },
    ],
  };
  return jsonLdScript(graph);
}

// `<` cannot close the script element from inside a JSON string once escaped.
const jsonLdScript = (data: object) =>
  `<script type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>`;

/** The share image of every page without its own: the home page's hero. */
const DEFAULT_IMAGE = {
  path: '/og.png',
  alt: 'Un article et, posée dessus, la relecture de Squiggle : un passage surligné, sa raison en marge, et une note de 61 sur 100.',
};

/** Where the build writes a page's own share image: `/og/glossaire/faux-dilemme.png` for `/glossaire/faux-dilemme`. */
export function shareImagePath(page: PublicPage): string {
  return page.share ? `/og${page.path}.png` : DEFAULT_IMAGE.path;
}

function imageTags(page?: PublicPage): string[] {
  const card = page?.share;
  const url = `${ORIGIN}${page ? shareImagePath(page) : DEFAULT_IMAGE.path}`;
  const alt = escape(card ? `${card.kicker} : ${card.title}. ${card.text}` : DEFAULT_IMAGE.alt);
  return [
    `<meta property="og:image" content="${url}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${alt}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:image" content="${url}" />`,
    `<meta name="twitter:image:alt" content="${alt}" />`,
  ];
}

/** The page-specific part of `<head>`: what replaces `<!--page-head-->` in `index.html`. */
export function headFor(page: PublicPage): string {
  const url = `${ORIGIN}${page.path}`;
  const title = escape(page.title);
  const description = escape(page.description);
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="index, follow" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    ...imageTags(page),
    ...(page.path === BLOG_PATH || page.path.startsWith(`${BLOG_PATH}/`)
      ? [`<link rel="alternate" type="application/rss+xml" title="${BLOG_TITLE}" href="${ORIGIN}${FEED_PATH}" />`]
      : []),
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    ...(page.path === '/' ? [structuredData()] : page.jsonLd ? [jsonLdScript(page.jsonLd)] : []),
  ].join('\n    ');
}

/**
 * The head of a page no search should index: an app page (`APP_PATHS`) or the 404.
 * A link to one still previews as the site, with the home page's image.
 */
export function appHeadFor(title: string): string {
  const home = PUBLIC_PAGES[0];
  return [
    `<title>${escape(title)}</title>`,
    `<meta name="description" content="${escape(home.description)}" />`,
    `<meta name="robots" content="noindex" />`,
    `<meta property="og:title" content="${escape(home.title)}" />`,
    `<meta property="og:description" content="${escape(home.description)}" />`,
    ...imageTags(),
  ].join('\n    ');
}

const GLOSSARY_SOURCES = ['src/glossaire.ts', 'src/pages/Glossaire.tsx'];
const PAGE_SOURCES: Record<string, string[]> = {
  '/': ['src/pages/Accueil.tsx'],
  '/analyser': ['src/pages/Analyser.tsx'],
  '/raccourci': ['src/pages/Raccourci.tsx'],
  '/favori': ['src/pages/Favori.tsx'],
  '/enseignants': ['src/pages/Enseignants.tsx'],
  '/enseignants/fiche-activite': ['src/pages/Kit.tsx'],
  '/enseignants/grille-lecture': ['src/pages/Kit.tsx'],
  '/enseignants/exercices': GLOSSARY_SOURCES,
  '/classe': ['src/pages/Classe.tsx'],
  '/classe/mode-emploi': ['src/components/ModeEmploi.tsx'],
  '/transparence': ['src/pages/Transparence.tsx'],
  '/confidentialite': ['src/pages/Legal.tsx'],
  '/conditions': ['src/pages/Legal.tsx'],
  '/cgv': ['src/pages/Legal.tsx'],
  '/mentions-legales': ['src/pages/Legal.tsx'],
};

/**
 * The files, relative to `web/`, whose last commit dates a page in the sitemap. A page's
 * own file only: a shared component's change is not a change Google needs to recrawl for.
 */
export const pageSources = (path: string): string[] | undefined =>
  path === '/glossaire' || path.startsWith('/glossaire/') ? GLOSSARY_SOURCES : PAGE_SOURCES[path];

/** Every public page, for `/sitemap.xml`. */
export function sitemap(pages: readonly PublicPage[] = PUBLIC_PAGES): string {
  const urls = pages.map(
    (page) => `  <url><loc>${ORIGIN}${page.path}</loc>${page.lastmod ? `<lastmod>${page.lastmod}</lastmod>` : ''}</url>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** RFC 822, as RSS wants it: `2026-11-06` is `Fri, 06 Nov 2026 00:00:00 GMT`. */
const rssDate = (day: string) => new Date(`${day}T00:00:00Z`).toUTCString();

/** `/blog/rss.xml`: the published articles, newest first. */
export function feed(articles: readonly Article[] = PUBLISHED): string {
  const items = articles.map((item) => {
    const url = `${ORIGIN}${blogPath(item.slug)}`;
    return [
      '    <item>',
      `      <title>${escape(item.titre)}</title>`,
      `      <link>${url}</link>`,
      `      <guid isPermaLink="true">${url}</guid>`,
      `      <pubDate>${rssDate(item.publie)}</pubDate>`,
      `      <description>${escape(item.chapo)}</description>`,
      '    </item>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${BLOG_TITLE}</title>`,
    `    <link>${ORIGIN}${BLOG_PATH}</link>`,
    `    <atom:link href="${ORIGIN}${FEED_PATH}" rel="self" type="application/rss+xml" />`,
    '    <description>Des méthodes pour lire un article avec un œil critique.</description>',
    '    <language>fr</language>',
    ...(articles.length ? [`    <lastBuildDate>${rssDate(articles.map((item) => item.misAJour ?? item.publie).sort().at(-1)!)}</lastBuildDate>`] : []),
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
