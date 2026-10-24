@echo off
setlocal
cd /d "%~dp0.."

if "%~1"=="" (
  echo Utilisation: scripts\docker-restore-db.cmd chemin\vers\sauvegarde.sql
  exit /b 1
)

set COMPOSE_ENV=
if exist ".env.docker" set COMPOSE_ENV=--env-file .env.docker

docker compose %COMPOSE_ENV% exec -T db sh -c "mysql -uroot -p$MYSQL_ROOT_PASSWORD $MYSQL_DATABASE" < "%~1"

echo Restauration terminee depuis: %~1
endlocal
