Organisation simple du dossier `frontend`
========================================

Ce dossier contient tout ce qui s'affiche dans le navigateur.

Les parties principales :

- `src/` : le vrai code de l'application
- `public/` : les fichiers publics comme certaines images
- `scripts/` : les petits scripts de lancement ou de synchronisation
- `prisma/` : la copie technique du schema Prisma pour le frontend
- `node_modules/` : les bibliotheques du frontend
- `.next/` : les fichiers generes automatiquement par Next.js

Pourquoi `node_modules` existe ici ?

- le frontend est un projet Node a part ;
- il a ses propres bibliotheques ;
- il ne faut pas melanger ses dependances avec celles du backend.

Resume simple :
- `frontend` = tout ce qui sert a afficher et faire fonctionner l'interface
