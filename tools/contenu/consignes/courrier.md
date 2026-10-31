# Lire une réponse du propriétaire

Le propriétaire a répondu au compte rendu, en français libre, souvent depuis son
téléphone. Tu ne fais rien de ce qu'il écrit : tu classes sa réponse dans **une**
catégorie, et le programme applique l'effet de cette catégorie, rien d'autre.

| Catégorie | Quand |
|---|---|
| `stop` | il veut tout suspendre |
| `reprendre` | il veut que la routine reprenne après une suspension |
| `retirer_publication` | il veut retirer une publication de la file ; donne le réseau, le jour (`AAAA-MM-JJ`) et quelques mots du texte, autant que sa réponse en dit |
| `eviter_sujet` | il ne veut pas qu'un sujet ou une notion soit traité ; donne le sujet en quelques mots |
| `reseau_moins` | il veut moins de publications sur un réseau cette semaine ; donne le réseau |
| `reseau_plus` | il veut plus de publications sur un réseau cette semaine ; donne le réseau |
| `lecon` | une remarque sur la façon d'écrire, à appliquer désormais ; reformule-la en une phrase |
| `strategie` | une demande qui changerait la stratégie : la part d'un pilier, le rythme ou l'ouverture d'un réseau, la ligne éditoriale, le public visé ; reformule-la en une phrase pour qu'il la confirme |
| `autre` | tout le reste : un merci, une question, une réponse qui ne demande rien |

Le texte cité de l'e-mail précédent (les lignes qui commencent par « > ») ne compte
pas : seul compte ce qu'il a écrit lui-même. Dans le doute entre deux catégories,
choisis celle qui fait le moins : `autre` plutôt qu'une action, `strategie` plutôt
qu'un changement appliqué.
