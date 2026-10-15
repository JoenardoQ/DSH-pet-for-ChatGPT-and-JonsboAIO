@echo off
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\windows-launcher.ps1" -Mode stop
