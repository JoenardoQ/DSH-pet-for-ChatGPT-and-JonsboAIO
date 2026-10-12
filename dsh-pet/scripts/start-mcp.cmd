@echo off
if exist "%~dp0..\runtime\node\node.exe" (
  "%~dp0..\runtime\node\node.exe" "%~dp0..\bridge\mcp.mjs"
) else (
  node "%~dp0..\bridge\mcp.mjs"
)
