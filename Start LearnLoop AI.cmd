@echo off
cd /d "%~dp0"
if not exist .env copy .env.example .env >nul
docker compose up -d --build --wait
if errorlevel 1 (
 echo Start Docker Desktop with Linux containers and try again.
 pause
 exit /b 1
)
start "" "http://localhost:4318"
