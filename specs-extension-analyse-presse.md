# Spécifications produit — Extension d'analyse critique d'articles de presse

**Version** 0.1 — document de travail
**Statut** MVP, distribution BYOK
**Cibles** Chrome (MV3) + Firefox (MV3)

> **Périmètre de ce document.** Tout sauf le pipeline d'analyse.
> Le workflow IA, ses étapes, ses prompts et ses grilles d'évaluation sont
> définis dans le **Document de prompting** (référencé ici sous le nom
> `PROMPTING.md`). Ce document le traite comme une boîte noire dotée d'un
> contrat d'entrée/sortie (§4.3). Toute évolution de la grille de notation
> relève de `PROMPTING.md`, pas de ces specs.

---

## 1. Vision produit

### 1.1 En une phrase

Une extension qui transforme n'importe quel article de presse en épreuve annotée : le lecteur clique, et le texte se couvre d'annotations en marge signalant sophismes, affirmations non étayées et décalages entre la force d'une conclusion et celle de ses preuves.

### 1.2 Position

L'outil est **au service du lecteur**. Il n'audite pas des rédactions, il aide quelqu'un à lire un texte précis avec plus de recul. Cette formulation n'est pas cosmétique : elle détermine le ton de toute l'interface (§6.6), la formulation des annotations, et l'exposition juridique du produit (§12).

### 1.3 Ce que le produit n'est pas

- Pas un détecteur de « fake news » — aucun verdict vrai/faux n'est rendu.
- Pas une notation de médias — la note porte sur **un article**, jamais sur un titre de presse ni sur un journaliste nommé.
- Pas un outil de modération ni de signalement.

### 1.4 Utilisateurs

| Profil | Usage | Ce qu'il attend |
|---|---|---|
| **Lecteur curieux** (primaire) | ponctuel, 2–5 analyses/mois | comprendre vite, pouvoir partager |
| **Journaliste / pigiste** (secondaire, prescripteur) | quotidien, sur sa propre production | précision, export, zéro faux positif |
| **Enseignant / documentaliste** (tertiaire) | en projection, en classe | lisibilité, lenteur pédagogique, absence de jargon |

Le lecteur curieux dicte le design. Le journaliste dicte la qualité.

---

## 2. Périmètre du MVP

### 2.1 Inclus

- Analyse à la demande d'un article, sur clic de l'icône.
- Surlignage in-page des passages concernés + annotations en marge.
- Note globale + rapport détaillé par catégorie.
- Configuration BYOK (clé API fournie par l'utilisateur).
- Cache local par URL.
- Français uniquement.
- Export du rapport (Markdown + image de partage).

### 2.2 Explicitement hors MVP

- Vérification automatique des sources primaires (v2 — cf. §14).
- Compte utilisateur, backend, cache partagé.
- Toute langue autre que le français.
- Analyse de vidéos, podcasts, PDF, réseaux sociaux.
- Historique synchronisé entre appareils.

### 2.3 Critère de sortie du MVP

Dix journalistes utilisent l'extension au moins une fois par semaine pendant quatre semaines consécutives, et le taux de faux positifs signalés (§10.3) reste sous 15 %.

---

## 3. Parcours utilisateur

### 3.1 Première installation

```
Installation ──► Onglet d'accueil s'ouvre automatiquement
                 │
                 ├─ 1. Ce que fait l'outil (30 s de lecture, une démo animée)
                 ├─ 2. Pourquoi une clé API (coût, confidentialité, contrôle)
                 ├─ 3. Coller la clé ──► test de validité en direct
                 └─ 4. « Essayer sur un article » ──► article d'exemple pré-analysé
```

L'écran d'accueil est un **produit à part entière**, pas un formulaire. C'est là que se joue la conversion : demander une clé API à un lecteur non technique est une friction énorme, et l'étape 4 doit lui montrer la valeur *avant* qu'il n'abandonne. L'article d'exemple est servi depuis un rapport pré-calculé embarqué dans l'extension — aucune clé requise pour le voir.

**Règle** : l'étape 3 est *sautable*. Un utilisateur doit pouvoir voir la démo sans clé et revenir plus tard.

### 3.2 Parcours principal

```
Article ouvert
   │
   ├─ L'icône s'active (couleur) quand un article est détecté ──────────┐
   │                                                                     │
   ▼                                                                     │
Clic sur l'icône                                                         │
   │                                                                     │
   ├─ Cache présent ? ──oui──► Restitution immédiate (<200 ms)           │
   │                                                                     │
   └─ non ──► Panneau latéral s'ouvre en état « lecture en cours »       │
              │                                                          │
              ├─ Progression par étapes (§6.4)                           │
              │                                                          │
              ├─ Erreur ──► État d'échec explicite + reprise (§7)        │
              │                                                          │
              └─ Succès ──► Séquence de révélation (§6.3)                │
                            │                                            │
                            ├─ Note + synthèse en tête du panneau        │
                            ├─ Surlignages posés dans la page ───────────┘
                            └─ Annotations liées en marge
```

### 3.3 Parcours secondaires

- **Détail d'un point** : clic sur un surlignage → l'annotation correspondante se déploie dans le panneau, le reste s'estompe.
- **Signalement de faux positif** : sur chaque annotation, une action « ce point est à côté » (§10.3).
- **Partage** : génération d'une image de la note + lien vers l'article.
- **Réanalyse** : forcer le recalcul en ignorant le cache.

---

## 4. Architecture technique

### 4.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────┐
│ EXTENSION (aucun serveur en MVP)                        │
│                                                         │
│  ┌───────────────┐   ┌──────────────────────────────┐   │
│  │ Content script│◄──┤ Service worker (MV3)         │   │
│  │               │   │  · orchestration du pipeline │   │
│  │ · extraction  │──►│  · appels API (clé BYOK)     │   │
│  │ · ancrage     │   │  · machine à états + reprise │   │
│  │ · surlignage  │   │  · cache                     │   │
│  │ · marge       │   └──────────────┬───────────────┘   │
│  └───────────────┘                  │                   │
│                                     ▼                   │
│  ┌───────────────┐   ┌──────────────────────────────┐   │
│  │ Side panel UI │   │ chrome.storage.local          │  │
│  │ (React)       │   │  · clé (§11.1) · cache · prefs│  │
│  └───────────────┘   └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼  HTTPS direct, clé de l'utilisateur
              ┌──────────────────────┐
              │ Fournisseur LLM      │
              └──────────────────────┘
```

### 4.2 Contraintes MV3 structurantes

Le service worker est tué après ~30 s d'inactivité. Le pipeline dure 20–60 s. Conséquences non négociables :

- Le pipeline est une **machine à états persistée** dans `chrome.storage.session`, pas une fonction `async` longue. Chaque transition écrit son état.
- Un **port de connexion long** (`chrome.runtime.connect`) entre le panneau et le worker maintient ce dernier éveillé tant que le panneau est ouvert.
- Filet de sécurité : une `chrome.alarms` à 25 s réveille le worker pour reprendre un pipeline interrompu.
- Si l'utilisateur ferme le panneau, le pipeline **continue** et le résultat est mis en cache. Un badge sur l'icône signale que le rapport est prêt.

### 4.3 Contrat avec le pipeline d'analyse

Frontière stricte entre ce document et `PROMPTING.md`.

**Entrée** fournie par l'extension :

```ts
interface AnalysisInput {
  url: string;              // URL canonique
  title: string;
  author?: string;
  publishedAt?: string;     // ISO 8601
  outlet?: string;          // domaine, jamais affiché comme jugement
  language: 'fr';
  blocks: TextBlock[];      // texte segmenté, ordre de lecture préservé
}

interface TextBlock {
  id: string;               // stable, sert d'ancre au surlignage
  type: 'heading' | 'paragraph' | 'quote' | 'caption' | 'list-item';
  text: string;             // texte brut, sans balises
  charStart: number;        // offset dans le texte reconstitué
}
```

**Sortie** attendue du pipeline :

```ts
interface AnalysisReport {
  schemaVersion: number;
  score: number;            // 0–100
  scoreBand: 'solide' | 'perfectible' | 'fragile' | 'problematique';
  summary: string;          // 2 phrases max, en français, ton neutre
  categories: CategoryScore[];
  findings: Finding[];
  meta: { model: string; promptVersion: string; analyzedAt: string; durationMs: number };
}

interface Finding {
  id: string;
  blockId: string;          // ancre
  quote: string;            // extrait exact, ≤ 25 mots, sert de repli d'ancrage
  charStart: number;
  charEnd: number;
  category: 'sophisme' | 'affirmation-non-etayee' | 'surinterpretation'
          | 'source-absente' | 'cadrage' | 'point-fort';
  severity: 1 | 2 | 3;
  label: string;            // ex. « Généralisation hâtive »
  explanation: string;      // 1–3 phrases, pédagogique
  suggestion?: string;      // reformulation plus juste, si applicable
  confidence: number;       // 0–1 — sous 0.6, l'annotation est repliée par défaut
}
```

**Règles imposées au pipeline par l'interface** (à répercuter dans `PROMPTING.md`) :

1. `quote` doit être un extrait **littéral** du bloc, sinon l'ancrage échoue.
2. La catégorie `point-fort` est **obligatoirement représentée** si le score dépasse 50. Un rapport qui ne relève que des défauts est perçu comme à charge et détruit la confiance.
3. `explanation` s'adresse au lecteur, jamais à l'auteur : « cette formulation suggère que… », pas « le journaliste aurait dû… ».

### 4.4 Stack

| Couche | Choix | Justification |
|---|---|---|
| Build | Vite + `@crxjs/vite-plugin` | HMR sur extension, build MV3 Chrome + Firefox |
| UI | React 18 + TypeScript | panneau uniquement ; le content script reste en TS vanilla |
| Styles | CSS Modules + variables CSS | pas de framework utilitaire : le content script s'injecte dans des pages hostiles, il faut du CSS maîtrisé et isolé |
| Isolation | Shadow DOM (closed) pour tout élément injecté | seule protection fiable contre les CSS des sites |
| Animation | Web Animations API + transitions CSS | zéro dépendance ; `motion` uniquement si le panneau l'exige |
| Extraction | `@mozilla/readability` + heuristiques maison | référence du domaine, déjà éprouvée |
| Tests | Vitest + Playwright | Playwright pour le harnais d'extraction (§5.3) |

Pas de framework d'agent (cf. décision antérieure) : le pipeline est déterministe, l'orchestration tient en quelques centaines de lignes.

---

## 5. Extraction et ancrage

C'est la partie la plus sous-estimée du projet. Elle mérite un tiers de l'effort d'ingénierie.

### 5.1 Détection d'article

L'icône ne s'active que si la page ressemble à un article. Heuristiques cumulatives :

- Présence de `<article>` ou d'un `ld+json` de type `NewsArticle` / `Article`.
- `og:type = article`.
- Densité de texte : > 1 200 caractères dans le bloc principal, ratio texte/liens > 0,6.
- Exclusions : pages d'accueil, rubriques, résultats de recherche, `<title>` correspondant à un motif de liste.

État par défaut si le doute persiste : icône active, avec mention discrète « détection incertaine » dans le panneau.

### 5.2 Extraction du contenu

1. Readability sur un clone du DOM.
2. Post-traitement maison : suppression des encarts « à lire aussi », des chapôs dupliqués, des mentions d'abonnement, des légendes de photos publicitaires.
3. Segmentation en `TextBlock` avec conservation d'un `Range` DOM par bloc — **c'est ce qui rend le surlignage possible**.
4. Détection de paywall : si le texte extrait est < 40 % de la longueur annoncée par `wordCount` du JSON-LD, afficher l'état « article partiellement accessible » (§7.4) et analyser uniquement ce qui est visible, en le disant.

### 5.3 Harnais de non-régression

Un corpus figé de 40 pages HTML (10 médias × 4 formats : brève, long format, live, tribune) stocké dans le dépôt. Un test Playwright vérifie que l'extraction retourne un nombre de blocs et un volume de texte dans une fourchette attendue. **Ce harnais est écrit avant la première ligne d'extraction.**

### 5.4 Ancrage des surlignages

Trois niveaux de repli, dans l'ordre :

1. **Range DOM mémorisé** au moment de l'extraction (chemin nominal, valide tant que le DOM n'a pas bougé).
2. **Recherche du `quote` littéral** dans le bloc identifié par `blockId`, avec normalisation des espaces, apostrophes et guillemets typographiques.
3. **Recherche floue** (Levenshtein sur fenêtre glissante, seuil 0,9) dans l'ensemble de l'article.

Si les trois échouent : l'annotation reste affichée dans le panneau, marquée « passage non localisé », sans surlignage. Elle n'est jamais silencieusement supprimée.

**Contrainte** : le surlignage ne modifie jamais le DOM de l'article. Il est peint en overlay absolu à partir de `Range.getClientRects()`, dans un conteneur en Shadow DOM. Un `ResizeObserver` et un `MutationObserver` (débattus à 100 ms) repositionnent les rectangles. Ceci évite de casser les sites, les lecteurs d'écran et les scripts de la page.

---

## 6. Design

### 6.1 Direction : l'épreuve d'imprimerie

Le produit emprunte son langage visuel au **travail de relecture avant publication** : marques de correcteur, marge d'annotation, traits de conduite reliant l'annotation au passage, tampon de validation. Ce monde est celui du sujet lui-même — la fabrication d'un article — et il porte la bonne idée : *un texte se relit*, ce n'est ni un verdict ni une accusation.

Ce choix écarte volontairement le registre « détecteur / scanner / alerte », qui pousserait l'outil vers une posture accusatoire.

### 6.2 Système de tokens

**Couleur** — palette froide d'atelier, à distance du registre « alerte rouge ».

```css
--ink:        #16181D;  /* texte, traits de conduite */
--paper:      #F2F3F5;  /* fond du panneau — gris épreuve, pas crème */
--pencil:     #2B4ACB;  /* bleu crayon de correcteur — accent principal */
--pencil-wash:#2B4ACB1A;/* surlignage sévérité 1 */
--ochre:      #A8761F;  /* sévérité 2 */
--rust:       #B3402F;  /* sévérité 3 — utilisé avec parcimonie */
--sage:       #3F7A5E;  /* points forts */
--muted:      #6B7079;  /* méta, horodatage, labels */
```

Le bleu crayon est l'accent unique. Le rouge n'apparaît que sur la sévérité 3 et jamais sur plus de trois annotations simultanément à l'écran.

**Typographie** — trois rôles distincts.

| Rôle | Famille | Usage |
|---|---|---|
| Display | **Bricolage Grotesque** (variable) | note, titres de section, mot-clé de catégorie |
| Texte | **Newsreader** | explications, synthèse — une serif de lecture, cohérente avec le sujet |
| Utilitaire | **IBM Plex Mono** | labels de catégorie, horodatage, numéros, méta |

Échelle : 12 / 14 / 16 / 20 / 28 / 56. La note s'affiche en 56, poids 700, largeur condensée — c'est le seul élément à cette taille.

**Layout** — le panneau latéral fait 400 px (min 340, max 520, redimensionnable). Trois zones fixes :

```
┌──────────────────────────────┐
│  [56] 72   PERFECTIBLE       │  ← tampon + bande de score
│  Synthèse en deux phrases.   │
├──────────────────────────────┤
│  ▤▤▤▤▤▤ barres par catégorie │  ← 5 catégories, barres horizontales
├──────────────────────────────┤
│  ┌─┐ SOPHISME · 2            │
│  │ │ Généralisation hâtive   │  ← liste d'annotations,
│  └─┘ « extrait cité… »       │     ordonnées par position
│      Explication…            │     dans l'article
│  ┌─┐ …                       │
└──────────────────────────────┘
```

**Signature** — le **trait de conduite**. Quand une annotation est survolée ou sélectionnée, une ligne fine en bleu crayon part de la carte dans le panneau, traverse le bord de la fenêtre et rejoint le passage surligné dans l'article, avec une légère courbure de Bézier. C'est l'élément unique du produit : il matérialise le lien entre le jugement et sa preuve, ce qui est exactement la promesse de l'outil.

### 6.3 Séquence de révélation

L'orchestration compte plus que la somme des effets. Une seule séquence, au moment où le rapport arrive :

| t (ms) | Événement | Durée | Courbe |
|---|---|---|---|
| 0 | Le panneau passe de « lecture » à « rapport » : fondu croisé | 240 | `ease-out` |
| 120 | La note s'incrémente de 0 à sa valeur | 900 | `cubic-bezier(.16,1,.3,1)` |
| 200 | Le tampon se pose : échelle 1,08 → 1, rotation −2° → 0, opacité 0 → 1 | 320 | `cubic-bezier(.34,1.56,.64,1)` |
| 420 | Les barres de catégorie se remplissent, décalage 60 ms entre elles | 500 | `ease-out` |
| 600 | **Passe de relecture** : les surlignages apparaissent dans l'article, de haut en bas, décalage 45 ms | 180 chacun | `ease-out` |
| 600+n | Les cartes d'annotation montent de 8 px avec fondu, synchronisées avec leur surlignage | 200 | `ease-out` |

La passe de relecture est le moment fort : elle imite le regard d'un relecteur qui descend dans le texte. Elle est plafonnée à 1,2 s au total — au-delà de 20 annotations, le décalage se comprime.

### 6.4 Animation de l'attente

L'attente dure 20 à 60 s : c'est le plus gros risque d'abandon. Elle doit informer, pas distraire.

- Une **ligne de progression par étapes**, nommées en langage utilisateur (« Lecture de l'article », « Repérage des affirmations », « Analyse des formulations », « Rédaction du rapport »). Les noms viennent du contrat §4.3, pas du détail du pipeline.
- L'étape en cours porte un curseur clignotant de type crayon qui parcourt une ligne de texte fantôme.
- Les étapes terminées se cochent et se rétractent.
- Après 35 s, un message honnête apparaît : « C'est un article long, l'analyse prend un peu plus de temps. »

Aucun spinner générique. Aucune barre de progression fausse.

### 6.5 Micro-interactions

- **Survol d'une annotation** → le surlignage correspondant s'intensifie (opacité ×1,6), le trait de conduite se dessine en 180 ms.
- **Clic sur un surlignage dans la page** → le panneau défile jusqu'à la carte, qui pulse une fois.
- **Survol d'un surlignage** → une pastille de catégorie apparaît en exposant, sans tooltip flottant.
- **Filtre par catégorie** → les cartes non concernées se réduisent en hauteur (200 ms) plutôt que de disparaître, pour préserver le repère spatial.

### 6.6 Voix de l'interface

- Sujet des phrases : le texte, jamais la personne. « Cette phrase généralise à partir d'un seul cas » et non « l'auteur généralise ».
- Les labels de catégorie sont des constats, pas des accusations : « affirmation non étayée », pas « mensonge ».
- Les libellés d'action décrivent l'effet : « Analyser cet article », « Relancer l'analyse », « Signaler une erreur d'analyse ».
- Pas de ponctuation exclamative. Pas d'emoji dans l'interface produit.
- La note est toujours accompagnée de sa bande textuelle — un nombre nu est illisible.

---

## 7. États de l'interface

Chaque état est une écran conçu, pas un message d'erreur générique.

### 7.1 Aucune clé configurée
Titre : « Il manque votre clé API. » Explication en une phrase du pourquoi (l'analyse tourne sur votre compte, rien ne transite par un serveur tiers), bouton vers les options, lien « voir un exemple d'abord ».

### 7.2 Page non analysable
« Cette page ne ressemble pas à un article. » Proposer l'analyse forcée en action secondaire.

### 7.3 Clé invalide ou quota dépassé
Distinguer les deux cas à partir du code d'erreur du fournisseur. Message explicite, action directe (« Modifier la clé », « Voir votre consommation » avec lien vers la console du fournisseur).

### 7.4 Article partiellement accessible (paywall)
Bandeau permanent en tête du rapport : « Analyse portant sur les N premiers paragraphes accessibles. » La note est affichée avec une marque de réserve visuelle (hachure sur le tampon).

### 7.5 Échec du pipeline
Message indiquant l'étape échouée, bouton « Reprendre » qui redémarre à partir du dernier état persisté et non depuis le début. Bouton secondaire « Copier le détail technique » pour les rapports de bug.

### 7.6 Hors ligne
Le cache reste consultable. L'analyse est désactivée avec explication.

---

## 8. Accessibilité

Non négociable, y compris pour un side project.

- **Contraste** : AA minimum partout, AAA sur le texte des explications. Les surlignages ne portent **jamais** l'information seule : chaque passage marqué porte aussi un soulignement dont le motif diffère par catégorie (plein / tireté / pointillé), pour les daltonismes.
- **Clavier** : parcours complet. `Tab` circule dans les annotations, `Entrée` déploie, `Échap` referme, `J`/`K` naviguent d'une annotation à l'autre.
- **Lecteurs d'écran** : le panneau est une `region` nommée. Les annotations forment une liste avec `aria-posinset`. Le rapport dispose d'un résumé textuel complet lisible en linéaire, indépendant des surlignages.
- **`prefers-reduced-motion`** : la séquence §6.3 se réduit à un fondu de 120 ms, la note s'affiche sans compteur, les traits de conduite apparaissent sans tracé progressif. Le produit reste entièrement fonctionnel.
- **Zoom** : lisible jusqu'à 200 %.
- **Cible tactile** : 44 px minimum sur toutes les actions du panneau.

---

## 9. Données et stockage

### 9.1 Schéma local

| Clé | Portée | Contenu | Purge |
|---|---|---|---|
| `settings` | `storage.sync` | préférences UI, langue, filtres par défaut | jamais |
| `apiKey` | `storage.local` | clé chiffrée (§11.1) | à la demande |
| `cache:<hash>` | `storage.local` | `AnalysisReport` + empreinte du contenu | LRU, 200 entrées ou 30 jours |
| `pipeline:<tabId>` | `storage.session` | état de la machine à états | fin de session |
| `feedback` | `storage.local` | signalements en attente d'envoi | après envoi |

### 9.2 Clé de cache

`sha256(url_canonique)` où l'URL canonique est prise dans `<link rel=canonical>`, à défaut l'URL nettoyée de ses paramètres de tracking (liste UTM + `fbclid`, `gclid`, `at_*`, `xtor`).

L'entrée stocke aussi `sha256(texte_extrait)`. Au chargement, si le hash du texte diffère, le cache est considéré périmé — c'est ce qui gère les articles mis à jour, cas fréquent sur les lives et les dépêches.

### 9.3 Versionnement

`schemaVersion` dans chaque rapport ; `promptVersion` dans `meta`. Un changement de `promptVersion` invalide le cache : deux utilisateurs ne doivent jamais comparer des notes issues de grilles différentes.

---

## 10. Qualité

### 10.1 Corpus de référence

30 articles annotés à la main par des journalistes, servant de vérité terrain. Chaque évolution de `PROMPTING.md` est évaluée dessus : précision, rappel, et surtout **taux de faux positifs**, métrique prioritaire.

### 10.2 Seuil de publication d'une annotation

Une annotation dont `confidence < 0.6` est repliée par défaut sous un libellé « signaux plus faibles (n) ». Elle ne compte pas dans la note. Mieux vaut manquer un sophisme que d'en inventer un.

### 10.3 Boucle de signalement

Chaque annotation porte une action « ce point est à côté ». Le signalement stocke localement : `promptVersion`, catégorie, extrait, et un commentaire libre facultatif. En MVP, l'envoi est **manuel et explicite** (bouton « Envoyer les signalements », avec aperçu de ce qui part). Aucune collecte silencieuse.

---

## 11. Sécurité et confidentialité

### 11.1 Clé API

- Stockée dans `storage.local`, jamais dans `sync` — la synchronisation Google exfiltrerait la clé.
- Chiffrée au repos via WebCrypto avec une clé dérivée de l'installation. Protection contre la lecture opportuniste, pas contre un attaquant local — **à dire honnêtement** dans les options.
- Jamais journalisée, jamais incluse dans un rapport de bug, masquée à l'affichage.
- Appels API émis depuis le service worker uniquement, jamais depuis le content script.

### 11.2 Permissions demandées

| Permission | Justification |
|---|---|
| `activeTab` | lire l'article seulement quand l'utilisateur clique |
| `storage` | préférences et cache |
| `sidePanel` | interface |
| `alarms` | reprise du pipeline |
| `scripting` | injection à la demande |

**Pas de `<all_urls>` en permission obligatoire.** Le modèle `activeTab` (déclenché par le clic) suffit et rend l'onboarding et la revue en boutique beaucoup plus simples.

### 11.3 Politique de confidentialité

Obligatoire pour publier. Points à couvrir sans détour : le contenu de l'article est envoyé au fournisseur LLM choisi par l'utilisateur ; aucun serveur de l'extension n'existe ; aucune donnée de navigation n'est collectée ; les signalements sont envoyés uniquement sur action explicite.

---

## 12. Cadre juridique

À traiter avant publication, avec un avis professionnel — les éléments ci-dessous sont des exigences produit, pas un conseil juridique.

- La note et les annotations sont présentées comme une **analyse assistée par IA**, faillible, portant sur un texte. La mention est visible dans le rapport, pas enfouie dans les CGU.
- Aucune agrégation par média ou par auteur dans l'interface, même si les données locales le permettraient techniquement.
- Aucun nom de journaliste affiché dans le rapport, même si extrait.
- La méthodologie (résumé public de `PROMPTING.md`, sans les prompts eux-mêmes) est accessible depuis le rapport en un clic.
- Les images de partage (§13) portent l'URL de l'article, l'horodatage et la mention « analyse automatisée » de manière indissociable.

---

## 13. Partage

L'objet partageable est une image 1200 × 630 générée localement en Canvas :

- La note en très grand, dans la typographie display.
- La bande textuelle.
- Le titre de l'article et son domaine, en utilitaire.
- Deux annotations les plus sévères, citation courte + label.
- Pied de page : mention « analyse automatisée », horodatage, nom de l'outil.

Aucune image ne peut être générée sans la mention et l'horodatage. C'est une contrainte de conception, pas une option.

---

## 14. Après le MVP

Par ordre de priorité, chacun conditionné à la validation du précédent :

1. **Vérification des sources** — la brique la plus lourde (liens morts, sources secondaires, « selon une étude » sans lien).
2. **Backend + cache partagé** — devient rentable au-delà de quelques milliers d'analyses ; supprime le BYOK pour le grand public.
3. **Autres langues** — l'anglais d'abord, ce qui suppose de retravailler `PROMPTING.md` par langue.
4. **Mode enseignant** — masquer la note, révéler les annotations une par une pour un usage en classe.
5. **Historique et comparaison** — comparer les traitements d'un même sujet par plusieurs sources.

---

## 15. Critères d'acceptation du MVP

- [ ] L'extraction réussit sur au moins 36 des 40 pages du harnais (§5.3).
- [ ] L'ancrage localise au moins 90 % des `findings` sur le corpus de référence.
- [ ] Aucun site du corpus n'est visuellement cassé par l'injection.
- [ ] Le rapport en cache s'affiche en moins de 200 ms.
- [ ] Le pipeline survit à la mise en veille du service worker et reprend seul.
- [ ] Parcours complet réalisable au clavier seul, sans souris.
- [ ] `prefers-reduced-motion` respecté sur l'ensemble des animations.
- [ ] Aucune clé API visible dans les journaux, le stockage synchronisé ou les exports.
- [ ] Onboarding complet sans clé API jusqu'à l'article d'exemple.
- [ ] Politique de confidentialité et mentions légales publiées.
