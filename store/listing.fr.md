# Fiches des boutiques

Le texte de la fiche française, pour le Chrome Web Store et pour addons.mozilla.org (AMO).
Les réponses sur les données et les autorisations sont dans
[`docs/store-disclosure.md`](../docs/store-disclosure.md) ; ce fichier ne contient que ce
que le lecteur lit. Le ton et les chiffres suivent squiggle.fr (`web/src/offer.ts`) : si
l’offre change là-bas, elle change ici.

Deux façons de s’en servir, présentées à égalité : gratuitement avec sa propre clé d’API,
ou avec un compte Squiggle, sans clé à créer. « Gratuit » reste en avant, et s’explique juste
à côté, en mots simples : Squiggle ne facture rien, le fournisseur d’IA du lecteur facture
chaque analyse au tarif du modèle choisi, et une clé d’API est le code d’accès que ce
fournisseur donne. Les fournisseurs pris en charge sont nommés parce qu’un lecteur doit
savoir quelle clé apporter ; aucun nom de modèle, et rien sur l’infrastructure du mode
hébergé. Le panneau dit la même chose (`src/ui/ownKeyWording.ts`).

## Nom

Squiggle - Analyse critique de presse

C’est le `name` des manifestes ; le Chrome Web Store le reprend tel quel. « Squiggle »
seul ne dit rien de l’usage, et le nom est le premier critère de pertinence de la
recherche dans la boutique : la seconde moitié porte les mots qu’un lecteur tape.

## Résumé

**Chrome Web Store** (132 caractères au plus ; c’est la `description` des manifestes, et
`tests/packaging.test.ts` vérifie la limite) :

Un deuxième avis sur l’article que vous lisez : passages fragiles surlignés, raisons, note sur 100. Gratuit avec votre clé d’API.

**AMO** (250 caractères au plus ; champ « Résumé » de la fiche) :

Un deuxième avis sur l’article de presse que vous lisez : passages fragiles surlignés, raisons, note sur 100. Gratuit avec votre propre clé d’API (votre fournisseur d’IA facture l’usage), ou avec un compte Squiggle, sans clé : 3 analyses offertes.

## Catégorie

- **Chrome Web Store** : Actualités et météo. C’est là que se trouve le lecteur de presse ;
  « Outils » et « Éducation » sont plus encombrées et moins justes.
- **AMO** : Flux, actualités et blogs. Une seule catégorie : une seconde qui ne
  correspond qu’à moitié dessert plus qu’elle n’aide.

## Description

Le même texte dans les deux boutiques. Le Chrome Web Store n’affiche que du texte brut :
les puces sont des caractères, pas du balisage.

```
Un deuxième avis sur l’article que vous lisez.

Un clic sur l’icône, et Squiggle relit l’article ouvert. Il surligne les passages fragiles, dit pourquoi, et montre aussi ce qui est solide. Le rapport s’ouvre à côté de l’article, avec une note sur 100.

DEUX FAÇONS DE S’EN SERVIR
• Gratuitement, avec votre propre clé d’API. Squiggle ne vous facture rien : la partie IA tourne sur votre propre compte chez un fournisseur d’IA (Anthropic, OpenAI, Google Gemini ou OpenRouter), qui vous facture directement chaque analyse, au tarif du modèle choisi. Une clé d’API, c’est le code d’accès personnel que ce fournisseur vous donne sur son site : collez-le une fois dans l’extension. L’analyse part alors de votre navigateur vers ce fournisseur, la clé y reste et rien ne passe par nos serveurs.
• Avec un compte Squiggle, sans clé à créer : 3 analyses offertes, sans carte bancaire. Ensuite 60 analyses par mois pour 4,99 €, sans engagement. Le compte marche aussi sur squiggle.fr et dans son appli pour téléphone, sans rien installer.

Chaque constat cite la phrase exacte : choisissez-le, le passage s’éclaire dans la page. Vous vérifiez par vous-même.

CE QUE SQUIGGLE REGARDE
• Les faits : quelles affirmations sont sourcées, lesquelles ne le sont pas, lesquelles les sources contredisent.
• La logique : faux dilemme, généralisation abusive, corrélation prise pour une causalité.
• Le cadrage : un titre qui promet plus que le texte, des mots choisis à la place de preuves, une opinion présentée comme un fait.
• La déontologie et la langue.

Les mêmes critères pour chaque article. Le texte est jugé, jamais son auteur.

LES CHIFFRES CONFRONTÉS AUX SOURCES
Avant de mettre un fait en doute, Squiggle lit les sources citées et en cherche d’autres. Si elles donnent raison à l’article, le doute est retiré. Les sources consultées sont listées dans le rapport.

POUR QUI
Pour toute personne qui lit la presse en ligne et veut garder l’esprit critique face à la désinformation, sans attendre un fact-checking. Pour la classe aussi : l’offre enseignants est gratuite.

VOS DONNÉES
• Rien n’est lu avant votre clic. Squiggle n’a accès qu’à la page où vous l’ouvrez ; aucun script ne tourne sur les autres pages.
• Avec votre clé : l’article va de votre navigateur au fournisseur choisi, et nulle part ailleurs.
• Avec un compte : le texte de l’article est envoyé le temps de l’analyse, sans votre identité, et n’est pas conservé. Le rapport, qui cite des extraits, est gardé 30 jours.
• Aucune publicité, aucun traceur, aucun code distant. La méthode et le code sont publics.

Les articles payants sont analysés jusqu’où vous pouvez les lire, et un texte partiel est signalé.

squiggle.fr
```

## Liens

- Site : https://squiggle.fr/
- Politique de confidentialité : https://squiggle.fr/confidentialite
- Trajet des données : https://squiggle.fr/transparence
- Code source : https://github.com/TheGlitching/Squiggle
- Assistance : https://github.com/TheGlitching/Squiggle/issues

## Images

Générées, pour ne pas dériver du produit : `node scripts/build-store-assets.mjs` écrit
toutes les images dans `store/`. Les quatre premières captures montrent le vrai panneau
de l’extension et les vrais surlignages de la page, rendus par leur propre code sur
l’article d’exemple de squiggle.fr ; la cinquième place côte à côte les deux façons de
commencer, chacune avec la partie du vrai panneau qui la met en œuvre (voir `store/render/`).

| Image | Taille | Boutique |
|---|---|---|
| `promo-small-440x280.png` | 440x280 | Chrome, petite vignette promotionnelle |
| `promo-marquee-1400x560.png` | 1400x560 | Chrome, bannière (nécessaire pour être mis en avant) |
| `screenshot-1..5-1280x800.png` | 1280x800 | Chrome et AMO, dans cet ordre |

Les vignettes ne portent aucune phrase : le Chrome Web Store les montre dans toutes les
langues et demande d’éviter le texte. Les captures portent une légende en français ; AMO
conseille d’éviter le texte dans les images parce qu’une seule série sert à toutes les
langues, mais l’extension elle-même n’existe qu’en français, donc la légende n’exclut
aucun lecteur que l’interface n’exclut pas déjà.

### Légendes

AMO affiche une légende sous chaque capture : reprendre le titre de l’image.

1. **Un deuxième avis sur votre lecture.** Le score, les passages surlignés, la synthèse.
2. **Chaque constat pointe sa phrase.** Un constat choisi, son passage mis en évidence.
3. **Les chiffres confrontés aux sources.** Le chiffre mis en doute et la source lue.
4. **Cinq questions pour chaque article.** Les notes par domaine, l’une ouverte.
5. **Gratuit avec votre clé, ou un compte.** Les deux façons de commencer, côte à côte, et qui facture quoi.

## Objectif unique, autorisations, confidentialité

Les champs du tableau de bord (objectif unique, justification de chaque autorisation,
pratiques de confidentialité, déclaration AMO) se remplissent depuis
[`docs/store-disclosure.md`](../docs/store-disclosure.md), colonne « With hosted mode ».
Ils n'ont qu'une source pour ne pas diverger du manifeste, que les tests figent.

## Notes pour les relecteurs

À coller dans le champ de notes de chaque boutique.

> Le mode hébergé s’essaie sans paiement : « Se connecter » dans les réglages, avec une
> adresse e-mail ; 3 analyses sont offertes. Ouvrir un article de presse public, cliquer
> sur l’icône, lancer l’analyse.
>
> Autorisations : `activeTab` et `scripting` lisent la page où l’utilisateur clique sur
> l’icône, et seulement elle ; aucun script de contenu n’est déclaré. L’accès à tous les
> sites est une autorisation facultative, accordée par l’utilisateur dans les réglages
> (« Accès aux sites »), jamais demandée à l’installation. Les seuls accès déclarés sont
> les quatre fournisseurs de modèles. Détail dans `docs/store-disclosure.md` du dépôt.
>
> Aucun code distant. Le paquet Firefox est construit à partir de l’archive de sources
> jointe, avec les instructions de construction.
