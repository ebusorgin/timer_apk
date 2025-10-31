// Стандартная инициализация Cordova
document.addEventListener('deviceready', onDeviceReady, false);

// Для тестирования в браузере (если cordova.js не загружен)
if (typeof cordova === 'undefined') {
    // Запускаем сразу если Cordova не доступен
    window.addEventListener('load', function() {
        setTimeout(onDeviceReady, 500);
    });
}

let timeFormat24 = false;
let stopwatchRunning = false;
let stopwatchTime = 0;
let stopwatchInterval = null;
let theme = 'default';

// Мировые часы - города и их смещения от UTC
const worldClocks = [
    { name: 'Москва', offset: 3 },
    { name: 'Нью-Йорк', offset: -5 },
    { name: 'Лондон', offset: 0 },
    { name: 'Токио', offset: 9 },
    { name: 'Пекин', offset: 8 },
    { name: 'Дубай', offset: 4 }
];

function onDeviceReady() {
    // Скрываем splash screen если он есть
    if (navigator.splashscreen) {
        navigator.splashscreen.hide();
    }
    
    initTheme();
    updateTime();
    initStopwatch();
    initWorldClocks();
    setInterval(updateTime, 1000);
    setInterval(updateWorldClocks, 1000);
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'default';
    setTheme(savedTheme);
    
    document.getElementById('themeToggle').addEventListener('click', () => {
        const themes = ['default', 'dark', 'light'];
        const currentIndex = themes.indexOf(theme);
        const nextTheme = themes[(currentIndex + 1) % themes.length];
        setTheme(nextTheme);
    });
}

function setTheme(newTheme) {
    theme = newTheme;
    document.body.className = '';
    
    if (newTheme === 'dark') {
        document.body.classList.add('dark-theme');
        document.getElementById('themeToggle').textContent = '☀️ Светлая тема';
    } else if (newTheme === 'light') {
        document.body.classList.add('light-theme');
        document.getElementById('themeToggle').textContent = '🌙 Темная тема';
    } else {
        document.getElementById('themeToggle').textContent = '🌙 Темная тема';
    }
    localStorage.setItem('theme', newTheme);
}

function updateTime() {
    const now = new Date();
    const timeElement = document.getElementById('time');
    
    let hours = now.getHours();
    let minutes = String(now.getMinutes()).padStart(2, '0');
    let seconds = String(now.getSeconds()).padStart(2, '0');
    let ampm = '';
    
    if (!timeFormat24) {
        ampm = hours >= 12 ? ' PM' : ' AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
    }
    
    const timeString = String(hours).padStart(2, '0') + ':' + minutes + ':' + seconds + ampm;
    timeElement.textContent = timeString;
    
    // Анимация при изменении секунд
    timeElement.classList.add('animate');
    setTimeout(() => timeElement.classList.remove('animate'), 1000);
    
    // Обновление даты
    const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 
                    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    
    const dayName = days[now.getDay()];
    const day = now.getDate();
    const month = months[now.getMonth()];
    const year = now.getFullYear();
    const dateString = `${dayName}, ${day} ${month} ${year}`;
    
    document.getElementById('date').textContent = dateString;
    document.getElementById('dayOfWeek').textContent = dayName;
    
    // Определение времени года
    const monthNum = now.getMonth() + 1;
    let season = '';
    if (monthNum >= 3 && monthNum <= 5) {
        season = '🌱 Весна';
    } else if (monthNum >= 6 && monthNum <= 8) {
        season = '☀️ Лето';
    } else if (monthNum >= 9 && monthNum <= 11) {
        season = '🍂 Осень';
    } else {
        season = '❄️ Зима';
    }
    document.getElementById('season').textContent = season;
}

function initStopwatch() {
    document.getElementById('stopwatchStart').addEventListener('click', () => {
        if (!stopwatchRunning) {
            stopwatchRunning = true;
            const startTime = Date.now() - stopwatchTime;
            stopwatchInterval = setInterval(() => {
                stopwatchTime = Date.now() - startTime;
                updateStopwatchDisplay();
            }, 10);
        }
    });
    
    document.getElementById('stopwatchStop').addEventListener('click', () => {
        if (stopwatchRunning) {
            stopwatchRunning = false;
            clearInterval(stopwatchInterval);
        }
    });
    
    document.getElementById('stopwatchReset').addEventListener('click', () => {
        stopwatchRunning = false;
        stopwatchTime = 0;
        clearInterval(stopwatchInterval);
        updateStopwatchDisplay();
    });
}

function updateStopwatchDisplay() {
    const totalMs = stopwatchTime;
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const ms = Math.floor((totalMs % 1000) / 10);
    
    const display = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
    document.getElementById('stopwatch').textContent = display;
}

function initWorldClocks() {
    const worldClockElement = document.getElementById('worldClock');
    worldClocks.forEach(clock => {
        const item = document.createElement('div');
        item.className = 'world-clock-item';
        item.innerHTML = `<span>${clock.name}</span><span class="world-time" data-offset="${clock.offset}">--:--:--</span>`;
        worldClockElement.appendChild(item);
    });
}

function updateWorldClocks() {
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    
    document.querySelectorAll('.world-time').forEach(element => {
        const offset = parseInt(element.getAttribute('data-offset'));
        const cityTime = new Date(utcTime + (offset * 3600000));
        
        let hours = cityTime.getHours();
        let minutes = String(cityTime.getMinutes()).padStart(2, '0');
        let seconds = String(cityTime.getSeconds()).padStart(2, '0');
        
        if (!timeFormat24) {
            const ampm = hours >= 12 ? ' PM' : ' AM';
            hours = hours % 12;
            hours = hours ? hours : 12;
            element.textContent = `${String(hours).padStart(2, '0')}:${minutes}:${seconds}${ampm}`;
        } else {
            element.textContent = `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
        }
    });
}

// Переключение формата времени
document.getElementById('format24').addEventListener('click', () => {
    timeFormat24 = true;
    document.getElementById('format24').classList.add('active');
    document.getElementById('format12').classList.remove('active');
    updateTime();
    updateWorldClocks();
});

document.getElementById('format12').addEventListener('click', () => {
    timeFormat24 = false;
    document.getElementById('format12').classList.add('active');
    document.getElementById('format24').classList.remove('active');
    updateTime();
    updateWorldClocks();
});

// Fallback для браузера - запускаем сразу если код уже выполняется
if (document.readyState === 'complete' && typeof cordova === 'undefined') {
    setTimeout(onDeviceReady, 100);
}
