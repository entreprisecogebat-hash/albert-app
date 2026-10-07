# Albert, V1

Le carnet de chantier de vos équipes. Cette V1 reprend la stack, le périmètre et la charte
de la proposition Sooyoos du 22 septembre 2026 (charte Albert V0.2, parcours cliquable).

| Brique | Techno | Dossier |
|---|---|---|
| API unique | Symfony 7.4 LTS (PHP 8.3), REST JSON, Doctrine | `api/` |
| Base de données | PostgreSQL 17, données séparées par entreprise | `compose.yaml` ou installation native |
| Cache et file de traitement | Redis (production), Messenger (miniatures, notifications) | `api/config/packages/` |
| Application mobile iOS et Android | React Native, Expo SDK 57, Expo Router | `apps/mobile/` |
| Back-office web | React 19, Vite | `apps/backoffice/` |
| Code partagé | Design system (tokens), client API, types, classement, file hors ligne | `packages/shared/` |

« Une base de code, deux compilations, trois interfaces, un seul serveur » : les tokens de la charte,
les types de l'API, le client HTTP, le formatage des dates et la logique hors ligne sont écrits
une fois dans `packages/shared` et utilisés par le mobile et le back-office.

## Démarrer

Prérequis : PHP 8.3 avec `pdo_pgsql`, `intl`, `gd`, `mbstring`, `sodium` ; Composer ; Node 22 ou plus ; PostgreSQL 17.

```bash
# 1. Base de données (au choix)
docker compose up -d                      # PostgreSQL + Redis en conteneurs
#   ou PostgreSQL natif : rôle et base "albert", mot de passe "albert"

# 2. API
cd api
composer install
php bin/console doctrine:migrations:migrate -n
php bin/console doctrine:fixtures:load -n    # données de démonstration
php -S 0.0.0.0:8000 -t public public/index.php

# 3. Back-office (http://localhost:5173)
npm install                                  # à la racine du dépôt
npm run backoffice

# 4. Application mobile
npm run mobile                               # puis Expo Go sur le téléphone (même Wi-Fi), ou "w" pour le web
```

Sur téléphone, l'application trouve l'API toute seule (même machine que le serveur Expo, port 8000).
Sinon : `EXPO_PUBLIC_API_URL=http://192.168.x.x:8000`.

### Comptes de démonstration

Pas de mot de passe : connexion par numéro et code SMS. En développement, aucun SMS n'est envoyé ;
le code s'affiche à l'écran et dans `var/log`.

| Numéro | Qui | Ce qu'il voit |
|---|---|---|
| 06 12 34 56 78 | Karim Belhadi, conducteur de travaux, admin Cogebat | 3 chantiers, back-office |
| 06 22 33 44 55 | Sophie Nadal, cheffe de chantier | 3 chantiers |
| 06 33 44 55 66 | Mehdi Rahal, chef d'équipe | Villa Marceau |
| 06 98 76 54 32 | Claire Lefèvre, cliente | Villa Marceau, canal client seulement |
| 06 55 44 33 22 | Julien Patenotte, admin Patenotte | Données Patenotte uniquement |

### Tests

```bash
npm test                         # packages/shared : classement, dates, file hors ligne (Vitest)
cd api && php bin/phpunit        # mêmes cas de classement côté PHP
npm run smoke                    # parcours complet sur l'API locale : 15 vérifications
                                 # (sur données de démo fraîches : doctrine:fixtures:load -n avant)
npm run typecheck
```

## Ce que couvre la V1

Périmètre de la slide 8 de la proposition :

- **F-01 à F-05** : dossier chantier ; arborescence automatique selon un modèle réglable au back-office ;
  versions de documents (la version en cours fait foi, les précédentes restent consultables) ;
  recherche unique sur tout le chantier (documents, versions remplacées, photos, messages) avec filtres.
- **F-08, F-09** : fil d'activité horodaté et non modifiable ; photos datées et géolocalisées
  au moment de la prise (pas de l'envoi), regroupées par lot.
- **F-19 à F-21** : messagerie par chantier, canal Équipe et canal Client ; « Réponse attendue » ;
  notifications in-app et push (nouveau message, nouvelle version).
- **F-22** : comptes, rôles par chantier (responsable, équipe, client) ; le client ne voit que ce
  qui est marqué « visible aussi par le client ».
- **Hors ligne** : copie locale des données (cache persistant) ; file d'attente des photos,
  documents et messages, envoyée seule au retour du réseau ; rejeu sans doublon (identifiant
  `clientId` par action) ; la V1 ne synchronise que des ajouts.
- **Classement sans IA** (étapes 01 et 02 de la slide 17) : règles de dépôt sur le nom du fichier,
  empreinte SHA-256 pour les doublons, rattachement à un document existant par son titre et lecture
  de l'indice (V3, Ind. B, Rev. 2). « Albert a reconnu un plan, version 3. » apparaît même sans
  réseau, grâce à la même logique écrite en TypeScript dans `packages/shared`.
- **Multi-tenant** : chaque entité porte son entreprise, et un filtre Doctrine l'impose à chaque requête.
- **Back-office** : vue d'ensemble, chantiers (création, équipe, droits, arborescence, archivage),
  supervision du fil complet, export CSV du journal, intervenants, arborescence type, règles de classement.

## Ce qui n'y est pas, ou diffère de la proposition

- **Option IA** (F-16 étapes 03-04, F-17 résumé) : non incluse, comme dans la proposition (chiffrée à part).
  Le champ `aiEnabled` par entreprise est prêt.
- **Repoussé en V2** (slide 8) : Stripe, partage externe, pointage, fiche d'intervention, DOE, dashboard, connecteur mail.
- **SMS** : le fournisseur reste à choisir au cadrage (OVHcloud, Brevo…). Il se branche dans `api/src/Service/SmsSender.php`.
- **Push** : envoyé par le service Expo, qui relaie vers APNs et FCM. Il faut un projet EAS (`extra.eas.projectId`) et `EXPO_PUSH_URL=https://exp.host/--/api/v2/push/send`.
- **Stockage** : disque local avec URL signées à durée limitée. En production, il faut un adaptateur S3 vers
  le stockage objet Scaleway (fr-par) derrière `FileStorage`. L'interface est prête, l'adaptateur n'est pas écrit.
- **Redis** : cache en production (`when@prod`). En développement sous Windows, l'extension PHP `redis` n'existe pas :
  Messenger tourne en `sync://`, et sur `doctrine://` avec un worker (`php bin/console messenger:consume async`) en production.
- **Lecture du texte des PDF** (étape 03) : pas en V1.

## Notes pour ce poste (dossier Dropbox)

Dropbox verrouille les fichiers qu'il synchronise et expose `node_modules` d'une manière que Metro ne sait pas lire.
Sur ce poste :

- `node_modules` est une jonction vers `%LOCALAPPDATA%\albert\node_modules` (hors Dropbox) ;
- le cache, les logs et les fichiers déposés de l'API sont dans `%LOCALAPPDATA%\albert` (`api/.env.local`) ;
- `api/vendor` et `api/var` sont marqués « ignorés » par Dropbox.

Un clone dans un dossier hors Dropbox n'a besoin de rien de tout cela.
