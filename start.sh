#!/bin/bash
# 飞牛图书启动脚本 (Linux/Mac/NAS)

set -e

echo "========================================"
echo "  飞牛图书 · 家庭读书数据中心"
echo "========================================"
echo

# 切换到脚本所在目录
cd "$(dirname "$0")"

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "[错误] 未找到 python3，请先安装 Python 3.11+"
    exit 1
fi

# 检查虚拟环境
if [ ! -d ".venv" ]; then
    echo "[初始化] 创建虚拟环境..."
    python3 -m venv .venv
fi

# 激活虚拟环境
source .venv/bin/activate

# 安装依赖
echo "[初始化] 检查依赖..."
pip install -q -r server/requirements.txt

# 创建数据目录
mkdir -p data/books data/covers

echo
echo "[启动] 正在启动服务..."
echo "[访问] http://localhost:8000"
echo "[API文档] http://localhost:8000/api/docs"
echo "[OPDS目录] http://localhost:8000/opds/v1.2/catalog"
echo "[默认账号] admin / admin123"
echo
echo "按 Ctrl+C 停止服务"
echo "----------------------------------------"

cd server
python app.py
