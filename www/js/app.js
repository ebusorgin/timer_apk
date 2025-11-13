// Простая конференция без регистрации
const App = {
    socket: null,
    localStream: null,
    participants: new Map(), // socketId -> { peerConnection, mediaElement, tileElement, pendingCandidates }
    presence: new Map(), // socketId -> { id, media: { cam, mic }, connectedAt }
    lastSentMediaStatus: { cam: false, mic: false },
    selfId: null,
    hangupAllInProgress: false,
    pendingPlaybackElements: new Map(),
    playbackUnlockHandlerInstalled: false,
    playbackUnlockHandler: null,
    audioContext: null,
    connectionInProgress: false,
    
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
        this.resetPresenceState();

        if (!this.elements.btnConnect) {
            console.error('❌ Кнопка подключения не найдена!');
            return;
        }
        
        this.setupEventListeners();
        this.updateVideoButton();
        this.updateHangupAllButton();
        console.log('✅ App инициализирован');
    },
    
    initElements() {
        this.elements = {
            connectScreen: document.getElementById('connectScreen'),
            conferenceScreen: document.getElementById('conferenceScreen'),
            btnConnect: document.getElementById('btnConnect'),
            btnDisconnect: document.getElementById('btnDisconnect'),
            btnMute: document.getElementById('btnMute'),
            btnHangupAll: document.getElementById('btnHangupAll'),
            participantsList: document.getElementById('participantsList'),
            statusMessage: document.getElementById('statusMessage'),
            connectStatusMessage: document.getElementById('connectStatusMessage'),
            conferenceStatus: document.getElementById('conferenceStatus'),
            videoGrid: document.getElementById('videoGrid'),
            localVideo: document.getElementById('localVideo'),
            localVideoTile: document.querySelector('#videoGrid .video-tile.self'),
            localVideoLabel: document.querySelector('#videoGrid .video-tile.self .video-label'),
            btnVideo: document.getElementById('btnVideo') // Добавляем кнопку видео
        };
    },

    setConnectStatusMessage(message, level = 'info') {
        const container = this.elements.connectStatusMessage;
        if (!container) {
            return;
        }
        container.textContent = message || '';
        container.classList.remove('success', 'error', 'info', 'show');
        if (message) {
            container.classList.add('show');
            if (level) {
                container.classList.add(level);
            }
        }
    },

    clearConnectStatusMessage() {
        this.setConnectStatusMessage('');
    },

    setupEventListeners() {
        this.elements.btnConnect.addEventListener('click', () => {
            this.ensureAudioContextUnlocked('connect-button');
            this.connect();
        });
        this.elements.btnDisconnect.addEventListener('click', () => this.disconnect());
        if (this.elements.btnMute) {
            this.elements.btnMute.addEventListener('click', () => this.toggleMute());
        }
        if (this.elements.btnVideo) {
            this.elements.btnVideo.addEventListener('click', () => this.toggleVideo());
        }
        if (this.elements.btnHangupAll) {
            this.elements.btnHangupAll.addEventListener('click', () => this.hangupAll());
        }
    },

    resetPresenceState() {
        this.presence = new Map();
        this.lastSentMediaStatus = { cam: false, mic: false };
        this.selfId = null;
        this.hangupAllInProgress = false;
        if (this.pendingPlaybackElements) {
            this.pendingPlaybackElements.clear();
        }
        this.removeSelfParticipantEntry();
        this.updateHangupAllButton();
    },

    removeSelfParticipantEntry() {
        const selfId = this.selfId || this.socket?.id;
        if (!selfId) {
            return;
        }
        const participant = this.participants.get(selfId);
        if (!participant) {
            return;
        }
        if (participant.peerConnection) {
            try {
                participant.peerConnection.close();
            } catch (err) {
                console.warn('⚠️ Ошибка закрытия self peerConnection:', err);
            }
        }
        if (participant.mediaElement) {
            participant.mediaElement.pause();
            participant.mediaElement.srcObject = null;
            if (participant.mediaElement.parentNode) {
                participant.mediaElement.parentNode.removeChild(participant.mediaElement);
            }
        }
        if (participant.tileElement && participant.tileElement.parentNode) {
            participant.tileElement.parentNode.removeChild(participant.tileElement);
        }
        this.participants.delete(selfId);
    },

    ensurePresenceRecord(socketId, data = {}) {
        if (!socketId) {
            return null;
        }

        const existing = this.presence.get(socketId) || {
            id: socketId,
            media: { cam: false, mic: false },
            connectedAt: Date.now()
        };

        if (data.media) {
            const nextMedia = {
                cam: typeof data.media.cam === 'boolean' ? data.media.cam : existing.media.cam,
                mic: typeof data.media.mic === 'boolean' ? data.media.mic : existing.media.mic
            };
            existing.media = nextMedia;
        }

        if (data.connectedAt) {
            existing.connectedAt = data.connectedAt;
        }

        this.presence.set(socketId, existing);
        return existing;
    },

    forcePlayMediaElement(mediaElement, debugLabel = 'unknown', options = {}) {
        if (!mediaElement) {
            return;
        }

        const { keepMuted = false } = options;
        const previousMuted = mediaElement.muted;
        // Временно выключаем звук, чтобы обойти ограничения автозапуска
        mediaElement.muted = true;

        const restorePlaybackState = () => {
            if (keepMuted) {
                mediaElement.muted = true;
            } else {
                mediaElement.muted = previousMuted;
            }
        };

        const ensureUnmutedSoon = () => {
            if (keepMuted) {
                return;
            }
            setTimeout(() => {
                if (mediaElement.muted) {
                    mediaElement.muted = false;
                }
            }, 200);
        };

        try {
            const playResult = mediaElement.play();
            restorePlaybackState();
            ensureUnmutedSoon();

            if (playResult && typeof playResult.then === 'function') {
                playResult
                    .then(() => {
                        this.pendingPlaybackElements.delete(mediaElement);
                    })
                    .catch((error) => {
                        console.warn(`⚠️ Не удалось автоматически воспроизвести поток (${debugLabel}):`, error);
                        this.queueMediaPlaybackRetry(mediaElement, options);
                    });
            } else {
                this.pendingPlaybackElements.delete(mediaElement);
            }
        } catch (error) {
            console.warn(`⚠️ Ошибка при попытке воспроизведения медиа (${debugLabel}):`, error);
            restorePlaybackState();
            this.queueMediaPlaybackRetry(mediaElement, options);
            ensureUnmutedSoon();
        }
    },

    queueMediaPlaybackRetry(mediaElement, options = {}) {
        if (!mediaElement) {
            return;
        }
        this.pendingPlaybackElements.set(mediaElement, options);
        this.ensurePlaybackUnlockHandlers();
    },

    ensurePlaybackUnlockHandlers() {
        if (this.playbackUnlockHandlerInstalled) {
            return;
        }

        const handler = () => {
            this.ensureAudioContextUnlocked('interaction');
            this.resumePendingMediaElements();
        };

        ['pointerdown', 'touchstart', 'keydown'].forEach((eventName) => {
            document.addEventListener(eventName, handler, { passive: true });
        });
        window.addEventListener('focus', handler);

        this.playbackUnlockHandlerInstalled = true;
        this.playbackUnlockHandler = handler;
    },

    resumePendingMediaElements() {
        if (!this.pendingPlaybackElements || this.pendingPlaybackElements.size === 0) {
            return;
        }

        const pending = Array.from(this.pendingPlaybackElements.entries());
        this.pendingPlaybackElements.clear();
        pending.forEach(([element, options]) => {
            this.forcePlayMediaElement(element, 'resume', options || {});
        });
    },

    ensureAudioContextUnlocked(reason = 'manual') {
        if (this.audioContext && this.audioContext.state !== 'closed') {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch((err) => {
                    console.warn(`⚠️ Не удалось возобновить AudioContext (${reason})`, err);
                });
            }
            return;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            console.warn('⚠️ AudioContext недоступен в этом браузере');
            return;
        }

        try {
            this.audioContext = new AudioContextClass();
        } catch (err) {
            console.warn(`⚠️ Не удалось создать AudioContext (${reason})`, err);
            this.audioContext = null;
            return;
        }

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch((err) => {
                console.warn(`⚠️ Не удалось активировать AudioContext (${reason})`, err);
            });
        }
    },

    attachStreamToAudioContext(participantRecord, remoteStream, debugLabel = 'remote') {
        if (!participantRecord || !remoteStream) {
            return;
        }

        this.ensureAudioContextUnlocked(`attach-${debugLabel}`);
        if (!this.audioContext) {
            return;
        }

        const currentStreamId = remoteStream.id;
        if (participantRecord.audioSourceNode && participantRecord.audioSourceStreamId === currentStreamId) {
            return;
        }

        if (participantRecord.audioSourceNode) {
            try {
                participantRecord.audioSourceNode.disconnect();
            } catch (err) {
                console.warn(`⚠️ Не удалось отключить предыдущий audioSourceNode (${debugLabel})`, err);
            }
            participantRecord.audioSourceNode = null;
            participantRecord.audioSourceStreamId = null;
        }

        try {
            const sourceNode = this.audioContext.createMediaStreamSource(remoteStream);
            sourceNode.connect(this.audioContext.destination);
            participantRecord.audioSourceNode = sourceNode;
            participantRecord.audioSourceStreamId = currentStreamId;
        } catch (err) {
            console.warn(`⚠️ Не удалось подключить поток к AudioContext (${debugLabel})`, err);
        }
    },

    detachAudioSourceFromParticipant(participantRecord) {
        if (!participantRecord || !participantRecord.audioSourceNode) {
            return;
        }

        try {
            participantRecord.audioSourceNode.disconnect();
        } catch (err) {
            console.warn('⚠️ Не удалось отключить audioSourceNode при очистке', err);
        }

        participantRecord.audioSourceNode = null;
        participantRecord.audioSourceStreamId = null;
    },

    getLocalMediaState() {
        const audioTrack = this.localStream?.getAudioTracks()[0];
        const mic = !!(audioTrack && audioTrack.enabled);
        const cam = !!this.isVideoEnabled;
        return { cam, mic };
    },

    syncLocalMediaStatus({ force = false } = {}) {
        if (!this.socket) {
            return;
        }

        const nextStatus = this.getLocalMediaState();
        const prev = this.lastSentMediaStatus || { cam: false, mic: false };

        if (!force && prev.cam === nextStatus.cam && prev.mic === nextStatus.mic) {
            return;
        }

        this.lastSentMediaStatus = nextStatus;
        this.socket.emit('status:change', { media: nextStatus });

        const selfId = this.selfId || this.socket.id;
        if (selfId) {
            const record = this.ensurePresenceRecord(selfId);
            record.media = { ...record.media, ...nextStatus };
            this.presence.set(selfId, record);
            this.updateParticipantsList();
        }
    },

    updateHangupAllButton() {
        const btn = this.elements?.btnHangupAll;
        if (!btn) {
            return;
        }

        if (!this.socket) {
            btn.style.display = 'none';
            btn.disabled = true;
            return;
        }

        if (this.hangupAllInProgress) {
            btn.style.display = 'none';
            btn.disabled = true;
            return;
        }

        btn.style.display = '';
        btn.disabled = false;
    },

    hangupAll() {
        if (!this.socket) {
            return;
        }
        if (this.hangupAllInProgress) {
            return;
        }

        this.hangupAllInProgress = true;
        this.updateHangupAllButton();
        this.showMessage('Завершаем конференцию для всех участников...', 'info');

        try {
            this.socket.emit('conference:hangup-all');
        } catch (error) {
            console.error('❌ Ошибка отправки глобального завершения конференции:', error);
            this.showMessage('Не удалось завершить конференцию для всех', 'error');
            this.hangupAllInProgress = false;
            this.updateHangupAllButton();
        }
    },

    handleForceDisconnect(payload = {}) {
        const { reason, initiatedBy } = payload;
        console.log('⚠️ Получена команда завершить конференцию для всех:', {
            reason,
            initiatedBy
        });

        const message = reason || 'Конференция завершена организатором';
        this.hangupAllInProgress = false;
        this.disconnect();
        this.showMessage(message, 'info');
        this.updateHangupAllButton();
    },

    handleSocketDisconnect(reason) {
        console.log('⚠️ Socket.IO отключен:', reason);
        this.showMessage('Отключено от сервера', 'error');
        this.setConnectStatusMessage('Отключено от сервера', 'error');

        this.participants.forEach((_, socketId) => {
            this.disconnectFromPeer(socketId);
        });
        this.participants = new Map();

        const videoGrid = this.elements.videoGrid;
        if (videoGrid) {
            videoGrid.querySelectorAll('.video-tile').forEach((tile) => {
                if (!tile.classList.contains('self')) {
                    tile.remove();
                }
            });
        }

        this.presence = new Map();
        this.selfId = null;
        this.lastSentMediaStatus = this.getLocalMediaState();
        this.hangupAllInProgress = false;

        this.updateParticipantsList();
        this.updateConferenceStatus();
        this.updateHangupAllButton();
    },

    async handlePresenceSync(data = {}) {
        const participants = Array.isArray(data.participants) ? data.participants : [];
        const selfIdFromServer = typeof data.selfId === 'string' ? data.selfId : null;
        if (selfIdFromServer) {
            this.selfId = selfIdFromServer;
        } else if (this.socket?.id) {
            this.selfId = this.socket.id;
        }

        console.log('📡 [presence:sync] Получен снимок участников:', participants, 'selfId:', this.selfId);

        this.presence = new Map();
        const toConnect = [];

        participants.forEach((participant) => {
            if (!participant?.id) {
                return;
            }

            const media = {
                cam: !!(participant.media && participant.media.cam),
                mic: typeof participant.media?.mic === 'boolean' ? participant.media.mic : false
            };

            this.ensurePresenceRecord(participant.id, {
                media,
                connectedAt: participant.connectedAt
            });

            if (participant.id !== this.selfId) {
                toConnect.push(participant.id);
            }
        });

        const selfId = this.selfId || this.socket?.id;
        if (selfId && !this.presence.has(selfId)) {
            this.ensurePresenceRecord(selfId, {
                media: this.getLocalMediaState(),
                connectedAt: Date.now()
            });
        }

        this.removeSelfParticipantEntry();

        this.updateParticipantsList();
        this.updateConferenceStatus();

        for (const otherId of toConnect) {
            const baseId = this.selfId || this.socket?.id;
            if (!baseId) {
                continue;
            }
            const isInitiator = this.isInitiator(baseId, otherId);
            try {
                await this.connectToPeer(otherId, isInitiator);
            } catch (err) {
                console.error(`❌ Ошибка подключения к участнику ${otherId} после presence:sync`, err);
            }
        }

        this.updateHangupAllButton();
    },

    async handlePresenceUpdate(data = {}) {
        const { action, participant, participantId } = data;
        console.log('📡 [presence:update]', data);

        if (action === 'join' && participant?.id) {
            if (participant.id === (this.selfId || this.socket?.id)) {
                return;
            }

            const media = {
                cam: !!(participant.media && participant.media.cam),
                mic: typeof participant.media?.mic === 'boolean' ? participant.media.mic : false
            };

            this.ensurePresenceRecord(participant.id, {
                media,
                connectedAt: participant.connectedAt
            });

            this.showMessage('Новый участник присоединился', 'info');

            this.updateParticipantsList();
            this.updateConferenceStatus();

            const baseId = this.selfId || this.socket?.id;
            if (!baseId) {
                return;
            }
            const isInitiator = this.isInitiator(baseId, participant.id);
            try {
                await this.connectToPeer(participant.id, isInitiator);
            } catch (err) {
                console.error(`❌ Ошибка подключения к новому участнику ${participant.id}`, err);
            }
        } else if (action === 'leave' && participantId) {
            this.presence.delete(participantId);
            this.disconnectFromPeer(participantId);
            this.updateConferenceStatus();
            this.updateParticipantsList();
            this.showMessage('Участник покинул конференцию', 'info');
        }

        this.updateHangupAllButton();
    },

    handleStatusUpdate(data = {}) {
        const { id, media } = data;
        if (!id) {
            return;
        }

        const normalizedMedia = {
            cam: typeof media?.cam === 'boolean' ? media.cam : undefined,
            mic: typeof media?.mic === 'boolean' ? media.mic : undefined
        };

        const selfId = this.selfId || this.socket?.id || null;
        const hasRecord = this.presence.has(id);
        const isSelf = selfId && id === selfId;

        if (!hasRecord && !isSelf) {
            const camValue = normalizedMedia.cam;
            const micValue = normalizedMedia.mic;
            const camInactive = camValue === false || camValue === undefined;
            const micInactive = micValue === false || micValue === undefined;

            if (camInactive && micInactive) {
                // Игнорируем статусы для участников, которые уже покинули конференцию
                return;
            }
        }

        const record = this.ensurePresenceRecord(id);
        record.media = {
            cam: normalizedMedia.cam !== undefined ? normalizedMedia.cam : record.media.cam,
            mic: normalizedMedia.mic !== undefined ? normalizedMedia.mic : record.media.mic
        };
        this.presence.set(id, record);

        if (id === (this.selfId || this.socket?.id)) {
            this.lastSentMediaStatus = {
                cam: record.media.cam,
                mic: record.media.mic
            };
        }

        this.updateParticipantUI(id);
        this.updateHangupAllButton();
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
        if (this.socket && this.socket.connected) {
            console.log('ℹ️ Уже подключены к конференции');
            if (this.elements.conferenceScreen && !this.elements.conferenceScreen.classList.contains('active')) {
                this.showScreen('conferenceScreen');
            }
            return;
        }
        if (this.connectionInProgress) {
            console.log('⏳ Подключение уже выполняется, ожидаем завершения');
            return;
        }

        this.connectionInProgress = true;
        this.setConnectStatusMessage('Подключение...', 'info');
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
            this.socket.on('connect', () => {
                this.connectionInProgress = false;
                console.log('✅ Socket.IO подключен:', this.socket.id);
                this.showMessage('Подключено к серверу', 'success');
                this.setConnectStatusMessage('Соединение установлено', 'success');

                this.selfId = this.socket.id;
                this.hangupAllInProgress = false;

                this.ensurePresenceRecord(this.socket.id, {
                    media: this.getLocalMediaState(),
                    connectedAt: Date.now()
                });

                if (document.getElementById('connectScreen').classList.contains('active')) {
                    this.showScreen('conferenceScreen');
                }
                this.clearConnectStatusMessage();

                this.updateConferenceStatus();
                this.updateParticipantsList();
                this.updateMuteButton();
                this.updateVideoButton();
                this.updateHangupAllButton();
                this.syncLocalMediaStatus({ force: true });
            });
            
            this.socket.on('connect_error', (error) => {
                this.connectionInProgress = false;
                console.error('❌ Ошибка подключения Socket.IO:', error);
                this.showMessage('Ошибка подключения к серверу', 'error');
                this.elements.btnConnect.disabled = false;
                this.setConnectStatusMessage('Ошибка подключения к серверу', 'error');
            });
            
            this.socket.on('disconnect', (reason) => {
                this.connectionInProgress = false;
                this.handleSocketDisconnect(reason);
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
                this.syncLocalMediaStatus({ force: true });
                this.attachLocalStreamToPreview();
                this.updateVideoButton();

                const audioAttached = await this.attachAudioTracksToAllParticipants();
                if (audioAttached) {
                    await this.renegotiateAllPeers('initial-audio', { forceLocalInitiator: true });
                }
            } catch (error) {
                console.error('❌ Ошибка доступа к микрофону:', error);
                this.showMessage('Не удалось получить доступ к микрофону. Разрешите доступ и попробуйте снова.', 'error');
                this.elements.btnConnect.disabled = false;
                this.setConnectStatusMessage('Не удалось получить доступ к микрофону', 'error');
                if (this.socket) {
                    this.socket.disconnect();
                }
                this.connectionInProgress = false;
                return;
            }
            
        } catch (error) {
            console.error('❌ Ошибка подключения:', error);
            this.showMessage('Ошибка подключения: ' + error.message, 'error');
            this.elements.btnConnect.disabled = false;
            this.setConnectStatusMessage('Ошибка подключения: ' + error.message, 'error');
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
                this.attachLocalStreamToPreview();
                this.updateVideoButton();
            }
            if (this.socket) {
                this.socket.disconnect();
            }
            this.connectionInProgress = false;
            this.updateVideoButton();
        }
    },
    
    setupSocketEvents() {
        this.socket.on('presence:sync', (data) => this.handlePresenceSync(data));
        this.socket.on('presence:update', (data) => this.handlePresenceUpdate(data));
        this.socket.on('status:update', (data) => this.handleStatusUpdate(data));
        this.socket.on('conference:force-disconnect', (data) => this.handleForceDisconnect(data));

        this.socket.on('webrtc-signal', async (data) => {
            console.log('📡 [webrtc-signal] Получен WebRTC сигнал:', data.type, 'от', data.fromSocketId);
            console.log('📡 [webrtc-signal] Полные данные:', data);
            await this.handleWebRTCSignal(data);
        });
    },
    
    async connectToPeer(targetSocketId, isInitiator) {
        const selfId = this.selfId || this.socket?.id;
        if (!targetSocketId || targetSocketId === selfId) {
            console.log('⏭️ Пропускаем подключение к самому себе', targetSocketId);
            return;
        }

        if (this.participants.has(targetSocketId)) {
            console.log('Уже подключен к', targetSocketId);
            return;
        }

        try {
            const peerConnection = new RTCPeerConnection({ iceServers: this.ICE_SERVERS });

            let videoTransceiver = null;
            let videoSender = null;

            if (this.videoTrack) {
                videoSender = peerConnection.addTrack(this.videoTrack, this.localStream);
                if (videoSender && videoSender.setStreams) {
                    try {
                        videoSender.setStreams(this.localStream);
                    } catch (err) {
                        console.warn('⚠️ Не удалось привязать локальный поток к sender для', targetSocketId, err);
                    }
                }
                if (typeof peerConnection.getTransceivers === 'function') {
                    videoTransceiver = peerConnection.getTransceivers().find(t => t.sender === videoSender) || null;
                }
            } else {
                videoTransceiver = peerConnection.addTransceiver('video', { direction: 'sendrecv' });
                if (this.localStream && videoTransceiver?.sender?.setStreams) {
                    try {
                        videoTransceiver.sender.setStreams(this.localStream);
                    } catch (err) {
                        console.warn('⚠️ Не удалось привязать локальный поток к sender для', targetSocketId, err);
                    }
                }
                videoSender = videoTransceiver.sender;
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
                videoSender: videoSender,
                videoTransceiver,
                audioSender: null,
                audioSourceNode: null,
                audioSourceStreamId: null,
                renegotiating: false,
                pendingRenegotiation: false,
                isInitiator
            };

            this.participants.set(targetSocketId, participantRecord);

            await this.attachAudioTrackToParticipant(targetSocketId, participantRecord);

            peerConnection.ontrack = (event) => {
                const trackKind = event.track ? event.track.kind : 'unknown';
                console.log('🎥 Получен трек от', targetSocketId, trackKind, event);

                if (!participantRecord.mediaElement) {
                    return;
                }

                let remoteStream = event.streams && event.streams[0];

                if (!remoteStream) {
                    const currentStream = participantRecord.mediaElement.srcObject;
                    if (currentStream instanceof MediaStream) {
                        remoteStream = currentStream;
                    } else {
                        remoteStream = new MediaStream();
                        participantRecord.mediaElement.srcObject = remoteStream;
                    }

                    if (event.track && !remoteStream.getTracks().includes(event.track)) {
                        remoteStream.addTrack(event.track);
                    }
                } else if (!participantRecord.mediaElement.srcObject || participantRecord.mediaElement.srcObject.id !== remoteStream.id) {
                    participantRecord.mediaElement.srcObject = remoteStream;
                }

                if (!remoteStream) {
                    console.warn('⚠️ Не удалось получить удаленный поток для', targetSocketId);
                    return;
                }

                participantRecord.mediaElement.autoplay = true;
                participantRecord.mediaElement.playsInline = true;
                participantRecord.mediaElement.muted = false;
                participantRecord.mediaElement.controls = false;

                this.forcePlayMediaElement(participantRecord.mediaElement, targetSocketId);

                if (event.track && event.track.kind === 'audio') {
                    this.attachStreamToAudioContext(participantRecord, remoteStream, targetSocketId);
                    event.track.addEventListener('ended', () => {
                        this.detachAudioSourceFromParticipant(participantRecord);
                    });
                }

                if (event.track && event.track.kind === 'video') {
                    participantRecord.videoEnabled = remoteStream.getVideoTracks().some(track =>
                        track.readyState === 'live' && track.enabled && !track.muted
                    );
                    this.updateParticipantVideoState(targetSocketId);
                    this.updateParticipantsList();

                    event.track.onended = () => {
                        participantRecord.videoEnabled = false;
                        this.updateParticipantVideoState(targetSocketId);
                        this.updateParticipantsList();
                    };
                    event.track.onmute = () => {
                        participantRecord.videoEnabled = remoteStream.getVideoTracks().some(track =>
                            track.readyState === 'live' && track.enabled && !track.muted
                        );
                        this.updateParticipantVideoState(targetSocketId);
                        this.updateParticipantsList();
                    };
                    event.track.onunmute = () => {
                        participantRecord.videoEnabled = remoteStream.getVideoTracks().some(track =>
                            track.readyState === 'live' && track.enabled && !track.muted
                        );
                        this.updateParticipantVideoState(targetSocketId);
                        this.updateParticipantsList();
                    };
                }

                remoteStream.onremovetrack = () => {
                    const hasLiveAudio = remoteStream.getAudioTracks().some(track =>
                        track.readyState === 'live' && !track.muted
                    );
                    if (!hasLiveAudio) {
                        this.detachAudioSourceFromParticipant(participantRecord);
                    }

                    const hasActiveVideo = remoteStream.getVideoTracks().some(track =>
                        track.readyState === 'live' && track.enabled && !track.muted
                    );
                    if (participantRecord.videoEnabled !== hasActiveVideo) {
                        participantRecord.videoEnabled = hasActiveVideo;
                        this.updateParticipantVideoState(targetSocketId);
                        this.updateParticipantsList();
                    }
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
                    this.forcePlayMediaElement(participantRecord.mediaElement, `${targetSocketId}-connectionstate`);
                }

                this.updateParticipantUI(targetSocketId);
            };

            peerConnection.oniceconnectionstatechange = () => {
                const iceState = peerConnection.iceConnectionState;
                console.log(`🧊 ICE соединение с ${targetSocketId}: ${iceState}`);

                if (iceState === 'connected' || iceState === 'completed') {
                    participantRecord.connected = true;
                    if (participantRecord.mediaElement && participantRecord.mediaElement.srcObject) {
                        this.forcePlayMediaElement(participantRecord.mediaElement, `${targetSocketId}-ice`);
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
            } else if (data.type === 'renegotiate-request') {
                console.log('🔁 Получен запрос на повторное согласование от', data.fromSocketId, data.reason);
                await this.renegotiateWithPeer(
                    data.fromSocketId,
                    participant,
                    data.reason || 'remote-request',
                    { forceInitiator: true }
                );
            }
        } catch (error) {
            console.error('Ошибка обработки WebRTC сигнала:', error);
        }
    },
    
    async handleOffer(pc, data) {
        try {
            // Если у нас уже есть локальное описание (мы тоже создали offer), 
            // это означает, что оба участника пытаются инициировать одновременно
            if (
                pc.signalingState === 'have-local-offer' &&
                pc.localDescription &&
                pc.localDescription.type === 'offer'
            ) {
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

        this.detachAudioSourceFromParticipant(participant);

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
        if (!this.localStream) {
            this.localStream = new MediaStream();
        }
        this.localStream.addTrack(videoTrack);
        this.isVideoEnabled = true;
        this.attachLocalStreamToPreview();
        this.syncLocalMediaStatus();

        const updateTasks = [];
        for (const [socketId, participant] of this.participants.entries()) {
            updateTasks.push(this.attachVideoTrackToParticipant(socketId, participant, videoTrack));
        }

        if (updateTasks.length > 0) {
            await Promise.allSettled(updateTasks);
        }

        await this.renegotiateAllPeers('enable-video', { forceLocalInitiator: true });
    },

    async disableVideo() {
        if (!this.isVideoEnabled) {
            return;
        }

        const videoTrack = this.videoTrack;

        const detachTasks = [];
        for (const [socketId, participant] of this.participants.entries()) {
            detachTasks.push(this.detachVideoTrackFromParticipant(socketId, participant));
        }

        if (detachTasks.length > 0) {
            await Promise.allSettled(detachTasks);
        }

        if (videoTrack) {
            this.localStream.removeTrack(videoTrack);
            videoTrack.stop();
        }

        this.videoTrack = null;
        this.isVideoEnabled = false;
        this.attachLocalStreamToPreview();
        this.syncLocalMediaStatus();

        await this.renegotiateAllPeers('disable-video', { forceLocalInitiator: true });
    },

    async attachAudioTrackToParticipant(socketId, participant) {
        if (!participant || !participant.peerConnection || !this.localStream) {
            return false;
        }

        const audioTracks = this.localStream.getAudioTracks();
        if (!audioTracks || audioTracks.length === 0) {
            return false;
        }

        const audioTrack = audioTracks[0];
        const peerConnection = participant.peerConnection;

        let sender = participant.audioSender || null;

        if (!sender && typeof peerConnection.getSenders === 'function') {
            sender = peerConnection
                .getSenders()
                .find((s) => s.track && s.track.kind === 'audio') || null;
        }

        if (sender) {
            if (sender.track === audioTrack) {
                participant.audioSender = sender;
                return false;
            }

            try {
                await sender.replaceTrack(audioTrack);
                participant.audioSender = sender;
                return true;
            } catch (err) {
                console.warn('⚠️ Не удалось заменить аудио-трек для участника', socketId, err);
                return false;
            }
        }

        try {
            const newSender = peerConnection.addTrack(audioTrack, this.localStream);
            participant.audioSender = newSender;
            return true;
        } catch (err) {
            console.error('❌ Не удалось добавить аудио-трек для участника', socketId, err);
        }

        return false;
    },

    async attachAudioTracksToAllParticipants() {
        if (!this.localStream) {
            return false;
        }

        const audioTracks = this.localStream.getAudioTracks();
        if (!audioTracks || audioTracks.length === 0) {
            return false;
        }

        const attachTasks = [];
        this.participants.forEach((participant, socketId) => {
            attachTasks.push(this.attachAudioTrackToParticipant(socketId, participant));
        });

        if (attachTasks.length === 0) {
            return false;
        }

        const results = await Promise.all(attachTasks);
        return results.some(Boolean);
    },

    async attachVideoTrackToParticipant(socketId, participant, videoTrack) {
        if (!participant || !participant.peerConnection) {
            return;
        }

        const { sender, transceiver } = this.ensureVideoSender(socketId, participant);

        if (!sender) {
            console.warn('⚠️ Не удалось получить sender для участника', socketId);
            return;
        }

        let senderParams = null;
        if (sender && typeof sender.getParameters === 'function') {
            try {
                senderParams = sender.getParameters();
            } catch (err) {
                console.warn('⚠️ Не удалось получить параметры sender для', socketId, err);
            }
        }

        const attachEncodings = senderParams?.encodings?.map((enc) => enc.active ?? null) ?? null;
        console.log('🎯 attachVideoTrackToParticipant', socketId,
            'hasSender', !!sender,
            'hasTransceiver', !!transceiver,
            'streamTracks', this.localStream?.getVideoTracks()?.length || 0,
            'enc', JSON.stringify(attachEncodings));

        if (transceiver) {
            try {
                if (typeof transceiver.setDirection === 'function') {
                    const maybePromise = transceiver.setDirection('sendrecv');
                    if (maybePromise instanceof Promise) {
                        await maybePromise;
                    }
                } else if (transceiver.direction !== 'sendrecv') {
                    transceiver.direction = 'sendrecv';
                }
            } catch (err) {
                console.warn('⚠️ Не удалось установить направление sendrecv для участника', socketId, err);
            }
        }

        if (sender && sender.setStreams) {
            try {
                sender.setStreams(this.localStream);
            } catch (err) {
                console.warn('⚠️ Не удалось привязать поток при включении видео для участника', socketId, err);
            }
        }

        if (transceiver && transceiver.sender && transceiver.sender !== sender && transceiver.sender.setStreams) {
            try {
                transceiver.sender.setStreams(this.localStream);
            } catch (err) {
                console.warn('⚠️ Не удалось привязать поток при включении видео (через transceiver) для участника', socketId, err);
            }
        }

        if (sender && senderParams && Array.isArray(senderParams.encodings) && senderParams.encodings.length > 0 && typeof sender.setParameters === 'function') {
            const nextParams = {
                ...senderParams,
                encodings: senderParams.encodings.map((enc) => ({ ...enc, active: true })),
            };
            try {
                await sender.setParameters(nextParams);
            } catch (err) {
                console.warn('⚠️ Не удалось обновить параметры sender для участника', socketId, err);
            }
        }

        if (sender) {
            try {
                await sender.replaceTrack(videoTrack);
                if (typeof sender.getParameters === 'function') {
                    const updatedParams = sender.getParameters();
                    const updatedEncodings = updatedParams?.encodings?.map((enc) => enc.active ?? null) ?? null;
                    console.log('✅ attachVideoTrackToParticipant replaceTrack success', socketId, 'enc', JSON.stringify(updatedEncodings));
                } else {
                    console.log('✅ attachVideoTrackToParticipant replaceTrack success', socketId);
                }
            } catch (err) {
                console.error('Ошибка замены видео-трека для участника', socketId, err);
            }
        }

        participant.videoSender = sender;
        participant.videoTransceiver = transceiver || null;
        this.updateParticipantVideoState(socketId);
    },

    async detachVideoTrackFromParticipant(socketId, participant) {
        if (!participant || !participant.peerConnection) {
            return;
        }

        const { sender, transceiver } = this.ensureVideoSender(socketId, participant);

        if (!sender) {
            console.warn('⚠️ Не удалось получить sender при отключении видео для участника', socketId);
            return;
        }

        let senderParams = null;
        if (sender && typeof sender.getParameters === 'function') {
            try {
                senderParams = sender.getParameters();
            } catch (err) {
                console.warn('⚠️ Не удалось получить параметры sender при отключении видео для', socketId, err);
            }
        }

        const detachEncodings = senderParams?.encodings?.map((enc) => enc.active ?? null) ?? null;
        console.log('🎯 detachVideoTrackFromParticipant', socketId,
            'hasSender', !!sender,
            'hasTransceiver', !!participant.videoTransceiver,
            'enc', JSON.stringify(detachEncodings));

        if (sender && sender.setStreams) {
            try {
                sender.setStreams();
            } catch (err) {
                console.warn('⚠️ Не удалось очистить поток при отключении видео для участника', socketId, err);
            }
        }

        if (sender && senderParams && Array.isArray(senderParams.encodings) && senderParams.encodings.length > 0 && typeof sender.setParameters === 'function') {
            const nextParams = {
                ...senderParams,
                encodings: senderParams.encodings.map((enc) => ({ ...enc, active: false })),
            };
            try {
                await sender.setParameters(nextParams);
            } catch (err) {
                console.warn('⚠️ Не удалось обновить параметры sender при отключении видео для участника', socketId, err);
            }
        }

        if (sender) {
            try {
                await sender.replaceTrack(null);
                if (typeof sender.getParameters === 'function') {
                    const updatedParams = sender.getParameters();
                    const updatedEncodings = updatedParams?.encodings?.map((enc) => enc.active ?? null) ?? null;
                    console.log('✅ detachVideoTrackFromParticipant replaceTrack success', socketId, 'enc', JSON.stringify(updatedEncodings));
                } else {
                    console.log('✅ detachVideoTrackFromParticipant replaceTrack success', socketId);
                }
            } catch (err) {
                console.warn('⚠️ Не удалось удалить видео-трек у участника', socketId, err);
            }
        }

        if (transceiver) {
            if (transceiver.sender && transceiver.sender !== sender && transceiver.sender.setStreams) {
                try {
                    transceiver.sender.setStreams();
                } catch (err) {
                    console.warn('⚠️ Не удалось очистить поток при отключении видео (через transceiver) для участника', socketId, err);
                }
            }

            try {
                if (typeof transceiver.setDirection === 'function') {
                    const maybePromise = transceiver.setDirection('recvonly');
                    if (maybePromise instanceof Promise) {
                        await maybePromise;
                    }
                } else if (transceiver.direction !== 'recvonly') {
                    transceiver.direction = 'recvonly';
                }
            } catch (err) {
                console.warn('⚠️ Не удалось остановить трансивер при отключении видео для участника', socketId, err);
            }
            participant.videoTransceiver = transceiver;
        }

        participant.videoSender = sender;
        this.updateParticipantVideoState(socketId);
    },

    ensureVideoSender(socketId, participant) {
        if (!participant || !participant.peerConnection) {
            return { sender: null, transceiver: null };
        }

        let sender = participant.videoSender || null;
        let transceiver = participant.videoTransceiver || null;

        if (!sender && typeof participant.peerConnection.getSenders === 'function') {
            sender = participant.peerConnection.getSenders().find((s) => s.track && s.track.kind === 'video') || null;
        }

        if (!transceiver && typeof participant.peerConnection.getTransceivers === 'function') {
            transceiver = participant.peerConnection.getTransceivers().find((t) => t.sender === sender) || null;
        }

        if (!sender && typeof participant.peerConnection.addTransceiver === 'function') {
            transceiver = participant.peerConnection.addTransceiver('video', { direction: 'sendrecv' });
            sender = transceiver.sender;
        } else if (!sender) {
            sender = participant.peerConnection.addTrack(this.videoTrack, this.localStream);
            if (typeof participant.peerConnection.getTransceivers === 'function') {
                transceiver = participant.peerConnection.getTransceivers().find((t) => t.sender === sender) || null;
            }
        }

        if (sender) {
            participant.videoSender = sender;
        }
        if (transceiver) {
            participant.videoTransceiver = transceiver;
        }

        return { sender: participant.videoSender || null, transceiver: participant.videoTransceiver || null };
    },

    async renegotiateAllPeers(reason = 'manual', options = {}) {
        if (!this.socket) {
            return;
        }

        const tasks = [];
        this.participants.forEach((participant, socketId) => {
            tasks.push(
                this.renegotiateWithPeer(socketId, participant, reason, {
                    forceInitiator: !!options.forceLocalInitiator,
                })
            );
        });

        if (tasks.length > 0) {
            await Promise.allSettled(tasks);
        }
    },

    async renegotiateWithPeer(socketId, participant, reason = 'manual', { forceInitiator = false } = {}) {
        const participantRecord = participant || this.participants.get(socketId);
        if (!participantRecord || !participantRecord.peerConnection) {
            return;
        }

        const baseId = this.selfId || this.socket?.id || null;
        const isInitiator = forceInitiator
            ? true
            : (participantRecord.isInitiator ??
                (baseId ? this.isInitiator(baseId, socketId) : false));

        if (!isInitiator) {
            if (this.socket && !forceInitiator) {
                this.socket.emit('webrtc-signal', {
                    targetSocketId: socketId,
                    type: 'renegotiate-request',
                    reason
                });
            }
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

            this.syncLocalMediaStatus();
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
        
        const selfMedia = this.getLocalMediaState();
        const selfItem = document.createElement('div');
        selfItem.className = 'participant-item self';
        selfItem.innerHTML = `
            <div class="participant-name">Вы</div>
            <div class="participant-status">
                <span class="status-pill success">Подключено</span>
                <span class="status-pill ${selfMedia.mic ? 'success' : 'muted'}">${selfMedia.mic ? '🎙️ Микрофон включен' : '🔇 Микрофон выключен'}</span>
                <span class="status-pill ${selfMedia.cam ? 'success' : 'muted'}">${selfMedia.cam ? '📹 Камера включена' : '🚫 Камера выключена'}</span>
            </div>
        `;
        list.appendChild(selfItem);
        
        const remoteIds = new Set();

        const selfId = this.selfId || this.socket?.id;

        this.presence.forEach((_, socketId) => {
            if (socketId && socketId !== selfId) {
                remoteIds.add(socketId);
            }
        });

        this.participants.forEach((_, socketId) => {
            if (socketId && socketId !== selfId) {
                remoteIds.add(socketId);
            }
        });

        const orderedIds = Array.from(remoteIds);
        orderedIds.sort((a, b) => {
            const aPresence = this.presence.get(a);
            const bPresence = this.presence.get(b);
            if (aPresence && bPresence) {
                return (aPresence.connectedAt || 0) - (bPresence.connectedAt || 0);
            }
            return a.localeCompare(b);
        });

        orderedIds.forEach((socketId) => {
            const participant = this.participants.get(socketId);
            const presenceRecord = this.presence.get(socketId);
            const media = presenceRecord?.media || { cam: false, mic: false };

            const connState = participant?.peerConnection ? participant.peerConnection.connectionState : 'new';
            const iceState = participant?.peerConnection ? participant.peerConnection.iceConnectionState : 'new';

            let status = 'Ожидание соединения';
            let statusClass = 'warning';
            if (connState === 'connected' || iceState === 'connected' || iceState === 'completed') {
                status = 'Подключено';
                statusClass = 'success';
            } else if (connState === 'failed' || iceState === 'failed') {
                status = 'Ошибка';
                statusClass = 'muted';
            } else if (connState === 'disconnected') {
                status = 'Отключено';
                statusClass = 'muted';
            }

            const expectsVideo = !!media.cam;
            const actualVideo = !!participant?.videoEnabled;
            let videoClass;
            let videoText;
            if (expectsVideo && actualVideo) {
                videoClass = 'success';
                videoText = '📹 Камера включена';
            } else if (expectsVideo && !actualVideo) {
                videoClass = 'warning';
                videoText = '⏳ Камера включена (ожидание видео)';
            } else if (!expectsVideo && actualVideo) {
                videoClass = 'warning';
                videoText = '⚠️ Видео получено (статус выкл.)';
            } else {
                videoClass = 'muted';
                videoText = '🚫 Камера выключена';
            }

            const micClass = media.mic ? 'success' : 'muted';
            const micText = media.mic ? '🎙️ Микрофон включен' : '🔇 Микрофон выключен';

            const item = document.createElement('div');
            item.className = 'participant-item';
            item.innerHTML = `
                <div class="participant-name">Участник ${socketId.substring(0, 8)}</div>
                <div class="participant-status">
                    <span class="status-pill ${statusClass}">${status}</span>
                    <span class="status-pill ${micClass}">${micText}</span>
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
        
        const selfId = this.selfId || this.socket?.id || null;
        let remotePresenceCount = 0;
        if (this.presence && this.presence.size > 0) {
            this.presence.forEach((_, id) => {
                if (!selfId || id !== selfId) {
                    remotePresenceCount += 1;
                }
            });
        } else {
            remotePresenceCount = Array.from(this.participants.keys()).filter((id) => !selfId || id !== selfId).length;
        }

        const totalCount = (this.socket && this.socket.connected ? 1 : 0) + remotePresenceCount;

        console.log('📊 [updateConferenceStatus] Обновление статуса:', {
            presenceSize: this.presence?.size || 0,
            participantsSize: this.participants.size,
            totalCount,
            presenceIds: this.presence ? Array.from(this.presence.keys()) : [],
            participantIds: Array.from(this.participants.keys())
        });
        statusEl.textContent = `Участников в конференции: ${totalCount}`;
    },
    
    disconnect() {
        this.connectionInProgress = false;
        // Закрываем все соединения с участниками
        this.participants.forEach((participant, socketId) => {
            this.disconnectFromPeer(socketId);
        });

        this.participants = new Map();
        this.presence = new Map();
        this.lastSentMediaStatus = { cam: false, mic: false };
        this.selfId = null;
        
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
        
        this.resetPresenceState();
        this.showScreen('connectScreen');
        this.elements.btnConnect.disabled = false;
        this.hangupAllInProgress = false;
        this.updateHangupAllButton();
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
                .some(track => track.readyState === 'live' && track.enabled && !track.muted);
            participant.videoEnabled = hasVideo;
        } else {
            participant.videoEnabled = false;
        }

        if (participant.tileElement) {
            participant.tileElement.classList.toggle('video-off', !participant.videoEnabled);
        }

        if (participant.labelElement) {
            const presenceRecord = this.presence.get(socketId);
            const expectedCam = !!presenceRecord?.media?.cam;
            const baseLabel = `Участник ${socketId.substring(0, 8)}`;
            let labelText = baseLabel;

            if (expectedCam && participant.videoEnabled) {
                labelText = baseLabel;
            } else if (expectedCam && !participant.videoEnabled) {
                labelText = `${baseLabel} (ожидание видео)`;
            } else if (!expectedCam && participant.videoEnabled) {
                labelText = `${baseLabel} (статус: выкл.)`;
            } else {
                labelText = `${baseLabel} (камера выкл.)`;
            }

            participant.labelElement.textContent = labelText;
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
            this.forcePlayMediaElement(localVideo, 'local-preview', { keepMuted: true });
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
