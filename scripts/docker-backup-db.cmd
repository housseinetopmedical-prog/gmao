@echo off
setlocal
cd /d "%~dp0.."

set COMPOSE_ENV=
if exist ".env.docker" set COMPOSE_ENV=--env-file .env.docker

if not exist "backups" mkdir "backups"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set BACKUP_TS=%%i
set BACKUP_FILE=backups\gmao_biomed_%BACKUP_TS%.sql

docker compose %COMPOSE_ENV% exec -T db sh -c "mysqldump -uroot -p$MYSQL_ROOT_PASSWORD $MYSQL_DATABASE" > "%BACKUP_FILE%"

echo Sauvegarde creee: %BACKUP_FILE%
endlocal
