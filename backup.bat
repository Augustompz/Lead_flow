@echo off
rem Copia o banco de dados (todos os leads, vendas e custos) para a pasta backups.
cd /d "%~dp0"
if not exist local.db (
  echo Nao achei o local.db. Se voce usa o Turso, o backup e feito la.
  pause
  exit /b 1
)
if not exist backups mkdir backups
set STAMP=%date:~-4%-%date:~3,2%-%date:~0,2%_%time:~0,2%%time:~3,2%
set STAMP=%STAMP: =0%
copy /y local.db "backups\local-%STAMP%.db" >nul
echo Backup salvo em backups\local-%STAMP%.db
pause
