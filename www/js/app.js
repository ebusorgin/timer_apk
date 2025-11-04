// Определение окружения и общая конфигурация
const App = {
    // Определяем Cordova - проверяем несколько способов
    get isCordova() {
        // Проверяем наличие cordova объекта
        if (typeof cordova !== 'undefined') return true;
        // Проверяем через window.cordova
        if (typeof window !== 'undefined' && window.cordova) return true;
        // Проверяем через navigator (для старых версий)
        if (typeof navigator !== 'undefined' && navigator.userAgent && 
            (navigator.userAgent.indexOf('cordova') !== -1 || 
             navigator.userAgent.indexOf('phonegap') !== -1)) return true;
        // Проверяем наличие device плагина
        if (typeof device !== 'undefined') return true;
        return false;
    },
    
    get isBrowser() {
        return typeof window !== 'undefined' && !this.isCordova;
    },
    
    // Определение URL для Socket.IO
    getSocketUrl() {
        // Всегда используем текущий хост (работает и в браузере и в Cordova)
        if (typeof window !== 'undefined') {
            return window.location.origin;
        }
        return 'http://localhost:3000';
    },
    
    // Инициализация приложения
    init() {
        console.log('App initialized in:', this.isCordova ? 'Cordova' : 'Browser');
        
        // Для Cordova ждем deviceready, для браузера - сразу готов
        if (this.isCordova) {
            document.addEventListener('deviceready', () => {
                this.onDeviceReady();
            }, false);
        } else {
            window.addEventListener('load', () => {
                this.onDeviceReady();
            });
        }
    },
    
    onDeviceReady() {
        console.log('Device ready');
        
        // Скрываем splash screen если есть
        if (this.isCordova && navigator.splashscreen) {
            navigator.splashscreen.hide();
        }
        
        // Инициализируем Voice Room после загрузки всех скриптов
        // Небольшая задержка для гарантии загрузки Socket.IO
        setTimeout(() => {
            if (typeof VoiceRoom !== 'undefined') {
                console.log('Initializing VoiceRoom...');
                VoiceRoom.init();
            } else {
                console.error('VoiceRoom module not found!');
            }
        }, 100);
    }
};

// Экспорт для использования в других модулях
window.App = App;

