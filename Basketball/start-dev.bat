@echo off
setlocal

REM --- read PORT from environment (falls back to 3000)
if "%PORT%"=="" set PORT=3000

REM --- open browser only on first run
if not exist ".browser_opened" (
  start "" http://localhost:%PORT%
  echo 1 > .browser_opened
)

cls
node index.js

endlocal


