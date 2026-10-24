# Installation Docker

Cette configuration lance la plateforme sans modifier les interfaces existantes.

## Prerequis

- Docker Desktop installe et lance.
- Le dossier `database/gmao_biomed.sql` present.

## Demarrage rapide

Depuis la racine du projet :

```cmd
scripts\docker-start.cmd
```

La plateforme sera disponible sur :

```text
http://localhost:3000
```

MySQL Docker est expose par defaut sur le port `3307` pour eviter les conflits avec un MySQL local deja lance sur `3306`.

## Variables d'environnement

Le fichier `.env.docker.example` contient les variables possibles sans secret reel.

Pour personnaliser la configuration :

```cmd
copy .env.docker.example .env.docker
```

Puis modifier `.env.docker`.

Le fichier `.env.docker` est ignore par Git et ne doit pas etre partage s'il contient des mots de passe.

## Commandes utiles

Demarrer :

```cmd
scripts\docker-start.cmd
```

Arreter :

```cmd
scripts\docker-stop.cmd
```

Voir les logs :

```cmd
docker compose logs -f app
```

Sauvegarder la base :

```cmd
scripts\docker-backup-db.cmd
```

Restaurer une sauvegarde :

```cmd
scripts\docker-restore-db.cmd backups\gmao_biomed_YYYYMMDD-HHMMSS.sql
```

## Volumes Docker

- `gmao_mysql_data` conserve la base MySQL.
- `gmao_uploads` conserve les fichiers envoyes dans `public/uploads`.

## Nettoyage complet

Attention : cette commande supprime la base et les uploads Docker.

```cmd
docker compose down -v
```
