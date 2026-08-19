# Essayer Squiggle avant sa publication

L'extension est en cours de revue par le Chrome Web Store. Tant que cette revue n'est
pas terminée, personne ne peut l'installer depuis le store - y compris les testeurs
déclarés. En attendant, elle s'installe à la main, et voici comment.

Comptez cinq minutes, et une clé d'API que vous fournit la personne qui vous a envoyé
ce lien, ou que vous créez vous-même.

## Chrome, Edge, Brave, Arc

L'installation persiste après un redémarrage du navigateur.

1. Téléchargez `squiggle-chrome-<version>.zip` et **décompressez-le**. Vous obtenez un
   dossier ; gardez-le où il est, l'extension le lit à chaque démarrage.
2. Ouvrez `chrome://extensions` *(sur Edge : `edge://extensions`, sur Brave :
   `brave://extensions`)*.
3. Activez **Mode développeur**, en haut à droite.
4. Cliquez **Charger l'extension non empaquetée**, puis désignez le dossier
   décompressé - pas le zip.
5. Épinglez Squiggle à la barre d'outils, via l'icône de pièce de puzzle.

Le navigateur affichera un bandeau signalant une extension en mode développeur à
chaque ouverture. C'est normal et sans conséquence ici : il disparaîtra une fois
l'extension publiée.

## Firefox

Plus simple à charger, mais l'installation **disparaît à la fermeture** du navigateur.

1. Ouvrez `about:debugging#/runtime/this-firefox`.
2. Cliquez **Charger un module temporaire**, et désignez directement le fichier
   `squiggle-firefox-<version>.zip`.

## La clé d'API

Squiggle n'a pas de serveur et ne fournit aucun modèle : il appelle celui que vous
désignez, avec votre propre clé. **Sans clé, aucune analyse ne démarre.**

1. Cliquez l'icône Squiggle, puis **Configurer une clé**.
2. Choisissez le fournisseur correspondant à votre clé - Anthropic, OpenAI, Google
   Gemini ou OpenRouter.
3. Collez la clé. Elle est chiffrée et reste sur votre machine.

Si la clé vous a été fournie pour cet essai, elle est probablement plafonnée en
dépense : une analyse coûte quelques centimes, mais une clé peut s'épuiser. Si
l'analyse s'arrête en signalant un problème de quota, c'est cela.

## Analyser un article

1. Ouvrez un article de presse.
2. Cliquez l'icône Squiggle. Le panneau s'ouvre à droite.
3. Cliquez **Analyser**.

L'analyse prend une à deux minutes : elle lit l'article, relève ce qui lui paraît
fragile, puis **cherche en ligne** de quoi confirmer ou infirmer chaque affirmation
factuelle. C'est cette recherche qui prend le temps, et c'est elle qui distingue un
reproche vérifié d'une impression.

Vous obtenez une note sur 100, répartie sur cinq domaines, et une liste de constats.
Cliquez un constat pour surligner dans l'article le passage exact qu'il vise.

## Ce qu'il est utile de signaler

Les retours les plus précieux sont ceux qu'aucun test interne ne produit :

- un constat **injuste** - la critique tombe à côté, ou reproche au texte ce qu'il ne
  dit pas ;
- un défaut réel que l'analyse **n'a pas vu** ;
- une note qui ne correspond pas à ce que vous savez de l'article ;
- un surlignage qui désigne le mauvais passage, ou l'article mal découpé ;
- une formulation qui vous paraît condescendante, ou du jargon.

L'analyse s'adresse à quelqu'un qui lit l'article, pas à celui qui l'a écrit : si un
constat ne vous apprend rien sur la solidité du texte, il ne sert à rien.

Signalez-le par un [ticket](https://github.com/TheGlitching/Squiggle/issues) ou
directement à la personne qui vous a transmis l'extension. L'adresse de l'article et
une capture du panneau suffisent.
