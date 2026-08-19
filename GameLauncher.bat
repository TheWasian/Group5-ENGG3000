@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Connect-Wacker5.ps1"

if errorlevel 1 (
    echo.
    echo The launcher failed.
    pause
)