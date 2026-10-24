Organisation simple du dossier `backend`
=======================================

Ce dossier contient surtout la partie base de donnees et les scripts techniques.

Les parties principales :

- `prisma/` : structure principale de la base de donnees
- `scripts/` : scripts techniques utiles au projet
- `node_modules/` : bibliotheques utilisees par le backend
- `.env`, `.env.local`, `.env.example` : fichiers de configuration

Pourquoi `node_modules` existe aussi ici ?

- le backend est lui aussi un projet Node ;
- il a ses propres outils ;
- certaines dependances sont communes en nom, mais elles restent separees pour eviter les conflits.

Resume simple :
- `backend` = la partie technique qui gere surtout la base et les scripts
