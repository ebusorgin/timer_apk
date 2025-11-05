// Voice Room модуль для Cordova
const VoiceRoom = {
    socket: null,
    localStream: null,
    peers: new Map(),
    currentRoomId: null,
    myUserId: null,
    myUsername: null,
    audioContext: null,
    analyser: null,
    connectionStatus: 'disconnected',
    globalStatusCheckInterval: null, // Интервал для глобальной проверки статусов всех участников
    isJoiningRoom: false,
    isCreatingRoom: false,
    joinRoomTimeout: null,
    
    // Константы WebRTC
    ICE_SERVERS: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    
    // URL сервера фиксированный для Cordova
    SERVER_URL: 'https://aiternitas.ru',
    
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
        let result = str.replace(/<[^>]*>/g, '');
        result = result.replace(/javascript:/gi, '').replace(/on\w+\s*=/gi, '').replace(/script/gi, '');
        result = result.trim();
        return result.substring(0, 20);
    },
    
    // Валидация username
    validateUsername(username) {
        if (!username || typeof username !== 'string') {
            return { valid: false, error: 'Username must be at least 1 character' };
        }
        const sanitized = this.sanitizeString(username);
        if (sanitized.length < 1) {
            return { valid: false, error: 'Username must be at least 1 character' };
        }
        return { valid: true, username: sanitized };
    },
    
    init() {
        console.log('VoiceRoom Cordova initializing...');
        this.initElements();
        this.loadSavedUsername();
        this.setupEventListeners();
        this.initSocket();
        
        // Запускаем глобальную периодическую проверку статусов всех участников
        // Это особенно важно для Cordova, где события WebRTC могут работать не так надежно
        this.startGlobalStatusCheck();
    },
    
    startGlobalStatusCheck() {
        // Останавливаем предыдущую проверку если она есть
        if (this.globalStatusCheckInterval) {
            clearInterval(this.globalStatusCheckInterval);
        }
        
        // Проверяем статусы всех участников каждые 2 секунды
        this.globalStatusCheckInterval = setInterval(() => {
            if (!this.currentRoomId) {
                // Если мы не в комнате, останавливаем проверку
                if (this.globalStatusCheckInterval) {
                    clearInterval(this.globalStatusCheckInterval);
                    this.globalStatusCheckInterval = null;
                }
                return;
            }
            
            // Проверяем все peer connections
            this.peers.forEach((peer, userId) => {
                if (userId === this.myUserId) {
                    return; // Пропускаем себя
                }
                
                const card = document.querySelector(`[data-user-id="${userId}"]`);
                const status = card?.querySelector('.user-status');
                
                if (!card || !status) {
                    return;
                }
                
                const iceState = peer.iceConnectionState;
                const connState = peer.connectionState;
                
                // Если соединение установлено, но статус еще "Подключение..."
                if ((iceState === 'connected' || iceState === 'completed' || connState === 'connected') && 
                    status.textContent === 'Подключение...') {
                    console.log(`Global status check: Force updating status to "Подключен" for ${userId}`);
                    status.textContent = 'Подключен';
                    card.classList.add('connected');
                    card.classList.remove('reconnecting', 'error');
                }
                
                // Если соединение установлено и у нас есть remote и local descriptions
                if (peer.remoteDescription && peer.localDescription &&
                    (iceState === 'connected' || iceState === 'completed' || connState === 'connected') &&
                    status.textContent === 'Подключение...') {
                    console.log(`Global status check: Force updating status to "Подключен" for ${userId} (descriptions set)`);
                    status.textContent = 'Подключен';
                    card.classList.add('connected');
                    card.classList.remove('reconnecting', 'error');
                }
            });
        }, 2000); // Проверяем каждые 2 секунды
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
            userCount: document.getElementById('userCount'),
            roomLink: document.getElementById('roomLink'),
            roomLinkContainer: document.getElementById('roomLinkContainer'),
            joinContainer: document.getElementById('joinContainer')
        };
        
        // Проверяем что критичные элементы найдены
        const criticalElements = ['loginScreen', 'roomScreen', 'usernameInput', 'btnCreateRoom'];
        criticalElements.forEach(key => {
            if (!this.elements[key]) {
                console.error(`Critical element not found: ${key}`);
            } else {
                console.log(`Element found: ${key}`);
            }
        });
    },
    
    loadSavedUsername() {
        const savedUsername = localStorage.getItem('voiceRoomUsername');
        if (savedUsername && this.elements.usernameInput) {
            this.elements.usernameInput.value = savedUsername;
        }
    },
    
    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        if (this.elements.btnCreateRoom) {
            const clickHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Create room button clicked');
                if (typeof this.createRoom === 'function') {
                    this.createRoom();
                }
            };
            this.elements.btnCreateRoom.addEventListener('touchstart', clickHandler, { passive: false });
            this.elements.btnCreateRoom.addEventListener('click', clickHandler);
        }
        
        if (this.elements.btnJoinRoom) {
            this.elements.btnJoinRoom.addEventListener('click', () => {
                if (!this.elements.joinContainer) return;
                const isHidden = this.elements.joinContainer.classList.contains('hidden');
                if (isHidden) {
                    this.elements.joinContainer.classList.remove('hidden');
                    setTimeout(() => {
                        if (this.elements.roomIdInput) {
                            this.elements.roomIdInput.focus();
                        }
                    }, 100);
                } else {
                    this.elements.joinContainer.classList.add('hidden');
                }
            });
        }
        
        if (this.elements.btnJoinRoomNow) {
            const joinHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Join room button clicked');
                if (typeof this.joinExistingRoom === 'function') {
                    this.joinExistingRoom();
                }
            };
            this.elements.btnJoinRoomNow.addEventListener('touchstart', joinHandler, { passive: false });
            this.elements.btnJoinRoomNow.addEventListener('click', joinHandler);
        }
        
        if (this.elements.btnLeaveRoom) {
            this.elements.btnLeaveRoom.addEventListener('click', () => this.leaveRoom());
        }
        
        if (this.elements.btnToggleMic) {
            this.elements.btnToggleMic.addEventListener('click', () => this.toggleMicrophone());
        }
    },
    
    initSocket() {
        console.log('Initializing socket to:', this.SERVER_URL);
        
        if (typeof io === 'undefined') {
            console.error('Socket.IO не загружен!');
            this.showNotification('Ошибка: Socket.IO не загружен', 'error', 5000);
            return;
        }
        
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        
        this.connectionStatus = 'connecting';
        
        this.socket = io(this.SERVER_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 20000
        });
        
        this.setupSocketEvents();
    },
    
    setupSocketEvents() {
        if (!this.socket) return;
        
        this.socket.on('connect', () => {
            console.log('Socket connected');
            this.connectionStatus = 'connected';
        });
        
        this.socket.on('disconnect', () => {
            console.log('Socket disconnected');
            this.connectionStatus = 'disconnected';
        });
        
        this.socket.on('user-joined', (data) => {
            console.log('User joined:', data);
            if (data.userId !== this.myUserId) {
                this.addUserToGrid(data.userId, data.username);
                this.createPeerConnection(data.userId);
            }
        });
        
        this.socket.on('user-left', (data) => {
            console.log('User left:', data);
            this.removeUserFromGrid(data.userId);
        });
        
        this.socket.on('offer', async (data) => {
            console.log('Received offer from:', data.from);
            await this.handleOffer(data);
        });
        
        this.socket.on('answer', async (data) => {
            console.log('Received answer from:', data.from);
            await this.handleAnswer(data);
        });
        
        this.socket.on('ice-candidate', async (data) => {
            console.log('Received ICE candidate from:', data.from);
            await this.handleIceCandidate(data);
        });
        
        this.socket.on('microphone-status', (data) => {
            console.log('Microphone status:', data);
            this.updateUserMicrophoneStatus(data.userId, data.enabled);
        });
    },
    
    async createRoom() {
        if (this.isCreatingRoom) {
            console.log('Already creating room');
            return;
        }
        
        this.isCreatingRoom = true;
        
        if (!this.elements.usernameInput) {
            this.isCreatingRoom = false;
            this.showNotification('Ошибка: поле ввода имени не найдено', 'error', 3000);
            return;
        }
        
        const usernameValue = this.elements.usernameInput.value.trim();
        const validation = this.validateUsername(usernameValue);
        
        if (!validation.valid) {
            this.isCreatingRoom = false;
            this.showNotification(validation.error, 'error', 3000);
            return;
        }
        
        const username = this.sanitizeString(usernameValue);
        
        if (!this.socket || !this.socket.connected) {
            this.isCreatingRoom = false;
            this.showNotification('Подключение к серверу...', 'info', 3000);
            setTimeout(() => {
                if (this.socket && this.socket.connected) {
                    this.createRoom();
                } else {
                    this.showNotification('Не удалось подключиться к серверу', 'error', 5000);
                }
            }, 2000);
            return;
        }
        
        this.myUsername = username;
        localStorage.setItem('voiceRoomUsername', username);
        
        if (this.elements.btnCreateRoom) {
            this.elements.btnCreateRoom.disabled = true;
        }
        
        try {
            this.socket.emit('create-room', { username }, async (response) => {
                this.isCreatingRoom = false;
                
                if (this.elements.btnCreateRoom) {
                    this.elements.btnCreateRoom.disabled = false;
                }
                
                if (!response || response.error) {
                    this.showNotification(response?.error || 'Ошибка при создании комнаты', 'error', 5000);
                    return;
                }
                
                const { roomId, userId } = response;
                this.currentRoomId = roomId;
                this.myUserId = userId;
                
                console.log('Room created:', roomId);
                this.showNotification('Комната создана!', 'success', 2000);
                
                if (this.elements.roomLink) {
                    this.elements.roomLink.textContent = roomId;
                }
                if (this.elements.roomLinkContainer) {
                    this.elements.roomLinkContainer.style.display = 'block';
                }
                
                // Инициализируем медиа и показываем экран комнаты
                this.initMedia().then(() => {
                    console.log('Media initialized successfully');
                    this.addUserToGrid(this.myUserId, username, true);
                    
                    if (this.elements.currentRoomIdSpan) {
                        this.elements.currentRoomIdSpan.textContent = roomId;
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
                    
                    // Небольшая задержка перед переключением экрана для плавности
                    setTimeout(() => {
                        this.showRoomScreen();
                    }, 100);
                }).catch(error => {
                    console.error('Error initializing media:', error);
                    let errorMessage = 'Не удалось получить доступ к микрофону. ';
                    if (error.name === 'NotAllowedError') {
                        errorMessage += 'Разрешите доступ к микрофону в настройках приложения.';
                    } else if (error.name === 'NotFoundError') {
                        errorMessage += 'Микрофон не найден.';
                    } else {
                        errorMessage += error.message;
                    }
                    this.showNotification(errorMessage, 'error', 7000);
                    
                    // Все равно показываем экран комнаты даже если медиа не инициализировано
                    console.log('Showing room screen despite media error');
                    this.addUserToGrid(this.myUserId, username, true);
                    
                    if (this.elements.currentRoomIdSpan) {
                        this.elements.currentRoomIdSpan.textContent = roomId;
                    }
                    
                    // Небольшая задержка перед переключением экрана
                    setTimeout(() => {
                        this.showRoomScreen();
                    }, 100);
                });
            });
        } catch (error) {
            this.isCreatingRoom = false;
            console.error('Error creating room:', error);
            this.showNotification('Ошибка при создании комнаты', 'error', 5000);
            if (this.elements.btnCreateRoom) {
                this.elements.btnCreateRoom.disabled = false;
            }
        }
    },
    
    async joinExistingRoom() {
        if (this.isJoiningRoom) {
            console.log('Already joining room');
            return;
        }
        
        if (!this.elements.roomIdInput || !this.elements.usernameInput) {
            return;
        }
        
        const roomId = this.elements.roomIdInput.value.trim().toUpperCase();
        const usernameValue = this.elements.usernameInput.value.trim();
        
        if (!roomId || roomId.length !== 6 || !/^[A-Z0-9]{6}$/.test(roomId)) {
            this.showNotification('Введите корректный код комнаты (6 символов)', 'error', 3000);
            return;
        }
        
        const validation = this.validateUsername(usernameValue);
        if (!validation.valid) {
            this.showNotification(validation.error, 'error', 3000);
            return;
        }
        
        const username = this.sanitizeString(usernameValue);
        
        this.isJoiningRoom = true;
        
        if (this.joinRoomTimeout) {
            clearTimeout(this.joinRoomTimeout);
        }
        
        this.joinRoomTimeout = setTimeout(() => {
            if (this.isJoiningRoom) {
                this.isJoiningRoom = false;
                if (this.elements.btnJoinRoomNow) {
                    this.elements.btnJoinRoomNow.disabled = false;
                }
                this.showNotification('Таймаут присоединения', 'error', 5000);
            }
        }, 10000);
        
        if (this.elements.btnJoinRoomNow) {
            this.elements.btnJoinRoomNow.disabled = true;
        }
        
        if (!this.socket || !this.socket.connected) {
            this.isJoiningRoom = false;
            if (this.joinRoomTimeout) {
                clearTimeout(this.joinRoomTimeout);
                this.joinRoomTimeout = null;
            }
            this.showNotification('Подключение к серверу...', 'info', 3000);
            return;
        }
        
        this.myUsername = username;
        localStorage.setItem('voiceRoomUsername', username);
        this.currentRoomId = roomId;
        
        try {
            this.socket.emit('join-room', { roomId, username }, async (response) => {
                if (this.joinRoomTimeout) {
                    clearTimeout(this.joinRoomTimeout);
                    this.joinRoomTimeout = null;
                }
                
                this.isJoiningRoom = false;
                
                if (this.elements.btnJoinRoomNow) {
                    this.elements.btnJoinRoomNow.disabled = false;
                }
                
                if (!response || response.error) {
                    this.showNotification(response?.error || 'Ошибка при присоединении', 'error', 5000);
                    return;
                }
                
                const { userId, users } = response;
                this.myUserId = userId;
                
                console.log('Joined room:', roomId);
                this.showNotification('Вы присоединились к комнате!', 'success', 2000);
                
                this.initMedia().then(() => {
                    console.log('Media initialized successfully');
                    this.addUserToGrid(this.myUserId, username, true);
                    
                    if (users && users.length > 0) {
                        users.forEach(user => {
                            const sanitizedUsername = this.sanitizeString(user.username);
                            this.addUserToGrid(user.userId, sanitizedUsername);
                            this.createPeerConnection(user.userId);
                        });
                    }
                    
                    if (this.elements.currentRoomIdSpan) {
                        this.elements.currentRoomIdSpan.textContent = roomId;
                    }
                    
                    // Небольшая задержка перед переключением экрана для плавности
                    setTimeout(() => {
                        this.showRoomScreen();
                    }, 100);
                }).catch(error => {
                    console.error('Error joining room:', error);
                    let errorMessage = 'Не удалось получить доступ к микрофону. ';
                    if (error.name === 'NotAllowedError') {
                        errorMessage += 'Разрешите доступ к микрофону в настройках приложения.';
                    } else {
                        errorMessage += error.message;
                    }
                    this.showNotification(errorMessage, 'error', 7000);
                    
                    // Все равно показываем экран комнаты даже если медиа не инициализировано
                    console.log('Showing room screen despite media error');
                    this.addUserToGrid(this.myUserId, username, true);
                    
                    if (users && users.length > 0) {
                        users.forEach(user => {
                            const sanitizedUsername = this.sanitizeString(user.username);
                            this.addUserToGrid(user.userId, sanitizedUsername);
                        });
                    }
                    
                    if (this.elements.currentRoomIdSpan) {
                        this.elements.currentRoomIdSpan.textContent = roomId;
                    }
                    
                    // Небольшая задержка перед переключением экрана
                    setTimeout(() => {
                        this.showRoomScreen();
                    }, 100);
                });
            });
        } catch (error) {
            this.isJoiningRoom = false;
            if (this.joinRoomTimeout) {
                clearTimeout(this.joinRoomTimeout);
                this.joinRoomTimeout = null;
            }
            console.error('Error joining room:', error);
            this.showNotification('Ошибка при присоединении', 'error', 5000);
            if (this.elements.btnJoinRoomNow) {
                this.elements.btnJoinRoomNow.disabled = false;
            }
        }
    },
    
    async initMedia() {
        try {
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }
            
            if (this.audioContext && this.audioContext.state !== 'closed') {
                await this.audioContext.close();
            }
            
            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    echoCancellation: true, 
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false 
            });
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 128;
            
            const source = this.audioContext.createMediaStreamSource(this.localStream);
            source.connect(this.analyser);
        } catch (error) {
            console.error('Error accessing microphone:', error);
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }
            throw error;
        }
    },
    
    createPeerConnection(targetUserId) {
        if (!this.localStream) {
            console.error('Cannot create peer connection: no local stream');
            return;
        }
        
        if (this.peers.has(targetUserId)) {
            console.warn('Peer connection already exists for:', targetUserId);
            return;
        }
        
        const shouldCreateOffer = this.myUserId < targetUserId;
        
        try {
            const peer = new RTCPeerConnection({
                iceServers: this.ICE_SERVERS
            });
            
            this.localStream.getTracks().forEach(track => {
                peer.addTrack(track, this.localStream);
            });
            
            peer.ontrack = (event) => {
                console.log('Received track from:', targetUserId);
                console.log('Updating status to connected for:', targetUserId);
                const audio = document.createElement('audio');
                audio.autoplay = true;
                audio.srcObject = event.streams[0];
                audio.setAttribute('data-user-id', targetUserId);
                document.body.appendChild(audio);
                
                // Обновляем статус при получении трека
                // Небольшая задержка для гарантии что карточка создана
                setTimeout(() => {
                    const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
                    console.log('Card found in ontrack for', targetUserId, ':', !!card);
                    if (card) {
                        const status = card.querySelector('.user-status');
                        if (status) {
                            console.log('Updating status to "Подключен" for', targetUserId);
                            status.textContent = 'Подключен';
                            card.classList.add('connected');
                            card.classList.remove('reconnecting', 'error');
                        } else {
                            console.warn('Status element not found in ontrack for', targetUserId);
                        }
                    } else {
                        console.warn('Card not found in ontrack for', targetUserId);
                        // Если карточка еще не создана, создаем ее
                        // Но это не должно происходить, так как addUserToGrid вызывается перед createPeerConnection
                    }
                }, 100);
            };
            
            peer.onicecandidate = (event) => {
                if (event.candidate && this.socket && this.socket.connected) {
                    this.socket.emit('ice-candidate', {
                        to: targetUserId,
                        candidate: event.candidate,
                        roomId: this.currentRoomId
                    });
                }
            };
            
            // Отслеживаем изменение состояния ICE соединения
            peer.oniceconnectionstatechange = () => {
                console.log(`ICE connection state for ${targetUserId}:`, peer.iceConnectionState);
                const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
                console.log(`Card found for ${targetUserId}:`, !!card);
                const status = card?.querySelector('.user-status');
                console.log(`Status element found for ${targetUserId}:`, !!status);
                
                if (!status) {
                    console.warn(`Status element not found for user ${targetUserId}. Card exists:`, !!card);
                    return;
                }
                
                switch (peer.iceConnectionState) {
                    case 'connected':
                    case 'completed':
                        status.textContent = 'Подключен';
                        if (card) {
                            card.classList.add('connected');
                            card.classList.remove('reconnecting', 'error');
                        }
                        break;
                    case 'connecting':
                    case 'checking':
                        status.textContent = 'Подключение...';
                        if (card) {
                            card.classList.remove('error', 'connected');
                        }
                        break;
                    case 'disconnected':
                        status.textContent = 'Отключен';
                        if (card) {
                            card.classList.add('reconnecting');
                            card.classList.remove('connected', 'error');
                        }
                        break;
                    case 'failed':
                        status.textContent = 'Ошибка подключения';
                        if (card) {
                            card.classList.add('error');
                            card.classList.remove('connected', 'reconnecting');
                        }
                        break;
                    case 'closed':
                        status.textContent = 'Закрыто';
                        break;
                }
            };
            
            // Отслеживаем изменение состояния соединения
            peer.onconnectionstatechange = () => {
                console.log(`Connection state for ${targetUserId}:`, peer.connectionState);
                const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
                console.log(`Card found for ${targetUserId} (connection state):`, !!card);
                const status = card?.querySelector('.user-status');
                console.log(`Status element found for ${targetUserId} (connection state):`, !!status);
                
                if (!status) {
                    console.warn(`Status element not found for user ${targetUserId} (connection state). Card exists:`, !!card);
                    return;
                }
                
                switch (peer.connectionState) {
                    case 'connected':
                        status.textContent = 'Подключен';
                        if (card) {
                            card.classList.add('connected');
                            card.classList.remove('reconnecting', 'error');
                        }
                        break;
                    case 'connecting':
                        status.textContent = 'Подключение...';
                        if (card) {
                            card.classList.remove('error', 'connected');
                        }
                        break;
                    case 'disconnected':
                        status.textContent = 'Отключен';
                        if (card) {
                            card.classList.add('reconnecting');
                            card.classList.remove('connected', 'error');
                        }
                        break;
                    case 'failed':
                        status.textContent = 'Ошибка подключения';
                        if (card) {
                            card.classList.add('error');
                            card.classList.remove('connected', 'reconnecting');
                        }
                        break;
                    case 'closed':
                        status.textContent = 'Закрыто';
                        break;
                }
            };
            
            this.peers.set(targetUserId, peer);
            
            // Добавляем периодическую проверку состояния соединения для Cordova
            // В Cordova события WebRTC могут работать не так надежно
            const checkConnectionInterval = setInterval(() => {
                const currentPeer = this.peers.get(targetUserId);
                if (!currentPeer) {
                    clearInterval(checkConnectionInterval);
                    return;
                }
                
                const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
                const status = card?.querySelector('.user-status');
                
                if (!card || !status) {
                    return;
                }
                
                // Принудительно обновляем статус на основе текущего состояния
                const iceState = currentPeer.iceConnectionState;
                const connState = currentPeer.connectionState;
                
                console.log(`Periodic check for ${targetUserId}: ICE=${iceState}, Connection=${connState}`);
                
                // Если соединение установлено, но статус еще "Подключение..."
                if ((iceState === 'connected' || iceState === 'completed' || connState === 'connected') && 
                    status.textContent === 'Подключение...') {
                    console.log(`Force updating status to "Подключен" for ${targetUserId}`);
                    status.textContent = 'Подключен';
                    card.classList.add('connected');
                    card.classList.remove('reconnecting', 'error');
                }
                
                // Если соединение установлено и мы получили трек, но статус не обновлен
                if (currentPeer.remoteDescription && currentPeer.localDescription &&
                    (iceState === 'connected' || iceState === 'completed' || connState === 'connected') &&
                    status.textContent === 'Подключение...') {
                    console.log(`Force updating status to "Подключен" for ${targetUserId} (after descriptions set)`);
                    status.textContent = 'Подключен';
                    card.classList.add('connected');
                    card.classList.remove('reconnecting', 'error');
                }
            }, 1000); // Проверяем каждую секунду
            
            // Останавливаем проверку через 30 секунд или когда соединение установлено
            setTimeout(() => {
                clearInterval(checkConnectionInterval);
            }, 30000);
            
            if (shouldCreateOffer) {
                peer.createOffer().then(offer => {
                    peer.setLocalDescription(offer);
                    if (this.socket && this.socket.connected) {
                        this.socket.emit('offer', {
                            to: targetUserId,
                            offer: offer,
                            roomId: this.currentRoomId
                        });
                    }
                    
                    // После создания offer проверяем статус
                    setTimeout(() => {
                        const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
                        const status = card?.querySelector('.user-status');
                        
                        if (card && status) {
                            const iceState = peer.iceConnectionState;
                            const connState = peer.connectionState;
                            
                            console.log(`After creating offer for ${targetUserId}: ICE=${iceState}, Connection=${connState}`);
                            
                            if (iceState === 'connected' || iceState === 'completed' || connState === 'connected') {
                                console.log(`Updating status to "Подключен" after creating offer for ${targetUserId}`);
                                status.textContent = 'Подключен';
                                card.classList.add('connected');
                                card.classList.remove('reconnecting', 'error');
                            }
                        }
                    }, 500);
                }).catch(error => {
                    console.error('Error creating offer:', error);
                });
            }
        } catch (error) {
            console.error('Error creating peer connection:', error);
        }
    },
    
    async handleOffer(data) {
        const peer = this.peers.get(data.from);
        if (!peer) {
            this.createPeerConnection(data.from);
            const newPeer = this.peers.get(data.from);
            if (newPeer) {
                await newPeer.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await newPeer.createAnswer();
                await newPeer.setLocalDescription(answer);
                if (this.socket && this.socket.connected) {
                    this.socket.emit('answer', {
                        to: data.from,
                        answer: answer,
                        roomId: this.currentRoomId
                    });
                }
                
                // После установки offer и создания answer проверяем статус
                setTimeout(() => {
                    const card = document.querySelector(`[data-user-id="${data.from}"]`);
                    const status = card?.querySelector('.user-status');
                    
                    if (card && status) {
                        const iceState = newPeer.iceConnectionState;
                        const connState = newPeer.connectionState;
                        
                        console.log(`After offer handling for ${data.from}: ICE=${iceState}, Connection=${connState}`);
                        
                        if (iceState === 'connected' || iceState === 'completed' || connState === 'connected') {
                            console.log(`Updating status to "Подключен" after offer for ${data.from}`);
                            status.textContent = 'Подключен';
                            card.classList.add('connected');
                            card.classList.remove('reconnecting', 'error');
                        }
                    }
                }, 500);
            }
        } else {
            await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            if (this.socket && this.socket.connected) {
                this.socket.emit('answer', {
                    to: data.from,
                    answer: answer,
                    roomId: this.currentRoomId
                });
            }
            
            // После установки offer и создания answer проверяем статус
            setTimeout(() => {
                const card = document.querySelector(`[data-user-id="${data.from}"]`);
                const status = card?.querySelector('.user-status');
                
                if (card && status) {
                    const iceState = peer.iceConnectionState;
                    const connState = peer.connectionState;
                    
                    console.log(`After offer handling (existing peer) for ${data.from}: ICE=${iceState}, Connection=${connState}`);
                    
                    if (iceState === 'connected' || iceState === 'completed' || connState === 'connected') {
                        console.log(`Updating status to "Подключен" after offer (existing peer) for ${data.from}`);
                        status.textContent = 'Подключен';
                        card.classList.add('connected');
                        card.classList.remove('reconnecting', 'error');
                    }
                }
            }, 500);
        }
    },
    
    async handleAnswer(data) {
        const peer = this.peers.get(data.from);
        if (peer) {
            await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
            
            // После установки answer проверяем и обновляем статус
            setTimeout(() => {
                const card = document.querySelector(`[data-user-id="${data.from}"]`);
                const status = card?.querySelector('.user-status');
                
                if (card && status) {
                    const iceState = peer.iceConnectionState;
                    const connState = peer.connectionState;
                    
                    console.log(`After answer for ${data.from}: ICE=${iceState}, Connection=${connState}`);
                    
                    if (iceState === 'connected' || iceState === 'completed' || connState === 'connected') {
                        console.log(`Updating status to "Подключен" after answer for ${data.from}`);
                        status.textContent = 'Подключен';
                        card.classList.add('connected');
                        card.classList.remove('reconnecting', 'error');
                    }
                }
            }, 500);
        }
    },
    
    async handleIceCandidate(data) {
        const peer = this.peers.get(data.from);
        if (peer && data.candidate) {
            await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
            
            // После добавления ICE кандидата проверяем статус
            setTimeout(() => {
                const card = document.querySelector(`[data-user-id="${data.from}"]`);
                const status = card?.querySelector('.user-status');
                
                if (card && status) {
                    const iceState = peer.iceConnectionState;
                    const connState = peer.connectionState;
                    
                    console.log(`After ICE candidate for ${data.from}: ICE=${iceState}, Connection=${connState}`);
                    
                    if ((iceState === 'connected' || iceState === 'completed' || connState === 'connected') &&
                        status.textContent === 'Подключение...') {
                        console.log(`Updating status to "Подключен" after ICE candidate for ${data.from}`);
                        status.textContent = 'Подключен';
                        card.classList.add('connected');
                        card.classList.remove('reconnecting', 'error');
                    }
                }
            }, 300);
        }
    },
    
    addUserToGrid(userId, username, isMyself = false) {
        if (!this.elements.usersGrid) return;
        
        const existingCard = document.querySelector(`[data-user-id="${userId}"]`);
        if (existingCard) return;
        
        const emptyState = this.elements.usersGrid.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }
        
        const card = document.createElement('div');
        card.className = 'user-card';
        card.setAttribute('data-user-id', userId);
        if (isMyself) {
            card.classList.add('myself');
        }
        
        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        avatar.textContent = username.charAt(0).toUpperCase();
        
        const name = document.createElement('div');
        name.className = 'user-name';
        name.textContent = username;
        
        const status = document.createElement('div');
        status.className = 'user-status';
        status.textContent = isMyself ? 'Вы' : 'Подключение...';
        
        card.appendChild(avatar);
        card.appendChild(name);
        card.appendChild(status);
        
        this.elements.usersGrid.appendChild(card);
        this.updateUserCount();
    },
    
    removeUserFromGrid(userId) {
        if (!this.elements.usersGrid) return;
        
        const card = document.querySelector(`[data-user-id="${userId}"]`);
        if (card) {
            card.remove();
        }
        
        const audio = document.querySelector(`audio[data-user-id="${userId}"]`);
        if (audio) {
            audio.remove();
        }
        
        const peer = this.peers.get(userId);
        if (peer) {
            try {
                peer.close();
            } catch (error) {
                console.error('Error closing peer:', error);
            }
            this.peers.delete(userId);
        }
        
        if (this.elements.usersGrid.children.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = '<div class="empty-icon">👥</div><div class="empty-text">Ожидание других участников...</div>';
            this.elements.usersGrid.appendChild(emptyState);
        }
        
        this.updateUserCount();
    },
    
    updateUserMicrophoneStatus(userId, enabled) {
        const card = document.querySelector(`[data-user-id="${userId}"]`);
        if (card) {
            if (enabled) {
                card.classList.remove('microphone-muted');
            } else {
                card.classList.add('microphone-muted');
            }
        }
    },
    
    updateUserConnectionStatus(userId, status) {
        const card = document.querySelector(`[data-user-id="${userId}"]`);
        const statusElement = card?.querySelector('.user-status');
        
        if (!statusElement) return;
        
        switch (status) {
            case 'connected':
                statusElement.textContent = 'Подключен';
                if (card) {
                    card.classList.add('connected');
                    card.classList.remove('reconnecting', 'error');
                }
                break;
            case 'connecting':
                statusElement.textContent = 'Подключение...';
                if (card) {
                    card.classList.remove('error', 'connected');
                }
                break;
            case 'disconnected':
                statusElement.textContent = 'Отключен';
                if (card) {
                    card.classList.add('reconnecting');
                    card.classList.remove('connected', 'error');
                }
                break;
            case 'error':
                statusElement.textContent = 'Ошибка подключения';
                if (card) {
                    card.classList.add('error');
                    card.classList.remove('connected', 'reconnecting');
                }
                break;
        }
    },
    
    updateUserCount() {
        if (this.elements.userCount) {
            const count = this.elements.usersGrid ? this.elements.usersGrid.querySelectorAll('.user-card').length : 0;
            this.elements.userCount.textContent = count;
        }
    },
    
    toggleMicrophone() {
        if (!this.localStream) return;
        
        const tracks = this.localStream.getAudioTracks();
        if (tracks.length === 0) return;
        
        const enabled = !tracks[0].enabled;
        tracks[0].enabled = enabled;
        
        if (this.elements.btnToggleMic) {
            if (enabled) {
                this.elements.btnToggleMic.classList.remove('muted');
                this.elements.btnToggleMic.querySelector('.btn-label').textContent = 'Микрофон';
            } else {
                this.elements.btnToggleMic.classList.add('muted');
                this.elements.btnToggleMic.querySelector('.btn-label').textContent = 'Включить';
            }
        }
        
        if (this.socket && this.socket.connected && this.currentRoomId) {
            this.socket.emit('microphone-status', {
                roomId: this.currentRoomId,
                enabled: enabled,
                userId: this.myUserId
            });
        }
        
        const myCard = document.querySelector(`[data-user-id="${this.myUserId}"]`);
        if (myCard) {
            if (enabled) {
                myCard.classList.remove('microphone-muted');
            } else {
                myCard.classList.add('microphone-muted');
            }
        }
    },
    
    showRoomScreen() {
        console.log('showRoomScreen called');
        console.log('loginScreen element:', this.elements.loginScreen);
        console.log('roomScreen element:', this.elements.roomScreen);
        
        if (this.elements.loginScreen) {
            this.elements.loginScreen.classList.remove('active');
            console.log('Login screen hidden');
        }
        
        if (this.elements.roomScreen) {
            this.elements.roomScreen.classList.add('active');
            console.log('Room screen shown');
        } else {
            console.error('Room screen element not found!');
        }
    },
    
    leaveRoom() {
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
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        // Закрываем AudioContext
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        // Удаляем все audio элементы
        document.querySelectorAll('audio[data-user-id]').forEach(audio => audio.remove());
        
        // Очищаем сетку пользователей
        if (this.elements.usersGrid) {
            this.elements.usersGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-text">Ожидание других участников...</div></div>';
        }
        
        // Отключаемся от комнаты
        if (this.socket && this.socket.connected && this.currentRoomId) {
            this.socket.emit('leave-room', { roomId: this.currentRoomId });
        }
        
        // Останавливаем глобальную проверку статусов
        if (this.globalStatusCheckInterval) {
            clearInterval(this.globalStatusCheckInterval);
            this.globalStatusCheckInterval = null;
        }
        
        // Сбрасываем состояние
        this.currentRoomId = null;
        this.myUserId = null;
        this.isJoiningRoom = false;
        this.isCreatingRoom = false;
        
        if (this.joinRoomTimeout) {
            clearTimeout(this.joinRoomTimeout);
            this.joinRoomTimeout = null;
        }
        
        // Возвращаемся на экран входа
        if (this.elements.roomScreen) {
            this.elements.roomScreen.classList.remove('active');
        }
        if (this.elements.loginScreen) {
            this.elements.loginScreen.classList.add('active');
        }
        
        // Очищаем поле кода комнаты
        if (this.elements.roomIdInput) {
            this.elements.roomIdInput.value = '';
        }
        
        if (this.elements.roomLinkContainer) {
            this.elements.roomLinkContainer.style.display = 'none';
        }
    }
};

// Экспорт для использования в других модулях
window.VoiceRoom = VoiceRoom;

