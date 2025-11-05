// Voice Room модуль
const VoiceRoom = {
    socket: null,
    localStream: null,
    peers: new Map(),
    currentRoomId: null,
    myUserId: null,
    myUsername: null,
    audioContext: null,
    analyser: null,
    reconnectTimeout: null,
    microphoneLevelCheckInterval: null,
    connectionStatus: 'disconnected', // disconnected, connecting, connected, error
    
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
        
        // Инициализация настроек сервера (для Cordova)
        // Загрузка сохраненного имени
        this.loadSavedUsername();
        
        // Настройка событий
        this.setupEventListeners();
        
        // Инициализация Socket.IO
        this.initSocket();
        
        // Автоподключение по URL параметру
        this.handleUrlParams();
        
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
            
            // Если были в комнате, переподключаемся
            if (this.currentRoomId && this.myUsername) {
                console.log('Reconnecting to room:', this.currentRoomId);
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
        
        this.socket.on('room-created-error', (data) => {
            console.error('❌ Room creation error from server:', data);
            this.showNotification('Ошибка сервера: ' + (data.error || 'Неизвестная ошибка'), 'error', 5000);
            
            // Восстанавливаем кнопку
            if (this.elements.btnCreateRoom) {
                this.elements.btnCreateRoom.disabled = false;
                this.elements.btnCreateRoom.innerHTML = '<span>➕</span><span>Создать комнату</span>';
            }
        });
        
        this.socket.on('disconnect', (reason) => {
            console.log('⚠️ Socket disconnected:', reason);
            this.connectionStatus = 'disconnected';
            this.updateConnectionStatus();
            
            // Пытаемся переподключиться если это не было запрошено пользователем
            if (reason !== 'io client disconnect' && this.currentRoomId) {
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
            if (this.localStream && this.socket && this.socket.connected && this.currentRoomId) {
                const tracks = this.localStream.getAudioTracks();
                const enabled = tracks[0]?.enabled ?? true;
                this.socket.emit('microphone-status', {
                    roomId: this.currentRoomId,
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
                        roomId: this.currentRoomId, 
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
                            roomId: this.currentRoomId, 
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
            if (this.connectionStatus !== 'connected' && this.currentRoomId) {
                console.log('Attempting to reconnect socket...');
                this.initSocket();
            }
        }, this.RECONNECTION_DELAY);
    },
    
    reconnectToRoom() {
        if (!this.currentRoomId || !this.myUsername) return;
        
        // Переподключаемся к комнате
        this.socket.emit('join-room', { 
            roomId: this.currentRoomId, 
            username: this.myUsername 
        }, (response) => {
            if (response.error) {
                console.error('Failed to reconnect to room:', response.error);
                this.showNotification('Не удалось переподключиться к комнате', 'error', 5000);
                this.leaveRoom();
            } else {
                console.log('Reconnected to room successfully');
                // Восстанавливаем peer connections
                if (response.users && response.users.length > 0) {
                    response.users.forEach(user => {
                        this.addUserToGrid(user.userId, user.username);
                        this.createPeerConnection(user.userId);
                        // Запрашиваем статус микрофона у существующих участников
                        if (this.socket && this.socket.connected) {
                            this.socket.emit('request-microphone-status', {
                                roomId: this.currentRoomId,
                                targetUserId: user.userId
                            });
                        }
                    });
                }
                
                // Отправляем свой статус микрофона всем участникам комнаты
                if (this.localStream && this.socket && this.socket.connected && this.currentRoomId) {
                    const tracks = this.localStream.getAudioTracks();
                    const enabled = tracks[0]?.enabled ?? true;
                    this.socket.emit('microphone-status', {
                        roomId: this.currentRoomId,
                        enabled: enabled,
                        userId: this.myUserId
                    });
                }
            }
        });
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
            usernameInput: document.getElementById('username'),
            btnCreateRoom: document.getElementById('btnCreateRoom'),
            btnJoinRoom: document.getElementById('btnJoinRoom'),
            btnJoinRoomNow: document.getElementById('btnJoinRoomNow'),
            btnLeaveRoom: document.getElementById('btnLeaveRoom'),
            btnToggleMic: document.getElementById('btnToggleMic'),
            roomIdInput: document.getElementById('roomId'),
            usersGrid: document.getElementById('usersGrid'),
            statusMessage: document.getElementById('statusMessage'),
            currentRoomIdSpan: document.getElementById('currentRoomId'),
            roomLinkInput: document.getElementById('roomLink'),
            roomLinkContainer: document.getElementById('roomLinkContainer'),
            btnCopyLink: document.getElementById('btnCopyLink'),
            joinContainer: document.getElementById('joinContainer'),
            userCount: document.getElementById('userCount')
        };
        
        // Создаем элемент для отображения ошибок валидации username
        if (this.elements.usernameInput && !this.elements.usernameInput.parentElement.querySelector('.validation-error')) {
            const errorElement = document.createElement('div');
            errorElement.className = 'validation-error';
            errorElement.style.display = 'none';
            errorElement.style.color = '#e74c3c';
            errorElement.style.fontSize = '12px';
            errorElement.style.marginTop = '4px';
            errorElement.style.minHeight = '16px';
            this.elements.usernameInput.parentElement.appendChild(errorElement);
            this.elements.usernameValidationError = errorElement;
        }
        
        // Проверяем критические элементы
        const criticalElements = ['usernameInput', 'btnCreateRoom', 'loginScreen', 'roomScreen'];
        const missingElements = criticalElements.filter(key => !this.elements[key]);
        
        if (missingElements.length > 0) {
            console.error('❌ Missing critical elements:', missingElements);
            console.error('Available elements:', Object.keys(this.elements).filter(key => this.elements[key] !== null));
        } else {
            console.log('✅ All critical elements found');
        }
    },
    
    loadSavedUsername() {
        const savedUsername = localStorage.getItem('voiceRoomUsername');
        if (savedUsername && this.elements.usernameInput) {
            this.elements.usernameInput.value = savedUsername;
        }
    },
    
    setupEventListeners() {
        console.log('Setting up event listeners...');
        console.log('Document ready state:', document.readyState);
        
        if (this.elements.btnCreateRoom) {
            console.log('btnCreateRoom found, adding click listener');
            console.log('Button element:', this.elements.btnCreateRoom);
            console.log('Button ID:', this.elements.btnCreateRoom.id);
            console.log('Button current onclick:', this.elements.btnCreateRoom.onclick);
            
            // Добавляем обработчик через addEventListener
            const clickHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Create room button clicked via addEventListener');
                console.log('Event:', e);
                console.log('VoiceRoom.createRoom type:', typeof this.createRoom);
                console.log('VoiceRoom object:', this);
                this.createRoom();
            };
            
            this.elements.btnCreateRoom.addEventListener('click', clickHandler);
            
            // Проверяем что обработчик установлен
            console.log('Event listener added');
            console.log('Button onclick after setup:', this.elements.btnCreateRoom.onclick);
            
            // Тестовый клик для проверки
            console.log('Testing button click programmatically...');
            setTimeout(() => {
                if (this.elements.btnCreateRoom) {
                    const testEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
                    // Не вызываем автоматически, только логируем
                    console.log('Test event created, button ready for clicks');
                }
            }, 1000);
        } else {
            console.error('btnCreateRoom element not found!');
            console.error('Available elements:', Object.keys(this.elements));
            console.error('Document body:', document.body.innerHTML.substring(0, 500));
        }
        
        if (this.elements.btnJoinRoom) {
            this.elements.btnJoinRoom.addEventListener('click', () => {
                const display = this.elements.joinContainer.style.display;
                this.elements.joinContainer.style.display = display === 'none' ? 'block' : 'none';
                // Фокус на поле ввода кода комнаты при открытии
                if (display === 'none' && this.elements.roomIdInput) {
                    setTimeout(() => this.elements.roomIdInput.focus(), 100);
                }
            });
        }
        
        if (this.elements.btnJoinRoomNow) {
            this.elements.btnJoinRoomNow.addEventListener('click', () => {
                console.log('Join room button clicked');
                this.joinExistingRoom();
            });
        }
        
        if (this.elements.btnLeaveRoom) {
            this.elements.btnLeaveRoom.addEventListener('click', () => this.confirmLeaveRoom());
        }
        
        if (this.elements.btnToggleMic) {
            this.elements.btnToggleMic.addEventListener('click', () => this.toggleMicrophone());
        }
        
        if (this.elements.btnCopyLink) {
            this.elements.btnCopyLink.addEventListener('click', () => this.copyRoomLink());
        }
        
        if (this.elements.btnSaveServer) {
            this.elements.btnSaveServer.addEventListener('click', () => this.saveServerUrl());
        }
        
        if (this.elements.roomIdInput) {
            this.elements.roomIdInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.joinExistingRoom();
            });
            // Автоматически преобразуем в верхний регистр
            this.elements.roomIdInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            });
        }
        
        // Валидация username в реальном времени
        if (this.elements.usernameInput) {
            // Валидация при вводе (debounced)
            let validationTimeout = null;
            this.elements.usernameInput.addEventListener('input', (e) => {
                clearTimeout(validationTimeout);
                validationTimeout = setTimeout(() => {
                    this.validateUsernameInput(e.target.value, true);
                }, 300);
            });
            
            // Валидация при потере фокуса
            this.elements.usernameInput.addEventListener('blur', (e) => {
                this.validateUsernameInput(e.target.value, true);
            });
            
            // Валидация при фокусе (показываем помощь)
            this.elements.usernameInput.addEventListener('focus', () => {
                if (this.elements.usernameInput.value.trim() === '') {
                    this.showUsernameHint();
                }
            });
            
            this.elements.usernameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !this.currentRoomId) {
                    console.log('Enter pressed in username input, creating room');
                    // Проверяем валидность перед созданием
                    if (this.validateUsernameInput(this.elements.usernameInput.value, true)) {
                        this.createRoom();
                    }
                }
            });
            
            // Автофокус на поле username при загрузке (если не в комнате)
            if (!this.currentRoomId && document.activeElement !== this.elements.usernameInput) {
                setTimeout(() => {
                    if (this.elements.usernameInput && !this.elements.usernameInput.value) {
                        this.elements.usernameInput.focus();
                    }
                }, 100);
            }
        }
        
        console.log('Event listeners set up');
    },
    
    handleUrlParams() {
        // Обрабатываем новый формат /room/:roomId
        const pathname = window.location.pathname;
        const roomMatch = pathname.match(/^\/room\/([A-Z0-9]{6})$/i);
        
        if (roomMatch) {
            const roomId = roomMatch[1].toUpperCase();
            
            if (this.elements.roomIdInput) {
                this.elements.roomIdInput.value = roomId;
            }
            
            // Проверяем, была ли эта комната создана текущим пользователем
            const createdRoomData = sessionStorage.getItem('voiceRoomCreatedRoom');
            if (createdRoomData) {
                try {
                    const createdRoom = JSON.parse(createdRoomData);
                    // Проверяем, что это та же комната и прошло не более 30 секунд с момента создания
                    if (createdRoom.roomId === roomId && (Date.now() - createdRoom.timestamp) < 30000) {
                        console.log('Room was created by current user, restoring state');
                        // Восстанавливаем состояние
                        this.currentRoomId = createdRoom.roomId;
                        this.myUserId = createdRoom.userId;
                        this.myUsername = createdRoom.username;
                        
                        if (this.elements.usernameInput) {
                            this.elements.usernameInput.value = createdRoom.username;
                        }
                        
                        // Не нужно присоединяться повторно - мы уже в комнате
                        // Просто показываем экран комнаты если медиа уже инициализировано
                        if (this.localStream) {
                            // Медиа уже есть, просто показываем экран
                            if (this.elements.currentRoomIdSpan) {
                                this.elements.currentRoomIdSpan.textContent = roomId;
                            }
                            this.showRoomScreen();
                            return;
                        }
                        
                        // Медиа еще нет, инициализируем
                        this.initMedia().then(() => {
                            this.addUserToGrid(this.myUserId, createdRoom.username, true);
                            
                            if (this.elements.currentRoomIdSpan) {
                                this.elements.currentRoomIdSpan.textContent = roomId;
                            }
                            
                            this.showRoomScreen();
                        }).catch(error => {
                            console.error('Error initializing media:', error);
                            // При ошибке инициализации медиа все равно показываем экран комнаты
                            this.showRoomScreen();
                        });
                        
                        return; // Выходим, не делаем join-room
                    } else {
                        // Это старая информация о созданной комнате, удаляем
                        sessionStorage.removeItem('voiceRoomCreatedRoom');
                    }
                } catch (error) {
                    console.error('Error parsing created room data:', error);
                    sessionStorage.removeItem('voiceRoomCreatedRoom');
                }
            }
            
            // Показываем контейнер присоединения с плавной анимацией
            if (this.elements.joinContainer) {
                this.elements.joinContainer.style.display = 'block';
                // Добавляем класс для плавной анимации
                setTimeout(() => {
                    this.elements.joinContainer.classList.add('show');
                }, 10);
            }
            
            // Проверяем есть ли сохраненное имя
            const savedUsername = localStorage.getItem('voiceRoomUsername');
            if (savedUsername && this.elements.usernameInput) {
                this.elements.usernameInput.value = savedUsername;
                // Ждем подключения socket перед автоматическим присоединением
                this.waitForSocketAndJoin(roomId, savedUsername);
            } else {
                // Показываем информационное сообщение для нового пользователя
                if (this.elements.statusMessage) {
                    this.elements.statusMessage.textContent = 'Введите ваше имя для присоединения к комнате';
                    this.elements.statusMessage.className = 'status-message info show';
                }
            }
        }
    },
    
    waitForSocketAndJoin(roomId, username) {
        console.log('waitForSocketAndJoin called:', { roomId, username, hasSocket: !!this.socket, socketConnected: this.socket?.connected });
        
        // Проверяем подключение socket
        if (this.socket && this.socket.connected) {
            // Socket уже подключен, можно присоединяться сразу
            console.log('Socket already connected, joining room');
            setTimeout(() => {
                this.joinExistingRoom();
            }, 100);
            return;
        }
        
        // Ждем подключения socket
        if (!this.socket) {
            // Socket еще не инициализирован, ждем немного
            console.log('Socket not initialized yet, waiting...');
            setTimeout(() => {
                this.waitForSocketAndJoin(roomId, username);
            }, 200);
            return;
        }
        
        // Socket есть, но еще не подключен - ждем события connect
        console.log('Socket exists but not connected, waiting for connect event');
        let joined = false;
        const joinRoom = () => {
            if (joined) return;
            joined = true;
            console.log('Socket connected, joining room');
            setTimeout(() => {
                this.joinExistingRoom();
            }, 100);
        };
        
        // Устанавливаем обработчик события connect
        this.socket.once('connect', joinRoom);
        
        // Также запускаем проверку на случай если событие уже произошло
        const checkConnection = () => {
            if (this.socket && this.socket.connected) {
                joinRoom();
            } else if (!joined) {
                // Проверяем каждые 200ms
                setTimeout(checkConnection, 200);
            }
        };
        
        setTimeout(checkConnection, 200);
        
        // Таймаут на случай если подключение не произойдет
        setTimeout(() => {
            if (!joined) {
                console.warn('Socket connection timeout, trying to join anyway');
                joinRoom();
            }
        }, 5000);
    },
    
    async createRoom() {
        console.log('createRoom() called');
        console.log('Current state:', {
            hasUsernameInput: !!this.elements.usernameInput,
            hasSocket: !!this.socket,
            socketConnected: this.socket?.connected,
            connectionStatus: this.connectionStatus
        });
        
        // Очищаем предыдущие peer connections перед созданием новой комнаты
        this.peers.forEach((peer, userId) => {
            try {
                peer.close();
            } catch (error) {
                console.error('Error closing peer before createRoom:', error);
            }
        });
        this.peers.clear();
        
        if (!this.elements.usernameInput) {
            console.error('Username input not found');
            this.showNotification('Ошибка: поле ввода имени не найдено', 'error', 3000);
            return;
        }
        
        // Валидация перед отправкой
        const usernameValue = this.elements.usernameInput.value.trim();
        if (!this.validateUsernameInput(usernameValue, true)) {
            // Ошибка уже показана через validateUsernameInput
            return;
        }
        
        const username = this.sanitizeString(usernameValue);
        console.log('Username value:', username);
        
        if (!username || username.length < 1) {
            console.log('Username is empty after sanitization, showing notification');
            this.showNotification('Пожалуйста, введите ваше имя', 'error', 3000);
            return;
        }
        
        if (!this.socket) {
            console.error('Socket not initialized');
            this.showNotification('Ошибка подключения к серверу. Проверьте, что сервер запущен.', 'error', 5000);
            // Попробуем инициализировать socket
            console.log('Attempting to initialize socket...');
            this.initSocket();
            // Ждем немного и проверяем снова
            setTimeout(() => {
                if (!this.socket || !this.socket.connected) {
                    this.showNotification('Не удалось подключиться к серверу. Проверьте консоль браузера для деталей.', 'error', 5000);
                } else {
                    // Повторяем попытку создания комнаты
                    this.createRoom();
                }
            }, 2000);
            return;
        }
        
        if (!this.socket.connected) {
            console.warn('Socket not connected yet, waiting...');
            this.showNotification('Подключение к серверу... Пожалуйста, подождите.', 'info', 3000);
            // Ждем подключения
            const checkConnection = setInterval(() => {
                if (this.socket && this.socket.connected) {
                    clearInterval(checkConnection);
                    console.log('Socket connected, retrying createRoom...');
                    this.createRoom();
                }
            }, 500);
            
            // Таймаут на ожидание подключения
            setTimeout(() => {
                clearInterval(checkConnection);
                if (!this.socket || !this.socket.connected) {
                    this.showNotification('Таймаут подключения к серверу. Проверьте, что сервер запущен.', 'error', 5000);
                }
            }, 10000);
            return;
        }
        
        console.log('Creating room for user:', username);
        this.myUsername = username;
        localStorage.setItem('voiceRoomUsername', username);
        
        // Добавляем визуальную обратную связь
        if (this.elements.btnCreateRoom) {
            this.elements.btnCreateRoom.disabled = true;
            const originalText = this.elements.btnCreateRoom.innerHTML;
            this.elements.btnCreateRoom.innerHTML = '<span>⏳</span><span>Создание...</span>';
        }
        
        try {
            this.socket.emit('create-room', { username }, (response) => {
                console.log('create-room response:', response);
                
                // Восстанавливаем кнопку
                if (this.elements.btnCreateRoom) {
                    this.elements.btnCreateRoom.disabled = false;
                    this.elements.btnCreateRoom.innerHTML = '<span>➕</span><span>Создать комнату</span>';
                }
                
                if (!response) {
                    console.error('No response from server');
                    this.showNotification('Ошибка при создании комнаты. Попробуйте снова.', 'error', 5000);
                    return;
                }
                
                if (response.error) {
                    console.error('Server error:', response.error);
                    this.showNotification('Ошибка: ' + response.error, 'error', 5000);
                    return;
                }
                
                const { roomId, userId } = response;
                this.currentRoomId = roomId;
                this.myUserId = userId;
                console.log('✅ Room created:', roomId, 'User ID:', userId);
                
                // Сохраняем имя пользователя
                localStorage.setItem('voiceRoomUsername', username);
                
                // Сохраняем информацию о созданной комнате в sessionStorage для восстановления состояния
                sessionStorage.setItem('voiceRoomCreatedRoom', JSON.stringify({
                    roomId,
                    userId,
                    username,
                    timestamp: Date.now()
                }));
                
                // Изменяем URL через History API вместо полного редиректа (сохраняет socket соединение)
                if (!App.isCordova) {
                    window.history.pushState({ roomId }, '', `/room/${roomId}`);
                    // Обновляем UI после изменения URL
                    if (this.elements.roomIdInput) {
                        this.elements.roomIdInput.value = roomId;
                    }
                    // Показываем контейнер присоединения если он скрыт
                    if (this.elements.joinContainer) {
                        this.elements.joinContainer.style.display = 'block';
                        setTimeout(() => {
                            this.elements.joinContainer.classList.add('show');
                        }, 10);
                    }
                }
                
                this.showNotification('Комната создана!', 'success', 2000);
                
                // Инициализируем медиа и показываем экран комнаты
                this.initMedia().then(() => {
                    this.addUserToGrid(this.myUserId, username, true);
                    
                    if (this.elements.currentRoomIdSpan) {
                        this.elements.currentRoomIdSpan.textContent = roomId;
                    }
                    
                    const roomUrl = App.isCordova 
                        ? `voice-room://room?${roomId}`
                        : `${window.location.origin}/room/${roomId}`;
                    
                    if (this.elements.roomLinkInput) {
                        this.elements.roomLinkInput.value = roomUrl;
                    }
                    
                    if (this.elements.roomLinkContainer) {
                        this.elements.roomLinkContainer.style.display = 'block';
                        setTimeout(() => {
                            this.elements.roomLinkContainer.classList.add('show');
                        }, 10);
                    }
                    
                    // Отправляем начальный статус микрофона (для будущих участников)
                    if (this.localStream && this.socket && this.socket.connected && this.currentRoomId) {
                        const tracks = this.localStream.getAudioTracks();
                        const enabled = tracks[0]?.enabled ?? true;
                        this.socket.emit('microphone-status', {
                            roomId: this.currentRoomId,
                            enabled: enabled,
                            userId: this.myUserId
                        });
                    }
                    
                    this.showRoomScreen();
                }).catch(error => {
                    console.error('Error initializing media:', error);
                    let errorMessage = 'Не удалось получить доступ к микрофону. ';
                    if (error.name === 'NotAllowedError') {
                        errorMessage += 'Разрешите доступ к микрофону в настройках браузера.';
                    } else if (error.name === 'NotFoundError') {
                        errorMessage += 'Микрофон не найден.';
                    } else {
                        errorMessage += error.message;
                    }
                    this.showNotification(errorMessage, 'error', 7000);
                });
            });
        } catch (error) {
            console.error('Error emitting create-room:', error);
            this.showNotification('Ошибка при отправке запроса на создание комнаты', 'error', 5000);
            
            // Восстанавливаем кнопку
            if (this.elements.btnCreateRoom) {
                this.elements.btnCreateRoom.disabled = false;
                this.elements.btnCreateRoom.innerHTML = '<span>➕</span><span>Создать комнату</span>';
            }
        }
    },
    
    async joinExistingRoom() {
        if (!this.elements.roomIdInput || !this.elements.usernameInput) return;
        
        const roomId = this.elements.roomIdInput.value.trim().toUpperCase();
        const usernameValue = this.elements.usernameInput.value.trim();
        
        // Валидация roomId
        if (!roomId || roomId.length !== 6 || !/^[A-Z0-9]{6}$/.test(roomId)) {
            this.showNotification('Введите корректный код комнаты (6 символов)', 'error', 3000);
            if (this.elements.roomIdInput) {
                this.elements.roomIdInput.classList.add('invalid');
                setTimeout(() => {
                    if (this.elements.roomIdInput) {
                        this.elements.roomIdInput.classList.remove('invalid');
                    }
                }, 3000);
            }
            return;
        }
        
        // Валидация username
        if (!this.validateUsernameInput(usernameValue, true)) {
            // Ошибка уже показана через validateUsernameInput
            return;
        }
        
        const username = this.sanitizeString(usernameValue);
        
        if (!username || username.length < 1) {
            this.showNotification('Пожалуйста, введите ваше имя', 'error', 3000);
            return;
        }
        
        // Визуальная обратная связь
        if (this.elements.btnJoinRoomNow) {
            this.elements.btnJoinRoomNow.disabled = true;
            const originalText = this.elements.btnJoinRoomNow.innerHTML;
            this.elements.btnJoinRoomNow.innerHTML = '<span>⏳</span><span>Присоединение...</span>';
        }
        
        if (!this.socket) {
            this.showNotification('Ошибка подключения к серверу', 'error', 5000);
            return;
        }
        
        if (!this.socket.connected) {
            this.showNotification('Подключение к серверу... Пожалуйста, подождите.', 'info', 3000);
            return;
        }
        
        this.myUsername = username;
        localStorage.setItem('voiceRoomUsername', username);
        this.currentRoomId = roomId;
        
        this.socket.emit('join-room', { roomId, username }, async (response) => {
            // Восстанавливаем кнопку
            if (this.elements.btnJoinRoomNow) {
                this.elements.btnJoinRoomNow.disabled = false;
                this.elements.btnJoinRoomNow.innerHTML = '<span>✅</span><span>Присоединиться к комнате</span>';
            }
            
            if (response.error) {
                console.error('Join room error:', response.error);
                if (response.error.includes('not found')) {
                    this.showNotification('Комната не найдена. Создаем новую...', 'info', 3000);
                    setTimeout(() => this.createRoom(), 1000);
                } else if (response.error.includes('full')) {
                    this.showNotification('Комната переполнена. Максимум участников: ' + (response.maxUsers || '10'), 'error', 5000);
                } else {
                    this.showNotification('Ошибка: ' + response.error, 'error', 5000);
                }
                return;
            }
            
            const { userId, users } = response;
            this.myUserId = userId;
            console.log('Joined room:', roomId);
            this.showNotification('Вы присоединились к комнате!', 'success', 2000);
            
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
                                roomId: this.currentRoomId,
                                targetUserId: user.userId
                            });
                        }
                    });
                }
                
                // Отправляем свой статус микрофона всем участникам комнаты
                if (this.localStream && this.socket && this.socket.connected && this.currentRoomId) {
                    const tracks = this.localStream.getAudioTracks();
                    const enabled = tracks[0]?.enabled ?? true;
                    this.socket.emit('microphone-status', {
                        roomId: this.currentRoomId,
                        enabled: enabled,
                        userId: this.myUserId
                    });
                }
                
                if (this.elements.currentRoomIdSpan) {
                    this.elements.currentRoomIdSpan.textContent = roomId;
                }
                
                this.showRoomScreen();
            } catch (error) {
                console.error('Error joining room:', error);
                let errorMessage = 'Не удалось подключиться к комнате. ';
                if (error.name === 'NotAllowedError') {
                    errorMessage += 'Разрешите доступ к микрофону в настройках браузера.';
                } else {
                    errorMessage += error.message;
                }
                this.showNotification(errorMessage, 'error', 7000);
            }
        });
    },
    
    async initMedia() {
        try {
            // Закрываем предыдущий поток если есть
            if (this.localStream) {
                try {
                    this.localStream.getTracks().forEach(track => track.stop());
                } catch (error) {
                    console.error('Error stopping previous stream:', error);
                }
            }
            
            // Закрываем предыдущий AudioContext если есть
            if (this.audioContext && this.audioContext.state !== 'closed') {
                try {
                    await this.audioContext.close();
                } catch (error) {
                    console.error('Error closing previous AudioContext:', error);
                }
            }
            
            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    echoCancellation: true, 
                    noiseSuppression: true,
                    autoGainControl: true,
                    // Оптимизация для мобильных устройств
                    ...(this.isMobile ? {
                        sampleRate: 16000, // Меньшая частота дискретизации для экономии батареи
                        channelCount: 1 // Моно вместо стерео
                    } : {})
                },
                video: false 
            });
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            
            // Оптимизация для мобильных устройств
            if (this.isMobile) {
                this.analyser.fftSize = 128; // Меньший размер для экономии ресурсов
                this.analyser.smoothingTimeConstant = 0.6; // Более быстрая реакция на мобильных
            } else {
                this.analyser.fftSize = 256;
                this.analyser.smoothingTimeConstant = 0.8;
            }
            
            const source = this.audioContext.createMediaStreamSource(this.localStream);
            source.connect(this.analyser);
            
            this.startMicrophoneMonitoring();
        } catch (error) {
            console.error('Error accessing microphone:', error);
            // Очищаем частично созданные ресурсы
            if (this.localStream) {
                try {
                    this.localStream.getTracks().forEach(track => track.stop());
                } catch (e) {
                    console.error('Error stopping stream on error:', e);
                }
                this.localStream = null;
            }
            if (this.audioContext && this.audioContext.state !== 'closed') {
                try {
                    await this.audioContext.close();
                } catch (e) {
                    console.error('Error closing AudioContext on error:', e);
                }
                this.audioContext = null;
            }
            this.analyser = null;
            throw error; // Пробрасываем ошибку дальше
        }
    },
    
    createPeerConnection(targetUserId) {
        if (!this.localStream) {
            console.error('Cannot create peer connection: no local stream');
            return;
        }
        
        // Проверяем, не существует ли уже соединение
        if (this.peers.has(targetUserId)) {
            console.warn('Peer connection already exists for:', targetUserId);
            const existingPeer = this.peers.get(targetUserId);
            console.log('Existing peer state:', existingPeer.signalingState);
            return;
        }
        
        console.log('Creating peer with:', targetUserId);
        console.log('My userId:', this.myUserId, 'Target userId:', targetUserId);
        
        // Определяем кто создает offer первым (чтобы избежать race condition)
        // Пользователь с меньшим userId создает offer
        const shouldCreateOffer = this.myUserId < targetUserId;
        console.log('Should create offer:', shouldCreateOffer);
        
        try {
            const peer = new RTCPeerConnection({
                iceServers: this.ICE_SERVERS
            });
            
            // Добавляем локальные треки
            this.localStream.getTracks().forEach(track => {
                peer.addTrack(track, this.localStream);
            });
            
            peer.ontrack = (event) => {
                console.log('Received track from:', targetUserId);
                const stream = event.streams[0];
                
                const audio = document.getElementById(`audio-${targetUserId}`);
                if (audio && audio.play) {
                    audio.srcObject = stream;
                    audio.play().catch(err => {
                        console.error('Error playing audio:', err);
                    });
                }
                
                const video = document.getElementById(`video-${targetUserId}`);
                if (video) {
                    video.srcObject = stream;
                    if (stream.getVideoTracks().length > 0) {
                        const card = document.getElementById(`user-${targetUserId}`);
                        if (card) card.classList.add('has-video');
                    }
                }
            };
            
            peer.onicecandidate = (event) => {
                if (event.candidate && this.socket && this.socket.connected) {
                    this.socket.emit('ice-candidate', { 
                        roomId: this.currentRoomId, 
                        candidate: event.candidate, 
                        targetUserId, 
                        fromUserId: this.myUserId 
                    });
                }
            };
            
            peer.oniceconnectionstatechange = () => {
                console.log(`ICE connection state with ${targetUserId}:`, peer.iceConnectionState);
                const card = document.getElementById(`user-${targetUserId}`);
                if (card) {
                    const status = card.querySelector('.user-status');
                    if (status) {
                        switch (peer.iceConnectionState) {
                            case 'connected':
                                status.textContent = 'Подключен';
                                card.classList.remove('reconnecting', 'error');
                                card.classList.add('connected');
                                break;
                            case 'connecting':
                            case 'checking':
                                status.textContent = 'Подключение...';
                                card.classList.add('reconnecting');
                                card.classList.remove('error', 'connected');
                                break;
                            case 'disconnected':
                                status.textContent = 'Отключен';
                                card.classList.remove('reconnecting', 'connected');
                                break;
                            case 'failed':
                                status.textContent = 'Ошибка подключения';
                                card.classList.add('error');
                                card.classList.remove('reconnecting', 'connected');
                                // Пытаемся переподключиться
                                setTimeout(() => {
                                    if (this.peers.has(targetUserId)) {
                                        this.createPeerConnection(targetUserId);
                                    }
                                }, 3000);
                                break;
                            case 'closed':
                                status.textContent = 'Закрыто';
                                break;
                        }
                    }
                }
            };
            
            peer.onconnectionstatechange = () => {
                console.log(`Connection state with ${targetUserId}:`, peer.connectionState);
            };
            
            peer.onerror = (error) => {
                console.error('Peer connection error:', error);
                this.showNotification('Ошибка соединения с участником', 'error', 3000);
            };
            
            this.peers.set(targetUserId, peer);
            
            // Создаем offer только если мы должны инициировать соединение
            if (shouldCreateOffer) {
                console.log('Creating offer for:', targetUserId);
                peer.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: false
                }).then(offer => {
                    console.log('Offer created, setting local description...');
                    return peer.setLocalDescription(offer);
                }).then(() => {
                    console.log('Local description set, sending offer to:', targetUserId);
                    if (this.socket && this.socket.connected && peer.signalingState === 'have-local-offer') {
                        this.socket.emit('offer', { 
                            roomId: this.currentRoomId, 
                            offer: peer.localDescription, 
                            targetUserId, 
                            fromUserId: this.myUserId 
                        });
                    } else {
                        console.warn('Cannot send offer:', {
                            socketConnected: this.socket?.connected,
                            peerState: peer.signalingState
                        });
                    }
                }).catch(error => {
                    console.error('Error creating offer:', error);
                    this.peers.delete(targetUserId);
                    this.showNotification('Ошибка при создании соединения', 'error', 3000);
                });
            } else {
                console.log('Waiting for offer from:', targetUserId);
                // Если мы не создаем offer, просто ждем offer от другого пользователя
            }
        } catch (error) {
            console.error('Error creating peer connection:', error);
            this.showNotification('Ошибка при создании соединения', 'error', 3000);
        }
    },
    
    addUserToGrid(userId, username, isMyself = false) {
        if (!this.elements.usersGrid) return;
        if (document.getElementById(`user-${userId}`)) return;
        
        const sanitizedUsername = this.sanitizeString(username);
        const firstLetter = sanitizedUsername.charAt(0).toUpperCase() || '?';
        
        const card = document.createElement('div');
        card.id = `user-${userId}`;
        card.className = 'user-card' + (isMyself ? ' speaking' : '');
        
        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        avatar.textContent = firstLetter;
        
        const name = document.createElement('div');
        name.className = 'user-name';
        name.textContent = isMyself ? sanitizedUsername + ' (Вы)' : sanitizedUsername;
        
        const status = document.createElement('div');
        status.className = 'user-status';
        status.textContent = isMyself ? 'Подключен' : 'Подключение...';
        
        // Добавляем иконку статуса микрофона (по умолчанию включен)
        const micIcon = document.createElement('span');
        micIcon.className = 'microphone-status-icon';
        micIcon.textContent = ' 🎤';
        micIcon.title = 'Микрофон включен';
        status.appendChild(micIcon);
        
        // Устанавливаем начальный статус микрофона (по умолчанию включен)
        if (isMyself) {
            // Для себя проверяем реальный статус
            if (this.localStream) {
                const tracks = this.localStream.getAudioTracks();
                const enabled = tracks[0]?.enabled ?? true;
                this.updateMicrophoneStatusUI(userId, enabled);
            }
        } else {
            // Для других участников по умолчанию считаем микрофон включенным
            card.classList.add('microphone-active');
        }
        
        const video = document.createElement('video');
        video.id = `video-${userId}`;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true; // Всегда приглушаем для предотвращения обратной связи
        video.className = 'user-video';
        
        const audio = document.createElement('audio');
        audio.id = `audio-${userId}`;
        audio.autoplay = true;
        audio.playsInline = true;
        audio.muted = isMyself; // Приглушаем только свой аудио
        
        avatar.appendChild(video);
        card.appendChild(avatar);
        card.appendChild(name);
        card.appendChild(status);
        card.appendChild(audio);
        
        // Удаляем empty-state если есть
        const emptyState = this.elements.usersGrid.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }
        
        this.elements.usersGrid.appendChild(card);
        this.updateUserCount();
    },
    
    updateUserCount() {
        if (this.elements.userCount && this.elements.usersGrid) {
            const count = this.elements.usersGrid.querySelectorAll('.user-card').length;
            this.elements.userCount.textContent = count;
        }
    },
    
    toggleMicrophone() {
        if (!this.localStream) return;
        const tracks = this.localStream.getAudioTracks();
        tracks.forEach(track => track.enabled = !track.enabled);
        
        const enabled = tracks[0]?.enabled;
        if (this.elements.btnToggleMic) {
            this.elements.btnToggleMic.classList.toggle('muted', !enabled);
            const icon = this.elements.btnToggleMic.querySelector('.btn-icon');
            if (icon) {
                icon.textContent = enabled ? '🎤' : '🔇';
            }
        }
        
        // Отправляем статус микрофона другим участникам
        if (this.socket && this.socket.connected && this.currentRoomId) {
            this.socket.emit('microphone-status', {
                roomId: this.currentRoomId,
                enabled: enabled,
                userId: this.myUserId
            });
        }
        
        // Обновляем визуальный статус для себя
        this.updateMicrophoneStatusUI(this.myUserId, enabled);
    },
    
    updateMicrophoneStatusUI(userId, enabled) {
        const card = document.getElementById(`user-${userId}`);
        if (!card) return;
        
        // Добавляем или удаляем класс для отображения статуса
        card.classList.toggle('microphone-muted', !enabled);
        card.classList.toggle('microphone-active', enabled);
        
        // Обновляем иконку статуса микрофона в карточке пользователя
        let micIcon = card.querySelector('.microphone-status-icon');
        if (!micIcon) {
            micIcon = document.createElement('span');
            micIcon.className = 'microphone-status-icon';
            const statusEl = card.querySelector('.user-status');
            if (statusEl) {
                statusEl.appendChild(micIcon);
            }
        }
        micIcon.textContent = enabled ? ' 🎤' : ' 🔇';
        micIcon.title = enabled ? 'Микрофон включен' : 'Микрофон выключен';
    },
    
    startMicrophoneMonitoring() {
        if (!this.analyser) return;
        
        // Останавливаем предыдущий мониторинг если есть
        if (this.microphoneLevelCheckInterval) {
            clearInterval(this.microphoneLevelCheckInterval);
        }
        
        const buffer = new Uint8Array(this.analyser.frequencyBinCount);
        let lastCheckTime = 0;
        
        // Для мобильных устройств используем более длинный интервал
        const checkInterval = this.isMobile ? this.MICROPHONE_CHECK_INTERVAL * 2 : this.MICROPHONE_CHECK_INTERVAL;
        
        const check = () => {
            const now = Date.now();
            // Throttle проверки для оптимизации производительности
            if (now - lastCheckTime < checkInterval) {
                this.microphoneLevelCheckInterval = setTimeout(check, checkInterval);
                return;
            }
            
            lastCheckTime = now;
            this.analyser.getByteFrequencyData(buffer);
            const avg = buffer.reduce((a, b) => a + b, 0) / buffer.length;
            
            const myCard = document.getElementById(`user-${this.myUserId}`);
            if (myCard) {
                myCard.classList.toggle('speaking', avg > 10);
            }
            
            this.microphoneLevelCheckInterval = setTimeout(check, checkInterval);
        };
        
        check();
    },
    
    stopMicrophoneMonitoring() {
        if (this.microphoneLevelCheckInterval) {
            try {
                clearInterval(this.microphoneLevelCheckInterval);
            } catch (error) {
                console.error('Error clearing microphone interval:', error);
            }
            this.microphoneLevelCheckInterval = null;
        }
    },
    
    // Подтверждение выхода из комнаты
    confirmLeaveRoom() {
        if (this.elements.usersGrid && this.elements.usersGrid.querySelectorAll('.user-card').length > 1) {
            const confirmed = confirm('Вы уверены, что хотите покинуть комнату?');
            if (!confirmed) {
                return;
            }
        }
        this.leaveRoom();
    },
    
    leaveRoom() {
        // Останавливаем мониторинг микрофона
        try {
            this.stopMicrophoneMonitoring();
        } catch (error) {
            console.error('Error stopping microphone monitoring:', error);
        }
        
        // Закрываем все peer connections
        this.peers.forEach((peer, userId) => {
            try {
                peer.close();
            } catch (error) {
                console.error('Error closing peer:', error);
            }
        });
        this.peers.clear();
        
        // Останавливаем локальный поток
        if (this.localStream) {
            try {
                this.localStream.getTracks().forEach(track => {
                    track.stop();
                });
            } catch (error) {
                console.error('Error stopping tracks:', error);
            }
            this.localStream = null;
        }
        
        // Закрываем AudioContext
        if (this.audioContext && this.audioContext.state !== 'closed') {
            try {
                this.audioContext.close().catch(error => {
                    console.error('Error closing AudioContext:', error);
                });
            } catch (error) {
                console.error('Error closing AudioContext:', error);
            }
            this.audioContext = null;
        }
        
        this.analyser = null;
        
        // Очищаем таймауты
        if (this.reconnectTimeout) {
            try {
                clearTimeout(this.reconnectTimeout);
            } catch (error) {
                console.error('Error clearing reconnectTimeout:', error);
            }
            this.reconnectTimeout = null;
        }
        
        // Очищаем UI
        if (this.elements.usersGrid) {
            this.elements.usersGrid.innerHTML = '';
        }
        
        if (this.elements.loginScreen) {
            this.elements.loginScreen.classList.add('active');
        }
        
        if (this.elements.roomScreen) {
            this.elements.roomScreen.classList.remove('active');
        }
        
        // Уведомляем сервер
        if (this.socket && this.socket.connected && this.currentRoomId) {
            try {
                this.socket.emit('leave-room', { roomId: this.currentRoomId });
            } catch (error) {
                console.error('Error emitting leave-room:', error);
            }
        }
        
        this.currentRoomId = null;
        this.myUserId = null;
    },
    
    showRoomScreen() {
        if (this.elements.loginScreen) {
            this.elements.loginScreen.classList.remove('active');
        }
        if (this.elements.roomScreen) {
            this.elements.roomScreen.classList.add('active');
        }
    },
    
    async copyRoomLink() {
        if (!this.elements.roomLinkInput) return;
        try {
            await navigator.clipboard.writeText(this.elements.roomLinkInput.value);
            this.showNotification('Ссылка скопирована!', 'success', 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
            // Fallback для старых браузеров
            this.elements.roomLinkInput.select();
            document.execCommand('copy');
            this.showNotification('Ссылка скопирована!', 'success', 2000);
        }
    }
};

// Экспорт для использования
window.VoiceRoom = VoiceRoom;

