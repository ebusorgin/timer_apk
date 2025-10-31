const { execSync } = require('child_process');
const os = require('os');

console.log('=== Диагностика подключения Android устройства ===\n');

// Проверка ADB
console.log('1. Проверка ADB...');
try {
    const adbVersion = execSync('adb version', { encoding: 'utf-8' });
    console.log('✓ ADB установлен:');
    console.log(adbVersion.split('\n')[0]);
} catch (e) {
    console.error('❌ ADB не найден!');
    console.log('Установите Android SDK Platform Tools');
    process.exit(1);
}

console.log('\n2. Перезапуск ADB сервера...');
try {
    execSync('adb kill-server', { stdio: 'ignore' });
    execSync('adb start-server', { stdio: 'ignore' });
    console.log('✓ ADB сервер перезапущен');
} catch (e) {
    console.error('❌ Ошибка при перезапуске ADB сервера');
}

console.log('\n3. Проверка подключенных устройств...');
try {
    const devicesOutput = execSync('adb devices', { encoding: 'utf-8' });
    console.log(devicesOutput);
    
    const lines = devicesOutput.split('\n').filter(line => line.trim());
    const deviceLines = lines.slice(1).filter(line => line.includes('\t'));
    
    if (deviceLines.length === 0) {
        console.log('\n❌ Устройства не найдены через ADB');
        console.log('\n=== Дополнительная диагностика ===\n');
        
        // Проверка USB устройств в Windows
        if (os.platform() === 'win32') {
            console.log('4. Проверка USB устройств Windows...');
            try {
                const usbDevices = execSync('powershell "Get-PnpDevice -Class USB | Where-Object {$_.Status -eq \'OK\'} | Select-Object FriendlyName, InstanceId | Format-Table -AutoSize"', { encoding: 'utf-8' });
                console.log('USB устройства:');
                console.log(usbDevices);
            } catch (e) {
                console.log('Не удалось получить список USB устройств');
            }
            
            console.log('\n5. Рекомендации для Windows:');
            console.log('   a) Установите драйверы USB для вашего телефона:');
            console.log('      - Зайдите на сайт производителя телефона');
            console.log('      - Скачайте USB драйверы или программное обеспечение (например, Samsung USB Driver, Xiaomi USB Driver)');
            console.log('   b) Или установите универсальный ADB драйвер:');
            console.log('      - Скачайте Universal ADB Driver с сайта github.com/koush/UniversalAdbDriver');
            console.log('   c) Проверьте в Диспетчере устройств:');
            console.log('      - Откройте Диспетчер устройств (Win+X → Диспетчер устройств)');
            console.log('      - Найдите ваше устройство (может быть в разделе "Другие устройства" с желтым треугольником)');
            console.log('      - Обновите драйвер, выбрав "Поиск драйверов на этом компьютере"');
            console.log('      - Укажите путь к папке с драйверами');
        }
    } else {
        console.log('✓ Устройства найдены!');
        deviceLines.forEach((line, index) => {
            const parts = line.split('\t');
            const deviceId = parts[0];
            const status = parts[1];
            console.log(`   Устройство ${index + 1}: ${deviceId} - ${status}`);
        });
    }
} catch (e) {
    console.error('Ошибка при проверке устройств:', e.message);
}

console.log('\n=== Общие рекомендации ===\n');
console.log('1. Попробуйте другой USB порт (предпочтительно USB 2.0, не USB 3.0)');
console.log('2. Попробуйте другой USB кабель');
console.log('3. Убедитесь, что на телефоне:');
console.log('   - Включена "Отладка по USB"');
console.log('   - Выбран режим "Передача файлов" (MTP)');
console.log('   - Разрешена отладка для этого компьютера');
console.log('4. На некоторых телефонах нужно дополнительно включить:');
console.log('   - "Разрешить USB отладку (безопасность)"');
console.log('   - "Установка через USB"');
console.log('\n5. После установки драйверов перезагрузите компьютер');

