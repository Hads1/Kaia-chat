@echo off
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (echo Execute INSTALAR.bat primeiro. & pause & exit /b 1)
.venv\Scripts\python.exe leitor_chat_app.py
if errorlevel 1 pause
