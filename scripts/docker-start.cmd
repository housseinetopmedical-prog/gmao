@echo off
setlocal
cd /d "%~dp0.."

set COMPOSE_ENV=
if exist ".env.docker" set COMPOSE_ENV=--env-file .env.docker

docker compose %COMPOSE_ENV% up --build -d
docker compose %COMPOSE_ENV% ps

echo.
echo Plateforme disponible sur http://localhost:3000
endlocal
