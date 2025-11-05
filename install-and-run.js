import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Проверка наличия ADB
try {
    execSync('adb version', { stdio: 'ignore' });
} catch (e) {
    console.error('❌ Ошибка: ADB не найден!');
    console.log('Установите Android SDK Platform Tools');
    console.log('Или добавьте путь к ADB в переменную PATH');
    process.exit(1);
}

const apkPath = path.join(__dirname, 'platforms', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

console.log('Проверка подключенных устройств...\n');

try {
    // Перезапускаем ADB сервер для надежности
    try {
        execSync('adb kill-server', { stdio: 'ignore' });
        execSync('adb start-server', { stdio: 'ignore' });
    } catch (e) {
        // Игнорируем ошибки при перезапуске
    }
    
    // Проверяем подключенные устройства
    const devicesOutput = execSync('adb devices', { encoding: 'utf-8' });
    console.log('Статус ADB:');
    console.log(devicesOutput);
    console.log('');
    
    const lines = devicesOutput.split('\n').filter(line => line.trim());
    
    // Пропускаем заголовок "List of devices attached"
    const deviceLines = lines.slice(1).filter(line => line.includes('\t'));
    
    // Проверяем устройства в различных состояниях
    const authorizedDevices = deviceLines.filter(line => line.includes('\tdevice'));
    const unauthorizedDevices = deviceLines.filter(line => line.includes('\tunauthorized'));
    const offlineDevices = deviceLines.filter(line => line.includes('\toffline'));
    
    if (authorizedDevices.length === 0) {
        if (unauthorizedDevices.length > 0) {
            console.error('❌ Устройство найдено, но не авторизовано!');
            console.log('\nНа телефоне появится запрос "Разрешить отладку по USB?"');
            console.log('Нажмите "Разрешить" и отметьте галочку "Всегда разрешать с этого компьютера"');
            console.log('\nПопробуйте снова после разрешения...');
        } else if (offlineDevices.length > 0) {
            console.error('❌ Устройство найдено, но находится в режиме offline!');
            console.log('\nПопробуйте:');
            console.log('1. Отключить и снова подключить USB кабель');
            console.log('2. На телефоне: Настройки → Для разработчиков → Отключите и снова включите "Отладку по USB"');
        } else {
            console.error('❌ Не найдено подключенных устройств!');
            console.log('\nПроверьте:');
            console.log('1. Телефон подключен к компьютеру по USB');
            console.log('2. Используйте оригинальный USB кабель (не все кабели поддерживают передачу данных)');
            console.log('3. На телефоне включена "Отладка по USB"');
            console.log('4. Разрешен доступ к устройству (может появиться запрос на телефоне)');
            console.log('\nДля включения отладки по USB:');
            console.log('- Настройки → О телефоне → 7 раз нажмите "Номер сборки"');
            console.log('- Настройки → Для разработчиков → Включите "Отладку по USB"');
            console.log('\nТакже проверьте, что на телефоне выбран режим "Передача файлов" (MTP),');
            console.log('а не "Только зарядка" при подключении USB.');
        }
        process.exit(1);
    }
    
    console.log(`✓ Найдено авторизованных устройств: ${authorizedDevices.length}`);
    
    // Определяем устройство для установки
    let selectedDevice = null;
    
    if (authorizedDevices.length === 1) {
        // Только одно устройство
        selectedDevice = authorizedDevices[0].split('\t')[0];
        console.log(`Используется устройство: ${selectedDevice}`);
    } else {
        // Несколько устройств - выбираем приоритет: физическое устройство > эмулятор
        const deviceIds = authorizedDevices.map(line => line.split('\t')[0]);
        
        // Ищем физическое устройство (не эмулятор)
        const physicalDevice = deviceIds.find(id => !id.startsWith('emulator-'));
        
        if (physicalDevice) {
            selectedDevice = physicalDevice;
            console.log(`Найдено несколько устройств. Используется физическое устройство: ${selectedDevice}`);
        } else {
            // Используем первый эмулятор
            selectedDevice = deviceIds[0];
            console.log(`Найдено несколько устройств. Используется эмулятор: ${selectedDevice}`);
        }
        
        console.log('\nВсе доступные устройства:');
        deviceIds.forEach((deviceId, index) => {
            const marker = deviceId === selectedDevice ? '← будет использовано' : '';
            console.log(`  ${index + 1}. ${deviceId} ${marker}`);
        });
        
        console.log('\n💡 Совет: Чтобы указать конкретное устройство, используйте:');
        console.log('   npm run install:device -- --device <device_id>');
    }
    
    // Проверяем аргумент командной строки для выбора устройства
    const args = process.argv.slice(2);
    const deviceIndex = args.indexOf('--device');
    if (deviceIndex !== -1 && args[deviceIndex + 1]) {
        const requestedDevice = args[deviceIndex + 1];
        if (authorizedDevices.some(line => line.split('\t')[0] === requestedDevice)) {
            selectedDevice = requestedDevice;
            console.log(`\n✓ Используется указанное устройство: ${selectedDevice}`);
        } else {
            console.error(`\n❌ Устройство "${requestedDevice}" не найдено!`);
            process.exit(1);
        }
    }
    
    // Функция для выполнения команд ADB с указанием устройства
    const adbCmd = (command) => {
        return `adb -s ${selectedDevice} ${command}`;
    };
    
    // Проверяем наличие APK
    if (!fs.existsSync(apkPath)) {
        console.error('\n❌ APK файл не найден!');
        console.log('Сначала выполните сборку: npm run build');
        process.exit(1);
    }
    
    console.log('\nУстановка приложения на устройство...');
    try {
        // Сначала удаляем старое приложение (если установлено)
        try {
            console.log('Удаление старой версии (если установлена)...');
            execSync(adbCmd('uninstall com.example.timeapp'), { stdio: 'ignore' });
        } catch (e) {
            // Игнорируем ошибку, если приложение не установлено
        }
        
        // Устанавливаем новую версию
        execSync(adbCmd(`install -r "${apkPath}"`), { stdio: 'inherit' });
        console.log('\n✓ Приложение установлено!');
    } catch (error) {
        console.error('\n❌ Ошибка при установке:', error.message);
        process.exit(1);
    }
    
    console.log('\nЗапуск приложения...');
    try {
        execSync(adbCmd('shell am start -n com.example.timeapp/.MainActivity'), { stdio: 'inherit' });
        console.log('\n✓ Приложение запущено на устройстве!');
    } catch (error) {
        console.error('\n❌ Ошибка при запуске:', error.message);
        process.exit(1);
    }
    
    console.log('\n✅ Готово! Приложение установлено и запущено.');
    
} catch (error) {
    console.error('Ошибка:', error.message);
    process.exit(1);
}

