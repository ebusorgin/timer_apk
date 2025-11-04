// Точка входа для Cordova приложения
// Инициализация происходит через app.js

// Если Cordova доступен, ждем deviceready
if (typeof cordova !== 'undefined') {
    document.addEventListener('deviceready', () => {
        console.log('Cordova deviceready');
        // App.init() вызовется автоматически через window.addEventListener('load')
    }, false);
}

