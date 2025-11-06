import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const isRelease = args.includes('--release');
const isMaster = args.includes('--master');
const isSlave = args.includes('--slave');
const buildType = isRelease ? 'release' : 'debug';
const appRole = isMaster ? 'master' : (isSlave ? 'slave' : 'master');

console.log(`🔨 Сборка ${appRole} приложения (${buildType})...`);

// Путь к конфигурационному файлу для slave
const slaveConfigPath = path.join(__dirname, 'slave-config.json');

// Если это slave, проверяем наличие конфигурации
if (appRole === 'slave') {
    if (!fs.existsSync(slaveConfigPath)) {
        console.error('❌ Файл slave-config.json не найден!');
        console.log('Создайте файл slave-config.json с содержимым:');
        console.log(JSON.stringify({
            deviceId: 'unique-device-id',
            userName: 'Имя пользователя'
        }, null, 2));
        process.exit(1);
    }
    
    const slaveConfig = JSON.parse(fs.readFileSync(slaveConfigPath, 'utf8'));
    console.log(`📱 Slave конфигурация: ${slaveConfig.userName} (${slaveConfig.deviceId})`);
}

// Путь к файлу cordova-app.js
const cordovaAppPath = path.join(__dirname, 'www', 'js', 'cordova-app.js');
let cordovaAppContent = fs.readFileSync(cordovaAppPath, 'utf8');

// Заменяем роль приложения
cordovaAppContent = cordovaAppContent.replace(
    /this\.role = window\.APP_ROLE \|\| 'master'/,
    `this.role = '${appRole}'`
);

// Если slave, добавляем deviceId из конфигурации
if (appRole === 'slave') {
    const slaveConfig = JSON.parse(fs.readFileSync(slaveConfigPath, 'utf8'));
    cordovaAppContent = cordovaAppContent.replace(
        /this\.deviceId = 'device_' \+ Date\.now\(\) \+ '_' \+ Math\.random\(\)\.toString\(36\)\.substr\(2, 9\);/,
        `this.deviceId = '${slaveConfig.deviceId}';`
    );
    
    // Также можно установить имя по умолчанию
    if (slaveConfig.userName) {
        const indexHtmlPath = path.join(__dirname, 'www', 'cordova.html');
        let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
        indexHtml = indexHtml.replace(
            /<input type="text" id="userName" placeholder="Ваше имя"/,
            `<input type="text" id="userName" placeholder="Ваше имя" value="${slaveConfig.userName}"`
        );
        fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
    }
}

// Сохраняем измененный файл
fs.writeFileSync(cordovaAppPath, cordovaAppContent, 'utf8');

console.log(`✅ Конфигурация применена (роль: ${appRole})`);

// Проверяем наличие Cordova платформы
const platformsPath = path.join(__dirname, 'platforms', 'android');
if (!fs.existsSync(platformsPath)) {
    console.log('📱 Добавление Android платформы...');
    execSync('npx cordova platform add android', { stdio: 'inherit', cwd: __dirname });
}

// Сборка APK
console.log(`🔨 Компиляция ${buildType} APK...`);
try {
    execSync(`npx cordova build android --${buildType}`, { 
        stdio: 'inherit', 
        cwd: __dirname 
    });
    
    console.log('✅ Сборка завершена успешно!');
    
    // Копируем APK в корень с соответствующим именем
    const apkSource = path.join(
        __dirname,
        'platforms',
        'android',
        'app',
        'build',
        'outputs',
        'apk',
        buildType,
        buildType === 'release' ? 'app-release-unsigned.apk' : 'app-debug.apk'
    );
    
    if (fs.existsSync(apkSource)) {
        const apkName = appRole === 'master' 
            ? `app-${appRole}-${buildType}.apk`
            : `app-${appRole}-${buildType}.apk`;
        const apkDest = path.join(__dirname, apkName);
        fs.copyFileSync(apkSource, apkDest);
        console.log(`✅ APK скопирован: ${apkName}`);
    }
    
} catch (error) {
    console.error('❌ Ошибка при сборке:', error.message);
    process.exit(1);
}

