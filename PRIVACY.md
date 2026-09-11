# Politique de confidentialité

*Dernière mise à jour : 7 septembre 2026*

Squiggle est une extension de navigateur qui analyse la rigueur d'un article de presse.
Cette page décrit exactement ce qu'elle lit, ce qu'elle envoie, à qui, et ce qu'elle
conserve.

Il existe **deux modes**, et ils n'ont pas la même politique parce qu'ils n'ont pas le
même trajet de données.

| | **Clé personnelle (BYOK)** | **Squiggle hébergé** |
|---|---|---|
| Disponible | oui, c'est le mode actuel | **pas encore : en cours de construction** |
| Il vous faut | une clé d'API à vous | un compte |
| L'article part vers | le fournisseur que vous avez choisi | notre serveur, puis le fournisseur configuré |
| Nous voyons | rien | l'article, le temps de l'analyser |
| Ce qui est conservé chez nous | rien | le rapport, pas l'article |

Le mode « clé personnelle » ne change pas et ne changera pas. Il reste le mode par
défaut, et rien de ce qui suit sur le mode hébergé ne s'y applique.

---

# 1. Mode « clé personnelle » (BYOK)

## Il n'y a pas de serveur dans ce mode

Squiggle n'a pas de service en ligne, pas de compte, pas de télémétrie,
et n'envoie rien à son auteur. Aucune donnée ne transite par une infrastructure
m'appartenant : je ne peux pas voir ce que vous analysez, parce qu'il n'existe aucun
endroit où cela pourrait m'arriver.

Vous renseignez la clé d'API d'un fournisseur de modèle de langage, et l'analyse part
directement de votre navigateur vers ce fournisseur.

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

---

# 2. Mode « Squiggle hébergé »

> **Ce mode n'est pas encore déployé.** Cette section décrit ce qu'il fera, publiée au
> fur et à mesure de sa construction plutôt qu'à sa mise en service. Tant qu'il n'est
> pas disponible, rien de ce qui suit ne se produit.

Le mode hébergé existe pour les lecteurs qui ne veulent pas gérer une clé d'API.
L'analyse tourne alors sur notre infrastructure, avec notre propre clé, via le
fournisseur configuré (OpenRouter par défaut, Google Gemini en alternative), contre
des crédits. **Le choix vous appartient à chaque instant** : c'est un
sélecteur dans les réglages, et un compte est nécessaire pour l'activer.

## Le trajet des données

```
votre navigateur  ──(le texte de l'article)──▶  notre serveur  ──▶  fournisseur configuré
                  ◀──────(le rapport)──────────
```

Trois choses à en retenir.

**Votre navigateur envoie le texte de l'article.** C'est la différence essentielle
avec le mode BYOK : nous le voyons. Il est utilisé pour l'appel d'audit et il
disparaît à la fin de cette requête. **Aucune table de notre base de données ne
contient de texte d'article** : les étapes suivantes de l'analyse ne travaillent que
sur les constats de l'audit, pas sur l'article.

**Notre serveur ne va jamais chercher l'article lui-même.** C'est votre navigateur qui
le lui fournit, depuis la page que vous lisez déjà. Conséquence directe : un article
payant est analysé exactement dans la limite de ce que vous pouvez lire (et le rapport
le signale), et notre adresse n'apparaît dans les journaux d'aucun éditeur. Les seules
pages que notre serveur va chercher sont **les sources citées par l'article**.

**Le rapport est mis en cache et partagé.** Deux lecteurs du même article obtiennent le
même rapport, et c'est ce qui rend le service abordable : le second ne consomme aucun
crédit et son navigateur n'envoie même pas l'article. La clé du cache est l'adresse
canonique de l'article, plus le modèle et la version des consignes.

## Ce que nous conservons, et combien de temps

| Donnée | Où | Durée |
|---|---|---|
| Texte de l'article | mémoire, le temps de l'appel d'audit | **jamais écrit** |
| Rapport d'analyse (cache partagé) | base de données | 30 jours, 500 rapports au plus |
| Analyse en cours (constats, sans l'article) | base de données | 1 heure |
| Journal d'usage : qu'un compte a lancé une analyse, et quand | base de données | 12 mois, **sans aucun contenu et sans dire de quel article** |
| Compteur d'analyses du jour | base de données | tant que le compte existe |
| Adresse e-mail | base de données | tant que le compte existe |
| Identifiant Google (`sub`), si connexion Google | base de données | tant que le compte existe |
| Clé publique de votre installation | base de données | tant que vous ne la révoquez pas |
| Jeton d'extension | base de données, **en empreinte SHA-256** | 90 jours |
| Session web | base de données, **en empreinte SHA-256** | 30 jours |
| Lien de connexion par e-mail | base de données, **en empreinte SHA-256** | 10 minutes |
| Identifiants client et abonnement Stripe | base de données | tant que le compte existe |
| Journaux techniques | Cloudflare | **aucun texte d'article, aucune adresse d'article en clair** |

Les journaux techniques méritent une précision, parce que c'est là que ce genre de
promesse se perd d'habitude. Le format d'une ligne de journal n'a **aucun champ de
texte libre** : elle ne peut porter qu'un nom d'événement fixe, un nombre, un de nos
identifiants opaques, ou l'empreinte SHA-256 de l'adresse de l'article. Il n'y a pas
d'endroit où mettre un paragraphe, même par accident. Une requête refusée est
journalisée par le **nom** du champ fautif, jamais par sa valeur.

## Les sous-traitants

| Sous-traitant | Rôle | Ce qu'il voit |
|---|---|---|
| **OpenRouter** | passerelle d'analyse, fournisseur par défaut | le texte de l'article et les extraits des sources citées |
| **Fournisseur du modèle** (DeepSeek pour `deepseek/deepseek-v4.1-flash`) | exécution du modèle choisi par la passerelle | idem |
| **Google** (Gemini) | analyse, seulement quand le fournisseur configuré est Gemini | idem |
| **Google** (connexion) | authentification, si vous choisissez « se connecter avec Google » | votre identité Google |
| **Cloudflare** (Workers) | hébergement du serveur | le trafic, sans contenu d'article dans les journaux |
| **Neon** | base de données | tout ce que décrit le tableau ci-dessus |
| **Stripe** | paiement | votre e-mail et vos données de paiement — **nous ne voyons aucun numéro de carte** |
| **Brevo** | envoi des e-mails de connexion | votre adresse e-mail |

## Vos droits

- **Accès et portabilité** — la page de compte affiche votre plan, votre usage et vos
  installations ; le rapport d'une analyse est le fichier que le panneau vous montre.
- **Suppression** — supprimer le compte efface le compte, ses clés, ses jetons, ses
  sessions et son journal d'usage. Un rapport déjà présent dans le cache partagé n'est
  pas rattaché à vous : il ne porte que l'empreinte de l'adresse de l'article, et il
  expire de lui-même sous 30 jours. Rien nulle part ne relie un compte à un article :
  le journal d'usage note qu'une analyse a eu lieu, jamais laquelle.
- **Rectification** — l'adresse e-mail est la seule donnée personnelle que vous nous
  confiez ; elle se change depuis la page de compte.
- Pour tout le reste : [ouvrez un ticket](https://github.com/TheGlitching/Squiggle/issues)
  ou utilisez l'adresse de contact publiée sur le site.

## Ce qui n'est jamais fait, dans les deux modes

- Aucune donnée n'est vendue.
- Aucune donnée n'est transmise à quiconque en dehors des destinataires listés
  ci-dessus, et uniquement pour produire l'analyse que vous avez demandée.
- Aucune donnée n'est utilisée à une fin étrangère à cette analyse. En particulier,
  **rien n'entraîne un modèle** : nous n'avons aucun accord de ce type et l'API payante
  du fournisseur configuré n'utilise pas les requêtes pour l'entraînement.
- Aucune donnée n'est utilisée pour évaluer une solvabilité ni pour un prêt.
- Aucune publicité, aucun traceur, aucun mouchard analytique.
- Aucun code n'est téléchargé ni exécuté depuis l'extérieur : tout ce qui s'exécute
  est dans le paquet que vous avez installé, et lisible dans le dépôt.
- **Votre clé personnelle n'atteint jamais notre serveur.** Dans le mode BYOK elle ne
  quitte pas votre navigateur autrement que vers le fournisseur que vous avez choisi,
  et le mode hébergé ne la lit pas.

## Les autorisations, une par une

- **`activeTab`** — lire l'article de l'onglet où vous cliquez, et seulement à ce
  moment-là.
- **`scripting`** — insérer le lecteur d'article dans cet onglet pour en extraire le
  texte, les liens et les emplacements à surligner.
- **`storage`** — conserver votre clé chiffrée, pour ne pas la redemander. En mode
  hébergé, conserver de la même façon le jeton de session et la clé de signature de
  l'installation.
- **`sidePanel`** — afficher le résultat dans le panneau latéral, à côté de l'article.
- **accès aux sites** — les articles se trouvent sur n'importe quel domaine, et
  l'extension ne peut pas savoir à l'avance lequel vous lirez. Cet accès sert à lire
  la page que vous analysez et à joindre le fournisseur que vous avez choisi.

Le mode hébergé **ne demande aucune autorisation supplémentaire**.

## Contact

Un problème ou une question : [ouvrez un ticket](https://github.com/TheGlitching/Squiggle/issues).
Le code est public et vérifiable.
