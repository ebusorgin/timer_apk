import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Функция для рекурсивного копирования директории
function copyDirSync(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// Проверка наличия необходимых папок
const wwwPath = path.join(__dirname, 'www');
if (!fs.existsSync(wwwPath)) {
    console.error('❌ Ошибка: Папка www не найдена!');
    process.exit(1);
}

// Проверка наличия node_modules
const nodeModulesPath = path.join(__dirname, 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
    console.error('❌ Ошибка: Папка node_modules не найдена!');
    console.log('Выполните: npm install');
    process.exit(1);
}

// Проверяем, существует ли платформа Android
const platformsPath = path.join(__dirname, 'platforms', 'android');

if (!fs.existsSync(platformsPath)) {
    console.log('Добавление платформы Android...');
    try {
        execSync('npx cordova platform add android', { stdio: 'inherit' });
        console.log('Платформа Android добавлена.');
    } catch (error) {
        console.error('Ошибка при добавлении платформы:', error.message);
        process.exit(1);
    }
} else {
    console.log('Платформа Android уже добавлена.');
}

// Подготавливаем файлы (копируем www в platforms)
console.log('Подготовка файлов...');
let prepareFailed = false;
try {
    execSync('npx cordova prepare android', { stdio: 'inherit' });
    console.log('Файлы подготовлены.');
} catch (error) {
    console.warn('⚠️  Ошибка при подготовке файлов через Cordova:', error.message);
    console.log('Попытка восстановления платформы Android...');
    
    // Пробуем пересоздать платформу
    try {
        console.log('Удаление поврежденной платформы...');
        if (fs.existsSync(platformsPath)) {
            execSync('npx cordova platform remove android', { stdio: 'pipe' });
        }
        console.log('Добавление платформы заново...');
        execSync('npx cordova platform add android', { stdio: 'inherit' });
        console.log('Платформа восстановлена. Повторная попытка prepare...');
        execSync('npx cordova prepare android', { stdio: 'inherit' });
        console.log('✅ Файлы подготовлены после восстановления.');
    } catch (recoveryError) {
        console.warn('⚠️  Восстановление не удалось:', recoveryError.message);
        console.log('Продолжаем сборку без prepare (файлы могут быть устаревшими)...');
        prepareFailed = true;
        
        // Проверяем, есть ли хотя бы основные файлы
        const wwwDest = path.join(platformsPath, 'app', 'src', 'main', 'assets', 'www');
        if (!fs.existsSync(wwwDest)) {
            console.log('Копирование www файлов вручную...');
            const wwwSrc = path.join(__dirname, 'www');
            if (fs.existsSync(wwwSrc)) {
                // Создаем директорию если её нет
                fs.mkdirSync(wwwDest, { recursive: true });
                // Копируем файлы
                copyDirSync(wwwSrc, wwwDest);
                console.log('✅ www файлы скопированы вручную.');
            }
        }
    }
}

// Проверяем наличие Gradle Wrapper и используем его напрямую для сборки
const gradlewPath = path.join(platformsPath, 'gradlew.bat');
const gradleWrapperJar = path.join(platformsPath, 'gradle', 'wrapper', 'gradle-wrapper.jar');

if (fs.existsSync(gradlewPath) && fs.existsSync(gradleWrapperJar)) {
    console.log('Использование Gradle Wrapper для сборки...');
    const originalDir = process.cwd();
    process.chdir(platformsPath);
    try {
        // Определяем тип сборки
        const isRelease = process.argv.includes('--release');
        const buildType = isRelease ? 'assembleRelease' : 'assembleDebug';
        
        // Используем gradlew напрямую для сборки APK
        execSync(`.\\gradlew.bat ${buildType}`, { stdio: 'inherit' });
        console.log('\n✓ Сборка завершена успешно!');
        const outputPath = isRelease 
            ? 'app\\build\\outputs\\apk\\release\\app-release-unsigned.apk'
            : 'app\\build\\outputs\\apk\\debug\\app-debug.apk';
        console.log(`APK файл находится в: ${outputPath}`);
        
        // Копируем APK в корень проекта для удобства
        const apkSource = path.join(platformsPath, outputPath.replace(/\\/g, path.sep));
        const apkDestination = path.join(__dirname, isRelease ? 'app-release.apk' : 'app-debug.apk');
        if (fs.existsSync(apkSource)) {
            fs.copyFileSync(apkSource, apkDestination);
            console.log(`✅ APK скопирован в корень: ${apkDestination}`);
        }
    } catch (error) {
        console.error('Ошибка при сборке:', error.message);
        process.exit(1);
    }
    process.chdir(originalDir);
} else {
    console.log('Gradle Wrapper не найден. Используется стандартная сборка Cordova...');
    // Если wrapper нет, пробуем стандартную сборку
    try {
        execSync('npx cordova build android', { stdio: 'inherit' });
    } catch (error) {
        console.error('Ошибка при сборке:', error.message);
        console.log('\nВНИМАНИЕ: Для сборки нужен Gradle.');
        console.log('Варианты решения:');
        console.log('1. Установите Android Studio (включает Gradle)');
        console.log('2. Установите Gradle отдельно и добавьте в PATH');
        console.log('3. Используйте команду: gradlew.bat assembleDebug из папки platforms/android');
        process.exit(1);
    }
}

