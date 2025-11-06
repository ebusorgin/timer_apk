// Cordova приложение (Master/Slave)
const CordovaApp = {
    socket: null,
    userId: null,
    userName: null,
    role: null, // 'master' или 'slave'
    deviceId: null,
    users: [],
    localStream: null,
    remoteStream: null,
    peerConnections: new Map(), // userId -> RTCPeerConnection
    
    SERVER_URL: 'https://aiternitas.ru', // Измените на ваш сервер
    
    ICE_SERVERS: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ],
    
    init() {
        console.log('CordovaApp initializing...');
        
        // Получаем deviceId
        if (typeof device !== 'undefined' && device.uuid) {
            this.deviceId = device.uuid;
        } else {
            // Генерируем временный ID
            this.deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        
        // Определяем роль из конфигурации
        this.role = window.APP_ROLE || 'master'; // По умолчанию master
        
        this.initElements();
        this.setupEventListeners();
    },
    
    initElements() {
        this.elements = {
            connectScreen: document.getElementById('connectScreen'),
            mainScreen: document.getElementById('mainScreen'),
            userName: document.getElementById('userName'),
            btnConnect: document.getElementById('btnConnect'),
            btnDisconnect: document.getElementById('btnDisconnect'),
            statusMessage: document.getElementById('statusMessage'),
            usersList: document.getElementById('usersList')
        };
        
        // Загружаем сохраненное имя
        const savedName = localStorage.getItem('severomorets_userName');
        if (savedName && this.elements.userName) {
            this.elements.userName.value = savedName;
        }
    },
    
    setupEventListeners() {
        if (this.elements.btnConnect) {
            this.elements.btnConnect.addEventListener('click', () => this.connect());
        }
        
        if (this.elements.btnDisconnect) {
            this.elements.btnDisconnect.addEventListener('click', () => this.disconnect());
        }
        
        if (this.elements.userName) {
            this.elements.userName.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.connect();
                }
            });
        }
    },
    
    showMessage(message, type = 'info') {
        const statusEl = this.elements.statusMessage;
        if (!statusEl) return;
        
        statusEl.textContent = message;
        statusEl.className = `status-message ${type} show`;
        setTimeout(() => {
            statusEl.classList.remove('show');
        }, 3000);
    },
    
    async connect() {
        const userName = this.elements.userName ? this.elements.userName.value.trim() : 'User';
        if (!userName) {
            this.showMessage('Введите ваше имя', 'error');
            return;
        }
        
        this.userName = userName;
        localStorage.setItem('severomorets_userName', userName);
        
        if (this.elements.btnConnect) {
            this.elements.btnConnect.disabled = true;
        }
        
        try {
            // Запрос разрешений на микрофон
            if (typeof cordova !== 'undefined' && cordova.plugins && cordova.plugins.permissions) {
                await this.requestPermissions();
            }
            
            // Подключение к Socket.IO
            if (typeof io === 'undefined') {
                throw new Error('Socket.IO не загружен');
            }
            
            this.socket = io(this.SERVER_URL, {
                transports: ['websocket', 'polling']
            });
            
            this.setupSocketEvents();
            
            // Регистрация
            this.socket.emit('register', {
                userId: this.userId,
                role: this.role,
                deviceId: this.deviceId,
                name: userName
            }, (response) => {
                if (response.error) {
                    this.showMessage(response.error, 'error');
                    if (this.elements.btnConnect) {
                        this.elements.btnConnect.disabled = false;
                    }
                    return;
                }
                
                this.userId = response.user.id;
                this.users = response.users || [];
                
                this.showScreen('mainScreen');
                this.showMessage('Подключено успешно', 'success');
                this.updateUsersList();
            });
            
        } catch (error) {
            console.error('Ошибка подключения:', error);
            this.showMessage('Ошибка подключения', 'error');
            if (this.elements.btnConnect) {
                this.elements.btnConnect.disabled = false;
            }
        }
    },
    
    async requestPermissions() {
        return new Promise((resolve, reject) => {
            cordova.plugins.permissions.requestPermission(
                cordova.plugins.permissions.RECORD_AUDIO,
                (status) => {
                    if (status.hasPermission) {
                        resolve();
                    } else {
                        reject(new Error('Разрешение на микрофон не предоставлено'));
                    }
                },
                reject
            );
        });
    },
    
    setupSocketEvents() {
        this.socket.on('user-connected', (data) => {
            if (this.role === 'master') {
                // Мастер видит всех новых подключений
                if (!this.users.find(u => u.id === data.user.id)) {
                    this.users.push(data.user);
                    this.updateUsersList();
                }
            } else {
                // Slave видит только мастера
                if (data.user.role === 'master') {
                    this.users = [data.user];
                    this.updateUsersList();
                }
            }
        });
        
        this.socket.on('user-disconnected', (data) => {
            this.users = this.users.filter(u => u.id !== data.userId);
            this.updateUsersList();
            
            // Закрываем соединение если есть
            if (this.peerConnections.has(data.userId)) {
                const pc = this.peerConnections.get(data.userId);
                pc.close();
                this.peerConnections.delete(data.userId);
            }
        });
        
        this.socket.on('users-list', (data) => {
            // Только для мастера
            if (this.role === 'master') {
                this.users = data.users || [];
                this.updateUsersList();
            }
        });
        
        this.socket.on('incoming-call', async (data) => {
            this.showMessage(`Входящий звонок от ${data.fromName}`, 'info');
            await this.acceptCall(data);
        });
        
        this.socket.on('webrtc-signal', async (data) => {
            await this.handleWebRTCSignal(data);
        });
    },
    
    updateUsersList() {
        if (!this.elements.usersList) return;
        
        if (this.users.length === 0) {
            this.elements.usersList.innerHTML = '<p>Ожидание пользователей...</p>';
            return;
        }
        
        let html = '';
        this.users.forEach(user => {
            html += `
                <div class="user-item">
                    <div>
                        <div class="user-name">${user.name}</div>
                        <div class="user-role">${user.role}</div>
                    </div>
                    ${this.role === 'master' ? `<button class="btn-call" onclick="CordovaApp.callUser(${user.id})">Позвонить</button>` : ''}
                </div>
            `;
        });
        
        this.elements.usersList.innerHTML = html;
    },
    
    async callUser(targetUserId) {
        if (!this.localStream) {
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: false
                });
            } catch (error) {
                this.showMessage('Ошибка доступа к микрофону', 'error');
                return;
            }
        }
        
        // Создаем RTCPeerConnection
        const pc = new RTCPeerConnection({ iceServers: this.ICE_SERVERS });
        this.peerConnections.set(targetUserId, pc);
        
        // Добавляем локальный поток
        this.localStream.getTracks().forEach(track => {
            pc.addTrack(track, this.localStream);
        });
        
        // Обработка входящих потоков
        pc.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            this.playRemoteAudio();
        };
        
        // ICE кандидаты
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('webrtc-signal', {
                    targetUserId: targetUserId,
                    signal: event.candidate,
                    type: 'ice-candidate'
                });
            }
        };
        
        // Создаем offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        // Отправляем запрос на звонок
        this.socket.emit('call-request', {
            targetUserId: targetUserId
        }, (response) => {
            if (response.error) {
                this.showMessage(response.error, 'error');
                return;
            }
            
            // Отправляем offer
            this.socket.emit('webrtc-signal', {
                targetUserId: targetUserId,
                signal: offer,
                type: 'offer'
            });
            
            this.showMessage('Звонок...', 'info');
        });
    },
    
    async acceptCall(data) {
        if (!this.localStream) {
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: false
                });
            } catch (error) {
                this.showMessage('Ошибка доступа к микрофону', 'error');
                return;
            }
        }
        
        // Создаем RTCPeerConnection
        const pc = new RTCPeerConnection({ iceServers: this.ICE_SERVERS });
        this.peerConnections.set(data.fromUserId, pc);
        
        // Добавляем локальный поток
        this.localStream.getTracks().forEach(track => {
            pc.addTrack(track, this.localStream);
        });
        
        // Обработка входящих потоков
        pc.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            this.playRemoteAudio();
        };
        
        // ICE кандидаты
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('webrtc-signal', {
                    targetUserId: data.fromUserId,
                    signal: event.candidate,
                    type: 'ice-candidate'
                });
            }
        };
        
        // Создаем answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        // Отправляем answer
        this.socket.emit('webrtc-signal', {
            targetUserId: data.fromUserId,
            signal: answer,
            type: 'answer'
        });
    },
    
    async handleWebRTCSignal(data) {
        let pc = this.peerConnections.get(data.fromUserId);
        
        if (!pc && data.type === 'offer') {
            // Создаем новое соединение для входящего звонка
            pc = new RTCPeerConnection({ iceServers: this.ICE_SERVERS });
            this.peerConnections.set(data.fromUserId, pc);
            
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    pc.addTrack(track, this.localStream);
                });
            }
            
            pc.ontrack = (event) => {
                this.remoteStream = event.streams[0];
                this.playRemoteAudio();
            };
            
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('webrtc-signal', {
                        targetUserId: data.fromUserId,
                        signal: event.candidate,
                        type: 'ice-candidate'
                    });
                }
            };
        }
        
        if (!pc) return;
        
        try {
            if (data.type === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
                
                if (!this.localStream) {
                    this.localStream = await navigator.mediaDevices.getUserMedia({
                        audio: true,
                        video: false
                    });
                    this.localStream.getTracks().forEach(track => {
                        pc.addTrack(track, this.localStream);
                    });
                }
                
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                
                this.socket.emit('webrtc-signal', {
                    targetUserId: data.fromUserId,
                    signal: answer,
                    type: 'answer'
                });
                
            } else if (data.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
                
            } else if (data.type === 'ice-candidate') {
                await pc.addIceCandidate(new RTCIceCandidate(data.signal));
            }
            
            this.showMessage('Соединено', 'success');
            
        } catch (error) {
            console.error('Ошибка обработки WebRTC сигнала:', error);
        }
    },
    
    playRemoteAudio() {
        if (this.remoteStream && typeof Audio !== 'undefined') {
            const audio = new Audio();
            audio.srcObject = this.remoteStream;
            audio.play().catch(err => console.error('Ошибка воспроизведения:', err));
        }
    },
    
    disconnect() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        
        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();
        
        if (this.socket) {
            this.socket.disconnect();
        }
        
        this.showScreen('connectScreen');
        if (this.elements.btnConnect) {
            this.elements.btnConnect.disabled = false;
        }
    },
    
    showScreen(screenName) {
        if (this.elements.connectScreen) {
            this.elements.connectScreen.classList.remove('active');
        }
        if (this.elements.mainScreen) {
            this.elements.mainScreen.classList.remove('active');
        }
        
        if (this.elements[screenName]) {
            this.elements[screenName].classList.add('active');
        }
    }
};

// Инициализация при загрузке
document.addEventListener('deviceready', () => {
    CordovaApp.init();
}, false);

// Для браузера
if (typeof cordova === 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        CordovaApp.init();
    });
}

// Глобальный доступ
window.CordovaApp = CordovaApp;

