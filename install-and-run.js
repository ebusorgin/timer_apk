const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
    authorizedDevices.forEach((line, index) => {
        const deviceId = line.split('\t')[0];
        console.log(`  ${index + 1}. ${deviceId}`);
    });
    
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
            execSync('adb uninstall com.example.timeapp', { stdio: 'ignore' });
        } catch (e) {
            // Игнорируем ошибку, если приложение не установлено
        }
        
        // Устанавливаем новую версию
        execSync(`adb install -r "${apkPath}"`, { stdio: 'inherit' });
        console.log('\n✓ Приложение установлено!');
    } catch (error) {
        console.error('\n❌ Ошибка при установке:', error.message);
        process.exit(1);
    }
    
    console.log('\nЗапуск приложения...');
    try {
        execSync('adb shell am start -n com.example.timeapp/.MainActivity', { stdio: 'inherit' });
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

