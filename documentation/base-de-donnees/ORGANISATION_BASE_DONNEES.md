DONE 0.5s

#8 [3/6] COPY frontend/package*.json ./
#8 DONE 0.1s

#9 [4/6] RUN npm ci
# Organisation simple de la base de donnees

La base utile de la plateforme est `gmao_biomed`.

Dans phpMyAdmin, `Nouvelle base de donnees` et `Nouvelle table` sont seulement des boutons pour creer quelque chose. Ce ne sont pas des tables de la plateforme et il n'y a rien a supprimer dans le projet pour ces deux lignes.

## Tables a garder

| Titre dans la plateforme | Tables utiles | Role simple |
| --- | --- | --- |
| Espace admin / Postes et clients | `utilisateurs` | Comptes, roles et clients. |
| Materiels | `materiels`, `documents_materiels` | Materiels biomedicales, garanties, BL, factures et fichiers. |
| Ticket / Demande d'intervention | `demandes_intervention`, `tickets`, `historiques_sav` | Demande client, suivi du ticket et historique SAV. |
| Maintenance / Visites | `maintenances` | Visites preventives, correctives et interventions planifiees. |
| Pieces / Stock / Import | `pieces_detachees`, `mouvements_stock`, `bons_achat`, `lignes_bons_achat` | Pieces, entrees/sorties stock, commandes locales et import. |
| Messagerie | `tickets_internes`, `messages_tickets_internes` | Echanges internes entre ADV, magasinier, technique et admin. |

## Tables anciennes a supprimer

Ces anciennes tables ne doivent plus rester dans la base active :

- `equipment`
- `equipment_document`
- `reclamation`
- `message`
- `equipements`
- `documents_equipements`
- `reclamations`
- `interventions`

La migration `20260512124500_rename_reclamations_to_interventions` renomme les anciennes tables utiles puis supprime celles qui ne servent plus.

## Lecture conseillee dans phpMyAdmin

phpMyAdmin affiche souvent les tables par ordre alphabetique. Pour les lire simplement, utilise plutot ce regroupement :

1. `utilisateurs`
2. `materiels`
3. `documents_materiels`
4. `demandes_intervention`
5. `tickets`
6. `historiques_sav`
7. `maintenances`
8. `pieces_detachees`
9. `mouvements_stock`
10. `bons_achat`
11. `lignes_bons_achat`
12. `tickets_internes`
13. `messages_tickets_internes`

## Ce qu'il ne faut pas ajouter

Il ne faut pas creer une table separee pour chaque page du menu. Une meme table peut servir plusieurs espaces. Par exemple, `tickets` est utilise par ADV, responsable technique, technicien, client, facturation et admin.
