# Architecture

Reprise du schéma de la slide 13 de la proposition Sooyoos.

```
 Application mobile (Expo / React Native)        Back-office web (React / Vite)
   cache persisté + file hors ligne                       │
            │                                             │
            └──────────────── API unique Symfony ─────────┘
                    REST JSON · jeton Bearer · filtre multi-tenant
                    │            │             │            │
              PostgreSQL     Stockage      Messenger      Push Expo
              (par tenant)   (URL signées)  (miniatures)  (APNs, FCM)
```

## API (`api/`)

- `src/Entity` : Company (tenant), User, Site, SiteMember, Folder, Document, DocumentVersion,
  Photo, Channel, Message, ActivityEvent, Notification, DeviceToken, ClassificationRule, LoginCode, ApiToken.
  Toute donnée métier implémente `TenantOwned`.
- `src/Doctrine/TenantFilter` : ajoute `company_id = :tenant` à chaque requête, activé dès l'authentification
  (`EventListener/TenantFilterListener`). C'est un filet de sécurité en plus des contrôles par chantier (`Service/SiteAccess`).
- `src/Classification` : règles de dépôt et empreinte, sans IA. Même algorithme que `packages/shared/src/classification.ts` ;
  `packages/shared/classification-cases.json` sert aux tests des deux côtés.
- `src/Api/Presenter` : le contrat JSON, miroir de `packages/shared/src/types.ts`.
- Idempotence : `clientId` unique sur DocumentVersion, Photo et Message. Un rejeu renvoie l'objet déjà créé.
- Fichiers : clés opaques `{company}/{site}/{yyyy}/{mm}/{uuid}.{ext}`, servis uniquement par `/files/…?e=…&s=…`
  (signature HMAC, 15 min).
- Preuve : `ActivityEvent` est en ajout seul. `occurredAt` est l'heure sur le chantier (prise de vue, écriture hors ligne),
  `recordedAt` l'heure de réception par le serveur. L'export CSV donne les deux.

### Points d'entrée

| Méthode | Chemin | Rôle |
|---|---|---|
| POST | `/api/auth/request-code`, `/api/auth/verify` | Connexion par SMS |
| GET | `/api/sites` | Mes chantiers (nouveautés, dernière activité, réponse attendue) |
| GET | `/api/sites/{id}/feed?filter=` | Fil unique paginé |
| POST | `/api/sites/{id}/documents/analyze` | « Albert a reconnu… » (nom + empreinte, sans envoi du fichier) |
| POST | `/api/sites/{id}/documents`, `/api/documents/{id}/versions` | Dépôt idempotent |
| GET, PATCH | `/api/documents/{id}` | Fiche, versions, journal ; corriger le classement |
| POST | `/api/sites/{id}/photos` | Une photo par requête, regroupée par `batchId` |
| GET, POST | `/api/channels/{id}/messages` | Messagerie |
| GET | `/api/sites/{id}/search?q=&kind=` | Recherche unique |
| * | `/api/admin/*` | Back-office (rôle administrateur) |

## Mobile (`apps/mobile/`)

- `src/app` : écrans Expo Router, qui suivent le parcours de la maquette (j'arrive, j'entre, je vois ce qui a bougé,
  je dépose, je retrouve, je prouve), plus la messagerie, les photos, le compte et la création de chantier.
- `src/lib/outbox.tsx` : file persistée (AsyncStorage). Les fichiers sont copiés dans le dossier de l'application
  pour survivre à la fermeture. L'envoi se fait au retour du réseau (NetInfo), au retour au premier plan, et toutes les 30 s.
- Cache : TanStack Query persisté 7 jours, en `offlineFirst`.
- Charte : `src/ui/theme.ts` reprend les tokens de `packages/shared/src/tokens.ts` (Archivo, IBM Plex,
  jaune #FFCB11 pour la seule action principale de l'écran, texte de 17 px minimum, cibles de 56 px).

## Production (à faire au déploiement)

Scaleway, région Paris : instances pour l'API (PHP-FPM avec l'extension `redis`), PostgreSQL managé, Redis,
stockage objet. Il reste à écrire l'adaptateur S3 de `FileStorage`, à brancher le fournisseur SMS, à configurer
le projet EAS pour le push et la publication sur les stores, et à mettre en place Sentry.
