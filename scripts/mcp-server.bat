@echo off
setlocal enabledelayedexpansion

set "MCP_DIR=%USERPROFILE%\.designpull"
set "PID_FILE=%MCP_DIR%\mcp-server.pid"
set "LOG_FILE=%MCP_DIR%\mcp-server.log"

if not exist "%MCP_DIR%" mkdir "%MCP_DIR%"

if "%1"=="start" goto start
if "%1"=="stop" goto stop
if "%1"=="restart" goto restart
if "%1"=="status" goto status

echo Usage: %0 {start^|stop^|restart^|status}
exit /b 1

:start
if exist "%PID_FILE%" (
    set /p PID=<"%PID_FILE%"
    tasklist /FI "PID eq !PID!" 2>nul | find "!PID!" >nul
    if !errorlevel! equ 0 (
        echo MCP server already running (PID: !PID!)
        exit /b 0
    )
    del "%PID_FILE%" 2>nul
)

REM Load .env file from current directory
if exist ".env" (
    for /f "usebackq tokens=*" %%a in (".env") do (
        set "line=%%a"
        if not "!line:~0,1!"=="#" (
            set "%%a"
        )
    )
)

echo Starting figma-console-mcp server...
set ENABLE_MCP_APPS=true
start /b "" cmd /c "npx -y figma-console-mcp@latest >> "%LOG_FILE%" 2>&1"

REM Get PID of the most recent node process (npx spawns node)
for /f "tokens=2" %%i in ('tasklist /FI "IMAGENAME eq node.exe" /NH ^| findstr /r "node"') do (
    set "LAST_PID=%%i"
)

echo !LAST_PID! > "%PID_FILE%"
echo Server started (PID: !LAST_PID!)
echo Logs: %LOG_FILE%
echo Server will listen on ws://localhost:9223
exit /b 0

:stop
if not exist "%PID_FILE%" (
    echo MCP server not running
    exit /b 0
)

set /p PID=<"%PID_FILE%"
echo Stopping MCP server (PID: %PID%)...
taskkill /PID %PID% /F >nul 2>&1
del "%PID_FILE%" 2>nul
echo Server stopped
exit /b 0

:restart
call :stop
call :start
exit /b 0

:status
if not exist "%PID_FILE%" (
    echo MCP server is not running
    exit /b 1
)

set /p PID=<"%PID_FILE%"
tasklist /FI "PID eq %PID%" 2>nul | find "%PID%" >nul
if %errorlevel% equ 0 (
    echo MCP server is running (PID: %PID%)
    exit /b 0
) else (
    echo MCP server is not running (stale PID file^)
    del "%PID_FILE%" 2>nul
    exit /b 1
)
