@echo off
setlocal
cd /d "%~dp0.."

set COMPOSE_ENV=
if exist ".env.docker" set COMPOSE_ENV=--env-file .env.docker

docker compose %COMPOSE_ENV% down
endlocal
