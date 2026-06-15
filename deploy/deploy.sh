#!/usr/bin/env bash
set -euo pipefail

# Скрипт деплоя на Ubuntu Server
# Использование: sudo bash deploy/deploy.sh [repo-url] [branch]
#   repo-url  - URL git-репозитория (по умолчанию: из .git/config или вручную)
#   branch    - ветка (по умолчанию: main)

APP_DIR="/opt/pdf-dossier-splitter"
REPO_URL="${1:-}"
BRANCH="${2:-main}"

# Если REPO_URL не указан, пытаемся взять из локального git
if [ -z "$REPO_URL" ] && [ -f ".git/config" ]; then
    REPO_URL=$(git config --get remote.origin.url 2>/dev/null || echo "")
fi

if [ -z "$REPO_URL" ]; then
    echo "Ошибка: укажите URL репозитория"
    echo "  sudo bash $0 https://github.com/user/repo.git [branch]"
    exit 1
fi

echo "=== PDF Dossier Splitter Deploy ==="
echo "  Repo: $REPO_URL"
echo "  Branch: $BRANCH"
echo "  Target: $APP_DIR"

# Системные зависимости
apt-get update
apt-get install -y python3.11 python3.11-venv python3.11-dev nginx git nodejs npm

# Клонирование / обновление
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR"
    git fetch origin
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
else
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# Python venv
if [ ! -d "venv" ]; then
    python3.11 -m venv venv
fi
source venv/bin/activate

# Установка зависимостей с GPU-поддержкой
pip install --upgrade pip
pip install paddlepaddle-gpu==3.0.0rc0 -f https://www.paddlepaddle.org.cn/whl/linux/cuda12/stable.html
pip install -r backend/requirements.prod.txt
pip install -r backend/requirements.ml.txt

# .env
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "!!! Отредактируйте .env перед запуском: nano $APP_DIR/.env !!!"
fi

# Директории данных
mkdir -p data/input data/output data/temp logs

# Frontend
cd frontend
npm install
npm run build
cd ..

# Systemd
sed "s|/opt/pdf-dossier-splitter|$APP_DIR|g" deploy/pdf-splitter.service > /etc/systemd/system/pdf-splitter.service
systemctl daemon-reload
systemctl enable pdf-splitter
systemctl restart pdf-splitter

# Nginx
sed "s|/opt/pdf-dossier-splitter|$APP_DIR|g" deploy/nginx.conf > /etc/nginx/sites-available/pdf-splitter
ln -sf /etc/nginx/sites-available/pdf-splitter /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

echo "=== Deploy complete ==="
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "<server-ip>")
echo "  API: http://$SERVER_IP/api/"
echo "  UI:  http://$SERVER_IP/"
echo "  Документация: http://$SERVER_IP/api/docs"
echo ""
echo "  !!! Не забудьте отредактировать .env: nano $APP_DIR/.env !!!"
