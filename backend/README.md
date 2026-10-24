# Backend

Ce dossier contient la partie données de la plateforme.

## Organisation

| Dossier / fichier | Rôle |
| --- | --- |
| `prisma/schema.prisma` | Schéma principal de la base de données. |
| `prisma/migrations` | Historique des modifications de la base. |
| `prisma/seed.js` | Données de départ. |
| `prisma/export-sql.js` | Export vers `database/gmao_biomed.sql`. |
| `scripts/archives-techniques` | Anciens scripts conservés comme archive technique. |

## Tables utiles de la plateforme

| Titre dans la plateforme | Tables |
| --- | --- |
| Espace admin / Postes et clients | `utilisateurs` |
| Materiels et documents | `materiels`, `documents_materiels` |
| Ticket / Demande d'intervention | `demandes_intervention`, `tickets`, `historiques_sav` |
| Maintenance / Visites | `maintenances` |
| Pieces / Stock / Import | `pieces_detachees`, `mouvements_stock`, `bons_achat`, `lignes_bons_achat` |
| Messagerie | `tickets_internes`, `messages_tickets_internes` |

Les anciennes tables `equipements`, `documents_equipements`, `reclamations`, `interventions` et `message` ne sont plus utiles dans la plateforme actuelle.

## Commandes utiles

```bash
npm run db:generate
npm run db:migrate
npm run db:deploy
npm run db:seed
npm run db:dump-sql
```

## Convention

Le schéma Prisma reste la source principale.

Les noms techniques des modèles Prisma restent stables pour ne pas casser le code, mais les tables physiques sont mappées en français quand c'est nécessaire.
