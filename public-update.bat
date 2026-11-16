@echo off
chcp 65001 > nul
echo ========================================
echo  ニコすこ！ サイト更新＆公開ツール
echo ========================================
echo.

echo 📦 変更されたファイルをまとめています...
git add .

echo 📝 変更内容を記録しています...
git commit -m "Auto update: update site and data"

echo 🚀 GitHubへアップロード中（公開版に反映）...
git push origin main

echo.
echo ========================================
echo  ✨ すべての更新が完了しました！
echo ========================================
pause