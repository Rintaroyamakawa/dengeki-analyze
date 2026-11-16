@echo off
cd /d %~dp0
echo ニコすこ！のローカルサーバーを起動しています...
start http://localhost:3000/admin
npm run dev
pause