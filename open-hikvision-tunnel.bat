@echo off
title Hikvision tunnel via karasu-bridge
setlocal

set "BRIDGE_HOST=karasu-bridge"
set "BRIDGE_IP=100.107.225.34"
set "BRIDGE_USER=admina"
set "ENTRY_LOCAL_PORT=8448"
set "EXIT_LOCAL_PORT=8447"
set "ENTRY_DEVICE=192.168.1.8:443"
set "EXIT_DEVICE=192.168.1.7:443"

echo.
echo Opening Hikvision terminals through Tailscale bridge...
echo.
echo Entry terminal:
echo   https://localhost:%ENTRY_LOCAL_PORT%
echo.
echo Exit terminal:
echo   https://localhost:%EXIT_LOCAL_PORT%
echo.
echo Keep this window open while using Hikvision.
echo Close this window to stop the tunnel.
echo.

where tailscale >nul 2>nul
if errorlevel 1 (
    echo ERROR: Tailscale is not installed or not available in PATH.
    echo Install/open Tailscale and sign in first.
    echo.
    pause
    exit /b 1
)

set "BRIDGE_STATUS="
for /f "tokens=*" %%L in ('tailscale status 2^>nul ^| findstr /I "%BRIDGE_HOST%"') do set "BRIDGE_STATUS=%%L"
if not defined BRIDGE_STATUS (
    echo ERROR: %BRIDGE_HOST% was not found in Tailscale status.
    echo Check that the mini PC is connected to the same Tailscale account.
    echo.
    tailscale status
    echo.
    pause
    exit /b 1
)

echo Bridge status:
echo   %BRIDGE_STATUS%
echo.
echo %BRIDGE_STATUS% | findstr /I "offline" >nul
if not errorlevel 1 (
    echo ERROR: %BRIDGE_HOST% is offline in Tailscale.
    echo Turn on the mini PC / restart Tailscale there, then run this file again.
    echo.
    pause
    exit /b 1
)

echo Starting SSH tunnel...
ssh -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -N -L %EXIT_LOCAL_PORT%:%EXIT_DEVICE% -L %ENTRY_LOCAL_PORT%:%ENTRY_DEVICE% %BRIDGE_USER%@%BRIDGE_IP%
if errorlevel 1 (
    echo.
    echo ERROR: SSH tunnel failed.
    echo Check that %BRIDGE_HOST% is online, SSH is running, and local ports %EXIT_LOCAL_PORT%/%ENTRY_LOCAL_PORT% are free.
)
echo.
echo Tunnel closed.
pause
