// Инициализация приложения
document.addEventListener('deviceready', onDeviceReady, false);

// Для тестирования в браузере
if (typeof cordova === 'undefined') {
    window.addEventListener('load', function() {
        setTimeout(onDeviceReady, 500);
    });
}

let messageHistory = [];
let theme = 'default';
let isSending = false;
let currentModel = CONFIG.MODEL;

function onDeviceReady() {
    // Скрываем splash screen если он есть
    if (navigator.splashscreen) {
        navigator.splashscreen.hide();
    }
    
    loadModel();
    initTheme();
    initModelSelector();
    loadHistory();
    renderMessages();
    initEventListeners();
}

function loadModel() {
    const saved = localStorage.getItem('selectedModel');
    if (saved && CONFIG.AVAILABLE_MODELS.find(m => m.id === saved)) {
        currentModel = saved;
    }
    updateModelDisplay();
}

function initModelSelector() {
    const dropdown = document.getElementById('modelDropdown');
    const modelBtn = document.getElementById('modelBtn');
    
    // Создаем опции моделей
    CONFIG.AVAILABLE_MODELS.forEach(model => {
        const option = document.createElement('div');
        option.className = 'model-option';
        if (model.id === currentModel) {
            option.classList.add('active');
        }
        
        option.innerHTML = `
            <div class="model-option-name">${model.name}</div>
            <div class="model-option-desc">${model.description}</div>
        `;
        
        option.addEventListener('click', () => {
            currentModel = model.id;
            localStorage.setItem('selectedModel', currentModel);
            updateModelDisplay();
            closeModelDropdown();
        });
        
        dropdown.appendChild(option);
    });
    
    // Открытие/закрытие dropdown
    modelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleModelDropdown();
    });
    
    // Закрытие при клике вне
    document.addEventListener('click', () => {
        closeModelDropdown();
    });
}

function updateModelDisplay() {
    const model = CONFIG.AVAILABLE_MODELS.find(m => m.id === currentModel);
    if (model) {
        document.getElementById('currentModelName').textContent = model.name;
    }
    
    // Обновляем активную опцию в dropdown
    document.querySelectorAll('.model-option').forEach(opt => {
        opt.classList.remove('active');
        const modelName = opt.querySelector('.model-option-name').textContent;
        const model = CONFIG.AVAILABLE_MODELS.find(m => m.name === modelName);
        if (model && model.id === currentModel) {
            opt.classList.add('active');
        }
    });
}

function toggleModelDropdown() {
    const dropdown = document.getElementById('modelDropdown');
    dropdown.classList.toggle('show');
}

function closeModelDropdown() {
    const dropdown = document.getElementById('modelDropdown');
    dropdown.classList.remove('show');
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
        document.getElementById('themeToggle').textContent = '☀️ Светлая';
    } else if (newTheme === 'light') {
        document.body.classList.add('light-theme');
        document.getElementById('themeToggle').textContent = '🌙 Темная';
    } else {
        document.getElementById('themeToggle').textContent = '🌙 Темная';
    }
    
    localStorage.setItem('theme', newTheme);
}

function initEventListeners() {
    const sendBtn = document.getElementById('sendBtn');
    const messageInput = document.getElementById('messageInput');
    const clearBtn = document.getElementById('clearBtn');
    
    sendBtn.addEventListener('click', sendMessage);
    clearBtn.addEventListener('click', clearHistory);
    
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Автоматическое изменение высоты textarea
    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
}

function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const messageText = messageInput.value.trim();
    
    // Проверяем что есть текст
    if (!messageText || isSending) {
        if (!messageText) {
            showError('Введите сообщение');
        }
        return;
    }
    
    // Проверяем наличие API ключа
    if (!CONFIG || !CONFIG.OPENAI_API_KEY || CONFIG.OPENAI_API_KEY === 'your-api-key-here') {
        showError('API ключ не настроен! Проверьте файл config.js');
        return;
    }
    
    // Добавляем сообщение пользователя
    addMessage('user', messageText);
    
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    // Показываем индикатор загрузки
    setLoading(true);
    isSending = true;
    
    // Отправляем запрос к GPT
    sendToGPT(messageText)
        .then(response => {
            addMessage('assistant', response);
            saveHistory();
        })
        .catch(error => {
            showError('Ошибка: ' + error.message);
        })
        .finally(() => {
            setLoading(false);
            isSending = false;
        });
}

async function sendToGPT(userMessage) {
    // Добавляем сообщение пользователя в историю
    messageHistory.push({
        role: 'user',
        content: userMessage
    });
    
    try {
        // Формируем сообщения для API
        const apiMessages = messageHistory.map(msg => ({
            role: msg.role,
            content: msg.content
        }));
        
        // Проверяем что модель существует
        const modelExists = CONFIG.AVAILABLE_MODELS.find(m => m.id === currentModel);
        if (!modelExists) {
            throw new Error('Модель не найдена: ' + currentModel);
        }
        
        const requestBody = {
            model: currentModel,
            messages: apiMessages,
            temperature: 0.7,
            max_tokens: 4096
        };
        
        const response = await fetch(CONFIG.OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorData = {};
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                // Игнорируем ошибку парсинга
            }
            
            let errorMessage = 'Ошибка API';
            
            if (response.status === 401) {
                errorMessage = 'Неверный API ключ';
            } else if (response.status === 429) {
                errorMessage = 'Превышен лимит запросов. Подождите немного.';
            } else if (response.status === 402) {
                errorMessage = 'Недостаточно средств на счету API';
            } else if (errorData.error) {
                errorMessage = errorData.error.message || errorData.error.type || errorMessage;
                // Если модель не поддерживается, предлагаем решение
                if (errorMessage.includes('model') && (errorMessage.includes('not found') || errorMessage.includes('invalid'))) {
                    errorMessage += '. Попробуйте выбрать другую модель.';
                }
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        const assistantMessage = data.choices[0].message.content;
        
        // Добавляем ответ ассистента в историю
        messageHistory.push({
            role: 'assistant',
            content: assistantMessage
        });
        
        return assistantMessage;
        
    } catch (error) {
        // Удаляем сообщение пользователя из истории при ошибке
        messageHistory.pop();
        throw error;
    }
}

function addMessage(role, content) {
    // Убираем empty state если он есть
    const messagesArea = document.getElementById('messagesArea');
    const emptyState = messagesArea.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;
    
    messageDiv.appendChild(contentDiv);
    messagesArea.appendChild(messageDiv);
    
    // Прокручиваем вниз
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

function setLoading(loading) {
    const sendBtn = document.getElementById('sendBtn');
    if (loading) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<div class="loading"></div>';
        // Показываем индикатор загрузки в чате
        const messagesArea = document.getElementById('messagesArea');
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message assistant';
        loadingDiv.id = 'loadingMessage';
        loadingDiv.innerHTML = '<div class="message-content"><div class="loading"></div> Думаю...</div>';
        messagesArea.appendChild(loadingDiv);
        messagesArea.scrollTop = messagesArea.scrollHeight;
    } else {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '➤';
        // Удаляем индикатор загрузки
        const loadingMsg = document.getElementById('loadingMessage');
        if (loadingMsg) {
            loadingMsg.remove();
        }
    }
}

function showError(message) {
    addMessage('assistant', `❌ ${message}`);
}

function clearHistory() {
    if (confirm('Очистить всю историю разговора?')) {
        messageHistory = [];
        localStorage.removeItem('chatHistory');
        renderMessages();
    }
}

function saveHistory() {
    localStorage.setItem('chatHistory', JSON.stringify(messageHistory));
}

function loadHistory() {
    const saved = localStorage.getItem('chatHistory');
    if (saved) {
        try {
            messageHistory = JSON.parse(saved);
        } catch (e) {
            console.error('Ошибка загрузки истории:', e);
            messageHistory = [];
        }
    }
}

function renderMessages() {
    const messagesArea = document.getElementById('messagesArea');
    messagesArea.innerHTML = '';
    
    if (messageHistory.length === 0) {
        messagesArea.innerHTML = `
            <div class="empty-state">
                <h2>Начните разговор</h2>
                <p>Напишите сообщение ниже</p>
            </div>
        `;
        return;
    }
    
    messageHistory.forEach(msg => {
        if (typeof msg.content === 'string') {
            addMessage(msg.role, msg.content);
        } else {
            // Fallback для старых форматов
            addMessage(msg.role, msg.content || '');
        }
    });
    
    // Прокручиваем вниз
    setTimeout(() => {
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }, 100);
}
