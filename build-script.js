import { execSync } from 'child_process';
import fs from 'fs';
import { statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Функция для рекурсивного копирования директории с обработкой ошибок
function copyDirSync(src, dest) {
    try {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            try {
                if (entry.isDirectory()) {
                    copyDirSync(srcPath, destPath);
                } else {
                    fs.copyFileSync(srcPath, destPath);
                }
            } catch (fileError) {
                console.warn(`⚠️  Предупреждение при копировании ${entry.name}: ${fileError.message}`);
                // Продолжаем копирование других файлов
            }
        }
    } catch (error) {
        throw new Error(`Ошибка при копировании директории ${src} → ${dest}: ${error.message}`);
    }
}

// Функция для валидации APK файла
function validateAPK(apkPath) {
    try {
        if (!fs.existsSync(apkPath)) {
            return { valid: false, error: 'Файл не существует' };
        }
        
        const stats = statSync(apkPath);
        const sizeMB = stats.size / 1024 / 1024;
        const minSizeBytes = 100 * 1024; // Минимум 100KB
        
        if (stats.size < minSizeBytes) {
            return { 
                valid: false, 
                error: `APK файл слишком маленький (${stats.size} байт, минимум ${minSizeBytes} байт)` 
            };
        }
        
        // Проверка расширения файла
        if (!apkPath.toLowerCase().endsWith('.apk')) {
            return { valid: false, error: 'Файл не является APK (нет расширения .apk)' };
        }
        
        return { 
            valid: true, 
            size: stats.size, 
            sizeMB: sizeMB.toFixed(2) 
        };
    } catch (error) {
        return { valid: false, error: `Ошибка при проверке файла: ${error.message}` };
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

// Сначала вызываем cordova prepare для правильной настройки платформы
// Это копирует cordova.js и другие платформенные файлы
console.log('Вызов cordova prepare...');
try {
    execSync('npx cordova prepare android', { stdio: 'inherit', cwd: __dirname });
    console.log('✅ Cordova prepare выполнен успешно.');
} catch (error) {
    console.warn('⚠️  Предупреждение: cordova prepare завершился с ошибкой:', error.message);
    console.log('Продолжаем сборку с ручным копированием файлов...');
}

const wwwDest = path.join(platformsPath, 'app', 'src', 'main', 'assets', 'www');

// Всегда копируем www файлы вручную для надежности (перезаписываем после prepare)
if (fs.existsSync(wwwPath)) {
    try {
        if (!fs.existsSync(wwwDest)) {
            fs.mkdirSync(wwwDest, { recursive: true });
        }
        console.log('Копирование www файлов в платформу...');
        copyDirSync(wwwPath, wwwDest);
        console.log('✅ www файлы скопированы.');
        
        // Проверяем что файлы действительно скопировались
        if (!fs.existsSync(wwwDest) || fs.readdirSync(wwwDest).length === 0) {
            console.warn('⚠️  Предупреждение: папка www пуста или файлы не скопировались');
        }
        
        // Проверяем наличие cordova.js
        const cordovaJsPath = path.join(wwwDest, 'cordova.js');
        if (!fs.existsSync(cordovaJsPath)) {
            // Пробуем скопировать из platform_www если не скопировался через prepare
            const platformCordovaJs = path.join(platformsPath, 'platform_www', 'cordova.js');
            if (fs.existsSync(platformCordovaJs)) {
                console.log('Копирование cordova.js из platform_www...');
                fs.copyFileSync(platformCordovaJs, cordovaJsPath);
                console.log('✅ cordova.js скопирован.');
            } else {
                console.warn('⚠️  Предупреждение: cordova.js не найден в platform_www');
            }
        } else {
            console.log('✅ cordova.js присутствует в assets/www');
        }
    } catch (error) {
        console.error(`❌ Ошибка при копировании www файлов: ${error.message}`);
        process.exit(1);
    }
} else {
    console.error('❌ Папка www не найдена!');
    process.exit(1);
}

// Проверяем наличие Gradle Wrapper и используем его напрямую для сборки
const gradlewPath = path.join(platformsPath, 'gradlew.bat');
const gradleWrapperJar = path.join(platformsPath, 'gradle', 'wrapper', 'gradle-wrapper.jar');

// Если wrapper не найден, пробуем создать его используя Gradle из Android SDK или системный
if (!fs.existsSync(gradlewPath) || !fs.existsSync(gradleWrapperJar)) {
    console.log('⚠️  Gradle Wrapper не найден, пытаемся создать...');
    
    // Читаем версию Gradle из конфигурации Cordova
    const configPath = path.join(platformsPath, 'cdv-gradle-config.json');
    let gradleVersion = '8.13'; // версия по умолчанию
    
    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.GRADLE_VERSION) {
                gradleVersion = config.GRADLE_VERSION;
                console.log(`Требуемая версия Gradle: ${gradleVersion}`);
            }
        } catch (e) {
            console.warn('Не удалось прочитать конфигурацию Gradle, используем версию по умолчанию');
        }
    }
    
    // Пробуем использовать системный Gradle для создания wrapper
    try {
        execSync('gradle --version', { stdio: 'pipe' });
        console.log('✅ Системный Gradle найден, создание Wrapper...');
        
        const originalDir = process.cwd();
        process.chdir(platformsPath);
        try {
            // Используем пустой проект из tools для создания wrapper без AGP требований
            const toolsPath = path.join(platformsPath, 'tools');
            if (fs.existsSync(toolsPath)) {
                process.chdir(toolsPath);
                console.log('Использование tools проекта для создания wrapper...');
            }
            
            // Создаем wrapper с нужной версией
            execSync(`gradle wrapper --gradle-version ${gradleVersion}`, { stdio: 'inherit' });
            
            // Копируем созданный wrapper в корень платформы если создался в tools
            if (process.cwd() !== platformsPath) {
                const toolsGradlew = path.join(toolsPath, 'gradlew.bat');
                const toolsGradleDir = path.join(toolsPath, 'gradle');
                if (fs.existsSync(toolsGradlew) && fs.existsSync(toolsGradleDir)) {
                    console.log('Копирование wrapper из tools в корень платформы...');
                    fs.copyFileSync(toolsGradlew, gradlewPath);
                    fs.copyFileSync(toolsGradlew.replace('.bat', ''), gradlewPath.replace('.bat', ''));
                    
                    const wrapperDest = path.join(platformsPath, 'gradle', 'wrapper');
                    if (!fs.existsSync(wrapperDest)) {
                        fs.mkdirSync(wrapperDest, { recursive: true });
                    }
                    const wrapperJar = path.join(toolsGradleDir, 'wrapper', 'gradle-wrapper.jar');
                    const wrapperProps = path.join(toolsGradleDir, 'wrapper', 'gradle-wrapper.properties');
                    if (fs.existsSync(wrapperJar)) {
                        fs.copyFileSync(wrapperJar, gradleWrapperJar);
                    }
                    if (fs.existsSync(wrapperProps)) {
                        fs.copyFileSync(wrapperProps, path.join(wrapperDest, 'gradle-wrapper.properties'));
                    }
                }
                process.chdir(platformsPath);
            }
            
            console.log('✅ Gradle Wrapper создан!');
        } catch (error) {
            console.warn('Не удалось создать wrapper через системный Gradle:', error.message);
            // Продолжаем попытку создать wrapper через другие методы
            process.chdir(originalDir);
        }
    } catch (gradleError) {
        console.log('Системный Gradle не найден, проверяем другие варианты...');
    }
}

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
        
        // Для release сборки проверяем наличие подписанного APK
        let outputPath;
        if (isRelease) {
            // Сначала проверяем подписанный release APK
            const signedReleasePath = path.join(platformsPath, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
            if (fs.existsSync(signedReleasePath)) {
                outputPath = 'app\\build\\outputs\\apk\\release\\app-release.apk';
                console.log('✅ Найден подписанный release APK');
            } else {
                // Если подписанного нет, используем unsigned (но это нежелательно для установки)
                outputPath = 'app\\build\\outputs\\apk\\release\\app-release-unsigned.apk';
                console.warn('⚠️  Подписанный release APK не найден, используется unsigned (не подходит для установки на устройства)');
                console.warn('   Рекомендуется использовать debug сборку для тестирования: npm run build');
            }
        } else {
            outputPath = 'app\\build\\outputs\\apk\\debug\\app-debug.apk';
        }
        
        console.log(`APK файл находится в: ${outputPath}`);
        
        // Копируем APK в корень проекта для удобства
        const apkSource = path.join(platformsPath, outputPath.replace(/\\/g, path.sep));
        const apkDestination = path.join(__dirname, isRelease ? 'app-release.apk' : 'app-debug.apk');
        
        if (fs.existsSync(apkSource)) {
            // Валидация APK перед копированием
            const validation = validateAPK(apkSource);
            
            if (!validation.valid) {
                console.error(`❌ APK файл невалиден: ${validation.error}`);
                process.exit(1);
            }
            
            console.log(`Размер APK: ${validation.sizeMB} MB`);
            
            try {
                fs.copyFileSync(apkSource, apkDestination);
                console.log(`✅ APK скопирован в корень: ${apkDestination}`);
                
                // Проверяем что файл успешно скопирован
                const copiedValidation = validateAPK(apkDestination);
                if (!copiedValidation.valid) {
                    console.error(`❌ Ошибка: скопированный APK файл невалиден: ${copiedValidation.error}`);
                    process.exit(1);
                }
            } catch (copyError) {
                console.error(`❌ Ошибка при копировании APK: ${copyError.message}`);
                process.exit(1);
            }
            
            // Для debug APK проверяем что он подписан
            if (!isRelease) {
                console.log('✅ Debug APK автоматически подписан debug keystore и готов к установке');
            } else {
                console.warn('⚠️  Release APK может быть неподписанным. Для установки используйте debug версию или подпишите release.');
            }
        } else {
            console.warn(`⚠️  APK файл не найден по пути: ${apkSource}`);
            // Пробуем найти альтернативные пути
            const alternativePaths = [
                path.join(platformsPath, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'), // Приоритет debug
                path.join(platformsPath, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'), // Подписанный release
                path.join(platformsPath, 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk'),
            ];
            for (const altPath of alternativePaths) {
                if (fs.existsSync(altPath)) {
                    const validation = validateAPK(altPath);
                    if (!validation.valid) {
                        console.warn(`⚠️  Пропущен невалидный APK: ${altPath} (${validation.error})`);
                        continue;
                    }
                    console.log(`✅ APK найден: ${altPath} (${validation.sizeMB} MB)`);
                    try {
                        fs.copyFileSync(altPath, apkDestination);
                        console.log(`✅ APK скопирован в корень: ${apkDestination}`);
                        
                        // Проверяем скопированный файл
                        const copiedValidation = validateAPK(apkDestination);
                        if (!copiedValidation.valid) {
                            console.error(`❌ Ошибка: скопированный APK невалиден: ${copiedValidation.error}`);
                            continue;
                        }
                        break;
                    } catch (copyError) {
                        console.error(`❌ Ошибка при копировании альтернативного APK: ${copyError.message}`);
                        continue;
                    }
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
                    const validation = validateAPK(apkSource);
                    if (!validation.valid) {
                        console.error(`❌ APK файл невалиден: ${validation.error}`);
                        process.exit(1);
                    }
                    try {
                        fs.copyFileSync(apkSource, apkDestination);
                        console.log(`✅ APK скопирован в корень: ${apkDestination}`);
                        
                        // Проверяем скопированный файл
                        const copiedValidation = validateAPK(apkDestination);
                        if (!copiedValidation.valid) {
                            console.error(`❌ Ошибка: скопированный APK невалиден: ${copiedValidation.error}`);
                            process.exit(1);
                        }
                    } catch (copyError) {
                        console.error(`❌ Ошибка при копировании APK: ${copyError.message}`);
                        process.exit(1);
                    }
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

