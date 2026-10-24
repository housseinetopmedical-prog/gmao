Ce dossier `backend/prisma` est la source principale de la base de donnees.

Il contient surtout :

- `schema.prisma` : la structure principale des tables
- `migrations/` : l'historique des changements de la base
- `seed.js` et `seed.ts` : les scripts qui ajoutent des donnees de depart
- `export-sql.js` : l'export SQL de la base
- `reset-workflow.js` : un script de remise a zero de certains flux

Pourquoi Prisma existe aussi dans `frontend` ?

- le backend garde la vraie definition de la base ;
- le frontend garde une copie synchronisee pour ses besoins techniques ;
- cela permet au frontend d'utiliser Prisma sans deplacer la vraie source.

Resume simple :
- `backend/prisma` = dossier principal de la base de donnees
- `frontend/prisma` = copie technique pour le frontend
