# Frontend

Ce dossier contient les interfaces de la plateforme et les API Next.js.

## Organisation

| Dossier | Rôle |
| --- | --- |
| `src/app/(connexion)` | Page de connexion. |
| `src/app/(tableau-de-bord)` | Interfaces connectées par rôle. |
| `src/app/api` | Routes API utilisées par les interfaces. |
| `src/composants` | Composants réutilisables. |
| `src/metier` | Règles métier et fonctions partagées. |
| `src/styles` | Styles globaux. |
| `public` | Images, logos et fichiers téléversés. |
| `scripts` | Scripts de développement. |

## Interfaces principales

- Client : demande, suivi, historique, assistant IA, devis.
- ADV : tableau de bord, qualification, affectation, devis, suivi, clôture, nessagerie interne.
- Responsable technique : affectation, demandes de pieces, enregistrement de pieces, suivi, messagerie fournisseur, messagerie interne,pièces.
- Technicien : tickets, intervention, enregistrement de pieces, demande de pièces.
- Magasinier : infos DP, messagerie
- Import : demandes et réceptions import, messagerie.
- Facturation : ticket d'entrée, ticket de sortie, historique, messagerie.
- Admin : supervision globale, messagerie fournisseur, messagerie interne.

## Commandes utiles

```bash
npm run dev
npm run build
```

## Note

Les fichiers imposés par Next.js gardent leurs noms techniques : `page.tsx`, `route.ts`, `layout.tsx`.
