@echo off
color 0A
title SARNANTO_X - الخادم
echo ========================================
echo    🔥 SARNANTO_X SERVER
echo ========================================
echo.
cd /d "C:\Users\pc\Documents"
echo 📁 المجلد: %CD%
echo.
echo 📦 جاري تثبيت الاعتماديات...
call npm install
echo.
echo 🚀 جاري تشغيل الخادم...
call node index.js
pause