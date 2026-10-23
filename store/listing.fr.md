# Fiches des boutiques, version 0.2.0

Le texte de la fiche française, pour les deux boutiques. Les réponses sur les données et
les autorisations sont dans [`docs/store-disclosure.md`](../docs/store-disclosure.md) ;
ce fichier ne contient que ce que le lecteur lit.

Chaque phrase ci-dessous décrit ce que l'extension fait **une fois le mode hébergé en
ligne**. Ne pas la publier avant : une fiche qui promet un service absent est une
fausse déclaration.

## Nom

Squiggle - Analyse critique de presse

## Résumé (132 caractères au plus ; c'est la `description` des manifestes)

Évalue et vérifie la rigueur logique, factuelle et argumentative des articles de presse.

## Description

Squiggle analyse l'article que vous lisez et montre ce qui ne tient pas.

Un clic sur l'icône, et le panneau latéral rend un score sur 100 et les faiblesses
relevées, chacune rattachée à la phrase exacte de l'article. Les passages concernés sont
surlignés dans la page : survolez un constat, il se relie au passage dont il parle.

CE QUE SQUIGGLE ÉVALUE
• La robustesse factuelle : quelles affirmations sont sourcées, lesquelles sont
  vérifiables mais non sourcées, lesquelles les sources contredisent.
• La solidité logique et argumentative.
• Le cadrage et les procédés rhétoriques : un titre qui dépasse le corps du texte, des
  mots choisis à la place de preuves, une opinion présentée comme un fait établi.
• La déontologie et la transparence, et le soin de la langue.

Les sources citées par l'article sont lues, pas seulement listées. Un constat porte sur
ce que l'article affirme, jamais sur la personne qui l'a écrit : Squiggle s'adresse au
lecteur, et ne donne aucun conseil de réécriture.

SANS CLÉ D'API
Connectez un compte Squiggle et l'analyse tourne sur nos serveurs, avec un modèle à poids
ouverts (DeepSeek V4.1 Flash, via OpenRouter). 3 analyses sont offertes à l'inscription ;
l'abonnement (4,99 €/mois, sans engagement, résiliable à tout moment) donne 10 analyses
par jour. Gratuit pour les enseignants, sur demande.

VOTRE PROPRE CLÉ
Vous préférez garder la main ? Renseignez votre clé Anthropic, OpenAI, OpenRouter ou
Google Gemini : l'analyse part alors directement de votre navigateur vers ce fournisseur,
sans passer par nos serveurs ni par aucun compte.

VOS DONNÉES, SANS DÉTOUR
• Rien n'est lu avant que vous le demandiez. Squiggle n'a accès qu'à la page où vous
  cliquez sur son icône ; aucun script ne tourne sur les autres pages.
• Mode hébergé : le texte de l'article est envoyé à notre serveur puis au fournisseur du
  modèle, le temps de l'analyse. Il n'est jamais écrit dans notre base. Le rapport, qui
  cite des extraits, est conservé 30 jours.
• Votre clé personnelle n'atteint jamais notre serveur.
• Aucune publicité, aucun traceur, aucun code distant. Le code source est ouvert.

Politique de confidentialité et trajet des données : voir les liens ci-dessous.

## Liens

- Politique de confidentialité : `<origine hébergée>/confidentialite`
- Trajet des données : `<origine hébergée>/transparence`
- Code source : https://github.com/TheGlitching/Squiggle
- Assistance : https://github.com/TheGlitching/Squiggle/issues

`<origine hébergée>` est l'origine publiée du Worker (API et site). Les deux
tableaux de bord attendent l'adresse complète d'une page qui répond.

## Légendes des captures (1280x800)

Cinq au plus. Prises dans un vrai navigateur, sur une analyse réelle, une fois la
nouvelle identité visuelle en place. `scripts/store-screenshot.sh` ramène une capture
brute au format exact attendu ; voir `docs/RELEASING.md`.

1. **Le score et les constats, à côté de l'article.** Panneau ouvert sur un article de
   presse analysé, surlignages visibles dans la page.
2. **Un constat relié à sa phrase.** Un constat survolé dans le panneau, le passage
   concerné mis en évidence dans l'article.
3. **Les sources lues.** La liste des sources citées et ce que chacune dit de
   l'affirmation.
4. **Sans clé d'API.** L'écran de départ du mode hébergé : 3 analyses offertes, un seul
   bouton « Se connecter ».
5. **Le trajet des données.** La page de transparence, avec le schéma navigateur,
   serveur, fournisseur.

## Notes pour les relecteurs

À coller dans le champ de notes de chaque boutique.

> Le mode hébergé s'essaie sans paiement : « Se connecter » dans les réglages, avec une
> adresse e-mail ; 3 analyses sont offertes. Ouvrir un article de presse public, cliquer
> sur l'icône, lancer l'analyse.
>
> Autorisations : `activeTab` et `scripting` lisent la page où l'utilisateur clique sur
> l'icône, et seulement elle ; aucun script de contenu n'est déclaré. L'accès à tous les
> sites est une autorisation facultative, accordée par l'utilisateur dans les réglages
> (« Accès aux sites »), jamais demandée à l'installation. Les seuls accès déclarés sont
> les quatre fournisseurs de modèles. Détail dans `docs/store-disclosure.md` du dépôt.
>
> Aucun code distant. Le paquet Firefox est construit à partir de l'archive de sources
> jointe, avec les instructions de construction.
