// App модуль для Cordova
const App = {
    init() {
        console.log('App Cordova initializing...');
        console.log('Document ready state:', document.readyState);
        
        // В Cordova ждем deviceready
        if (typeof cordova !== 'undefined') {
            document.addEventListener('deviceready', () => {
                this.onDeviceReady();
            }, false);
        } else {
            // Если cordova не загружен, ждем загрузки DOM
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                setTimeout(() => this.onDeviceReady(), 0);
            } else {
                window.addEventListener('load', () => {
                    this.onDeviceReady();
                });
            }
        }
    },
    
    onDeviceReady() {
        console.log('App.onDeviceReady() called');
        
        // Скрываем splash screen если есть
        if (typeof navigator !== 'undefined' && navigator.splashscreen) {
            navigator.splashscreen.hide();
        }
        
        // Инициализируем Voice Room
        if (typeof VoiceRoom !== 'undefined') {
            console.log('Initializing VoiceRoom...');
            try {
                VoiceRoom.init();
                console.log('VoiceRoom.init() completed');
            } catch (error) {
                console.error('Error initializing VoiceRoom:', error);
                setTimeout(() => {
                    if (typeof VoiceRoom !== 'undefined') {
                        VoiceRoom.init();
                    }
                }, 500);
            }
        } else {
            console.error('VoiceRoom module not found! Waiting...');
            setTimeout(() => {
                if (typeof VoiceRoom !== 'undefined') {
                    VoiceRoom.init();
                }
            }, 500);
        }
    }
};

// Экспорт для использования в других модулях
window.App = App;

// Инициализация при загрузке
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        App.init();
    });
} else {
    App.init();
}

