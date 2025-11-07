// Простая конференция без регистрации
const App = {
    socket: null,
    localStream: null,
    participants: new Map(), // socketId -> { peerConnection, mediaElement, tileElement, pendingCandidates }
    
    SERVER_URL: window.location.origin,
    
    ICE_SERVERS: [
        // Собственный STUN/TURN сервер (приоритет)
        { urls: 'stun:aiternitas.ru:3478' },
        { 
            urls: 'turn:aiternitas.ru:3478?transport=udp',
            username: 'turnuser',
            credential: 'turnpass'
        },
        { 
            urls: 'turn:aiternitas.ru:3478?transport=tcp',
            username: 'turnuser',
            credential: 'turnpass'
        },
        // Резервные публичные STUN серверы
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.stunprotocol.org:3478' }
    ],
    
    // Определение, кто является инициатором соединения
    // Участник с меньшим socketId становится инициатором
    isInitiator(mySocketId, targetSocketId) {
        return mySocketId < targetSocketId;
    },
    
    init() {
        console.log('Conference App initializing...');
        this.initElements();
        
        if (!this.elements.btnConnect) {
            console.error('❌ Кнопка подключения не найдена!');
            return;
        }
        
        this.setupEventListeners();
        this.updateVideoButton();
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
            conferenceStatus: document.getElementById('conferenceStatus'),
            videoGrid: document.getElementById('videoGrid'),
            localVideo: document.getElementById('localVideo'),
            localVideoTile: document.querySelector('#videoGrid .video-tile.self'),
            localVideoLabel: document.querySelector('#videoGrid .video-tile.self .video-label'),
            btnVideo: document.getElementById('btnVideo') // Добавляем кнопку видео
        };
    },
    
    setupEventListeners() {
        this.elements.btnConnect.addEventListener('click', () => this.connect());
        this.elements.btnDisconnect.addEventListener('click', () => this.disconnect());
        if (this.elements.btnMute) {
            this.elements.btnMute.addEventListener('click', () => this.toggleMute());
        }
        if (this.elements.btnVideo) {
            this.elements.btnVideo.addEventListener('click', () => this.toggleVideo());
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
            console.log('🌐 SERVER_URL:', this.SERVER_URL);
            
            // Устанавливаем обработчики ДО создания соединения
            this.socket = io(this.SERVER_URL, {
                path: '/socket.io/',
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 5,
                timeout: 20000,
                forceNew: false,
                upgrade: true,
                rememberUpgrade: false
            });
            
            // Обработчики подключения Socket.IO
            // Устанавливаем обработчик users-list ВНУТРИ события connect,
            // чтобы гарантировать, что он зарегистрирован до получения события от сервера
            this.socket.on('connect', () => {
                console.log('✅ Socket.IO подключен:', this.socket.id);
                this.showMessage('Подключено к серверу', 'success');
                
                // Устанавливаем обработчик users-list СРАЗУ после подключения
                // Сервер отправляет событие через setImmediate(), так что обработчик успеет зарегистрироваться
                let usersListHandled = false;
                this.socket.once('users-list', async (data) => {
                    if (usersListHandled) {
                        console.log('📋 [ONCE] Пропускаем повторное событие users-list');
                        return;
                    }
                    usersListHandled = true;
                    
                    console.log('📋 [ONCE] Получен список пользователей:', data);
                    console.log('📋 [ONCE] Количество участников:', data.users ? data.users.length : 0);
                    console.log('📋 [ONCE] Мой socket.id:', this.socket.id);
                    
                    // Переходим в конференцию сразу
                    if (document.getElementById('connectScreen').classList.contains('active')) {
                        this.showScreen('conferenceScreen');
                        this.updateConferenceStatus();
                        this.updateMuteButton();
                        this.updateVideoButton();
                    }
                    
                    // Подключаемся ко всем существующим участникам
                    if (data.users && data.users.length > 0) {
                        console.log(`🔗 Подключение к ${data.users.length} участникам...`);
                        for (const socketId of data.users) {
                            // Определяем роль на основе сравнения socketId
                            const isInitiator = this.isInitiator(this.socket.id, socketId);
                            console.log(`🔗 Инициирую соединение с ${socketId}, роль: ${isInitiator ? 'инициатор' : 'ответчик'}`);
                            await this.connectToPeer(socketId, isInitiator);
                        }
                        this.showMessage(`Подключено к ${data.users.length} участникам`, 'success');
                    } else {
                        console.log('📭 Нет других участников в конференции');
                        this.showScreen('conferenceScreen');
                        this.updateConferenceStatus();
                        this.updateMuteButton();
                        this.updateVideoButton();
                        this.showMessage('Подключено к конференции', 'success');
                    }
                });
                
                // Также устанавливаем обычный обработчик на случай повторных событий
                this.socket.on('users-list', async (data) => {
                    console.log('📋 [ON] Получен список пользователей (повторное событие):', data);
                    console.log('📋 [ON] Количество участников:', data.users ? data.users.length : 0);
                });
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
            
            this.setupSocketEvents();
            
            // Получаем медиа поток
            console.log('Запрос доступа к микрофону...');
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: false
                });
                console.log('✅ Доступ к микрофону получен');
                // Обновляем текст кнопки микрофона (микрофон включен по умолчанию)
                this.updateMuteButton();
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
                        this.updateMuteButton();
                        this.updateVideoButton();
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
            console.log('👤 [user-connected] Новый участник присоединился:', data);
            console.log('👤 [user-connected] SocketId нового участника:', data.socketId);
            console.log('👤 [user-connected] Мой socket.id:', this.socket.id);
            console.log('👤 [user-connected] Текущее количество участников в this.participants:', this.participants.size);
            
            this.showMessage('Новый участник присоединился', 'info');
            
            // Убеждаемся, что мы уже в конференции
            if (document.getElementById('connectScreen').classList.contains('active')) {
                this.showScreen('conferenceScreen');
                this.updateMuteButton();
            }
            
            // Определяем роль на основе сравнения socketId
            const isInitiator = this.isInitiator(this.socket.id, data.socketId);
            console.log(`🔗 [user-connected] Подключение к новому участнику ${data.socketId}, роль: ${isInitiator ? 'инициатор' : 'ответчик'}`);
            await this.connectToPeer(data.socketId, isInitiator);
            console.log('👤 [user-connected] После connectToPeer, количество участников:', this.participants.size);
            this.updateConferenceStatus();
        });
        
        this.socket.on('user-disconnected', (data) => {
            console.log('👋 [user-disconnected] Участник покинул:', data);
            console.log('👋 [user-disconnected] SocketId:', data.socketId);
            console.log('👋 [user-disconnected] Количество участников до отключения:', this.participants.size);
            this.disconnectFromPeer(data.socketId);
            console.log('👋 [user-disconnected] Количество участников после отключения:', this.participants.size);
            this.updateConferenceStatus();
        });
        
        this.socket.on('webrtc-signal', async (data) => {
            console.log('📡 [webrtc-signal] Получен WebRTC сигнал:', data.type, 'от', data.fromSocketId);
            console.log('📡 [webrtc-signal] Полные данные:', data);
            await this.handleWebRTCSignal(data);
        });
    },
    
    async connectToPeer(targetSocketId, isInitiator) {
        if (this.participants.has(targetSocketId)) {
            console.log('Уже подключен к', targetSocketId);
            return;
        }

        try {
            const peerConnection = new RTCPeerConnection({ iceServers: this.ICE_SERVERS });

            if (this.localStream) {
                this.localStream.getAudioTracks().forEach(track => {
                    peerConnection.addTrack(track, this.localStream);
                });
            }

            const videoTransceiver = peerConnection.addTransceiver('video', { direction: 'sendrecv' });
            if (this.videoTrack) {
                videoTransceiver.sender.replaceTrack(this.videoTrack);
            }

            const media = this.createParticipantMedia(targetSocketId);

            const participantRecord = {
                peerConnection,
                mediaElement: media.mediaElement,
                tileElement: media.tileElement,
                labelElement: media.labelElement,
                pendingCandidates: [],
                connected: false,
                videoEnabled: false,
                videoSender: videoTransceiver.sender,
                renegotiating: false,
                pendingRenegotiation: false
            };

            this.participants.set(targetSocketId, participantRecord);

            peerConnection.ontrack = (event) => {
                const trackKind = event.track ? event.track.kind : 'unknown';
                console.log('🎥 Получен трек от', targetSocketId, trackKind, event);

                const remoteStream = event.streams[0];
                if (!remoteStream || !participantRecord.mediaElement) {
                    return;
                }

                if (!participantRecord.mediaElement.srcObject || participantRecord.mediaElement.srcObject.id !== remoteStream.id) {
                    participantRecord.mediaElement.srcObject = remoteStream;
                }

                participantRecord.mediaElement.autoplay = true;
                participantRecord.mediaElement.playsInline = true;
                participantRecord.mediaElement.muted = false;
                participantRecord.mediaElement.controls = false;

                participantRecord.mediaElement.play().catch(err => {
                    console.error('❌ Ошибка воспроизведения медиа для', targetSocketId, err);
                    document.addEventListener('click', () => {
                        participantRecord.mediaElement.play().catch(e => console.error('Ошибка воспроизведения после клика:', e));
                    }, { once: true });
                });

                participantRecord.videoEnabled = remoteStream.getVideoTracks().some(track => track.readyState === 'live' && track.enabled);
                this.updateParticipantVideoState(targetSocketId);
                this.updateParticipantsList();

                if (event.track && event.track.kind === 'video') {
                    event.track.onended = () => {
                        participantRecord.videoEnabled = false;
                        this.updateParticipantVideoState(targetSocketId);
                        this.updateParticipantsList();
                    };
                    event.track.onmute = () => {
                        participantRecord.videoEnabled = remoteStream.getVideoTracks().some(track => track.enabled);
                        this.updateParticipantVideoState(targetSocketId);
                        this.updateParticipantsList();
                    };
                    event.track.onunmute = () => {
                        participantRecord.videoEnabled = true;
                        this.updateParticipantVideoState(targetSocketId);
                        this.updateParticipantsList();
                    };
                }

                remoteStream.onremovetrack = () => {
                    participantRecord.videoEnabled = remoteStream.getVideoTracks().some(track => track.readyState === 'live' && track.enabled);
                    this.updateParticipantVideoState(targetSocketId);
                    this.updateParticipantsList();
                };
            };

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('webrtc-signal', {
                        targetSocketId,
                        signal: event.candidate,
                        type: 'ice-candidate'
                    });
                }
            };

            peerConnection.onconnectionstatechange = () => {
                const state = peerConnection.connectionState;
                console.log(`🔗 Соединение с ${targetSocketId}: ${state}`);

                participantRecord.connected = state === 'connected';
                if (participantRecord.mediaElement && participantRecord.mediaElement.srcObject) {
                    participantRecord.mediaElement.play().catch(err => {
                        console.error('Ошибка воспроизведения после подключения:', err);
                    });
                }

                this.updateParticipantUI(targetSocketId);
            };

            peerConnection.oniceconnectionstatechange = () => {
                const iceState = peerConnection.iceConnectionState;
                console.log(`🧊 ICE соединение с ${targetSocketId}: ${iceState}`);

                if (iceState === 'connected' || iceState === 'completed') {
                    participantRecord.connected = true;
                    if (participantRecord.mediaElement && participantRecord.mediaElement.srcObject) {
                        participantRecord.mediaElement.play().catch(err => {
                            console.error('Ошибка воспроизведения после ICE подключения:', err);
                        });
                    }
                } else if (iceState === 'failed' || iceState === 'disconnected') {
                    participantRecord.connected = false;
                    console.warn(`⚠️ ICE соединение потеряно с ${targetSocketId}: ${iceState}`);
                }

                this.updateParticipantUI(targetSocketId);
            };

            peerConnection.addEventListener('signalingstatechange', () => {
                const state = peerConnection.signalingState;
                console.log(`🔄 Signaling state с ${targetSocketId}: ${state}`);
                if (state === 'stable' && participantRecord.pendingRenegotiation) {
                    participantRecord.pendingRenegotiation = false;
                    this.renegotiateWithPeer(targetSocketId, participantRecord, 'signaling-stable');
                }
            });

            this.updateConferenceStatus();

            if (isInitiator) {
                console.log(`📤 Создание offer для ${targetSocketId}`);
                const offer = await peerConnection.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                await peerConnection.setLocalDescription(offer);
                console.log(`✅ Offer создан и отправлен для ${targetSocketId}`);

                this.socket.emit('webrtc-signal', {
                    targetSocketId,
                    signal: offer,
                    type: 'offer'
                });
            }

            this.updateParticipantsList();
            this.updateParticipantVideoState(targetSocketId);
        } catch (error) {
            console.error(`Ошибка подключения к ${targetSocketId}:`, error);
            const participant = this.participants.get(targetSocketId);
            if (participant) {
                if (participant.tileElement && participant.tileElement.parentNode) {
                    participant.tileElement.remove();
                }
                if (participant.mediaElement && participant.mediaElement.parentNode && participant.mediaElement.parentNode !== participant.tileElement) {
                    participant.mediaElement.remove();
                }
            }
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

                // Устанавливаем answer только если состояние "have-local-offer"
                // Это означает, что мы отправили offer и ждем answer
                if (pc.signalingState === 'have-local-offer') {
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
                    }
                } else {
                    console.warn('⚠️ Неподходящее состояние для установки answer:', pc.signalingState, 
                        '(ожидается have-local-offer, но получено', pc.signalingState + ')');
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
                
                // Определяем, кто должен быть инициатором
                const shouldBeInitiator = this.isInitiator(this.socket.id, data.fromSocketId);
                
                if (!shouldBeInitiator) {
                    // Мы не инициатор (больший socketId), отменяем свой offer и принимаем роль ответчика
                    console.log('🔄 Отменяю локальный offer, принимаю роль ответчика');
                    try {
                        // Отменяем локальный offer
                        await pc.setLocalDescription(null);
                        console.log('✅ Локальный offer отменен');
                        
                        // Устанавливаем удаленное описание (offer от инициатора)
                        await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
                        console.log('✅ Remote description установлен (offer от инициатора)');
                        
                        // Создаем answer
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
                        console.error('❌ Ошибка обработки одновременного offer (отмена):', err);
                    }
                } else {
                    // Мы инициатор (меньший socketId), игнорируем полученный offer
                    // и ждем answer на наш offer
                    console.log('✅ Я инициатор, игнорирую полученный offer, жду answer');
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
        if (!participant) {
            return;
        }

        console.log(`🔌 Отключение от ${socketId}`);

        if (participant.peerConnection) {
            participant.peerConnection.close();
        }

        if (participant.mediaElement) {
            participant.mediaElement.pause();
            participant.mediaElement.srcObject = null;
            if (participant.mediaElement.parentNode && participant.mediaElement.parentNode !== (participant.tileElement || null)) {
                participant.mediaElement.remove();
            }
        }

        if (participant.tileElement && participant.tileElement.parentNode) {
            participant.tileElement.remove();
        }

        this.participants.delete(socketId);
        this.updateConferenceStatus();
        this.showMessage('Участник покинул конференцию', 'info');
        this.updateParticipantsList();
        this.updateParticipantVideoState(socketId);
    },
    
    async toggleVideo() {
        if (!this.localStream || this.videoToggleInProgress) {
            return;
        }

        this.videoToggleInProgress = true;
        this.updateVideoButton();

        try {
            if (this.isVideoEnabled) {
                await this.disableVideo();
                this.showMessage('Камера выключена', 'info');
            } else {
                await this.enableVideo();
                this.showMessage('Камера включена', 'success');
            }
        } catch (error) {
            console.error('❌ Ошибка переключения видео:', error);
            this.showMessage('Не удалось переключить камеру: ' + error.message, 'error');
        } finally {
            this.videoToggleInProgress = false;
            this.updateVideoButton();
            this.updateParticipantsList();
        }
    },

    async enableVideo() {
        if (this.isVideoEnabled) {
            return;
        }

        console.log('📹 Запрос доступа к камере...');
        let stream;

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: true
            });
        } catch (error) {
            throw new Error('Камера недоступна или отключена');
        }

        const [videoTrack] = stream.getVideoTracks();
        if (!videoTrack) {
            throw new Error('Видео трек не найден');
        }

        stream.getTracks().forEach(track => {
            if (track !== videoTrack) {
                track.stop();
            }
        });

        this.videoTrack = videoTrack;
        this.localStream.addTrack(videoTrack);
        this.isVideoEnabled = true;
        this.attachLocalStreamToPreview();

        this.participants.forEach((participant, socketId) => {
            if (!participant.peerConnection) {
                return;
            }

            if (participant.videoSender) {
                participant.videoSender.replaceTrack(videoTrack).catch(err => {
                    console.error('Ошибка замены видео-трека для участника', socketId, err);
                });
            } else {
                const sender = participant.peerConnection
                    .getSenders()
                    .find(s => s.track && s.track.kind === 'video');

                if (sender) {
                    sender.replaceTrack(videoTrack).catch(err => {
                        console.error('Ошибка замены видео-трека для участника', socketId, err);
                    });
                } else {
                    participant.peerConnection.addTrack(videoTrack, this.localStream);
                }
            }

            this.updateParticipantVideoState(socketId);
        });

        await this.renegotiateAllPeers('enable-video');
    },

    async disableVideo() {
        if (!this.isVideoEnabled) {
            return;
        }

        const videoTrack = this.videoTrack;

        this.participants.forEach((participant, socketId) => {
            if (!participant.peerConnection) {
                return;
            }

            if (participant.videoSender) {
                participant.videoSender.replaceTrack(null).catch(err => {
                    console.warn('⚠️ Не удалось удалить видео-трек у участника', socketId, err);
                });
            } else {
                const videoSenders = participant.peerConnection
                    .getSenders()
                    .filter(sender => sender.track && sender.track.kind === 'video');

                videoSenders.forEach(sender => {
                    sender.replaceTrack(null).catch(err => {
                        console.warn('⚠️ Не удалось удалить видео-трек у участника', socketId, err);
                    });
                });
            }

            this.updateParticipantVideoState(socketId);
        });

        if (videoTrack) {
            this.localStream.removeTrack(videoTrack);
            videoTrack.stop();
        }

        this.videoTrack = null;
        this.isVideoEnabled = false;
        this.attachLocalStreamToPreview();

        await this.renegotiateAllPeers('disable-video');
    },

    async renegotiateAllPeers(reason = 'manual') {
        if (!this.socket) {
            return;
        }

        const tasks = [];
        this.participants.forEach((participant, socketId) => {
            tasks.push(this.renegotiateWithPeer(socketId, participant, reason));
        });

        if (tasks.length > 0) {
            await Promise.allSettled(tasks);
        }
    },

    async renegotiateWithPeer(socketId, participant, reason = 'manual') {
        const participantRecord = participant || this.participants.get(socketId);
        if (!participantRecord || !participantRecord.peerConnection) {
            return;
        }

        const peerConnection = participantRecord.peerConnection;
        if (peerConnection.signalingState === 'closed') {
            return;
        }

        if (peerConnection.signalingState !== 'stable') {
            console.log(`⏳ Откладываем renegotiation с ${socketId}, signalingState=${peerConnection.signalingState}`);
            participantRecord.pendingRenegotiation = true;
            return;
        }

        if (participantRecord.renegotiating) {
            participantRecord.pendingRenegotiation = true;
            return;
        }

        participantRecord.renegotiating = true;

        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            if (this.socket) {
                this.socket.emit('webrtc-signal', {
                    targetSocketId: socketId,
                    signal: offer,
                    type: 'offer',
                    reason
                });
            }
        } catch (error) {
            console.error(`❌ Ошибка renegotiation с ${socketId}:`, error);
        } finally {
            participantRecord.renegotiating = false;
            if (participantRecord.pendingRenegotiation) {
                participantRecord.pendingRenegotiation = false;
                setTimeout(() => {
                    this.renegotiateWithPeer(socketId, participantRecord, reason);
                }, 0);
            }
        }
    },
    
    toggleMute() {
        if (!this.localStream) return;
        
        const audioTracks = this.localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            // Определяем текущее состояние (включен/выключен)
            const currentlyEnabled = audioTracks[0].enabled;
            
            // Изменяем состояние на противоположное
            audioTracks[0].enabled = !currentlyEnabled;
            
            // Обновляем текст кнопки - показываем действие, которое произойдет при следующем нажатии
            // Если микрофон теперь включен -> показываем "Выключить" (следующее действие)
            // Если микрофон теперь выключен -> показываем "Включить" (следующее действие)
            if (this.elements.btnMute) {
                if (!currentlyEnabled) {
                    // Микрофон был выключен, теперь включили -> показываем "Выключить" (следующее действие)
                    this.elements.btnMute.textContent = '🔇 Выключить микрофон';
                    this.elements.btnMute.classList.remove('muted');
                } else {
                    // Микрофон был включен, теперь выключили -> показываем "Включить" (следующее действие)
                    this.elements.btnMute.textContent = '🎤 Включить микрофон';
                    this.elements.btnMute.classList.add('muted');
                }
            }
        }
    },
    
    updateMuteButton() {
        // Обновляем текст кнопки в соответствии с текущим состоянием микрофона
        if (!this.localStream || !this.elements.btnMute) return;
        
        const audioTracks = this.localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            const isEnabled = audioTracks[0].enabled;
            // Если микрофон включен -> показываем "Выключить" (действие при нажатии)
            // Если микрофон выключен -> показываем "Включить" (действие при нажатии)
            if (isEnabled) {
                this.elements.btnMute.textContent = '🔇 Выключить микрофон';
                this.elements.btnMute.classList.remove('muted');
            } else {
                this.elements.btnMute.textContent = '🎤 Включить микрофон';
                this.elements.btnMute.classList.add('muted');
            }
        }
    },
    
    updateParticipantsList() {
        const list = this.elements.participantsList;
        if (!list) return;
        
        list.innerHTML = '';
        
        const selfVideoEnabled = this.isVideoEnabled;
        const selfItem = document.createElement('div');
        selfItem.className = 'participant-item self';
        selfItem.innerHTML = `
            <div class="participant-name">Вы</div>
            <div class="participant-status">
                <span class="status-pill success">Подключено</span>
                <span class="status-pill ${selfVideoEnabled ? 'success' : 'muted'}">${selfVideoEnabled ? '📹 Камера включена' : '🚫 Камера выключена'}</span>
            </div>
        `;
        list.appendChild(selfItem);
        
        this.participants.forEach((participant, socketId) => {
            const item = document.createElement('div');
            item.className = 'participant-item';
            
            const connState = participant.peerConnection ? participant.peerConnection.connectionState : 'new';
            const iceState = participant.peerConnection ? participant.peerConnection.iceConnectionState : 'new';
            
            let status = 'Ожидание';
            let statusClass = 'neutral';
            if (connState === 'connected' || iceState === 'connected' || iceState === 'completed') {
                status = 'Подключено';
                statusClass = 'success';
            } else if (connState === 'connecting' || iceState === 'checking' || iceState === 'connecting') {
                status = 'Подключение...';
                statusClass = 'warning';
            } else if (connState === 'failed' || iceState === 'failed') {
                status = 'Ошибка';
                statusClass = 'muted';
            } else if (connState === 'disconnected') {
                status = 'Отключено';
                statusClass = 'muted';
            }
            
            const videoActive = !!participant.videoEnabled;
            const videoClass = videoActive ? 'success' : 'muted';
            const videoText = videoActive ? '📹 Камера включена' : '🚫 Камера выключена';
            
            item.innerHTML = `
                <div class="participant-name">Участник ${socketId.substring(0, 8)}</div>
                <div class="participant-status">
                    <span class="status-pill ${statusClass}">${status}</span>
                    <span class="status-pill ${videoClass}">${videoText}</span>
                </div>
            `;
            list.appendChild(item);
        });
    },
    
    updateParticipantUI(socketId) {
        this.updateParticipantsList();
        if (socketId) {
            this.updateParticipantVideoState(socketId);
        }
    },
    
    updateConferenceStatus() {
        const statusEl = this.elements.conferenceStatus;
        if (!statusEl) return;
        
        const count = this.participants.size + 1; // +1 для себя
        console.log('📊 [updateConferenceStatus] Обновление статуса:', {
            participantsSize: this.participants.size,
            totalCount: count,
            participantIds: Array.from(this.participants.keys())
        });
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
        this.videoTrack = null;
        this.isVideoEnabled = false;
        this.attachLocalStreamToPreview();
        this.updateVideoButton();

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
    },

    createParticipantMedia(socketId) {
        const grid = this.elements.videoGrid;

        if (!grid) {
            const audioElement = document.createElement('audio');
            audioElement.autoplay = true;
            audioElement.controls = false;
            audioElement.playsInline = true;
            audioElement.volume = 1.0;
            audioElement.style.display = 'none';
            document.body.appendChild(audioElement);

            return {
                tileElement: null,
                mediaElement: audioElement,
                labelElement: null
            };
        }

        const existingTile = grid.querySelector(`[data-socket-id="${socketId}"]`);
        if (existingTile) {
            existingTile.remove();
        }

        const tileElement = document.createElement('div');
        tileElement.className = 'video-tile video-off';
        tileElement.dataset.socketId = socketId;

        const videoElement = document.createElement('video');
        videoElement.className = 'video-element';
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.controls = false;
        videoElement.muted = false;

        const labelElement = document.createElement('div');
        labelElement.className = 'video-label';
        labelElement.textContent = `Участник ${socketId.substring(0, 8)}`;

        tileElement.appendChild(videoElement);
        tileElement.appendChild(labelElement);
        grid.appendChild(tileElement);

        return {
            tileElement,
            mediaElement: videoElement,
            labelElement
        };
    },

    updateParticipantVideoState(socketId) {
        const participant = this.participants.get(socketId);
        if (!participant) {
            return;
        }

        if (participant.mediaElement && participant.mediaElement.srcObject) {
            const hasVideo = participant.mediaElement.srcObject
                .getVideoTracks()
                .some(track => track.readyState === 'live' && track.enabled);
            participant.videoEnabled = hasVideo;
        } else {
            participant.videoEnabled = false;
        }

        if (participant.tileElement) {
            participant.tileElement.classList.toggle('video-off', !participant.videoEnabled);
        }

        if (participant.labelElement) {
            const baseLabel = `Участник ${socketId.substring(0, 8)}`;
            participant.labelElement.textContent = participant.videoEnabled ? baseLabel : `${baseLabel} (камера выкл.)`;
        }
    },

    updateVideoButton() {
        const btn = this.elements.btnVideo;
        if (!btn) {
            this.updateLocalVideoState(!!this.localStream && this.isVideoEnabled);
            return;
        }
 
        if (!this.localStream) {
            btn.disabled = true;
            btn.textContent = '📹 Включить камеру';
            btn.classList.add('muted');
            this.updateLocalVideoState(false);
            return;
        }
 
        btn.disabled = !!this.videoToggleInProgress;
        if (this.isVideoEnabled) {
            btn.textContent = '📷 Выключить камеру';
            btn.classList.remove('muted');
            this.updateLocalVideoState(true);
        } else {
            btn.textContent = '📹 Включить камеру';
            btn.classList.add('muted');
            this.updateLocalVideoState(false);
        }
    },

    updateLocalVideoState(isEnabled = this.isVideoEnabled) {
        const tile = this.elements.localVideoTile;
        const label = this.elements.localVideoLabel;

        if (tile) {
            tile.classList.toggle('video-off', !isEnabled);
        }

        if (label) {
            label.textContent = isEnabled ? 'Вы' : 'Вы (камера выкл.)';
        }
    },

    attachLocalStreamToPreview() {
        const localVideo = this.elements.localVideo;
        if (!localVideo) return;
        if (this.localStream) {
            localVideo.srcObject = this.localStream;
            localVideo.muted = true;
            localVideo.playsInline = true;
            localVideo.autoplay = true;
            localVideo.style.visibility = 'visible';
            this.updateLocalVideoState(this.isVideoEnabled);
            const attemptPlay = () => localVideo.play().catch(err => {
                console.warn('⚠️ Не удалось автоматически воспроизвести локальное превью:', err);
                document.addEventListener('click', () => {
                    localVideo.play().catch(e => console.warn('Ошибка воспроизведения превью после клика:', e));
                }, { once: true });
            });
            attemptPlay();
        } else {
            localVideo.srcObject = null;
            localVideo.style.visibility = 'hidden';
            this.updateLocalVideoState(false);
        }
    }
};

if (typeof globalThis !== 'undefined') {
    globalThis.App = App;
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
