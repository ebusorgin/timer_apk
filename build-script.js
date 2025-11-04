import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
try {
    execSync('npx cordova prepare android', { stdio: 'inherit' });
    console.log('Файлы подготовлены.');
} catch (error) {
    console.error('Ошибка при подготовке файлов:', error.message);
    process.exit(1);
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

