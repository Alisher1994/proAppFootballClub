@echo off
title Hikvision tunnel via karasu-bridge
echo.
echo Opening Hikvision terminals through Tailscale bridge...
echo.
echo Entry terminal:
echo   https://localhost:8448
echo.
echo Exit terminal:
echo   https://localhost:8447
echo.
echo Keep this window open while using Hikvision.
echo Close this window to stop the tunnel.
echo.
ssh -N -L 8447:192.168.1.7:443 -L 8448:192.168.1.8:443 admina@100.107.225.34
echo.
echo Tunnel closed.
pause
