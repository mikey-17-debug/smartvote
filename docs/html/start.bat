@echo off
chcp 936 >nul
cd /d "%~dp0"
title 课堂评分投票系统 - 本地服务

set "PY="
py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY (
  python --version >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo.
  echo [错误] 未找到可用的 Python 3。
  echo 请先安装 Python 3，安装时勾选 "Add Python to PATH"，然后重新双击本文件。
  echo.
  pause
  exit /b 1
)

echo.
echo 正在启动本地服务，请稍候...
echo 访问地址：http://localhost:8000/login.html
echo 提示：请保持本窗口开启，关闭窗口即停止服务。
echo.

start "" /min cmd /c "timeout /t 2 >nul & start http://localhost:8000/login.html"

%PY% -m http.server 8000

echo.
echo 服务已停止。
pause
