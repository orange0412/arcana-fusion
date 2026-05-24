#!/bin/bash
# Arcana Fusion 启动脚本
# 在 Git Bash 中双击运行，或用 bash start.sh 启动

echo "✨ Arcana Fusion 启动中..."

# 使用嵌入版 Python
PYTHON="/c/Users/orang/Python312/python.exe"

# 切换到项目目录
cd "$(dirname "$0")"

echo "📡 启动服务器..."
echo "🌐 打开浏览器访问: http://127.0.0.1:5000"
echo "📝 按 Ctrl+C 停止服务器"
echo ""

$PYTHON app.py

# 如果出错，暂停以便查看错误
echo ""
echo "❌ 服务器已停止"
read -p "按 Enter 键退出..."
