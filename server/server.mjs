import { createServerApp } from './app.mjs';

const { server } = createServerApp();

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

server
  .listen(PORT, HOST, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`📱 Веб-версия доступна: http://localhost:${PORT}`);
  })
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Порт ${PORT} уже занят!`);
    } else {
      console.error('❌ Ошибка при запуске сервера:', err.message);
    }
    process.exit(1);
  });
