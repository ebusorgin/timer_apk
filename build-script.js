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
// Пропускаем cordova prepare из-за проблем с API, используем прямой вызов Gradle
console.log('Подготовка файлов...');
const wwwDest = path.join(platformsPath, 'app', 'src', 'main', 'assets', 'www');

// Всегда копируем www файлы вручную для надежности
if (fs.existsSync(wwwPath)) {
    if (!fs.existsSync(wwwDest)) {
        fs.mkdirSync(wwwDest, { recursive: true });
    }
    console.log('Копирование www файлов в платформу...');
    copyDirSync(wwwPath, wwwDest);
    console.log('✅ www файлы скопированы.');
} else {
    console.error('❌ Папка www не найдена!');
    process.exit(1);
}

// Проверяем наличие Gradle Wrapper и используем его напрямую для сборки
const gradlewPath = path.join(platformsPath, 'gradlew.bat');
const gradleWrapperJar = path.join(platformsPath, 'gradle', 'wrapper', 'gradle-wrapper.jar');

if (fs.existsSync(gradlewPath) && fs.existsSync(gradleWrapperJar)) {
    console.log('✅ Использование Gradle Wrapper для сборки (обход Cordova API)...');
    const originalDir = process.cwd();
    process.chdir(platformsPath);
    try {
        // Определяем тип сборки
        const isRelease = process.argv.includes('--release');
        const buildType = isRelease ? 'assembleRelease' : 'assembleDebug';
        
        console.log(`Запуск Gradle сборки (${buildType})...`);
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
        } else {
            console.warn(`⚠️  APK файл не найден по пути: ${apkSource}`);
            // Пробуем найти альтернативные пути
            const alternativePaths = [
                path.join(platformsPath, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
                path.join(platformsPath, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
            ];
            for (const altPath of alternativePaths) {
                if (fs.existsSync(altPath)) {
                    fs.copyFileSync(altPath, apkDestination);
                    console.log(`✅ APK найден и скопирован: ${altPath}`);
                    break;
                }
            }
        }
    } catch (error) {
        console.error('Ошибка при сборке через Gradle:', error.message);
        console.log('\nУбедитесь, что:');
        console.log('1. Установлен Java JDK (v11+)');
        console.log('2. Установлен Android SDK');
        console.log('3. Переменные окружения ANDROID_HOME или ANDROID_SDK_ROOT настроены');
        process.exit(1);
    }
    process.chdir(originalDir);
} else {
    console.error('❌ Gradle Wrapper не найден!');
    console.log('Попытка создания Gradle Wrapper...');
    
    // Пробуем создать Gradle Wrapper через системный Gradle
    try {
        execSync('gradle --version', { stdio: 'pipe' });
        console.log('✅ Системный Gradle найден, создание Wrapper...');
        
        const originalDir = process.cwd();
        process.chdir(platformsPath);
        try {
            execSync('gradle wrapper', { stdio: 'inherit' });
            console.log('✅ Gradle Wrapper создан!');
            
            // Проверяем что wrapper создался
            if (fs.existsSync(gradlewPath) && fs.existsSync(gradleWrapperJar)) {
                const isRelease = process.argv.includes('--release');
                const buildType = isRelease ? 'assembleRelease' : 'assembleDebug';
                
                console.log(`Запуск сборки через созданный Gradle Wrapper (${buildType})...`);
                execSync(`.\\gradlew.bat ${buildType}`, { stdio: 'inherit' });
                console.log('\n✓ Сборка завершена успешно!');
                
                const outputPath = isRelease 
                    ? 'app\\build\\outputs\\apk\\release\\app-release-unsigned.apk'
                    : 'app\\build\\outputs\\apk\\debug\\app-debug.apk';
                const apkSource = path.join(platformsPath, outputPath.replace(/\\/g, path.sep));
                const apkDestination = path.join(__dirname, isRelease ? 'app-release.apk' : 'app-debug.apk');
                
                if (fs.existsSync(apkSource)) {
                    fs.copyFileSync(apkSource, apkDestination);
                    console.log(`✅ APK скопирован в корень: ${apkDestination}`);
                }
            } else {
                throw new Error('Gradle Wrapper не был создан');
            }
        } catch (error) {
            console.error('Ошибка при создании Wrapper или сборке:', error.message);
            process.exit(1);
        }
        process.chdir(originalDir);
    } catch (gradleError) {
        // Если системный Gradle тоже не найден
        console.error('❌ Системный Gradle не найден!');
        console.log('\n📦 Варианты установки Gradle:');
        console.log('');
        console.log('1. Android Studio (рекомендуется):');
        console.log('   - Скачать: https://developer.android.com/studio');
        console.log('   - Включает Gradle, Android SDK и все необходимые инструменты');
        console.log('   - После установки Gradle будет доступен в PATH');
        console.log('');
        console.log('2. Gradle отдельно:');
        console.log('   - Скачать: https://gradle.org/releases/');
        console.log('   - Распакуйте и добавьте bin в PATH');
        console.log('   - Пример: C:\\gradle\\bin');
        console.log('');
        console.log('3. Chocolatey (Windows):');
        console.log('   choco install gradle');
        console.log('');
        console.log('4. Scoop (Windows):');
        console.log('   scoop install gradle');
        console.log('');
        console.log('После установки Gradle запустите сборку снова: npm run build');
        process.exit(1);
    }
}

