@echo off
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0..\..\scripts\windows-launcher.ps1" -Mode mcp
