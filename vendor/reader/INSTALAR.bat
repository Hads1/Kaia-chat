@echo off
cd /d "%~dp0"
py -3 -m venv .venv
if errorlevel 1 goto erro
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto erro
echo Instalacao concluida. FFmpeg com ffplay deve estar no PATH.
pause
exit /b
:erro
echo Instalacao falhou. Verifique Python 3.11 ou superior e internet.
pause
