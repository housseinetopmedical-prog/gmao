# Plateforme GMAO biomédicale

Ce projet est une plateforme de gestion de maintenance biomédicale.

Elle couvre le workflow complet :

- demande d'intervention ;
- qualification ADV ;
- décision sous garantie / hors garantie ;
- devis client ;
- affectation technique ;
- demande de pièces ;
- suivi magasinier ou import ;
- rapport final ;
- clôture administrative ;
- satisfaction client.

## Organisation simple

| Dossier | Rôle |
| --- | --- |
| `frontend/` | Interfaces utilisateurs et API Next.js. |
| `backend/` | Schéma Prisma, migrations et scripts base de données. |
| `database/` | Export SQL de référence. |
Les fichiers de rapports, workflow et documentation pure ont été supprimés pour garder un projet centré sur la plateforme.

## Lancement local

Depuis `frontend/` :

```bash
npm run dev
```

Adresse habituelle :

```text
http://localhost:3000
```

## Base de données

- Schéma Prisma : `backend/prisma/schema.prisma`
- Export SQL : `database/gmao_biomed.sql`
- Organisation simple des tables : `database/ORGANISATION_BASE_DONNEES.md`

## Remarque importante

Certains noms restent techniques (`src`, `app`, `api`, `prisma`, `public`) parce qu'ils sont nécessaires au fonctionnement de Next.js, Prisma et Node.js.

Dans `frontend/src`, les dossiers métier ont été simplifiés :

- `composants/` : blocs d'interface ;
- `metier/` : logique métier ;
- `(tableau-de-bord)/` : groupe des interfaces connectées.
