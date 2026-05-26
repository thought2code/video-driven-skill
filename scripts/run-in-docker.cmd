@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Start Docker Compose and open the UI in the default browser when ready.
REM Usage: scripts\run-in-docker.cmd [--cn] [--no-open]

cd /d "%~dp0.."

set "CN=0"
set "NO_OPEN=0"

:parseArgs
if "%~1"=="" goto argsDone
if /I "%~1"=="--cn" set "CN=1" & shift & goto parseArgs
if /I "%~1"=="--no-open" set "NO_OPEN=1" & shift & goto parseArgs
echo Unknown option: %~1 >&2
exit /b 1

:argsDone
if not exist ".env" (
  if exist ".env.example" (
    copy /Y ".env.example" ".env" >nul
    echo Created .env from .env.example — set AI_API_KEY before using AI features.
  ) else (
    echo Warning: .env.example not found; create .env manually. >&2
  )
)

for /f "usebackq delims=" %%u in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0resolve-ui-url.ps1" -EnvFile ".env"`) do set "URL=%%u"

echo Starting containers...
if "%CN%"=="1" (
  docker compose -f docker-compose.yml -f docker-compose.cn.yml up -d --build
) else (
  docker compose up -d --build
)
if errorlevel 1 exit /b 1

echo Waiting for %URL% ...

set /a ATTEMPTS=90
:waitLoop
curl.exe -fsS -o nul -m 3 "%URL%" 2>nul
if not errorlevel 1 goto ready
set /a ATTEMPTS-=1
if %ATTEMPTS% LEQ 0 goto timeout
timeout /t 2 /nobreak >nul
goto waitLoop

:ready
echo Ready: %URL%
if "%NO_OPEN%"=="0" start "" "%URL%"
exit /b 0

:timeout
echo Timed out waiting for the UI at %URL%. >&2
docker compose ps >&2
docker compose logs frontend --tail 15 >&2
exit /b 1
