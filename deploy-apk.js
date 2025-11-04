/**
 * Единый скрипт для компиляции и загрузки APK на сервер
 * Кроссплатформенный (Windows/Linux)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[34m',
  blue: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

// Конфигурация из переменных окружения
const config = {
  SERVER_HOST: process.env.SERVER_HOST || '82.146.44.126',
  SERVER_USER: process.env.SERVER_USER || 'root',
  APP_DIR: process.env.APP_DIR || '/opt/voice-room',
  SSH_PASSWORD: process.env.SSH_PASSWORD || 'carFds43',
  BUILD_TYPE: process.argv.includes('--release') ? 'release' : 'debug',
};

// Определение операционной системы
const isWindows = process.platform === 'win32';

/**
 * Выполняет команду и возвращает результат
 */
function execCommand(command, options = {}) {
  try {
    const result = execSync(command, {
      stdio: options.silent ? 'pipe' : 'inherit',
      encoding: 'utf8',
      ...options,
    });
    return { success: true, output: result };
  } catch (error) {
    return { success: false, error: error.message, output: error.stdout?.toString() || '' };
  }
}

/**
 * Проверяет наличие файла
 */
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath) && statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Получает размер файла в MB
 */
function getFileSizeMB(filePath) {
  try {
    const stats = statSync(filePath);
    return (stats.size / 1024 / 1024).toFixed(2);
  } catch {
    return '0';
  }
}

/**
 * Находит APK файл после сборки
 */
function findAPKFile(buildType) {
  const possiblePaths = [
    path.join(__dirname, buildType === 'release' ? 'app-release.apk' : 'app-debug.apk'),
    path.join(__dirname, 'platforms', 'android', 'app', 'build', 'outputs', 'apk', buildType, `app-${buildType}.apk`),
    path.join(__dirname, 'platforms', 'android', 'app', 'build', 'outputs', 'apk', buildType, `app-${buildType === 'release' ? 'release-unsigned.apk' : 'debug.apk'}`),
  ];

  for (const apkPath of possiblePaths) {
    if (fileExists(apkPath)) {
      const size = getFileSizeMB(apkPath);
      const stats = statSync(apkPath);
      
      // Проверка валидности APK (должен быть больше 100KB)
      if (stats.size < 100 * 1024) {
        logWarning(`APK файл слишком маленький (${size} MB), возможно поврежден`);
        continue;
      }
      
      return { path: apkPath, size };
    }
  }

  return null;
}

/**
 * Компилирует APK
 */
function buildAPK(buildType) {
  logInfo(`Начало компиляции ${buildType} APK...`);
  
  const buildCommand = buildType === 'release' ? 'npm run build:release' : 'npm run build';
  log(`Выполняется: ${buildCommand}`, 'cyan');
  
  const result = execCommand(buildCommand);
  
  if (!result.success) {
    logError(`Ошибка при компиляции: ${result.error}`);
    return false;
  }
  
  logSuccess('Компиляция завершена успешно!');
  return true;
}

/**
 * Загружает APK на сервер используя SCP
 */
function uploadAPK(apkPath, buildType) {
  logInfo(`Загрузка APK на сервер ${config.SERVER_USER}@${config.SERVER_HOST}...`);
  
  const fileName = buildType === 'release' ? 'app-release.apk' : 'app-debug.apk';
  const remotePath = `${config.APP_DIR}/${fileName}`;
  const target = `${config.SERVER_USER}@${config.SERVER_HOST}:${remotePath}`;
  
  // Используем абсолютный путь для Windows
  const localPath = path.resolve(apkPath);
  
  let scpCommand;
  
  if (isWindows) {
    // Для Windows используем scp напрямую (должен быть в PATH)
    // Если нужен пароль, используем sshpass альтернативу или PowerShell
    logInfo('Использование SCP для Windows...');
    
    // Проверяем наличие sshpass или используем обычный scp
    const sshpassCheck = execCommand('sshpass -V', { silent: true });
    
    if (sshpassCheck.success) {
      // Используем sshpass для автоматической передачи пароля
      scpCommand = `sshpass -p "${config.SSH_PASSWORD}" scp -o StrictHostKeyChecking=no "${localPath}" "${target}"`;
    } else {
      // Используем обычный scp (потребует ввод пароля)
      logWarning('sshpass не найден, будет использован обычный scp');
      logWarning('Пароль будет запрошен вручную');
      scpCommand = `scp -o StrictHostKeyChecking=no "${localPath}" "${target}"`;
    }
  } else {
    // Для Linux/Mac
    const sshpassCheck = execCommand('which sshpass', { silent: true });
    
    if (sshpassCheck.success) {
      scpCommand = `sshpass -p "${config.SSH_PASSWORD}" scp -o StrictHostKeyChecking=no "${localPath}" "${target}"`;
    } else {
      logWarning('sshpass не найден, будет использован обычный scp');
      logWarning('Пароль будет запрошен вручную');
      scpCommand = `scp -o StrictHostKeyChecking=no "${localPath}" "${target}"`;
    }
  }
  
  log(`Выполняется: scp ${path.basename(localPath)} → ${target}`, 'cyan');
  
  const result = execCommand(scpCommand);
  
  if (!result.success) {
    logError(`Ошибка при загрузке: ${result.error}`);
    logInfo('Попробуйте вручную:');
    logInfo(`  scp "${localPath}" "${target}"`);
    return false;
  }
  
  logSuccess(`APK успешно загружен на сервер!`);
  logInfo(`Файл доступен по адресу: https://aiternitas.ru/download/apk`);
  
  return true;
}

/**
 * Проверяет доступность сервера
 */
function checkServerAvailability() {
  logInfo('Проверка доступности сервера...');
  
  const pingCommand = isWindows 
    ? `ping -n 1 ${config.SERVER_HOST}`
    : `ping -c 1 ${config.SERVER_HOST}`;
  
  const result = execCommand(pingCommand, { silent: true });
  
  if (!result.success) {
    logWarning('Не удалось проверить доступность сервера (ping failed)');
    logWarning('Продолжаем попытку загрузки...');
  } else {
    logSuccess('Сервер доступен');
  }
}

/**
 * Главная функция
 */
async function main() {
  log('🚀 Начало процесса деплоя APK', 'bright');
  log(`Тип сборки: ${config.BUILD_TYPE}`, 'cyan');
  log(`Сервер: ${config.SERVER_USER}@${config.SERVER_HOST}:${config.APP_DIR}`, 'cyan');
  log('');
  
  // Шаг 1: Компиляция
  log('📦 Шаг 1: Компиляция APK', 'bright');
  if (!buildAPK(config.BUILD_TYPE)) {
    logError('Компиляция не удалась. Прерывание процесса.');
    process.exit(1);
  }
  
  // Шаг 2: Поиск APK файла
  log('');
  log('🔍 Шаг 2: Поиск скомпилированного APK', 'bright');
  const apkInfo = findAPKFile(config.BUILD_TYPE);
  
  if (!apkInfo) {
    logError('APK файл не найден после компиляции!');
    logInfo('Проверьте пути:');
    logInfo(`  - ${path.join(__dirname, config.BUILD_TYPE === 'release' ? 'app-release.apk' : 'app-debug.apk')}`);
    logInfo(`  - platforms/android/app/build/outputs/apk/${config.BUILD_TYPE}/`);
    process.exit(1);
  }
  
  logSuccess(`APK найден: ${apkInfo.path}`);
  logInfo(`Размер: ${apkInfo.size} MB`);
  
  // Шаг 3: Проверка сервера
  log('');
  log('🌐 Шаг 3: Проверка доступности сервера', 'bright');
  checkServerAvailability();
  
  // Шаг 4: Загрузка на сервер
  log('');
  log('📤 Шаг 4: Загрузка APK на сервер', 'bright');
  if (!uploadAPK(apkInfo.path, config.BUILD_TYPE)) {
    logError('Загрузка не удалась.');
    process.exit(1);
  }
  
  // Успешное завершение
  log('');
  logSuccess('🎉 Деплой завершен успешно!');
  logInfo(`APK доступен на сервере: ${config.APP_DIR}/${config.BUILD_TYPE === 'release' ? 'app-release.apk' : 'app-debug.apk'}`);
  logInfo(`URL для скачивания: https://aiternitas.ru/download/apk`);
}

// Обработка ошибок
process.on('unhandledRejection', (error) => {
  logError(`Необработанная ошибка: ${error.message}`);
  process.exit(1);
});

// Запуск
main().catch((error) => {
  logError(`Критическая ошибка: ${error.message}`);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
