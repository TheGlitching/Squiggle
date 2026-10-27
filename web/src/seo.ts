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
import { NOTIONS, famille, glossaryPath } from './glossaire';
import { CHROME_URL, FIREFOX_URL } from './install';

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
}

const GLOSSARY = `${ORIGIN}/glossaire`;
const TERM_SET = { '@type': 'DefinedTermSet', '@id': `${GLOSSARY}#glossaire`, name: 'Glossaire de l’esprit critique', url: GLOSSARY };

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
    title: `${notion.nom} : définition et exemple - Squiggle`,
    description: `${notion.resume} Définition, exemple, comment le repérer.`,
    share: {
      kicker: `Glossaire de l’esprit critique · ${famille(notion.famille).titre}`,
      title: notion.nom,
      text: notion.resume,
      mark: true,
    },
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'DefinedTerm',
      '@id': `${ORIGIN}${glossaryPath(notion.slug)}#notion`,
      name: notion.nom,
      ...(notion.aussi ? { alternateName: notion.aussi } : {}),
      description: notion.definition[0],
      url: `${ORIGIN}${glossaryPath(notion.slug)}`,
      inLanguage: 'fr',
      inDefinedTermSet: TERM_SET,
    },
  })),
];

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
    share: {
      kicker: 'Grille de lecture',
      title: 'Cinq raisons de douter d’un article',
      text: 'Une page à photocopier pour chaque élève, avec un exemple pour chaque raison.',
      figure: 'classe',
    },
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
];

export const NOT_FOUND_TITLE = 'Page introuvable - Squiggle';

/** The title a path shows in the browser tab; any other app page (account, sign-in) keeps the site's. */
export function titleFor(path: string): string {
  const page = PUBLIC_PAGES.find((item) => item.path === path);
  if (page) return page.title;
  if (APP_TITLES[path]) return APP_TITLES[path];
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
export const shareImagePath = (page: PublicPage) => (page.share ? `/og${page.path}.png` : DEFAULT_IMAGE.path);

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

/** Every public page, for `/sitemap.xml`. */
export function sitemap(): string {
  const urls = PUBLIC_PAGES.map((page) => `  <url><loc>${ORIGIN}${page.path}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
