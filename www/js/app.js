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
    cookieKeys: {
        userId: 'conference_user_id',
        termsAccepted: 'conference_terms_accepted',
        userName: 'conference_user_name'
    },
    subscriber: {
        id: null,
        name: '',
        registered: false
    },
    subscribers: [],
    cookieConsentAccepted: false,
    subscriptionInProgress: false,
    socketHandlers: {},
    serviceWorkerRegistration: null,
    serviceWorkerReadyPromise: null,
    serviceWorkerMessageHandler: null,
    connectionInProgress: false,
    callWatcherTimer: null,
    callWatcherIntervalMs: 4000,
    lastProcessedCallIds: new Set(),
    callRegistry: new Map(), // callId -> { call, status, direction, updatedAt }
    latestCallBySubscriber: new Map(), // subscriberId -> callId
    callStatusTtlMs: 2 * 60 * 1000,
    
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
        this.initCookieState();
        this.resetPresenceState();

        if (!this.elements.btnConnect) {
            console.error('❌ Кнопка подключения не найдена!');
            return;
        }
        
        this.setupEventListeners();
        this.fetchSubscribers();
        this.registerServiceWorker();
        this.ensureCallWatcherState();
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
            subscriptionMessage: document.getElementById('subscriptionMessage'),
            subscriberList: document.getElementById('subscriberList'),
            inputSubscriberName: document.getElementById('inputSubscriberName'),
            btnSubscribe: document.getElementById('btnSubscribe'),
            conferenceStatus: document.getElementById('conferenceStatus'),
            videoGrid: document.getElementById('videoGrid'),
            localVideo: document.getElementById('localVideo'),
            localVideoTile: document.querySelector('#videoGrid .video-tile.self'),
            localVideoLabel: document.querySelector('#videoGrid .video-tile.self .video-label'),
            btnVideo: document.getElementById('btnVideo') // Добавляем кнопку видео
        };
    },

    initCookieState() {
        this.cookieConsentAccepted = this.ensureCookieConsent();
        this.subscriber.id = this.ensurePersistentUserId();
        this.subscriber.name = this.loadStoredUserName();
        this.subscriber.registered = Boolean(this.subscriber.name);
        this.updateSubscriptionUI();
        this.ensureCallWatcherState();
    },

    ensureCookieConsent() {
        const accepted = this.getCookie(this.cookieKeys.termsAccepted);
        if (accepted === '1') {
            return true;
        }
        this.setCookie(this.cookieKeys.termsAccepted, '1', 365 * 10);
        return true;
    },

    ensurePersistentUserId() {
        let userId = this.getCookie(this.cookieKeys.userId);
        if (userId && typeof userId === 'string' && userId.length > 0) {
            return userId;
        }
        userId = this.generateUserId();
        this.setCookie(this.cookieKeys.userId, userId, 365 * 10);
        return userId;
    },

    generateUserId() {
        if (window.crypto && window.crypto.randomUUID) {
            return window.crypto.randomUUID();
        }
        const randomPart = Math.random().toString(36).slice(2, 10);
        return `user_${Date.now()}_${randomPart}`;
    },

    setCookie(name, value, days = 365) {
        if (!name) {
            return;
        }
        const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
        document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
    },

    getCookie(name) {
        if (!name) {
            return null;
        }
        const encodedName = `${encodeURIComponent(name)}=`;
        const cookies = document.cookie ? document.cookie.split('; ') : [];
        for (const cookie of cookies) {
            if (cookie.startsWith(encodedName)) {
                return decodeURIComponent(cookie.substring(encodedName.length));
            }
        }
        return null;
    },

    loadStoredUserName() {
        try {
            const stored = localStorage.getItem(this.cookieKeys.userName);
            if (stored) {
                return stored;
            }
        } catch (err) {
            console.warn('⚠️ Не удалось прочитать имя из localStorage', err);
        }
        return '';
    },

    storeUserName(name) {
        if (typeof name !== 'string') {
            return;
        }
        try {
            localStorage.setItem(this.cookieKeys.userName, name);
        } catch (err) {
            console.warn('⚠️ Не удалось сохранить имя в localStorage', err);
        }
    },

    buildApiUrl(pathname) {
        if (!pathname) {
            return this.SERVER_URL;
        }
        try {
            const url = new URL(pathname, this.SERVER_URL);
            return url.toString();
        } catch (error) {
            console.warn('⚠️ Не удалось сформировать URL API, возвращаем исходный путь', pathname, error);
            return pathname;
        }
    },

    sortSubscriberList(list = []) {
        return [...list].sort((a, b) => {
            const nameA = (a?.name || '').toLocaleLowerCase();
            const nameB = (b?.name || '').toLocaleLowerCase();
            if (nameA === nameB) {
                return (a?.createdAt || 0) - (b?.createdAt || 0);
            }
            return nameA.localeCompare(nameB, 'ru');
        });
    },

    setSubscribers(subscribers = [], options = {}) {
        const { ensureSelf = true, silent = false } = options;
        const normalized = Array.isArray(subscribers)
            ? subscribers.filter((item) => item && typeof item.id === 'string' && item.id.length > 0)
            : [];

        let prepared = normalized;

        if (ensureSelf && this.subscriber.registered) {
            const hasSelf = normalized.some((item) => item.id === this.subscriber.id);
            if (!hasSelf) {
                prepared = [
                    ...normalized,
                    {
                        id: this.subscriber.id,
                        name: this.subscriber.name,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        localEcho: true,
                    },
                ];
            }
        } else {
            prepared = [...normalized];
        }

        this.subscribers = this.sortSubscriberList(prepared);

        if (!silent) {
            this.renderSubscriberList();
        }
    },

    findSubscriberById(subscriberId) {
        if (!subscriberId) {
            return null;
        }
        return (this.subscribers || []).find((item) => item.id === subscriberId) || null;
    },

    upsertSubscriberLocal(subscriber, options = {}) {
        if (!subscriber || typeof subscriber.id !== 'string') {
            return;
        }
        const list = Array.isArray(this.subscribers) ? [...this.subscribers] : [];
        const index = list.findIndex((item) => item.id === subscriber.id);
        if (index >= 0) {
            list[index] = { ...list[index], ...subscriber };
        } else {
            list.push({ ...subscriber });
        }
        this.setSubscribers(list, options);
    },

    async fetchSubscribers() {
        try {
            const response = await fetch(this.buildApiUrl('/api/subscribers'), {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                },
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            if (data?.success && Array.isArray(data.subscribers)) {
                this.setSubscribers(data.subscribers);
            }
        } catch (error) {
            console.warn('⚠️ Не удалось загрузить список подписчиков', error);
        }
    },

    handleSubscribersUpdate(payload) {
        if (!payload) {
            return;
        }
        const { subscribers } = payload;
        if (Array.isArray(subscribers)) {
            this.setSubscribers(subscribers);
        }
    },

    ensureCallWatcherState() {
        if (this.subscriber?.registered) {
            this.startCallWatcher();
        } else {
            this.stopCallWatcher();
        }
    },

    startCallWatcher() {
        if (this.callWatcherTimer) {
            return;
        }
        if (!(this.lastProcessedCallIds instanceof Set)) {
            this.lastProcessedCallIds = new Set();
        }
        const interval = Math.max(2000, this.callWatcherIntervalMs || 4000);
        this.checkPendingCalls();
        this.callWatcherTimer = setInterval(() => {
            this.checkPendingCalls();
        }, interval);
    },

    stopCallWatcher() {
        if (this.callWatcherTimer) {
            clearInterval(this.callWatcherTimer);
            this.callWatcherTimer = null;
        }
    },

    async checkPendingCalls() {
        if (!this.subscriber?.registered || !this.subscriber?.id) {
            return;
        }
        try {
            const response = await fetch(
                this.buildApiUrl(`/api/calls/pending/${encodeURIComponent(this.subscriber.id)}`),
                {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json',
                    },
                }
            );
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            if (data?.success && Array.isArray(data.calls)) {
                for (const call of data.calls) {
                    if (!call?.id) {
                        continue;
                    }
                    if (this.lastProcessedCallIds.has(call.id)) {
                        continue;
                    }
                    this.lastProcessedCallIds.add(call.id);
                    if (this.lastProcessedCallIds.size > 200) {
                        const recent = Array.from(this.lastProcessedCallIds).slice(-100);
                        this.lastProcessedCallIds = new Set(recent);
                    }
                    await this.processIncomingCall(call);
                }
            }
        } catch (error) {
            console.warn('⚠️ Не удалось проверить входящие звонки', error);
        }
    },

    async processIncomingCall(call) {
        if (!call) {
            return;
        }
        this.registerCallState(call, 'incoming');
        this.notifyIncomingCall(call);
        try {
            const acknowledgement = await this.acknowledgeCall(call.id, 'accepted');
            if (acknowledgement?.success && acknowledgement.call) {
                this.registerCallState(acknowledgement.call, 'incoming');
            }
        } catch (error) {
            console.warn('⚠️ Не удалось подтвердить звонок', error);
        }

        if (this.socket && this.socket.connected) {
            this.setConnectStatusMessage('Входящий звонок. Вы уже подключены к конференции.', 'info');
            return;
        }

        this.setConnectStatusMessage('Вас пригласили в конференцию. Подготавливаем подключение…', 'info');
        setTimeout(() => {
            this.handleJoinConference();
        }, 500);
    },

    cleanupCallRegistry() {
        if (!(this.callRegistry instanceof Map)) {
            this.callRegistry = new Map();
        }
        if (!(this.latestCallBySubscriber instanceof Map)) {
            this.latestCallBySubscriber = new Map();
        }
        const now = Date.now();
        for (const [callId, info] of this.callRegistry.entries()) {
            if (!info || now - (info.updatedAt || 0) > this.callStatusTtlMs) {
                this.callRegistry.delete(callId);
            }
        }
        for (const [subscriberId, callId] of this.latestCallBySubscriber.entries()) {
            if (!this.callRegistry.has(callId)) {
                this.latestCallBySubscriber.delete(subscriberId);
            }
        }
    },

    registerCallState(call, direction = 'outgoing', statusOverride) {
        if (!call || !call.id) {
            return;
        }
        if (!(this.callRegistry instanceof Map)) {
            this.callRegistry = new Map();
        }
        if (!(this.latestCallBySubscriber instanceof Map)) {
            this.latestCallBySubscriber = new Map();
        }
        const status = statusOverride || call.status || 'pending';
        const record = {
            call,
            status,
            direction,
            updatedAt: Date.now(),
        };
        this.callRegistry.set(call.id, record);

        const targetId =
            direction === 'outgoing'
                ? call?.to?.id
                : direction === 'incoming'
                ? call?.from?.id
                : null;

        if (targetId) {
            this.latestCallBySubscriber.set(targetId, call.id);
        }

        this.cleanupCallRegistry();
        this.renderSubscriberList();
    },

    getCallStatusForSubscriber(subscriberId) {
        if (!subscriberId) {
            return null;
        }
        this.cleanupCallRegistry();
        const callId = this.latestCallBySubscriber.get(subscriberId);
        if (!callId) {
            return null;
        }
        const record = this.callRegistry.get(callId);
        if (!record) {
            this.latestCallBySubscriber.delete(subscriberId);
            return null;
        }
        return record;
    },

    translateCallStatus(status) {
        const normalized = (status || '').toLowerCase();
        switch (normalized) {
            case 'pending':
                return 'Ожидает ответа';
            case 'acknowledged':
                return 'Уведомление доставлено';
            case 'accepted':
                return 'Принято';
            case 'declined':
                return 'Отклонено';
            case 'ignored':
                return 'Нет ответа';
            default:
                return status || 'Неизвестно';
        }
    },

    async acknowledgeCall(callId, status = 'acknowledged') {
        if (!callId) {
            return;
        }
        try {
            const response = await fetch(this.buildApiUrl(`/api/calls/${encodeURIComponent(callId)}/ack`), {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ status }),
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            if (data?.success && data.call) {
                const direction =
                    data.call?.from?.id === this.subscriber.id
                        ? 'outgoing'
                        : data.call?.to?.id === this.subscriber.id
                        ? 'incoming'
                        : 'outgoing';
                this.registerCallState(data.call, direction);
            }
            return data;
        } catch (error) {
            console.warn('⚠️ Ошибка при подтверждении звонка', error);
            return null;
        }
    },

    registerServiceWorker() {
        if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
            console.warn('⚠️ Service Worker не поддерживается в этом браузере');
            return Promise.resolve(null);
        }

        if (this.serviceWorkerReadyPromise) {
            return this.serviceWorkerReadyPromise;
        }

        if (!this.serviceWorkerMessageHandler) {
            this.serviceWorkerMessageHandler = (event) => this.handleServiceWorkerMessage(event);
            navigator.serviceWorker.addEventListener('message', this.serviceWorkerMessageHandler);
        }

        this.serviceWorkerReadyPromise = navigator.serviceWorker
            .register('/service-worker.js')
            .then((registration) => {
                this.serviceWorkerRegistration = registration;
                console.log('✅ Service worker зарегистрирован:', registration.scope);
                this.syncServiceWorkerProfile();
                return registration;
            })
            .catch((error) => {
                console.warn('⚠️ Не удалось зарегистрировать service worker', error);
                return null;
            });

        return this.serviceWorkerReadyPromise;
    },

    async getServiceWorkerRegistration() {
        if (this.serviceWorkerRegistration) {
            return this.serviceWorkerRegistration;
        }

        if (this.serviceWorkerReadyPromise) {
            try {
                this.serviceWorkerRegistration = await this.serviceWorkerReadyPromise;
                return this.serviceWorkerRegistration;
            } catch (error) {
                console.warn('⚠️ Ожидание service worker не удалось', error);
                return null;
            }
        }

        if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
            return null;
        }

        try {
            this.serviceWorkerRegistration = await navigator.serviceWorker.ready;
        } catch (error) {
            console.warn('⚠️ Service worker не готов', error);
            this.serviceWorkerRegistration = null;
        }
        return this.serviceWorkerRegistration;
    },

    async syncServiceWorkerProfile() {
        if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
            return;
        }

        const registration = await this.getServiceWorkerRegistration();
        const activeWorker = registration?.active || registration?.waiting || registration?.installing;
        if (!activeWorker) {
            return;
        }

        activeWorker.postMessage({
            type: 'subscriber-profile',
            payload: {
                id: this.subscriber.id,
                name: this.subscriber.name,
                registered: this.subscriber.registered,
                consent: this.cookieConsentAccepted,
            },
        });
    },

    handleServiceWorkerMessage(event) {
        const data = event?.data;
        console.log('📬 Сообщение от service worker:', data);
    },

    handleCallInitiated(call) {
        if (!call || !call.id) {
            return;
        }
        if (call.from?.id === this.subscriber.id) {
            this.registerCallState(call, 'outgoing');
        }
        if (call.to?.id === this.subscriber.id) {
            this.registerCallState(call, 'incoming');
            this.notifyIncomingCall(call);
        }
    },

    handleCallAcknowledged(payload) {
        if (!payload) {
            return;
        }
        const call = payload.call || null;
        const callId = payload.callId || call?.id;
        const status = payload.status || call?.status;
        if (!callId) {
            return;
        }

        let direction = 'outgoing';
        let resolvedCall = call;

        if (!resolvedCall && this.callRegistry instanceof Map && this.callRegistry.has(callId)) {
            const entry = this.callRegistry.get(callId);
            resolvedCall = entry?.call || null;
            direction = entry?.direction || direction;
        }

        if (resolvedCall) {
            if (resolvedCall.from?.id === this.subscriber.id) {
                direction = 'outgoing';
            } else if (resolvedCall.to?.id === this.subscriber.id) {
                direction = 'incoming';
            }
            const mergedCall = {
                ...resolvedCall,
                status: status || resolvedCall.status,
                updatedAt: Date.now(),
            };
            this.registerCallState(mergedCall, direction, status);
            if (direction === 'outgoing') {
                const statusLabel = this.translateCallStatus(mergedCall.status);
                this.setConnectStatusMessage(`Статус приглашения: ${statusLabel}`, mergedCall.status === 'accepted' ? 'success' : mergedCall.status === 'declined' ? 'error' : 'info');
            }
            if (direction === 'incoming' && mergedCall.status === 'accepted') {
                this.setConnectStatusMessage('Ваш звонок принят. Подключаемся…', 'success');
            }
            return;
        }

        if (this.callRegistry instanceof Map && this.callRegistry.has(callId)) {
            const entry = this.callRegistry.get(callId);
            entry.status = status || entry.status;
            entry.updatedAt = Date.now();
            this.callRegistry.set(callId, entry);
            this.cleanupCallRegistry();
            this.renderSubscriberList();
        }
    },

    async notifyIncomingCall(call) {
        const callerName = call?.from?.name || 'Неизвестный абонент';
        const message = `${callerName} приглашает вас в конференцию.`;
        this.setConnectStatusMessage(message, 'info');

        const notificationOptions = {
            body: message,
            tag: `incoming-call-${call?.id || Date.now()}`,
            data: {
                url: window.location.origin,
                call,
            },
        };

        await this.showLocalNotification('Входящий звонок', notificationOptions);

        const registration = await this.getServiceWorkerRegistration();
        const activeWorker = registration?.active;
        if (activeWorker) {
            activeWorker.postMessage({
                type: 'incoming-call',
                payload: call,
            });
        }
    },

    async ensureNotificationPermission() {
        if (typeof Notification === 'undefined') {
            return false;
        }
        if (Notification.permission === 'granted') {
            return true;
        }
        if (Notification.permission === 'denied') {
            return false;
        }
        try {
            const result = await Notification.requestPermission();
            return result === 'granted';
        } catch (error) {
            console.warn('⚠️ Не удалось запросить разрешение на уведомления', error);
            return false;
        }
    },

    async showLocalNotification(title, options = {}) {
        const permissionGranted = await this.ensureNotificationPermission();
        if (!permissionGranted) {
            console.warn('⚠️ Уведомления отключены пользователем');
            return;
        }

        const registration = await this.getServiceWorkerRegistration();
        if (!registration || typeof registration.showNotification !== 'function') {
            console.warn('⚠️ Service worker не готов к показу уведомлений');
            return;
        }

        try {
            await registration.showNotification(title, options);
        } catch (error) {
            console.warn('⚠️ Не удалось показать уведомление', error);
        }
    },

    updateSubscriptionUI() {
        const input = this.elements.inputSubscriberName;
        const subscribeButton = this.elements.btnSubscribe;
        if (input) {
            input.value = this.subscriber.name || '';
            input.disabled = this.subscriptionInProgress;
        }
        if (subscribeButton) {
            subscribeButton.disabled = this.subscriptionInProgress;
            subscribeButton.textContent = this.subscriber.registered ? 'Обновить имя' : 'Подписаться';
        }
        this.renderSubscriberList();
    },

    setSubscriptionMessage(message, level = 'info') {
        const container = this.elements.subscriptionMessage;
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
            container.dataset.level = level || '';
        } else {
            delete container.dataset.level;
        }
    },

    clearSubscriptionMessage() {
        this.setSubscriptionMessage('');
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

    renderSubscriberList() {
        const listEl = this.elements.subscriberList;
        if (!listEl) {
            return;
        }
        listEl.innerHTML = '';
        if (!Array.isArray(this.subscribers) || this.subscribers.length === 0) {
            const emptyState = document.createElement('li');
            emptyState.className = 'subscriber-list__empty';
            emptyState.textContent = 'Пока никто не подписался.';
            listEl.appendChild(emptyState);
            return;
        }

        this.subscribers.forEach((subscriber) => {
            const listItem = document.createElement('li');
            listItem.className = 'subscriber-list__item';
            listItem.dataset.subscriberId = subscriber.id;

            const nameContainer = document.createElement('span');
            nameContainer.className = 'subscriber-list__name';
            nameContainer.textContent = subscriber.name || 'Без имени';
            if (subscriber.id === this.subscriber.id) {
                nameContainer.classList.add('subscriber-list__name--self');
            }

            const actionsContainer = document.createElement('span');
            actionsContainer.className = 'subscriber-list__actions';

            const callButton = document.createElement('button');
            callButton.className = 'btn btn-small btn-call';
            callButton.type = 'button';
            callButton.textContent = 'Позвонить';
            callButton.setAttribute('data-action', 'call');
            callButton.setAttribute('data-subscriber-id', subscriber.id);

            const joinButton = document.createElement('button');
            joinButton.className = 'btn btn-small btn-join';
            joinButton.type = 'button';
            joinButton.textContent = 'В конференцию';
            joinButton.setAttribute('data-action', 'join');
            joinButton.setAttribute('data-subscriber-id', subscriber.id);

            actionsContainer.append(callButton, joinButton);

            const callStatusInfo = this.getCallStatusForSubscriber(subscriber.id);
            if (callStatusInfo) {
                const statusBadge = document.createElement('span');
                statusBadge.className = `subscriber-list__status subscriber-list__status--${callStatusInfo.status}`;
                const directionLabel = callStatusInfo.direction === 'incoming' ? 'Входящий' : 'Исходящий';
                statusBadge.textContent = `${directionLabel}: ${this.translateCallStatus(callStatusInfo.status)}`;
                statusBadge.dataset.direction = callStatusInfo.direction || 'outgoing';
                actionsContainer.appendChild(statusBadge);
            }

            listItem.append(nameContainer, actionsContainer);
            listEl.appendChild(listItem);
        });
    },

    async handleSubscribeAction() {
        if (this.subscriptionInProgress) {
            return;
        }
        const input = this.elements.inputSubscriberName;
        if (!input) {
            return;
        }
        const name = input.value.trim();
        if (!name) {
            this.setSubscriptionMessage('Введите имя, чтобы подписаться.', 'error');
            return;
        }

        this.subscriptionInProgress = true;
        this.updateSubscriptionUI();
        this.setSubscriptionMessage('Сохраняем данные…', 'info');

        try {
            const result = await this.registerSubscriber(name);
            if (result && result.success) {
                this.subscriber.name = name;
                this.subscriber.registered = true;
                this.storeUserName(name);
                this.syncServiceWorkerProfile();
                this.setSubscriptionMessage('Имя сохранено. Теперь вам могут звонить по ссылке.', 'success');
            } else {
                this.setSubscriptionMessage('Не удалось сохранить имя. Попробуйте позже.', 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка подписки:', error);
            this.setSubscriptionMessage('Произошла ошибка при подписке.', 'error');
        } finally {
            this.subscriptionInProgress = false;
            this.updateSubscriptionUI();
        }
    },

    handleSubscriberAction(subscriberId, action) {
        if (!subscriberId || !action) {
            return;
        }
        if (action === 'join') {
            this.handleJoinConference();
            return;
        }
        if (action === 'call') {
            if (!this.subscriber.registered) {
                this.setSubscriptionMessage('Сначала зарегистрируйте своё имя, чтобы звонить другим.', 'info');
                return;
            }
            if (subscriberId === this.subscriber.id) {
                this.setSubscriptionMessage('Нельзя звонить самому себе.', 'error');
                return;
            }
            this.initiateCallToSubscriber(subscriberId);
        }
    },

    handleJoinConference() {
        this.clearConnectStatusMessage();
        this.ensureAudioContextUnlocked('subscriber-join');
        this.connect();
    },

    async initiateCallToSubscriber(subscriberId) {
        console.log('📞 Запрос звонка для подписчика', subscriberId);
        try {
            const result = await this.triggerCallNotification(subscriberId);
            if (result?.success) {
                setTimeout(() => {
                    this.handleJoinConference();
                }, 300);
            }
        } catch (error) {
            console.warn('⚠️ Не удалось инициировать звонок', error);
        }
    },

    async registerSubscriber(name) {
        const payload = {
            id: this.subscriber.id,
            name,
        };

        const response = await fetch(this.buildApiUrl('/api/subscribers'), {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            try {
                const data = await response.json();
                if (data && data.error) {
                    errorMessage = data.error;
                }
            } catch {
                // ignore
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        if (data?.success) {
            if (data.subscriber) {
                this.subscriber.name = data.subscriber.name;
                this.subscriber.registered = true;
            }
            if (Array.isArray(data.subscribers)) {
                this.setSubscribers(data.subscribers);
            } else if (data.subscriber) {
                this.upsertSubscriberLocal(data.subscriber);
            }
            this.ensureCallWatcherState();
        }
        return data;
    },

    async triggerCallNotification(subscriberId) {
        const target = this.findSubscriberById(subscriberId);
        const targetName = target?.name || 'участника';
        this.setConnectStatusMessage(`Отправляем приглашение для ${targetName}...`, 'info');

        try {
            const response = await fetch(this.buildApiUrl('/api/calls'), {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    fromId: this.subscriber.id,
                    fromName: this.subscriber.name,
                    toId: subscriberId,
                }),
            });

            if (!response.ok) {
                let errorMessage = `HTTP ${response.status}`;
                try {
                    const errorPayload = await response.json();
                    if (errorPayload?.error) {
                        errorMessage = errorPayload.error;
                    }
                } catch {
                    // ignore parse error
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            if (data?.success) {
                const resolvedTargetName =
                    data.call?.to?.name || targetName || 'участника';
                if (data.call) {
                    this.registerCallState(data.call, 'outgoing');
                }
                this.setConnectStatusMessage(
                    `Отправили приглашение для ${resolvedTargetName}.`,
                    'success'
                );
                return data;
            }

            this.setConnectStatusMessage('Не удалось инициировать звонок.', 'error');
            return data;
        } catch (error) {
            console.error('❌ Ошибка инициирования звонка:', error);
            this.setConnectStatusMessage('Ошибка отправки приглашения. Попробуйте позже.', 'error');
            throw error;
        }
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
        if (this.elements.btnSubscribe) {
            this.elements.btnSubscribe.addEventListener('click', (event) => {
                event.preventDefault();
                this.handleSubscribeAction();
            });
        }
        if (this.elements.inputSubscriberName) {
            this.elements.inputSubscriberName.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    this.handleSubscribeAction();
                }
            });
        }
        if (this.elements.subscriberList) {
            this.elements.subscriberList.addEventListener('click', (event) => {
                const actionButton = event.target.closest('[data-action]');
                if (!actionButton) {
                    return;
                }
                const subscriberId = actionButton.getAttribute('data-subscriber-id');
                const action = actionButton.getAttribute('data-action');
                this.handleSubscriberAction(subscriberId, action);
            });
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

                this.selfId = this.socket.id;
                this.hangupAllInProgress = false;

                this.ensurePresenceRecord(this.socket.id, {
                    media: this.getLocalMediaState(),
                    connectedAt: Date.now()
                });

                if (document.getElementById('connectScreen').classList.contains('active')) {
                    this.showScreen('conferenceScreen');
                }

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
        this.socket.on('subscribers:update', (data) => this.handleSubscribersUpdate(data));
        this.socket.on('call:initiated', (data) => this.handleCallInitiated(data));
        this.socket.on('call:ack', (data) => this.handleCallAcknowledged(data));

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
