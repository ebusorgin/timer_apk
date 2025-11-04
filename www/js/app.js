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
        console.log('App.init() called');
        console.log('App initialized in:', this.isCordova ? 'Cordova' : 'Browser');
        console.log('Document ready state:', document.readyState);
        
        // Для Cordova ждем deviceready, для браузера - проверяем готовность документа
        if (this.isCordova) {
            document.addEventListener('deviceready', () => {
                this.onDeviceReady();
            }, false);
        } else {
            // Если документ уже загружен, сразу вызываем onDeviceReady
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                console.log('Document already loaded, calling onDeviceReady immediately');
                setTimeout(() => this.onDeviceReady(), 0);
            } else {
                // Если документ еще загружается, ждем события load
                window.addEventListener('load', () => {
                    console.log('Window load event fired');
                    this.onDeviceReady();
                });
            }
        }
    },
    
    onDeviceReady() {
        console.log('App.onDeviceReady() called');
        console.log('VoiceRoom available:', typeof VoiceRoom !== 'undefined');
        
        // Скрываем splash screen если есть
        if (this.isCordova && navigator.splashscreen) {
            navigator.splashscreen.hide();
        }
        
        // Инициализируем Voice Room после загрузки всех скриптов
        // Проверяем что VoiceRoom действительно доступен
        if (typeof VoiceRoom !== 'undefined') {
            console.log('Initializing VoiceRoom...');
            try {
                VoiceRoom.init();
                console.log('VoiceRoom.init() completed');
            } catch (error) {
                console.error('Error initializing VoiceRoom:', error);
                // Повторяем попытку через некоторое время
                setTimeout(() => {
                    if (typeof VoiceRoom !== 'undefined') {
                        console.log('Retrying VoiceRoom.init()...');
                        VoiceRoom.init();
                    }
                }, 500);
            }
        } else {
            console.error('VoiceRoom module not found! Waiting...');
            // Повторяем попытку через некоторое время
            setTimeout(() => {
                if (typeof VoiceRoom !== 'undefined') {
                    console.log('VoiceRoom found, initializing...');
                    VoiceRoom.init();
                } else {
                    console.error('VoiceRoom still not found after delay');
                }
            }, 500);
        }
    }
};

// Экспорт для использования в других модулях
window.App = App;

