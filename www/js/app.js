// Конференция - веб-версия приложения
const App = {
    socket: null,
    userId: null,
    userName: null,
    localStream: null,
    participants: new Map(), // userId -> { peerConnection, audioElement, name }
    
    SERVER_URL: window.location.origin,
    
    ICE_SERVERS: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ],
    
    init() {
        console.log('Conference App initializing...');
        this.initElements();
        this.setupEventListeners();
    },
    
    initElements() {
        this.elements = {
            connectScreen: document.getElementById('connectScreen'),
            conferenceScreen: document.getElementById('conferenceScreen'),
            userName: document.getElementById('userName'),
            btnConnect: document.getElementById('btnConnect'),
            btnDisconnect: document.getElementById('btnDisconnect'),
            btnMute: document.getElementById('btnMute'),
            participantsList: document.getElementById('participantsList'),
            statusMessage: document.getElementById('statusMessage'),
            conferenceStatus: document.getElementById('conferenceStatus')
        };
    },
    
    setupEventListeners() {
        this.elements.btnConnect.addEventListener('click', () => this.connect());
        this.elements.btnDisconnect.addEventListener('click', () => this.disconnect());
        if (this.elements.btnMute) {
            this.elements.btnMute.addEventListener('click', () => this.toggleMute());
        }
        
        this.elements.userName.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.connect();
            }
        });
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
        const userName = this.elements.userName.value.trim();
        if (!userName) {
            this.showMessage('Введите ваше имя', 'error');
            return;
        }
        
        this.userName = userName;
        this.elements.btnConnect.disabled = true;
        
        try {
            // Подключение к Socket.IO
            if (typeof io === 'undefined') {
                throw new Error('Socket.IO не загружен');
            }
            
            this.socket = io(this.SERVER_URL, {
                transports: ['websocket', 'polling']
            });
            
            this.setupSocketEvents();
            
            // Получаем медиа поток перед регистрацией
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: false
                });
            } catch (error) {
                console.error('Ошибка доступа к микрофону:', error);
                this.showMessage('Не удалось получить доступ к микрофону', 'error');
                this.elements.btnConnect.disabled = false;
                return;
            }
            
            // Регистрация в конференции
            this.socket.emit('register', {
                name: userName
            }, async (response) => {
                if (response.error) {
                    this.showMessage(response.error, 'error');
                    this.elements.btnConnect.disabled = false;
                    if (this.localStream) {
                        this.localStream.getTracks().forEach(track => track.stop());
                        this.localStream = null;
                    }
                    return;
                }
                
                this.userId = response.user.id;
                
                // Подключаемся ко всем существующим участникам
                // Новый пользователь инициирует соединения
                if (response.users && response.users.length > 0) {
                    for (const user of response.users) {
                        await this.connectToPeer(user.id, user.name, true);
                    }
                }
                
                this.showScreen('conferenceScreen');
                this.updateConferenceStatus();
                this.showMessage('Подключено к конференции', 'success');
            });
            
        } catch (error) {
            console.error('Ошибка подключения:', error);
            this.showMessage('Ошибка подключения', 'error');
            this.elements.btnConnect.disabled = false;
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }
        }
    },
    
    setupSocketEvents() {
        this.socket.on('user-connected', async (data) => {
            console.log('Новый участник:', data.user.name);
            this.showMessage(`${data.user.name} присоединился к конференции`, 'info');
            await this.connectToPeer(data.user.id, data.user.name, true);
            this.updateConferenceStatus();
        });
        
        this.socket.on('user-disconnected', (data) => {
            this.disconnectFromPeer(data.userId);
            this.updateConferenceStatus();
        });
        
        this.socket.on('users-list', async (data) => {
            // Подключаемся к новым участникам из списка
            // Инициируем соединения как новый пользователь
            for (const user of data.users) {
                if (!this.participants.has(user.id)) {
                    await this.connectToPeer(user.id, user.name, true);
                }
            }
            this.updateConferenceStatus();
        });
        
        this.socket.on('peer-init', async (data) => {
            // Другой участник инициирует соединение с нами
            // Мы создаем соединение и ждем их offer
            if (!this.participants.has(data.fromUserId)) {
                await this.connectToPeer(data.fromUserId, data.fromName, false);
            }
        });
        
        this.socket.on('webrtc-signal', async (data) => {
            await this.handleWebRTCSignal(data);
        });
    },
    
    async connectToPeer(targetUserId, targetName, isInitiator) {
        // Проверяем, не подключены ли мы уже к этому участнику
        if (this.participants.has(targetUserId)) {
            console.log('Уже подключен к', targetName);
            return;
        }
        
        try {
            // Создаем RTCPeerConnection для этого участника
            const peerConnection = new RTCPeerConnection({ iceServers: this.ICE_SERVERS });
            
            // Добавляем локальный поток
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, this.localStream);
                });
            }
            
            // Создаем аудио элемент для удаленного потока
            const audioElement = document.createElement('audio');
            audioElement.autoplay = true;
            audioElement.controls = false;
            
            // Обработка входящих потоков
            peerConnection.ontrack = (event) => {
                const remoteStream = event.streams[0];
                audioElement.srcObject = remoteStream;
                console.log('Получен поток от', targetName);
            };
            
            // ICE кандидаты
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('webrtc-signal', {
                        targetUserId: targetUserId,
                        signal: event.candidate,
                        type: 'ice-candidate'
                    });
                }
            };
            
            // Обработка изменения состояния соединения
            peerConnection.onconnectionstatechange = () => {
                console.log(`Соединение с ${targetName}: ${peerConnection.connectionState}`);
                this.updateParticipantUI(targetUserId);
            };
            
            // Сохраняем информацию о соединении
            this.participants.set(targetUserId, {
                peerConnection,
                audioElement,
                name: targetName,
                connected: false
            });
            
            // Если мы инициатор, создаем offer
            if (isInitiator) {
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                
                this.socket.emit('webrtc-signal', {
                    targetUserId: targetUserId,
                    signal: offer,
                    type: 'offer'
                });
            }
            // Если мы не инициатор, мы просто ждем offer от другого участника
            
            this.updateParticipantsList();
            
        } catch (error) {
            console.error(`Ошибка подключения к ${targetName}:`, error);
            this.participants.delete(targetUserId);
        }
    },
    
    async handleWebRTCSignal(data) {
        let participant = this.participants.get(data.fromUserId);
        
        // Если соединения еще нет, создаем его (когда получаем offer)
        if (!participant && data.type === 'offer') {
            await this.connectToPeer(data.fromUserId, data.fromName || 'Unknown', false);
            participant = this.participants.get(data.fromUserId);
        }
        
        if (!participant || !participant.peerConnection) {
            console.log('Соединение еще не создано для', data.fromUserId);
            return;
        }
        
        const pc = participant.peerConnection;
        
        try {
            if (data.type === 'offer') {
                await this.handleOffer(pc, data);
            } else if (data.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
                participant.connected = true;
                this.updateParticipantUI(data.fromUserId);
                
                // Добавляем отложенные ICE кандидаты если есть
                if (participant.pendingCandidates) {
                    for (const candidate of participant.pendingCandidates) {
                        try {
                            await pc.addIceCandidate(candidate);
                        } catch (err) {
                            console.error('Ошибка добавления отложенного кандидата:', err);
                        }
                    }
                    participant.pendingCandidates = [];
                }
            } else if (data.type === 'ice-candidate') {
                if (pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(data.signal));
                } else {
                    // Сохраняем кандидата для добавления позже
                    if (!participant.pendingCandidates) {
                        participant.pendingCandidates = [];
                    }
                    participant.pendingCandidates.push(new RTCIceCandidate(data.signal));
                }
            }
        } catch (error) {
            console.error('Ошибка обработки WebRTC сигнала:', error);
        }
    },
    
    async handleOffer(pc, data) {
        try {
            // Если у нас уже есть локальное описание (мы тоже создали offer), 
            // проверяем, не является ли удаленное описание answer
            if (pc.localDescription && pc.localDescription.type === 'offer') {
                // Если мы получили offer, но у нас уже есть offer, 
                // это означает, что оба пытались инициировать
                // В этом случае мы игнорируем входящий offer и ждем answer на наш offer
                console.log('Оба участника инициировали соединение, ожидаем answer');
                return;
            }
            
            await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
            
            // Добавляем отложенные ICE кандидаты если есть
            const participant = Array.from(this.participants.values()).find(p => p.peerConnection === pc);
            if (participant && participant.pendingCandidates) {
                for (const candidate of participant.pendingCandidates) {
                    try {
                        await pc.addIceCandidate(candidate);
                    } catch (err) {
                        console.error('Ошибка добавления отложенного кандидата:', err);
                    }
                }
                participant.pendingCandidates = [];
            }
            
            // Создаем answer только если у нас еще нет локального описания
            if (!pc.localDescription) {
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                
                this.socket.emit('webrtc-signal', {
                    targetUserId: data.fromUserId,
                    signal: answer,
                    type: 'answer'
                });
            }
        } catch (error) {
            console.error('Ошибка обработки offer:', error);
        }
    },
    
    disconnectFromPeer(userId) {
        const participant = this.participants.get(userId);
        if (participant) {
            if (participant.peerConnection) {
                participant.peerConnection.close();
            }
            if (participant.audioElement) {
                participant.audioElement.srcObject = null;
                participant.audioElement.remove();
            }
            this.participants.delete(userId);
            this.showMessage(`${participant.name} покинул конференцию`, 'info');
            this.updateParticipantsList();
        }
    },
    
    toggleMute() {
        if (!this.localStream) return;
        
        const audioTracks = this.localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            const isMuted = !audioTracks[0].enabled;
            audioTracks[0].enabled = isMuted;
            
            if (this.elements.btnMute) {
                this.elements.btnMute.textContent = isMuted ? '🔇 Выключить микрофон' : '🎤 Включить микрофон';
                this.elements.btnMute.classList.toggle('muted', !isMuted);
            }
        }
    },
    
    updateParticipantsList() {
        const list = this.elements.participantsList;
        if (!list) return;
        
        list.innerHTML = '';
        
        // Добавляем себя
        const selfItem = document.createElement('div');
        selfItem.className = 'participant-item self';
        selfItem.innerHTML = `
            <div class="participant-name">${this.userName} (Вы)</div>
            <div class="participant-status">Подключено</div>
        `;
        list.appendChild(selfItem);
        
        // Добавляем других участников
        this.participants.forEach((participant, userId) => {
            const item = document.createElement('div');
            item.className = 'participant-item';
            const status = participant.peerConnection.connectionState === 'connected' ? 'Подключено' : 
                          participant.peerConnection.connectionState === 'connecting' ? 'Подключение...' : 
                          'Ожидание';
            item.innerHTML = `
                <div class="participant-name">${participant.name}</div>
                <div class="participant-status">${status}</div>
            `;
            list.appendChild(item);
        });
    },
    
    updateParticipantUI(userId) {
        // Обновляем UI для конкретного участника
        this.updateParticipantsList();
    },
    
    updateConferenceStatus() {
        const statusEl = this.elements.conferenceStatus;
        if (!statusEl) return;
        
        const count = this.participants.size + 1; // +1 для себя
        statusEl.textContent = `Участников в конференции: ${count}`;
    },
    
    disconnect() {
        // Закрываем все соединения с участниками
        this.participants.forEach((participant, userId) => {
            this.disconnectFromPeer(userId);
        });
        
        // Останавливаем локальный поток
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        // Отключаемся от сервера
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        
        this.showScreen('connectScreen');
        this.elements.userName.value = '';
        this.elements.btnConnect.disabled = false;
        this.userId = null;
        this.userName = null;
    },
    
    showScreen(screenName) {
        Object.values(this.elements).forEach(el => {
            if (el && el.classList && el.classList.contains('screen')) {
                el.classList.remove('active');
            }
        });
        
        if (this.elements[screenName]) {
            this.elements[screenName].classList.add('active');
        }
    }
};

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
