# 飞牛图书 Dockerfile
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# 安装系统依赖（部分电子书处理库需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libxml2-dev \
    libxslt1-dev \
    libjpeg-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件并安装
COPY server/requirements.txt ./server/
RUN pip install --no-cache-dir -r server/requirements.txt

# 复制项目文件
COPY server/ ./server/
COPY web/ ./web/

# 创建数据目录
RUN mkdir -p /app/data/books /app/data/covers

# 暴露端口
EXPOSE 8000

# 设置工作目录到 server
WORKDIR /app/server

# 启动命令
CMD ["python", "app.py"]
