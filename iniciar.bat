@echo off
rem Inicia o LeadFlow no Windows: instala o que faltar, compila e abre no navegador.
cd /d "%~dp0"
if not exist node_modules call npm install
if not exist .env.local (
  echo Falta o arquivo .env.local. Copie o .env.example para .env.local e preencha.
  pause
  exit /b 1
)
rem Recompila sempre, para pegar qualquer atualizacao do codigo.
call npm run build
if errorlevel 1 (
  echo A compilacao falhou.
  pause
  exit /b 1
)
start "" http://localhost:3100
call npm run start
