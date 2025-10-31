const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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

