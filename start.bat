@echo off
chcp 65001 >nul
echo ✨ Arcana Fusion 启动中...
echo.

cd /d "%~dp0"

"C:\Users\orang\Python312\python.exe" app.py

echo.
echo ❌ 服务器已停止
pause
