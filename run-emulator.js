const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Проверка наличия node_modules
const nodeModulesPath = path.join(__dirname, 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
    console.error('❌ Ошибка: Папка node_modules не найдена!');
    console.log('Выполните: npm install');
    process.exit(1);
}

const apkPath = path.join(__dirname, 'platforms', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const packageName = 'com.example.timeapp';

// Вспомогательная функция для задержки
function sleep(ms) {
    const start = Date.now();
    while (Date.now() - start < ms) {}
}

// Получаем путь к Android SDK
const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || 
                    path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
const emulatorPath = path.join(androidHome, 'emulator', 'emulator.exe');
const adbPath = path.join(androidHome, 'platform-tools', 'adb.exe');

console.log('Запуск приложения в эмуляторе...\n');

// Функция для проверки наличия файлов
function checkPaths() {
    if (!fs.existsSync(emulatorPath)) {
        console.error(`❌ Эмулятор не найден по пути: ${emulatorPath}`);
        console.log('\nПроверьте, что:');
        console.log('1. Android SDK установлен');
        console.log('2. Переменная окружения ANDROID_HOME установлена корректно');
        console.log('3. Emulator установлен через Android SDK Manager');
        process.exit(1);
    }
    
    if (!fs.existsSync(adbPath)) {
        console.error(`❌ ADB не найден по пути: ${adbPath}`);
        console.log('\nУстановите Android SDK Platform-Tools');
        process.exit(1);
    }
    
    if (!fs.existsSync(apkPath)) {
        console.error('\n❌ APK файл не найден!');
        console.log('Сначала выполните сборку: npm run build');
        process.exit(1);
    }
}

// Функция для запуска ADB команд
function adbCommand(command, options = {}) {
    try {
        return execSync(`"${adbPath}" ${command}`, { 
            encoding: 'utf-8',
            ...options 
        });
    } catch (error) {
        if (options.ignoreErrors) {
            return '';
        }
        throw error;
    }
}

// Функция для получения списка запущенных эмуляторов
function getRunningEmulators() {
    try {
        adbCommand('start-server', { stdio: 'ignore', ignoreErrors: true });
        const devicesOutput = adbCommand('devices');
        const lines = devicesOutput.split('\n').filter(line => line.trim());
        const deviceLines = lines.slice(1).filter(line => line.includes('\t'));
        return deviceLines.filter(line => {
            const parts = line.split('\t');
            return parts.length > 1 && parts[1].trim() === 'device';
        });
    } catch (error) {
        return [];
    }
}

// Функция для получения списка доступных AVD
function getAvailableAvds() {
    try {
        const avdsOutput = execSync(`"${emulatorPath}" -list-avds`, { encoding: 'utf-8' });
        const avds = avdsOutput.split('\n').filter(line => line.trim());
        return avds;
    } catch (error) {
        console.error('❌ Ошибка при получении списка AVD:', error.message);
        process.exit(1);
    }
}

// Функция для ожидания готовности эмулятора (синхронная версия)
function waitForEmulatorSync(maxWaitTime = 120000) {
    console.log('Ожидание загрузки эмулятора...');
    const startTime = Date.now();
    let lastDotTime = startTime;
    
    while (true) {
        const elapsed = Date.now() - startTime;
        
        if (elapsed > maxWaitTime) {
            throw new Error('Превышено время ожидания загрузки эмулятора');
        }
        
        try {
            // Проверяем, что устройство подключено
            adbCommand('wait-for-device', { stdio: 'ignore', timeout: 5000 });
            
            // Проверяем, что Android загрузился (boot_completed)
            const bootCheck = adbCommand('shell getprop sys.boot_completed', { stdio: 'ignore' });
            if (bootCheck.trim() === '1') {
                // Дополнительная проверка - ждем еще немного для полной инициализации
                sleep(3000);
                console.log('');
                return;
            }
        } catch (e) {
            // Устройство еще не готово, продолжаем ждать
        }
        
        // Показываем прогресс каждые 2 секунды
        if (Date.now() - lastDotTime >= 2000) {
            process.stdout.write('.');
            lastDotTime = Date.now();
        }
        
        // Небольшая задержка перед следующей проверкой
        sleep(500);
    }
}

// Функция для запуска эмулятора
function startEmulator(avdName) {
    console.log(`Запуск эмулятора: ${avdName}...`);
    console.log('(Это может занять некоторое время при первом запуске)\n');
    
    // Запускаем эмулятор в фоновом режиме
    const emulatorProcess = spawn(`"${emulatorPath}"`, ['-avd', avdName], {
        shell: true,
        detached: true,
        stdio: 'ignore'
    });
    
    emulatorProcess.unref(); // Позволяем процессу продолжать работать после выхода из скрипта
    
    return emulatorProcess;
}

try {
    // Проверяем наличие необходимых файлов
    checkPaths();
    
    // Проверяем запущенные эмуляторы
    console.log('Проверка запущенных эмуляторов...');
    const runningEmulators = getRunningEmulators();
    
    if (runningEmulators.length > 0) {
        console.log(`✓ Найден запущенный эмулятор: ${runningEmulators[0].split('\t')[0]}`);
        console.log('Используется существующий эмулятор.\n');
    } else {
        console.log('Эмулятор не запущен. Запускаю новый...\n');
        
        // Получаем список доступных AVD
        const avds = getAvailableAvds();
        
        if (avds.length === 0) {
            console.error('❌ Не найдено доступных AVD (Android Virtual Devices)!');
            console.log('\nСоздайте AVD через Android Studio:');
            console.log('Tools → Device Manager → Create Device');
            process.exit(1);
        }
        
        // Используем первый доступный AVD
        const selectedAvd = avds[0];
        console.log(`Доступные AVD: ${avds.join(', ')}`);
        console.log(`Используется: ${selectedAvd}\n`);
        
        // Запускаем эмулятор
        startEmulator(selectedAvd);
        
        // Ждем загрузки эмулятора
        waitForEmulatorSync();
        console.log('✓ Эмулятор готов!\n');
    }
    
    // Устанавливаем приложение
    console.log('Установка приложения на эмулятор...');
    try {
        // Удаляем старое приложение (если установлено)
        adbCommand(`uninstall ${packageName}`, { stdio: 'ignore', ignoreErrors: true });
        
        // Устанавливаем новую версию
        adbCommand(`install -r "${apkPath}"`, { stdio: 'inherit' });
        console.log('\n✓ Приложение установлено!');
    } catch (error) {
        console.error('\n❌ Ошибка при установке:', error.message);
        process.exit(1);
    }
    
    // Запускаем приложение
    console.log('\nЗапуск приложения...');
    try {
        adbCommand(`shell am start -n ${packageName}/.MainActivity`, { stdio: 'inherit' });
        console.log('\n✓ Приложение запущено на эмуляторе!');
    } catch (error) {
        console.error('\n❌ Ошибка при запуске:', error.message);
        process.exit(1);
    }
    
    console.log('\n✅ Готово! Приложение установлено и запущено в эмуляторе.');
    console.log('\n💡 Совет: Эмулятор будет работать в фоновом режиме.');
    console.log('   Закройте окно эмулятора, если хотите его остановить.\n');
    
} catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    process.exit(1);
}

