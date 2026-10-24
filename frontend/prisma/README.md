Ce dossier `frontend/prisma` ne contient pas la base de donnees principale.

Le vrai schema principal se trouve ici :

`../../backend/prisma/schema.prisma`

Le fichier local `./schema.prisma` est seulement une copie de travail.
Cette copie est mise a jour automatiquement avec :

- `npm run db:sync-schema`

Pourquoi cette copie existe ici ?

- le frontend a besoin de generer son client Prisma local ;
- cette generation se fait avec les dependances du frontend ;
- cela evite de melanger les outils du frontend et du backend.

Resume simple :
- `backend/prisma` = schema principal et migrations
- `frontend/prisma` = copie technique utile au frontend
