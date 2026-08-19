# Politique de confidentialité

*Dernière mise à jour : 19 août 2026*

Squiggle est une extension de navigateur qui analyse la rigueur d'un article de presse.
Cette page décrit exactement ce qu'elle lit, ce qu'elle envoie, à qui, et ce qu'elle
conserve.

## Il n'y a pas de serveur

Squiggle n'a pas de service en ligne, pas de compte, pas de télémétrie, et n'envoie
rien à son auteur. Aucune donnée ne transite par une infrastructure m'appartenant : je
ne peux pas voir ce que vous analysez, parce qu'il n'existe aucun endroit où cela
pourrait m'arriver.

L'extension fonctionne selon le principe « votre propre clé » : vous renseignez la clé
d'API d'un fournisseur de modèle de langage, et l'analyse part directement de votre
navigateur vers ce fournisseur.

## Ce qui quitte votre navigateur

Quand vous lancez une analyse, et uniquement à ce moment-là, sont envoyés au
fournisseur que vous avez choisi :

- le texte de l'article affiché dans l'onglet actif, ainsi que son titre, son adresse
  et les liens qu'il cite ;
- des requêtes de recherche formulées à partir des affirmations factuelles relevées
  dans l'article, pour vérifier ces affirmations ;
- votre clé d'API, qui sert à authentifier l'appel auprès de ce fournisseur.

La recherche passe par l'outil de recherche du fournisseur lui-même. Aucun tiers
supplémentaire n'est contacté.

Le fournisseur est celui que vous avez désigné, parmi :

| Fournisseur | Destination | Confidentialité |
|---|---|---|
| Anthropic | `api.anthropic.com` | [politique](https://www.anthropic.com/legal/privacy) |
| OpenAI | `api.openai.com` | [politique](https://openai.com/policies/privacy-policy) |
| Google Gemini | `generativelanguage.googleapis.com` | [politique](https://policies.google.com/privacy) |
| OpenRouter | `openrouter.ai` | [politique](https://openrouter.ai/privacy) |

Le traitement de ces données par le fournisseur relève de sa politique et du contrat
que vous avez avec lui, pas de celui-ci. Si cela compte pour vous, lisez la sienne
avant de choisir : leurs pratiques de conservation diffèrent.

Rien n'est envoyé sans action de votre part. Ouvrir une page ne déclenche aucun appel.

## Ce qui reste sur votre machine

Deux choses, et rien d'autre :

- **votre configuration de clé** — la clé d'API, le fournisseur et le modèle
  sélectionnés, chiffrés dans le stockage local de l'extension ;
- **un indicateur** notant que vous avez déjà vu la présentation initiale.

L'analyse en cours vit en mémoire et disparaît quand le navigateur libère l'extension.
Aucun historique de navigation, aucune liste de pages consultées, aucun texte
d'article n'est conservé.

Supprimer l'extension supprime les deux.

## Ce qui n'est jamais fait

- Aucune donnée n'est vendue.
- Aucune donnée n'est transmise à quiconque en dehors du fournisseur que vous avez
  choisi, et uniquement pour produire l'analyse que vous avez demandée.
- Aucune donnée n'est utilisée à une fin étrangère à cette analyse.
- Aucune donnée n'est utilisée pour évaluer une solvabilité ni pour un prêt.
- Aucun code n'est téléchargé ni exécuté depuis l'extérieur : tout ce qui s'exécute
  est dans le paquet que vous avez installé, et lisible dans le dépôt.

## Les autorisations, une par une

- **`activeTab`** — lire l'article de l'onglet où vous cliquez, et seulement à ce
  moment-là.
- **`scripting`** — insérer le lecteur d'article dans cet onglet pour en extraire le
  texte, les liens et les emplacements à surligner.
- **`storage`** — conserver votre clé chiffrée, pour ne pas la redemander.
- **`sidePanel`** — afficher le résultat dans le panneau latéral, à côté de l'article.
- **accès aux sites** — les articles se trouvent sur n'importe quel domaine, et
  l'extension ne peut pas savoir à l'avance lequel vous lirez. Cet accès sert à lire
  la page que vous analysez et à joindre le fournisseur que vous avez choisi.

## Contact

Un problème ou une question : [ouvrez un ticket](https://github.com/TheGlitching/Squiggle/issues).
Le code est public et vérifiable.
