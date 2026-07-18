@echo off
chcp 65001 >nul
title 飞牛图书 · 家庭读书数据中心

echo ========================================
echo   飞牛图书 · 家庭读书数据中心
echo ========================================
echo.

REM 检查 Python 环境
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python 3.11+
    pause
    exit /b 1
)

REM 切换到脚本所在目录
cd /d "%~dp0"

REM 检查虚拟环境
if not exist ".venv\Scripts\python.exe" (
    echo [初始化] 创建虚拟环境...
    python -m venv .venv
)

REM 激活虚拟环境
call .venv\Scripts\activate.bat

REM 安装依赖
echo [初始化] 检查依赖...
pip install -q -r server\requirements.txt
if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络连接
    pause
    exit /b 1
)

REM 创建数据目录
if not exist "data\books" mkdir "data\books"
if not exist "data\covers" mkdir "data\covers"

echo.
echo [启动] 正在启动服务...
echo [访问] http://localhost:8000
echo [API文档] http://localhost:8000/api/docs
echo [OPDS目录] http://localhost:8000/opds/v1.2/catalog
echo [默认账号] admin / admin123
echo.
echo 按 Ctrl+C 停止服务
echo ----------------------------------------

cd server
python app.py

pause
