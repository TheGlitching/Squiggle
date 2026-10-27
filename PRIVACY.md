# Politique de confidentialité

*Dernière mise à jour : 26 octobre 2026*

Squiggle est une extension de navigateur qui analyse la rigueur d'un article de presse,
et un site, squiggle.fr, qui fait la même analyse sur le texte d'un article qu'on y
colle. Cette page décrit exactement ce qu'ils lisent, ce qu'ils envoient, à qui, et ce
qu'ils conservent.

Il existe **deux modes**, et ils n'ont pas la même politique parce qu'ils n'ont pas le
même trajet de données.

| | **Clé personnelle (BYOK)** | **Squiggle hébergé** |
|---|---|---|
| Disponible | oui | oui |
| Il vous faut | une clé d'API à vous | un compte |
| L'article part vers | le fournisseur que vous avez choisi | notre serveur, puis le fournisseur configuré |
| Nous voyons | rien | l'article, le temps de l'analyser |
| Ce qui est conservé chez nous | rien | le rapport, avec des extraits de l'article, pas l'article entier |

Le mode « clé personnelle » ne change pas et ne changera pas. Il reste le mode par
défaut, et rien de ce qui suit sur le mode hébergé ne s'y applique.

L'analyse sur le site (la page « Analyser un texte ») est le mode hébergé, sans
extension : elle tourne sur le même compte, avec les mêmes analyses offertes et le même
abonnement, et tout ce que la section 2 dit du mode hébergé s'y applique.

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

Le mode hébergé existe pour les lecteurs qui ne veulent pas gérer une clé d'API.
L'analyse tourne alors sur notre infrastructure, avec notre propre clé, via le
fournisseur configuré (OpenRouter par défaut, Google Gemini en alternative), dans la
limite de votre essai ou de votre abonnement. Par défaut, l'analyse tourne sur **DeepSeek V4.1 Flash**, un modèle à poids
ouverts, via OpenRouter : il a été retenu pour le meilleur équilibre entre vitesse,
qualité de raisonnement et coût. Un modèle à poids ouverts est servi par plusieurs
hébergeurs d'inférence, et chaque requête fixe ceux qu'OpenRouter a le droit
d'utiliser : **en Europe en priorité, aux États-Unis en secours**. D'abord
**Nebius** (siège aux Pays-Bas), seul hébergeur européen de ce modèle sur OpenRouter ;
seulement s'il ne peut pas répondre, **DeepInfra**, **CoreWeave** et **Together AI**
(États-Unis). Aucun n'a son siège en Chine. Chacun doit s'engager à ne conserver aucune
requête et à n'en servir aucune à l'entraînement d'un modèle. Si aucun ne peut
répondre, l'analyse s'arrête plutôt que de partir chez un autre hébergeur : vous lisez
« Service momentanément indisponible. Réessayez dans quelques minutes. », et la
tentative ne vous coûte aucune analyse.

La **recherche web** de l'étape de vérification, elle, ne peut pas se faire en Europe :
OpenRouter ne propose aucun moteur de recherche européen ; elle passe par
**Parallel Web Systems** (États-Unis). Ce moteur reçoit les **requêtes de recherche**
que le modèle rédige à partir des affirmations relevées dans l'article, quelques mots
chacune, et rien d'autre : jamais le texte de l'article, jamais une identité de
lecteur. Squiggle ne traite que des **articles publics** : le
texte de la page que vous lisez, son adresse et les pages qu'elle cite. Aucune donnée
privée ne part vers le modèle, et aucune identité de lecteur n'accompagne une requête. **Le choix vous appartient à chaque instant** : c'est un
sélecteur dans les réglages, et un compte est nécessaire pour l'activer.

## Le trajet des données

```
votre navigateur  ──(le texte de l'article)──▶  notre serveur  ──▶  fournisseur configuré
                  ◀──────(le rapport)──────────
```

Trois choses à en retenir.

**Votre navigateur envoie le texte de l'article** : celui que l'extension lit dans la
page, ou celui que vous collez sur le site, qui suit exactement le même trajet. C'est
la différence essentielle avec le mode BYOK : nous le voyons. Il est utilisé pour l'appel d'audit et il
disparaît à la fin de cette requête. **Aucune table de notre base de données ne
contient de texte d'article** : les étapes suivantes de l'analyse ne travaillent que
sur les constats de l'audit, pas sur l'article.

**Notre serveur ne va jamais chercher l'article lui-même.** C'est votre navigateur qui
le lui fournit, depuis la page que vous lisez déjà. Conséquence directe : un article
payant est analysé exactement dans la limite de ce que vous pouvez lire (et le rapport
le signale), et notre adresse n'apparaît dans les journaux d'aucun éditeur. Les seules
pages que notre serveur va chercher sont **les sources citées par l'article**. Sur le
site, l'adresse que vous indiquez à côté d'un texte collé reste une simple mention :
elle accompagne le rapport et sert de clé au cache, mais **elle n'est jamais visitée**,
et un texte collé ne cite aucun lien, si bien qu'une analyse lancée depuis le site ne
fait lire aucune page à notre serveur.

**Le rapport est mis en cache et partagé.** Deux lecteurs du même article obtiennent le
même rapport, et c'est ce qui rend le service abordable : le second ne consomme aucun
crédit et son navigateur n'envoie même pas l'article. **Un rapport contient des extraits
de l'article** (la citation de chaque constat) et un résumé ; il ne contient jamais le
texte intégral. La clé du cache est l'adresse canonique de l'article, plus l'empreinte
(SHA-256) de son texte, plus le modèle et la version des consignes : un rapport n'est
servi qu'à un lecteur dont la page donne le même texte. Un texte collé sans adresse est
rangé sous une clé fixe, avec la même empreinte : son rapport n'est servi qu'à un
lecteur qui colle le même texte.

## Ce que nous conservons, et combien de temps

| Donnée | Où | Durée |
|---|---|---|
| Texte de l'article, lu par l'extension ou collé sur le site | mémoire, le temps de l'appel d'audit | **jamais écrit** |
| Texte collé sur le site, avant l'analyse | **votre navigateur** (stockage local du site), jamais notre serveur | jusqu'à ce que vous l'effaciez |
| Séance du mode classe : l'article, le rapport, l'ordre de révélation et vos remarques | **l'onglet de votre navigateur** (stockage de session), et le fichier de séance que vous téléchargez ; jamais notre serveur | jusqu'à la fermeture de l'onglet ; le fichier, tant que vous le gardez |
| Fichiers du site installé sur l'écran d'accueil | votre navigateur | jusqu'à la version suivante du site ; **jamais une réponse de compte ou d'analyse** |
| Rapport d'analyse, avec extraits de l'article (cache partagé) | base de données | 30 jours, 500 rapports au plus |
| Analyse en cours (constats, sans l'article) | base de données | 1 heure |
| Journal d'usage : qu'un compte a lancé une analyse, et quand | base de données | 12 mois, **sans aucun contenu et sans dire de quel article** |
| Compteur d'analyses du jour (lancées, et menées à terme) | base de données | tant que le compte existe |
| Adresse e-mail | base de données | tant que le compte existe |
| Identifiant Google (`sub`), si connexion Google | base de données | tant que le compte existe |
| Clé publique de votre installation | base de données | tant que vous ne la révoquez pas |
| Jeton d'extension | base de données, **en empreinte SHA-256** | 90 jours |
| Session web | base de données, **en empreinte SHA-256** | 30 jours |
| Lien de connexion par e-mail, avec l'adresse IP de la demande | base de données, le code **en empreinte SHA-256** | 10 minutes |
| Limites de fréquence : une adresse IP ou e-mail et un nombre de demandes dans l'heure | base de données | 2 heures au plus |
| Identifiants client et abonnement Stripe | base de données | tant que le compte existe |
| Compteurs de fonctionnement : combien de fois le cache a répondu, combien de fois une étape d'analyse a échoué, par jour | base de données | tant que le serveur existe ; **un nombre par jour et par nom d'événement, sans compte et sans article** |
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
| **OpenRouter** (États-Unis) | passerelle d'analyse, fournisseur par défaut : transmet chaque requête à l'hébergeur d'inférence | le texte de l'article et les extraits des sources citées |
| **Hébergeurs d'inférence** : Nebius (Pays-Bas) en priorité, DeepInfra, CoreWeave et Together AI (États-Unis) en secours ; modèle `deepseek/deepseek-v4.1-flash`, DeepSeek V4.1 Flash | exécution du modèle à poids ouverts, sans conservation des requêtes | idem, sans identité de lecteur |
| **Parallel Web Systems** (États-Unis), via OpenRouter | moteur de la recherche web de l'étape de vérification | les requêtes de recherche rédigées par le modèle, jamais l'article ni une identité de lecteur |
| **Google** (Gemini) | analyse, seulement quand le fournisseur configuré est Gemini, ce qui n'est pas le cas aujourd'hui ; ses serveurs ne sont pas tous en Europe | idem |
| **Google** (connexion) | authentification, si vous choisissez « se connecter avec Google » | votre identité Google |
| **Cloudflare** (Workers) | hébergement du serveur | le trafic, sans contenu d'article dans les journaux |
| **Neon** | base de données | tout ce que décrit le tableau ci-dessus |
| **Stripe** | paiement | votre e-mail et vos données de paiement — **nous ne voyons aucun numéro de carte** |
| **Brevo** | envoi des e-mails de connexion | votre adresse e-mail |

## Vos droits

- **Accès et portabilité** — la page de compte affiche votre plan, votre usage et vos
  installations ; le rapport d'une analyse est le fichier que le panneau vous montre.
- **Suppression** — « Supprimer mon compte », dans la page de compte, efface le compte,
  ses clés, ses jetons, ses sessions et son journal d'usage, ainsi que les codes de
  connexion et les compteurs de limite liés à votre adresse. Un abonnement en cours est
  d'abord résilié chez Stripe ; si Stripe ne répond pas, rien n'est supprimé et vous pouvez
  réessayer. Un rapport déjà présent dans le cache partagé n'est pas rattaché à vous : il
  ne porte que l'empreinte de l'adresse de l'article, et il expire de lui-même sous 30
  jours. Rien nulle part ne relie un compte à un article : le journal d'usage note qu'une
  analyse a eu lieu, jamais laquelle. La suppression n'efface pas, chez Stripe, le client
  et ses factures : ce sont des pièces de facturation qui relèvent de Stripe.
- **Rectification** — l'adresse e-mail est la seule donnée personnelle que vous nous
  confiez ; elle se change depuis la page de compte, en confirmant un code envoyé à la
  nouvelle adresse. L'adresse portée par Stripe sur vos reçus suit ce changement.
- **Révocation d'une installation** — la page de compte liste les extensions connectées
  et permet d'en révoquer une : sa clé cesse aussitôt d'être acceptée.
- Pour tout le reste : écrivez à contact@squiggle.fr. La politique complète, avec les
  bases légales et les transferts hors UE, est publiée sur le site, à `/confidentialite`.

## Ce qui n'est jamais fait, dans les deux modes

- Aucune donnée n'est vendue.
- **Limited Use.** L'utilisation par Squiggle des informations reçues depuis le
  navigateur respecte la politique « Chrome Web Store User Data Policy », y compris ses
  exigences d'utilisation limitée (« Limited Use ») : ces informations ne servent qu'à
  fournir l'analyse que vous demandez, elles ne sont ni transférées à des tiers (hors
  sous-traitants nécessaires à cette analyse, listés ci-dessus), ni utilisées pour de la
  publicité, ni lues par des personnes (sauf avec votre accord, pour la sécurité, ou si
  la loi l'exige), ni utilisées pour évaluer une solvabilité.
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

- **`activeTab`** — lire l'article de l'onglet où vous cliquez, au moment où vous le
  demandez.
- **`scripting`** — insérer le lecteur d'article dans cet onglet pour en extraire le
  texte, les liens et les emplacements à surligner.
- **`storage`** — conserver votre clé chiffrée, pour ne pas la redemander. En mode
  hébergé, conserver de la même façon le jeton de session et la clé de signature de
  l'installation.
- **`sidePanel`** — afficher le résultat dans le panneau latéral, à côté de l'article.
- **accès aux quatre fournisseurs de modèles** (`api.anthropic.com`, `api.openai.com`,
  `openrouter.ai`, `generativelanguage.googleapis.com`) - avec votre propre clé,
  l'extension appelle directement le fournisseur que vous avez choisi.
- **accès à tous les sites, facultatif** (`https://*/*`, `http://*/*`) - jamais demandé à
  l'installation. Vous pouvez l'accorder dans les réglages (« Accès aux sites ») et le
  retirer au même endroit. Il permet d'analyser une page après avoir changé de site sans
  recliquer sur l'icône et, avec votre propre clé, de lire les sources que l'article cite.

Aucun script n'est déclaré pour s'exécuter sur les pages : le lecteur d'article n'est
inséré que dans l'onglet où vous lancez l'analyse.

Le mode hébergé **ne demande aucune autorisation supplémentaire**.

## Contact

Un problème ou une question : contact@squiggle.fr, ou [ouvrez un ticket](https://github.com/TheGlitching/Squiggle/issues).
Le code est public et vérifiable.
