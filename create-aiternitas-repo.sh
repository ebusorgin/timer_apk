#!/bin/bash
# Скрипт для создания репозитория Aiternitas

set -e

echo "🚀 Создание репозитория Aiternitas..."

cd aiternitas.ru

# Инициализировать git если еще не инициализирован
if [ ! -d ".git" ]; then
    git init
    echo "✅ Git репозиторий инициализирован"
fi

# Добавить все файлы
git add .

# Создать первый коммит
git commit -m "Initial commit: Aiternitas landing page" || echo "Уже есть коммиты"

# Создать ветку production если еще не создана
git checkout -b production 2>/dev/null || git checkout production

# Добавить remote (замените на ваш URL)
echo ""
echo "📝 Добавьте remote репозиторий:"
echo "   git remote add origin git@github.com:ebusorgin/aiternitas.git"
echo ""
echo "📤 Затем запушите:"
echo "   git push -u origin production"
echo "   git push -u origin main"

