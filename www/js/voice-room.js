// Voice Room модуль
const VoiceRoom = {
    socket: null,
    localStream: null,
    peers: new Map(),
    isConnected: false, // Флаг подключения к чату
    myUserId: null,
    audioContext: null,
    analyser: null,
    reconnectTimeout: null,
    microphoneLevelCheckInterval: null,
    connectionStatus: 'disconnected', // disconnected, connecting, connected, error
    isConnecting: false, // Флаг для предотвращения повторных попыток подключения
    joinRoomTimeout: null, // Таймаут для сброса флага подключения
    
    // Константы WebRTC
    ICE_SERVERS: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        // TURN серверы для обхода NAT
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    RECONNECTION_DELAY: 3000,
    MAX_RECONNECTION_ATTEMPTS: 5,
    MICROPHONE_CHECK_INTERVAL: 100, // мс
    
    // Определение мобильного устройства
    get isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               (window.innerWidth <= 768);
    },
    
    // DOM элементы
    elements: {},
    
    // Система уведомлений
    showNotification(message, type = 'info', duration = 3000) {
        if (!this.elements.statusMessage) return;
        
        const statusEl = this.elements.statusMessage;
        statusEl.textContent = message;
        statusEl.className = `status-message ${type}`;
        statusEl.classList.add('show');
        
        setTimeout(() => {
            statusEl.classList.remove('show');
        }, duration);
    },
    
    // Санитизация строки
    sanitizeString(str) {
        if (typeof str !== 'string') return '';
        
        // Удаляем все HTML теги полностью
        let result = str.replace(/<[^>]*>/g, '');
        
        // Декодируем HTML entities перед дальнейшей обработкой
        result = result
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&amp;/gi, '&')
            .replace(/&quot;/gi, '"')
            .replace(/&#x27;/gi, "'")
            .replace(/&#x2F;/gi, '/');
        
        // Удаляем HTML теги снова после декодирования
        result = result.replace(/<[^>]*>/g, '');
        
        // Удаляем опасные паттерны XSS и ключевые слова (полностью, включая части слов)
        const dangerousPatterns = [
            /javascript:/gi,
            /on\w+\s*=/gi, // onerror=, onclick=, onmouseover=, etc.
            /script/gi,
            /iframe/gi,
            /img/gi,
            /svg/gi,
            /style/gi,
            /onerror/gi,
            /onclick/gi,
            /onmouseover/gi,
            /onload/gi,
            /onfocus/gi,
            /onblur/gi,
            /onchange/gi,
            /onsubmit/gi,
            /data-xss/gi,
            /expression/gi,
            /vbscript:/gi,
            /data:/gi
        ];
        
        dangerousPatterns.forEach(pattern => {
            result = result.replace(pattern, '');
        });
        
        // Удаляем SQL команды и операторы
        const sqlPatterns = [
            /DROP/gi,
            /DELETE/gi,
            /INSERT/gi,
            /UPDATE/gi,
            /SELECT/gi,
            /UNION/gi,
            /EXEC/gi,
            /EXECUTE/gi,
            /--/g,
            /\/\*/g,
            /\*\//g
        ];
        
        sqlPatterns.forEach(pattern => {
            result = result.replace(pattern, '');
        });
        
        // Удаляем опасные символы для SQL injection
        result = result.replace(/['";]/g, '');
        
        // Удаляем NoSQL операторы
        result = result.replace(/\$ne/gi, '');
        result = result.replace(/\$gt/gi, '');
        result = result.replace(/\$lt/gi, '');
        result = result.replace(/\$in/gi, '');
        result = result.replace(/\$nin/gi, '');
        result = result.replace(/\$regex/gi, '');
        
        // Удаляем опасные символы для NoSQL и LDAP injection
        result = result
            .replace(/\$/g, '')
            .replace(/\{/g, '')
            .replace(/\}/g, '')
            .replace(/\*/g, '')
            .replace(/\(/g, '')
            .replace(/\)/g, '')
            .replace(/&/g, '');
        
        // Удаляем оставшиеся < и >
        result = result.replace(/[<>]/g, '');
        
        // Удаляем unicode escape sequences
        result = result.replace(/\\u003c/gi, '');
        result = result.replace(/\\u003e/gi, '');
        result = result.replace(/\\u0027/gi, '');
        result = result.replace(/\\u0022/gi, '');
        
        // Удаляем null bytes
        result = result.replace(/\0/g, '');
        
        // Если после всех удалений осталась только пустая строка или только пробелы, возвращаем пустую строку
        result = result.trim();
        if (result.length === 0) return '';
        
        return result.substring(0, 20); // Ограничение длины
    },
    
    // Валидация username
    validateUsername(username) {
        if (!username || typeof username !== 'string') {
            return { valid: false, error: `Username must be at least 1 character` };
        }
        
        const MIN_USERNAME_LENGTH = 1;
        const MAX_USERNAME_LENGTH = 20;
        
        // Проверяем длину до санитизации для длинных username (>20 символов)
        // так как sanitizeString обрезает до 20
        if (username.length > MAX_USERNAME_LENGTH) {
            return { valid: false, error: `Username must be at most ${MAX_USERNAME_LENGTH} characters` };
        }
        
        const sanitized = this.sanitizeString(username);
        
        if (sanitized.length < MIN_USERNAME_LENGTH) {
            return { valid: false, error: `Username must be at least ${MIN_USERNAME_LENGTH} character` };
        }
        
        // Проверяем, что после санитизации остались только допустимые символы
        if (!/^[a-zA-Zа-яА-ЯёЁ0-9\s\-_]+$/.test(sanitized)) {
            return { valid: false, error: 'Username contains invalid characters' };
        }
        
        return { valid: true, username: sanitized };
    },
    
    // Валидация username с визуальной обратной связью
    validateUsernameInput(username, showError = false) {
        const validation = this.validateUsername(username);
        
        if (!this.elements.usernameInput) return validation.valid;
        
        // Обновляем визуальное состояние поля
        if (validation.valid) {
            this.elements.usernameInput.classList.remove('invalid');
            this.elements.usernameInput.classList.add('valid');
            if (this.elements.usernameValidationError) {
                this.elements.usernameValidationError.style.display = 'none';
            }
        } else {
            this.elements.usernameInput.classList.remove('valid');
            if (showError || username.length > 0) {
                this.elements.usernameInput.classList.add('invalid');
                if (this.elements.usernameValidationError) {
                    this.elements.usernameValidationError.textContent = validation.error;
                    this.elements.usernameValidationError.style.display = 'block';
                }
            } else {
                this.elements.usernameInput.classList.remove('invalid');
                if (this.elements.usernameValidationError) {
                    this.elements.usernameValidationError.style.display = 'none';
                }
            }
        }
        
        // Обновляем состояние кнопки
        this.updateCreateButtonState();
        
        return validation.valid;
    },
    
    // Показ подсказки для username
    showUsernameHint() {
        if (this.elements.usernameValidationError && !this.elements.usernameInput.value) {
            this.elements.usernameValidationError.textContent = 'Введите имя от 1 до 20 символов';
            this.elements.usernameValidationError.style.display = 'block';
            this.elements.usernameValidationError.style.color = '#666';
        }
    },
    
    // Обновление состояния кнопки создания комнаты
    updateCreateButtonState() {
        if (!this.elements.btnCreateRoom || !this.elements.usernameInput) return;
        
        const username = this.elements.usernameInput.value.trim();
        const isValid = this.validateUsername(username).valid;
        const isDisabled = this.elements.btnCreateRoom.disabled;
        
        // Не отключаем кнопку если она уже в состоянии загрузки
        if (!isDisabled && !isValid && username.length > 0) {
            this.elements.btnCreateRoom.style.opacity = '0.6';
            this.elements.btnCreateRoom.style.cursor = 'not-allowed';
        } else if (!isDisabled) {
            this.elements.btnCreateRoom.style.opacity = '1';
            this.elements.btnCreateRoom.style.cursor = 'pointer';
        }
    },
    
    init() {
        console.log('VoiceRoom initializing...');
        console.log('Document ready state:', document.readyState);
        console.log('Socket.IO available:', typeof io !== 'undefined');
        
        // Очищаем предыдущие peer connections при повторной инициализации
        this.peers.forEach((peer, userId) => {
            try {
                peer.close();
            } catch (error) {
                console.error('Error closing peer during init:', error);
            }
        });
        this.peers.clear();
        
        // Инициализация DOM элементов
        this.initElements();
        const foundElements = Object.keys(this.elements).filter(key => this.elements[key] !== null).length;
        console.log('Elements initialized:', foundElements, 'elements found');
        
        // Настройка событий
        this.setupEventListeners();
        
        // Инициализация Socket.IO
        this.initSocket();
        
        console.log('VoiceRoom.init() completed');
    },
    
    initSocket() {
        const socketUrl = App.getSocketUrl();
        console.log('Initializing socket to:', socketUrl);
        
        // Для Cordova нужно подключить Socket.IO через CDN
        if (App.isCordova && typeof io === 'undefined') {
            console.error('Socket.IO не загружен! Нужно подключить через CDN в HTML.');
            this.showNotification('Ошибка: Socket.IO не загружен', 'error', 5000);
            return;
        }
        
        if (typeof io === 'undefined') {
            console.error('Socket.IO не доступен');
            this.showNotification('Ошибка: Socket.IO не доступен. Проверьте подключение к интернету.', 'error', 5000);
            return;
        }
        
        // Закрываем существующее соединение если есть
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        
        this.connectionStatus = 'connecting';
        this.updateConnectionStatus();
        
        console.log('Creating socket connection...');
        this.socket = io(socketUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: this.MAX_RECONNECTION_ATTEMPTS,
            reconnectionDelay: 1000,
            timeout: 20000
        });
        
        this.setupSocketEvents();
    },
    
    updateConnectionStatus() {
        if (!this.elements.statusMessage) return;
        
        let message = '';
        let type = 'info';
        
        switch (this.connectionStatus) {
            case 'connecting':
                message = 'Подключение к серверу...';
                type = 'info';
                break;
            case 'connected':
                message = 'Подключено';
                type = 'success';
                break;
            case 'disconnected':
                message = 'Отключено';
                type = 'error';
                break;
            case 'error':
                message = 'Ошибка подключения';
                type = 'error';
                break;
        }
        
        this.showNotification(message, type, this.connectionStatus === 'connected' ? 2000 : 0);
    },
    
    setupSocketEvents() {
        if (!this.socket) return;
        
        this.socket.on('connect', () => {
            console.log('✅ Socket connected:', this.socket.id);
            this.connectionStatus = 'connected';
            this.updateConnectionStatus();
            
            // Если были подключены, переподключаемся
            if (this.isConnected && this.myUserId) {
                console.log('Reconnecting...');
                this.reconnectToRoom();
            }
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('❌ Socket connection error:', error);
            console.error('Error details:', {
                message: error.message,
                type: error.type,
                description: error.description
            });
            this.connectionStatus = 'error';
            this.updateConnectionStatus();
            this.showNotification('Ошибка подключения к серверу', 'error', 5000);
        });
        
        this.socket.on('disconnect', (reason) => {
            console.log('⚠️ Socket disconnected:', reason);
            this.connectionStatus = 'disconnected';
            this.updateConnectionStatus();
            
            // Пытаемся переподключиться если это не было запрошено пользователем
            if (reason !== 'io client disconnect' && this.isConnected) {
                this.scheduleReconnection();
            }
        });
        
        this.socket.on('reconnect', (attemptNumber) => {
            console.log('✅ Socket reconnected after', attemptNumber, 'attempts');
            this.connectionStatus = 'connected';
            this.updateConnectionStatus();
            this.showNotification('Подключение восстановлено', 'success', 3000);
        });
        
        this.socket.on('reconnect_attempt', () => {
            console.log('🔄 Attempting to reconnect...');
            this.connectionStatus = 'connecting';
            this.updateConnectionStatus();
        });
        
        this.socket.on('reconnect_error', (error) => {
            console.error('❌ Reconnection error:', error);
            this.connectionStatus = 'error';
            this.updateConnectionStatus();
        });
        
        this.socket.on('reconnect_failed', () => {
            console.error('❌ Failed to reconnect after', this.MAX_RECONNECTION_ATTEMPTS, 'attempts');
            this.connectionStatus = 'error';
            this.updateConnectionStatus();
            this.showNotification('Не удалось подключиться к серверу', 'error', 5000);
        });
        
        this.socket.on('user-joined', ({ userId, username }) => {
            console.log('User joined:', userId, username);
            const sanitizedUsername = this.sanitizeString(username);
            this.addUserToGrid(userId, sanitizedUsername);
            this.createPeerConnection(userId);
        });
        
        this.socket.on('user-left', (userId) => {
            console.log('User left:', userId);
            this.removeUser(userId);
        });
        
        this.socket.on('microphone-status', ({ userId, enabled }) => {
            console.log('Microphone status update:', userId, enabled);
            this.updateMicrophoneStatusUI(userId, enabled);
        });
        
        this.socket.on('request-microphone-status', () => {
            // Отправляем текущий статус микрофона запросившему пользователю
            if (this.localStream && this.socket && this.socket.connected && this.isConnected) {
                const tracks = this.localStream.getAudioTracks();
                const enabled = tracks[0]?.enabled ?? true;
                this.socket.emit('microphone-status', {
                    enabled: enabled,
                    userId: this.myUserId
                });
            }
        });
        
        this.socket.on('offer', async ({ offer, fromUserId }) => {
            try {
                const peer = this.peers.get(fromUserId);
                if (!peer) {
                    console.warn('Peer not found for offer from:', fromUserId);
                    return;
                }
                
                console.log('Received offer from:', fromUserId, 'Peer state:', peer.signalingState);
                
                // Проверяем что мы можем установить remote description
                // Мы можем установить remote offer только если:
                // 1. Peer в состоянии 'stable' (еще нет local description)
                // 2. Или в состоянии 'have-local-offer' (уже есть local offer, но мы можем заменить)
                if (peer.signalingState === 'stable') {
                    // Нормальный случай - устанавливаем remote offer, создаем answer
                    await peer.setRemoteDescription(new RTCSessionDescription(offer));
                    console.log('Remote description (offer) set for:', fromUserId);
                    
                    const answer = await peer.createAnswer();
                    await peer.setLocalDescription(answer);
                    console.log('Local description (answer) set for:', fromUserId);
                    
                    this.socket.emit('answer', { 
                        answer, 
                        targetUserId: fromUserId, 
                        fromUserId: this.myUserId 
                    });
                } else if (peer.signalingState === 'have-local-offer') {
                    // У нас уже есть local offer, значит мы тоже создали offer одновременно
                    // В этом случае устанавливаем remote offer и создаем answer (Rollback)
                    console.log('Both peers created offer, handling rollback for:', fromUserId);
                    await peer.setRemoteDescription(new RTCSessionDescription(offer));
                    console.log('Remote description (offer) set for:', fromUserId);
                    
                    // Если у нас уже есть local offer, нужно создать answer
                    if (peer.localDescription && peer.localDescription.type === 'offer') {
                        const answer = await peer.createAnswer();
                        await peer.setLocalDescription(answer);
                        console.log('Local description (answer) set for:', fromUserId);
                        
                        this.socket.emit('answer', { 
                            answer, 
                            targetUserId: fromUserId, 
                            fromUserId: this.myUserId 
                        });
                    }
                } else {
                    console.warn('Cannot set remote description, peer state:', peer.signalingState);
                    return;
                }
            } catch (error) {
                console.error('Error handling offer:', error);
                console.error('Error details:', {
                    fromUserId,
                    peerExists: !!this.peers.get(fromUserId),
                    peerState: this.peers.get(fromUserId)?.signalingState
                });
                // Не показываем уведомление для каждой ошибки, только логируем
            }
        });
        
        this.socket.on('answer', async ({ answer, fromUserId }) => {
            try {
                const peer = this.peers.get(fromUserId);
                if (!peer) {
                    console.warn('Peer not found for answer from:', fromUserId);
                    return;
                }
                
                console.log('Received answer from:', fromUserId, 'Peer state:', peer.signalingState);
                
                // Проверяем что мы можем установить remote description
                // Answer можно установить только когда local description (offer) уже установлен
                if (peer.signalingState !== 'have-local-offer') {
                    console.warn('Cannot set remote answer, peer state:', peer.signalingState, 'Expected: have-local-offer');
                    return;
                }
                
                await peer.setRemoteDescription(new RTCSessionDescription(answer));
                console.log('Remote description (answer) set for:', fromUserId);
            } catch (error) {
                console.error('Error handling answer:', error);
                console.error('Error details:', {
                    fromUserId,
                    peerExists: !!this.peers.get(fromUserId),
                    peerState: this.peers.get(fromUserId)?.signalingState,
                    errorName: error.name,
                    errorMessage: error.message
                });
                // Не показываем уведомление, только логируем
            }
        });
        
        this.socket.on('ice-candidate', async ({ candidate, fromUserId }) => {
            try {
                const peer = this.peers.get(fromUserId);
                if (peer && candidate) {
                    await peer.addIceCandidate(new RTCIceCandidate(candidate));
                }
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        });
    },
    
    scheduleReconnection() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        
        this.reconnectTimeout = setTimeout(() => {
            if (this.connectionStatus !== 'connected' && this.isConnected) {
                console.log('Attempting to reconnect socket...');
                this.initSocket();
            }
        }, this.RECONNECTION_DELAY);
    },
    
    reconnectToRoom() {
        if (!this.isConnected) return;
        
        // Используем connect() для переподключения
        console.log('Reconnecting via connect()...');
        this.connect();
    },
    
    removeUser(userId) {
        const peer = this.peers.get(userId);
        if (peer) {
            try {
                peer.close();
            } catch (error) {
                console.error('Error closing peer connection:', error);
            }
            this.peers.delete(userId);
        }
        
        const card = document.getElementById(`user-${userId}`);
        if (card) {
            card.remove();
        }
        
        this.updateUserCount();
    },
    
    initElements() {
        console.log('Initializing DOM elements...');
        this.elements = {
            loginScreen: document.getElementById('loginScreen'),
            roomScreen: document.getElementById('roomScreen'),
            btnConnect: document.getElementById('btnConnect'),
            btnLeaveRoom: document.getElementById('btnLeaveRoom'),
            btnToggleMic: document.getElementById('btnToggleMic'),
            usersGrid: document.getElementById('usersGrid'),
            statusMessage: document.getElementById('statusMessage'),
            userCount: document.getElementById('userCount')
        };
        
        // Проверяем критические элементы
        const criticalElements = ['btnConnect', 'loginScreen', 'roomScreen'];
        const missingElements = criticalElements.filter(key => !this.elements[key]);
        
        if (missingElements.length > 0) {
            console.error('❌ Missing critical elements:', missingElements);
            console.error('Available elements:', Object.keys(this.elements).filter(key => this.elements[key] !== null));
        } else {
            console.log('✅ All critical elements found');
        }
    },
    
    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        if (this.elements.btnConnect) {
            const clickHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Connect button clicked');
                this.connect();
            };
            
            if (App.isCordova) {
                this.elements.btnConnect.addEventListener('touchstart', clickHandler, { passive: false });
                this.elements.btnConnect.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }, { passive: false });
            }
            this.elements.btnConnect.addEventListener('click', clickHandler);
        }
        
        if (this.elements.btnLeaveRoom) {
            this.elements.btnLeaveRoom.addEventListener('click', () => this.leaveRoom());
        }
        
        if (this.elements.btnToggleMic) {
            this.elements.btnToggleMic.addEventListener('click', () => this.toggleMicrophone());
        }
        
        console.log('Event listeners set up');
    },
    
    async connect() {
        if (this.isConnecting) {
            console.log('Already connecting, skipping duplicate call');
            return;
        }
        
        this.isConnecting = true;
        
        // Очищаем предыдущие peer connections
        this.peers.forEach((peer, userId) => {
            try {
                peer.close();
            } catch (error) {
                console.error('Error closing peer before connect:', error);
            }
        });
        this.peers.clear();
        
        if (!this.socket || !this.socket.connected) {
            console.warn('Socket not connected, initializing...');
            this.initSocket();
            // Ждем подключения
            await new Promise((resolve) => {
                if (this.socket && this.socket.connected) {
                    resolve();
                } else {
                    this.socket.once('connect', resolve);
                    setTimeout(() => {
                        if (!this.socket || !this.socket.connected) {
                            this.isConnecting = false;
                            this.showNotification('Не удалось подключиться к серверу', 'error', 5000);
                            resolve();
                        }
                    }, 5000);
                }
            });
        }
        
        if (!this.socket || !this.socket.connected) {
            this.isConnecting = false;
            this.showNotification('Не удалось подключиться к серверу', 'error', 5000);
            return;
        }
        
        const username = `User_${Date.now()}`; // Генерируем случайное имя
        
        try {
            this.socket.emit('join-chat', { username }, async (response) => {
                this.isConnecting = false;
                
                if (response.error) {
                    console.error('Failed to join:', response.error);
                    this.showNotification('Ошибка: ' + response.error, 'error', 5000);
                    return;
                }
                
                const { userId, users } = response;
                this.myUserId = userId;
                this.isConnected = true;
                
                console.log('Joined');
                this.showNotification('Вы подключились!', 'success', 2000);
                
                try {
                    await this.initMedia();
                    this.addUserToGrid(this.myUserId, username, true);
                    
                    if (users && users.length > 0) {
                        users.forEach(user => {
                            const sanitizedUsername = this.sanitizeString(user.username);
                            this.addUserToGrid(user.userId, sanitizedUsername);
                            this.createPeerConnection(user.userId);
                            // Запрашиваем статус микрофона у существующих участников
                            if (this.socket && this.socket.connected) {
                                this.socket.emit('request-microphone-status', {
                                    targetUserId: user.userId
                                });
                            }
                        });
                    }
                    
                    // Отправляем свой статус микрофона всем участникам
                    if (this.localStream && this.socket && this.socket.connected && this.isConnected) {
                        const tracks = this.localStream.getAudioTracks();
                        const enabled = tracks[0]?.enabled ?? true;
                        this.socket.emit('microphone-status', {
                            enabled: enabled,
                            userId: this.myUserId
                        });
                    }
                    
                    this.showRoomScreen();
                } catch (error) {
                    console.error('Error initializing media:', error);
                    let errorMessage = 'Не удалось подключиться. ';
                    if (error.name === 'NotAllowedError') {
                        errorMessage += 'Разрешите доступ к микрофону в настройках браузера.';
                    } else {
                        errorMessage += error.message;
                    }
                    this.showNotification(errorMessage, 'error', 7000);
                }
            });
        } catch (error) {
            this.isConnecting = false;
            console.error('Error emitting join-chat:', error);
            this.showNotification('Ошибка при подключении', 'error', 5000);
        }
    },
    
    removeUser(userId) {
        const peer = this.peers.get(userId);
        if (peer) {
            try {
                peer.close();
            } catch (error) {
                console.error('Error closing peer connection:', error);
            }
        }
        this.peers.delete(userId);
        
        // Удаляем пользователя из DOM
        const userCard = document.getElementById(`user-${userId}`);
        if (userCard) {
            userCard.remove();
        }
        
        // Обновляем счетчик пользователей
        this.updateUserCount();
    },
    
    removeUser(userId) {
        console.log('Disconnecting...');
        
        // Закрываем все peer connections
        this.peers.forEach((peer, userId) => {
            try {
                peer.close();
            } catch (error) {
                console.error('Error closing peer connection:', error);
            }
        });
        this.peers.clear();
        
        // Останавливаем локальный поток
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        // Закрываем AudioContext
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(error => {
                console.error('Error closing audio context:', error);
            });
            this.audioContext = null;
        }
        
        // Останавливаем проверку уровня микрофона
        if (this.microphoneLevelCheckInterval) {
            clearInterval(this.microphoneLevelCheckInterval);
            this.microphoneLevelCheckInterval = null;
        }
        
        // Очищаем сетку пользователей
        if (this.elements.usersGrid) {
            this.elements.usersGrid.innerHTML = '<div class="empty-state">Ожидание других участников...</div>';
        }
        
        // Отправляем событие отключения
        if (this.socket && this.socket.connected && this.isConnected) {
            this.socket.emit('leave-chat', {});
        }
        
        this.isConnected = false;
        this.myUserId = null;
        this.isConnecting = false;
        
        this.showLoginScreen();
    },
    
    showRoomScreen() {
        if (this.elements.loginScreen) {
            this.elements.loginScreen.classList.remove('active');
        }
        if (this.elements.roomScreen) {
            this.elements.roomScreen.classList.add('active');
        }
    },
    
    showLoginScreen() {
        if (this.elements.roomScreen) {
            this.elements.roomScreen.classList.remove('active');
        }
        if (this.elements.loginScreen) {
            this.elements.loginScreen.classList.add('active');
        }
    }
};

// Экспорт для использования
window.VoiceRoom = VoiceRoom;

