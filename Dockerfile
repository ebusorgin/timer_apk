FROM node:20-alpine

WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код
COPY server/ ./server/
COPY www/ ./www/
COPY config.xml ./

# Создаем непривилегированного пользователя
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Меняем владельца файлов
RUN chown -R nodejs:nodejs /app

USER nodejs

# Открываем порт
EXPOSE 3000

# Переменные окружения по умолчанию
ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

# Запускаем сервер
CMD ["node", "server/server.mjs"]

