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
import { CHROME_URL, FIREFOX_URL } from './install';

export const ORIGIN = 'https://squiggle.fr';

const HOME_TITLE = `Squiggle : ${TAGLINE.charAt(0).toLowerCase()}${TAGLINE.slice(1, -1)}`;

export interface PublicPage {
  path: string;
  title: string;
  description: string;
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
  },
  {
    path: '/enseignants',
    title: 'Squiggle pour les enseignants',
    description:
      'Un article de l’actualité, relu sous les yeux de la classe : vous préparez chez vous, vous révélez l’analyse au tableau. Gratuit pour les enseignants.',
  },
  {
    path: '/classe',
    title: 'Le mode classe - Squiggle',
    description:
      'Ouvrez votre fichier de séance sur l’ordinateur de la classe, sans compte, et révélez l’analyse au tableau constat par constat.',
  },
  {
    path: '/classe/mode-emploi',
    title: 'Mode d’emploi du mode classe - Squiggle',
    description:
      'Une séance avec Squiggle en six étapes, sur une page à imprimer : préparer chez soi, télécharger la séance, l’ouvrir en classe, projeter.',
  },
  {
    path: '/transparence',
    title: 'Transparence - Squiggle',
    description:
      'Où va votre article quand Squiggle l’analyse, ce que nous gardons, combien de temps, et à qui nous le confions.',
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

/** The title a path shows in the browser tab; any other app page (account, sign-in) keeps the site's. */
export function titleFor(path: string): string {
  return APP_TITLES[path] ?? (PUBLIC_PAGES.find((page) => page.path === path) ?? PUBLIC_PAGES[0]).title;
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
  // `<` cannot close the script element from inside a JSON string once escaped.
  return `<script type="application/ld+json">${JSON.stringify(graph).replaceAll('<', '\\u003c')}</script>`;
}

/** The page-specific part of `<head>`: what replaces `<!--page-head-->` in `index.html`. */
export function headFor(page: PublicPage): string {
  const url = `${ORIGIN}${page.path}`;
  const title = escape(page.title);
  const description = escape(page.description);
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    ...(page.path === '/' ? [structuredData()] : []),
  ].join('\n    ');
}

/** Every public page, for `/sitemap.xml`. */
export function sitemap(): string {
  const urls = PUBLIC_PAGES.map((page) => `  <url><loc>${ORIGIN}${page.path}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
