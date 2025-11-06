// Простая конференция без регистрации
const App = {
    socket: null,
    localStream: null,
    participants: new Map(), // socketId -> { peerConnection, audioElement }
    
    SERVER_URL: window.location.origin,
    
    ICE_SERVERS: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ],
    
    init() {
        console.log('Conference App initializing...');
        this.initElements();
        
        if (!this.elements.btnConnect) {
            console.error('❌ Кнопка подключения не найдена!');
            return;
        }
        
        this.setupEventListeners();
        console.log('✅ App инициализирован');
    },
    
    initElements() {
        this.elements = {
            connectScreen: document.getElementById('connectScreen'),
            conferenceScreen: document.getElementById('conferenceScreen'),
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
        console.log('Подключение к конференции...');
        this.elements.btnConnect.disabled = true;
        this.showMessage('Подключение...', 'info');
        
        try {
            // Подключение к Socket.IO
            if (typeof io === 'undefined') {
                throw new Error('Socket.IO не загружен');
            }
            
            console.log('Создание Socket.IO соединения...');
            
            // Устанавливаем обработчики ДО создания соединения
            this.socket = io(this.SERVER_URL, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 5,
                timeout: 20000,
                forceNew: false
            });
            
            // Обработчики подключения Socket.IO
            this.socket.on('connect', () => {
                console.log('✅ Socket.IO подключен:', this.socket.id);
                this.showMessage('Подключено к серверу', 'success');
            });
            
            this.socket.on('connect_error', (error) => {
                console.error('❌ Ошибка подключения Socket.IO:', error);
                this.showMessage('Ошибка подключения к серверу', 'error');
                this.elements.btnConnect.disabled = false;
            });
            
            this.socket.on('disconnect', (reason) => {
                console.log('⚠️ Socket.IO отключен:', reason);
                this.showMessage('Отключено от сервера', 'error');
            });
            
            // Устанавливаем обработчик users-list ДО подключения
            this.socket.on('users-list', async (data) => {
                console.log('📋 Получен список пользователей:', data);
                console.log('📋 Количество участников:', data.users ? data.users.length : 0);
                
                // Переходим в конференцию сразу
                if (document.getElementById('connectScreen').classList.contains('active')) {
                    this.showScreen('conferenceScreen');
                    this.updateConferenceStatus();
                }
                
                // Подключаемся ко всем существующим участникам
                if (data.users && data.users.length > 0) {
                    console.log(`🔗 Подключение к ${data.users.length} участникам...`);
                    for (const socketId of data.users) {
                        console.log(`🔗 Инициирую соединение с ${socketId}`);
                        await this.connectToPeer(socketId, true);
                    }
                    this.showMessage(`Подключено к ${data.users.length} участникам`, 'success');
                } else {
                    console.log('📭 Нет других участников в конференции');
                    this.showMessage('Подключено к конференции', 'success');
                }
            });
            
            this.setupSocketEvents();
            
            // Получаем медиа поток
            console.log('Запрос доступа к микрофону...');
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: false
                });
                console.log('✅ Доступ к микрофону получен');
            } catch (error) {
                console.error('❌ Ошибка доступа к микрофону:', error);
                this.showMessage('Не удалось получить доступ к микрофону. Разрешите доступ и попробуйте снова.', 'error');
                this.elements.btnConnect.disabled = false;
                if (this.socket) {
                    this.socket.disconnect();
                }
                return;
            }
            
            // Ждем подключения Socket.IO перед переходом в конференцию
            this.socket.once('connect', () => {
                // Даем время серверу отправить users-list
                setTimeout(() => {
                    if (document.getElementById('connectScreen').classList.contains('active')) {
                        console.log('⏱️ Таймаут: переходим в конференцию');
                        this.showScreen('conferenceScreen');
                        this.updateConferenceStatus();
                        this.showMessage('Подключено к конференции', 'success');
                    }
                }, 1000);
            });
            
        } catch (error) {
            console.error('❌ Ошибка подключения:', error);
            this.showMessage('Ошибка подключения: ' + error.message, 'error');
            this.elements.btnConnect.disabled = false;
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }
            if (this.socket) {
                this.socket.disconnect();
            }
        }
    },
    
    setupSocketEvents() {
        this.socket.on('user-connected', async (data) => {
            console.log('👤 Новый участник присоединился:', data.socketId);
            this.showMessage('Новый участник присоединился', 'info');
            
            // Убеждаемся, что мы уже в конференции
            if (document.getElementById('connectScreen').classList.contains('active')) {
                this.showScreen('conferenceScreen');
            }
            
            await this.connectToPeer(data.socketId, true);
            this.updateConferenceStatus();
        });
        
        this.socket.on('user-disconnected', (data) => {
            console.log('👋 Участник покинул:', data.socketId);
            this.disconnectFromPeer(data.socketId);
            this.updateConferenceStatus();
        });
        
        this.socket.on('webrtc-signal', async (data) => {
            console.log('📡 Получен WebRTC сигнал:', data.type, 'от', data.fromSocketId);
            await this.handleWebRTCSignal(data);
        });
    },
    
    async connectToPeer(targetSocketId, isInitiator) {
        // Проверяем, не подключены ли мы уже к этому участнику
        if (this.participants.has(targetSocketId)) {
            console.log('Уже подключен к', targetSocketId);
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
            audioElement.playsInline = true;
            audioElement.volume = 1.0;
            audioElement.style.display = 'none';
            // Добавляем в DOM для работы
            document.body.appendChild(audioElement);
            
            // Обработка входящих потоков
            peerConnection.ontrack = (event) => {
                console.log('🎵 Получен аудио поток от', targetSocketId, event);
                const remoteStream = event.streams[0];
                if (remoteStream) {
                    audioElement.srcObject = remoteStream;
                    
                    // Принудительное воспроизведение
                    audioElement.play().then(() => {
                        console.log('✅ Аудио воспроизводится от', targetSocketId);
                    }).catch(err => {
                        console.error('❌ Ошибка воспроизведения аудио:', err);
                        // Пробуем еще раз после взаимодействия пользователя
                        document.addEventListener('click', () => {
                            audioElement.play().catch(e => console.error('Ошибка воспроизведения после клика:', e));
                        }, { once: true });
                    });
                }
            };
            
            // ICE кандидаты
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('webrtc-signal', {
                        targetSocketId: targetSocketId,
                        signal: event.candidate,
                        type: 'ice-candidate'
                    });
                }
            };
            
            // Обработка изменения состояния соединения
            peerConnection.onconnectionstatechange = () => {
                const state = peerConnection.connectionState;
                console.log(`🔗 Соединение с ${targetSocketId}: ${state}`);
                
                if (state === 'connected') {
                    console.log('✅ WebRTC соединение установлено с', targetSocketId);
                    participant.connected = true;
                    // Убеждаемся, что аудио воспроизводится
                    if (participant.audioElement && participant.audioElement.srcObject) {
                        participant.audioElement.play().catch(err => {
                            console.error('Ошибка воспроизведения после подключения:', err);
                        });
                    }
                } else if (state === 'failed' || state === 'disconnected') {
                    console.warn('⚠️ WebRTC соединение потеряно с', targetSocketId, state);
                }
                
                this.updateParticipantUI(targetSocketId);
            };
            
            // Обработка ICE соединения
            peerConnection.oniceconnectionstatechange = () => {
                const iceState = peerConnection.iceConnectionState;
                console.log(`🧊 ICE соединение с ${targetSocketId}: ${iceState}`);
                
                const participant = this.participants.get(targetSocketId);
                if (participant) {
                    if (iceState === 'connected' || iceState === 'completed') {
                        participant.connected = true;
                        console.log(`✅ ICE соединение установлено с ${targetSocketId}`);
                        // Убеждаемся, что аудио воспроизводится
                        if (participant.audioElement && participant.audioElement.srcObject) {
                            participant.audioElement.play().catch(err => {
                                console.error('Ошибка воспроизведения после ICE подключения:', err);
                            });
                        }
                    } else if (iceState === 'failed' || iceState === 'disconnected') {
                        console.warn(`⚠️ ICE соединение потеряно с ${targetSocketId}: ${iceState}`);
                    }
                    this.updateParticipantUI(targetSocketId);
                }
            };
            
            // Сохраняем информацию о соединении
            this.participants.set(targetSocketId, {
                peerConnection,
                audioElement,
                connected: false
            });
            
            // Если мы инициатор, создаем offer
            if (isInitiator) {
                console.log(`📤 Создание offer для ${targetSocketId}`);
                const offer = await peerConnection.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: false
                });
                await peerConnection.setLocalDescription(offer);
                console.log(`✅ Offer создан и отправлен для ${targetSocketId}`);
                
                this.socket.emit('webrtc-signal', {
                    targetSocketId: targetSocketId,
                    signal: offer,
                    type: 'offer'
                });
            }
            
            this.updateParticipantsList();
            
        } catch (error) {
            console.error(`Ошибка подключения к ${targetSocketId}:`, error);
            this.participants.delete(targetSocketId);
        }
    },
    
    async handleWebRTCSignal(data) {
        let participant = this.participants.get(data.fromSocketId);
        
        // Если соединения еще нет, создаем его (когда получаем offer)
        if (!participant && data.type === 'offer') {
            await this.connectToPeer(data.fromSocketId, false);
            participant = this.participants.get(data.fromSocketId);
        }
        
        if (!participant || !participant.peerConnection) {
            console.log('Соединение еще не создано для', data.fromSocketId);
            return;
        }
        
        const pc = participant.peerConnection;
        
        try {
            if (data.type === 'offer') {
                await this.handleOffer(pc, data);
            } else if (data.type === 'answer') {
                console.log('📥 Получен answer от', data.fromSocketId);
                console.log('📊 Текущее состояние соединения:', pc.signalingState);
                
                // Проверяем состояние перед установкой answer
                if (pc.signalingState === 'stable' && pc.localDescription && pc.localDescription.type === 'offer') {
                    // Если состояние stable и у нас есть локальный offer, значит мы уже установили remote description
                    // Проверяем, не установлен ли уже remote description
                    if (pc.remoteDescription) {
                        console.log('⚠️ Remote description уже установлен, пропускаем answer');
                        // Возможно, это дубликат или поздний answer
                        return;
                    }
                }
                
                // Если состояние "have-local-offer", можем установить answer
                if (pc.signalingState === 'have-local-offer' || pc.signalingState === 'stable') {
                    try {
                        await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
                        console.log('✅ Remote description установлен (answer)');
                        participant.connected = true;
                        this.updateParticipantUI(data.fromSocketId);
                        
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
                    } catch (err) {
                        console.error('❌ Ошибка установки answer:', err);
                        // Если ошибка из-за состояния, пробуем rollback
                        if (err.name === 'InvalidStateError' && pc.signalingState === 'stable') {
                            console.log('🔄 Попытка rollback для установки answer');
                            try {
                                // Сохраняем текущее локальное описание
                                const localDesc = pc.localDescription;
                                // Сбрасываем локальное описание
                                await pc.setLocalDescription(null);
                                // Устанавливаем удаленное описание (answer)
                                await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
                                // Восстанавливаем локальное описание
                                await pc.setLocalDescription(localDesc);
                                console.log('✅ Answer установлен после rollback');
                                participant.connected = true;
                                this.updateParticipantUI(data.fromSocketId);
                            } catch (rollbackErr) {
                                console.error('❌ Ошибка при rollback:', rollbackErr);
                            }
                        }
                    }
                } else {
                    console.warn('⚠️ Неподходящее состояние для установки answer:', pc.signalingState);
                }
            } else if (data.type === 'ice-candidate') {
                console.log('🧊 Получен ICE кандидат от', data.fromSocketId);
                if (pc.remoteDescription) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(data.signal));
                        console.log('✅ ICE кандидат добавлен');
                    } catch (err) {
                        console.error('❌ Ошибка добавления ICE кандидата:', err);
                    }
                } else {
                    // Сохраняем кандидата для добавления позже
                    console.log('⏳ Сохранение ICE кандидата для добавления позже');
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
            // это означает, что оба участника пытаются инициировать одновременно
            if (pc.localDescription && pc.localDescription.type === 'offer') {
                console.log('⚠️ Оба участника инициировали соединение одновременно');
                console.log('🔄 Устанавливаем удаленное описание и создаем answer');
                
                // Устанавливаем удаленное описание
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
                    console.log('✅ Remote description установлен (offer при одновременной инициализации)');
                    
                    // Создаем answer - это разрешено в WebRTC
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    console.log(`✅ Answer создан и отправлен для ${data.fromSocketId}`);
                    
                    this.socket.emit('webrtc-signal', {
                        targetSocketId: data.fromSocketId,
                        signal: answer,
                        type: 'answer'
                    });
                    
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
                } catch (err) {
                    console.error('❌ Ошибка обработки одновременного offer:', err);
                }
                return;
            }
            
            console.log('📥 Установка удаленного описания (offer)');
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
            
            // Создаем answer
            console.log(`📥 Создание answer для ${data.fromSocketId}`);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log(`✅ Answer создан и отправлен для ${data.fromSocketId}`);
            
            this.socket.emit('webrtc-signal', {
                targetSocketId: data.fromSocketId,
                signal: answer,
                type: 'answer'
            });
        } catch (error) {
            console.error('Ошибка обработки offer:', error);
        }
    },
    
    disconnectFromPeer(socketId) {
        const participant = this.participants.get(socketId);
        if (participant) {
            console.log(`🔌 Отключение от ${socketId}`);
            if (participant.peerConnection) {
                participant.peerConnection.close();
            }
            if (participant.audioElement) {
                participant.audioElement.pause();
                participant.audioElement.srcObject = null;
                if (participant.audioElement.parentNode) {
                    participant.audioElement.remove();
                }
            }
            this.participants.delete(socketId);
            this.showMessage('Участник покинул конференцию', 'info');
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
            <div class="participant-name">Вы</div>
            <div class="participant-status">Подключено</div>
        `;
        list.appendChild(selfItem);
        
        // Добавляем других участников
        this.participants.forEach((participant, socketId) => {
            const item = document.createElement('div');
            item.className = 'participant-item';
            
            // Проверяем оба состояния для более точного статуса
            const connState = participant.peerConnection.connectionState;
            const iceState = participant.peerConnection.iceConnectionState;
            
            let status = 'Ожидание';
            if (connState === 'connected' || iceState === 'connected' || iceState === 'completed') {
                status = 'Подключено';
            } else if (connState === 'connecting' || iceState === 'checking' || iceState === 'connecting') {
                status = 'Подключение...';
            } else if (connState === 'failed' || iceState === 'failed') {
                status = 'Ошибка';
            }
            
            item.innerHTML = `
                <div class="participant-name">Участник ${socketId.substring(0, 8)}</div>
                <div class="participant-status">${status}</div>
            `;
            list.appendChild(item);
        });
    },
    
    updateParticipantUI(socketId) {
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
        this.participants.forEach((participant, socketId) => {
            this.disconnectFromPeer(socketId);
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
        this.elements.btnConnect.disabled = false;
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
