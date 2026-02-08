// Простая конференция без регистрации
const App = {
    socket: null,
    localStream: null,
    participants: new Map(), // socketId -> { peerConnection, mediaElement, tileElement, pendingCandidates }
    presence: new Map(), // socketId -> { id, media: { cam, mic }, connectedAt }
    subscriberPresence: new Map(), // subscriberId -> { online: boolean } — для онлайн/оффлайн в контактах
    presenceWorker: null,
    lastSentMediaStatus: { cam: false, mic: false },
    selfId: null,
    pendingPlaybackElements: new Map(),
    playbackUnlockHandlerInstalled: false,
    playbackUnlockHandler: null,
    audioContext: null,
    connectionInProgress: false,
    callRingtoneInterval: null,
    callRingtoneOscillator: null,
    callRingtoneGain: null,
    callRingtoneContext: null,

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
        this.isPublicRoomGuest = false;
        this.setupEventListeners();

        const roomFromUrl = this.getRoomIdFromUrl();
        const hasToken = !!this.getStoredDisplayName();
        if (roomFromUrl && !hasToken) {
            this.showPublicRoomJoin(roomFromUrl);
            return;
        }
        if (!hasToken) {
            this.showLanding();
            return;
        }
        this.displayName = this.getStoredDisplayName();
        try { this.myAvatarUrl = localStorage.getItem('conference:avatarUrl') || null; } catch(e){}
        if (this.elements.inputDisplayName) this.elements.inputDisplayName.value = this.displayName;
        this.showMainApp();
        this.setupMainApp();
        console.log('✅ App инициализирован');
    },

    getStoredDisplayName() {
        try {
            const token = localStorage.getItem('conference:token');
            if (!token) return '';
            return localStorage.getItem('conference:displayName') || '';
        } catch (e) { return ''; }
    },

    showLanding() {
        this.showScreen('landingScreen');
        this.setupAuthForms();
        this.preFillLoginField();
    },

    showPublicRoomJoin(roomId) {
        this.showScreen('publicRoomJoinScreen');
        this.currentRoomId = roomId;
        if (this.elements.inputPublicDisplayName) this.elements.inputPublicDisplayName.value = '';
        if (this.elements.publicRoomJoinError) this.elements.publicRoomJoinError.textContent = '';
        this.setupPublicRoomJoin();
    },

    setupPublicRoomJoin() {
        const inputName = this.elements.inputPublicDisplayName;
        const btnJoin = this.elements.btnPublicRoomJoin;
        const errEl = this.elements.publicRoomJoinError;
        const updateBtn = () => {
            if (btnJoin) btnJoin.disabled = !(inputName?.value?.trim());
        };
        if (inputName) {
            inputName.addEventListener('input', updateBtn);
            inputName.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.handlePublicRoomJoin(); });
        }
        if (btnJoin) {
            btnJoin.addEventListener('click', () => this.handlePublicRoomJoin());
            updateBtn();
        }
    },

    handlePublicRoomJoin() {
        const name = (this.elements.inputPublicDisplayName?.value || '').trim();
        if (!name) {
            if (this.elements.publicRoomJoinError) this.elements.publicRoomJoinError.textContent = 'Введите имя';
            return;
        }
        this.isPublicRoomGuest = true;
        this.displayName = name;
        if (this.elements.inputRoomId) this.elements.inputRoomId.value = this.currentRoomId;
        if (this.elements.inputDisplayName) this.elements.inputDisplayName.value = name;
        if (this.elements.publicRoomJoinError) this.elements.publicRoomJoinError.textContent = '';
        if (this.elements.btnPublicRoomJoin) this.elements.btnPublicRoomJoin.disabled = true;
        this.ensureAudioContextUnlocked('public-room-join');
        this.connect();
    },

    preFillLoginField() {
        try {
            const savedLogin = localStorage.getItem('conference:login');
            const input = document.getElementById('inputLogin');
            if (input && savedLogin) input.value = savedLogin;
        } catch (e) {}
    },

    setupAuthForms() {
        const tabLogin = document.getElementById('authTabLogin');
        const tabRegister = document.getElementById('authTabRegister');
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');

        if (tabLogin) tabLogin.onclick = () => {
            tabLogin.classList.add('active'); tabRegister?.classList.remove('active');
            if (loginForm) loginForm.style.display = 'flex';
            if (registerForm) registerForm.style.display = 'none';
            this.preFillLoginField();
        };
        if (tabRegister) tabRegister.onclick = () => {
            tabRegister.classList.add('active'); tabLogin?.classList.remove('active');
            if (registerForm) registerForm.style.display = 'flex';
            if (loginForm) loginForm.style.display = 'none';
        };

        // Login form
        const loginInput = document.getElementById('inputLogin');
        const loginPw = document.getElementById('inputLoginPassword');
        const btnLogin = document.getElementById('btnLogin');
        const loginErr = document.getElementById('loginError');
        const updateLoginBtn = () => { if (btnLogin) btnLogin.disabled = !(loginInput?.value?.trim() && loginPw?.value); };
        if (loginInput) loginInput.addEventListener('input', updateLoginBtn);
        if (loginPw) loginPw.addEventListener('input', updateLoginBtn);
        if (loginInput) loginInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.handleLogin(); });
        if (btnLogin) btnLogin.addEventListener('click', () => this.handleLogin());
        if (loginPw) loginPw.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.handleLogin(); });

        // Register form
        const regLogin = document.getElementById('inputRegLogin');
        const regName = document.getElementById('inputRegName');
        const regPw = document.getElementById('inputRegPassword');
        const btnReg = document.getElementById('btnRegister');
        const updateRegBtn = () => { if (btnReg) btnReg.disabled = !(regLogin?.value?.trim() && regName?.value?.trim() && regPw?.value?.length >= 4); };
        if (regLogin) regLogin.addEventListener('input', updateRegBtn);
        if (regName) regName.addEventListener('input', updateRegBtn);
        if (regPw) regPw.addEventListener('input', updateRegBtn);
        [regLogin, regName, regPw].forEach((el) => {
            if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.handleRegister(); });
        });
        if (btnReg) btnReg.addEventListener('click', () => this.handleRegister());
    },

    async handleLogin() {
        const login = document.getElementById('inputLogin')?.value?.trim();
        const password = document.getElementById('inputLoginPassword')?.value;
        const errEl = document.getElementById('loginError');
        const btnLogin = document.getElementById('btnLogin');
        if (!login || !password) return;
        if (btnLogin) { btnLogin.disabled = true; btnLogin.textContent = 'Вход...'; }
        if (errEl) errEl.textContent = '';
        try {
            const res = await fetch(this.SERVER_URL + '/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login, password }),
            });
            const data = await res.json();
            if (!data.success) {
                if (errEl) errEl.textContent = data.error || 'Ошибка входа';
                if (btnLogin) { btnLogin.disabled = false; btnLogin.textContent = 'Войти'; }
                return;
            }
            this.onAuthSuccess(data.subscriber, data.token);
        } catch (err) {
            if (errEl) errEl.textContent = 'Ошибка сети';
            if (btnLogin) { btnLogin.disabled = false; btnLogin.textContent = 'Войти'; }
        }
    },

    async handleRegister() {
        const login = document.getElementById('inputRegLogin')?.value?.trim();
        const name = document.getElementById('inputRegName')?.value?.trim();
        const password = document.getElementById('inputRegPassword')?.value;
        const errEl = document.getElementById('registerError');
        const btnReg = document.getElementById('btnRegister');
        if (!login || !name || !password || password.length < 4) return;
        if (btnReg) { btnReg.disabled = true; btnReg.textContent = 'Регистрация...'; }
        if (errEl) errEl.textContent = '';
        try {
            const res = await fetch(this.SERVER_URL + '/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login, name, password }),
            });
            const data = await res.json();
            if (!data.success) {
                if (errEl) errEl.textContent = data.error || 'Ошибка регистрации';
                if (btnReg) { btnReg.disabled = false; btnReg.textContent = 'Зарегистрироваться'; }
                return;
            }
            this.onAuthSuccess(data.subscriber, data.token);
        } catch (err) {
            if (errEl) errEl.textContent = 'Ошибка сети';
            if (btnReg) { btnReg.disabled = false; btnReg.textContent = 'Зарегистрироваться'; }
        }
    },

    onAuthSuccess(subscriber, token) {
        const loginErr = document.getElementById('loginError');
        const registerErr = document.getElementById('registerError');
        if (loginErr) loginErr.textContent = '';
        if (registerErr) registerErr.textContent = '';
        try {
            if (token) localStorage.setItem('conference:token', token);
            localStorage.setItem('conference:subscriberId', subscriber.id);
            localStorage.setItem('conference:displayName', subscriber.name);
            if (subscriber.login) localStorage.setItem('conference:login', subscriber.login);
            if (subscriber.avatarUrl) localStorage.setItem('conference:avatarUrl', subscriber.avatarUrl);
        } catch (e) {}
        this.displayName = subscriber.name;
        this.myAvatarUrl = subscriber.avatarUrl || null;
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
        this.showMainApp();
        this.setupMainApp();
    },

    updateLandingButton() {
        // Legacy no-op
    },

    async handleLandingContinue() {
        // Legacy no-op — replaced by handleLogin/handleRegister
    },

    logout() {
        try {
            localStorage.removeItem('conference:token');
            localStorage.removeItem('conference:subscriberId');
            localStorage.removeItem('conference:displayName');
            localStorage.removeItem('conference:login');
            localStorage.removeItem('conference:avatarUrl');
        } catch (e) {}
        this.stopPresenceWorker();
        if (this.socket) { this.socket.disconnect(); this.socket = null; }
        this.socketChatSetup = false;
        this.displayName = '';
        this.myAvatarUrl = null;
        this.showLanding();
    },

    showMainApp() {
        this.showScreen('mainAppScreen');
        const roomFromUrl = this.getRoomIdFromUrl();
        if (roomFromUrl && this.elements.inputRoomId) this.elements.inputRoomId.value = roomFromUrl;
    },

    async setupMainApp() {
        await this.fetchProfileAndSync();
        const params = new URLSearchParams(window.location.search);
        const declineCallId = params.get('declineCall');
        if (declineCallId) {
            try {
                await this.authFetch(this.SERVER_URL + '/api/calls/' + encodeURIComponent(declineCallId) + '/ack', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...this.getSubscriberHeaders() },
                    body: JSON.stringify({ status: 'declined' })
                });
            } catch (e) {}
            const url = new URL(window.location.href);
            url.searchParams.delete('declineCall');
            window.history.replaceState({}, '', url.pathname + url.search);
        }

        // Обработка ?acceptCall= — принять звонок из push при закрытом приложении
        const acceptCallId = params.get('acceptCall');
        const acceptCallType = params.get('callType') || 'audio';
        if (acceptCallId) {
            const url = new URL(window.location.href);
            url.searchParams.delete('acceptCall');
            url.searchParams.delete('callType');
            window.history.replaceState({}, '', url.pathname + url.search);
            try {
                await this.authFetch(this.SERVER_URL + '/api/calls/' + encodeURIComponent(acceptCallId) + '/ack', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...this.getSubscriberHeaders() },
                    body: JSON.stringify({ status: 'acknowledged' })
                });
                this.pendingIncomingCall = { id: acceptCallId, callType: acceptCallType };
                this.joinCallRoom(acceptCallId, acceptCallType);
            } catch (e) {
                this.showMessage('Не удалось принять звонок', 'error');
            }
        }

        if (this.elements.inputDisplayName) this.elements.inputDisplayName.value = this.displayName || '';
        this.setupTabNavigation();
        this.updateHeaderUser();
        this.updateVideoButton();
        this.loadMyContacts();
        this.loadContactRequests();
        this.connectSocketForCalls();
        this.attachChatSocketListener();
        this.initPresenceWorker();
        this.registerServiceWorker();
        this.setupServiceWorkerMessages();
        this.registerPushSubscription();
        this.registerFcmTokenIfNative();
        this.setupFullScreenCallListener();
        this.setupAppUpdateCheckOnResume();
        this.checkForAppUpdate();
        this.setupContactsTabSearch();
        this.setupContactRequestsUI();
        this.checkForAppUpdate();
        this.showTab('chats');
    },

    isVersionNewer(serverVer, currentVer) {
        const parse = (v) => {
            const s = String(v || '0').replace(/[^\d.]/g, '');
            return s.split('.').map((n) => parseInt(n, 10) || 0);
        };
        const a = parse(serverVer);
        const b = parse(currentVer);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            const x = a[i] || 0;
            const y = b[i] || 0;
            if (x > y) return true;
            if (x < y) return false;
        }
        return false;
    },

    async checkForAppUpdate() {
        if (!this.isInNativeApp()) return;
        try {
            const cap = window.Capacitor;
            const App = cap?.Plugins?.App;
            if (!App) return;
            const info = await App.getInfo();
            const currentVersion = info?.version || info?.appVersion || '0';
            const res = await fetch(this.SERVER_URL + '/app-version.json?t=' + Date.now());
            if (!res.ok) return;
            const data = await res.json();
            const serverVersion = data?.version;
            const downloadUrl = data?.downloadUrl || '/conference-app.apk';
            if (!serverVersion || !this.isVersionNewer(serverVersion, currentVersion)) return;
            const banner = this.elements.updateBanner;
            const btn = this.elements.btnUpdateApp;
            if (banner) banner.style.display = 'flex';
            if (btn) {
                btn.onclick = () => {
                    const url = downloadUrl.startsWith('http') ? downloadUrl : this.SERVER_URL + downloadUrl;
                    const App = window.Capacitor?.Plugins?.App;
                    if (App?.openUrl) App.openUrl({ url }).catch(() => window.open(url));
                    else window.open(url);
                };
            }
        } catch (e) { console.warn('[App] Version check failed:', e); }
    },

    initPresenceWorker() {
        if (!('Worker' in window)) return;
        try {
            this.presenceWorker = new Worker(this.SERVER_URL + '/js/presence-worker.js');
            this.presenceWorker.onmessage = (e) => {
                const { type, status } = e.data || {};
                if (type === 'presence:bulk' && status && typeof status === 'object') {
                    Object.entries(status).forEach(([id, online]) => {
                        this.subscriberPresence.set(id, { online: !!online });
                    });
                    this.renderChatsList();
                    const sel = this.selectedContact;
                    if (sel && (this.elements.chatContactName?.offsetParent || this.elements.profileName?.offsetParent)) {
                        if (sel.id) this.updateContactOnlineUI(sel.id);
                    }
                }
            };
            const contactIds = (this.myContacts || []).map((c) => c.id).filter(Boolean);
            this.presenceWorker.postMessage({
                type: 'init',
                payload: {
                    serverUrl: this.SERVER_URL,
                    subscriberId: this.getMySubscriberId(),
                    contactIds,
                },
            });
        } catch (err) {
            console.warn('Presence Worker не инициализирован:', err);
        }
    },

    stopPresenceWorker() {
        if (this.presenceWorker) {
            this.presenceWorker.postMessage({ type: 'stop' });
            this.presenceWorker.terminate();
            this.presenceWorker = null;
        }
        this.subscriberPresence.clear();
    },

    updatePresenceWorkerContacts() {
        if (!this.presenceWorker) return;
        const contactIds = (this.myContacts || []).map((c) => c.id).filter(Boolean);
        this.presenceWorker.postMessage({ type: 'updateContacts', payload: contactIds });
    },

    isContactOnline(subscriberId) {
        const r = this.subscriberPresence.get(subscriberId);
        return !!r?.online;
    },

    getOnlineIndicatorHtml(subscriberId) {
        const online = this.isContactOnline(subscriberId);
        const safeId = (subscriberId || '').replace(/"/g, '&quot;');
        return `<span class="presence-dot ${online ? 'online' : 'offline'}" data-presence-for="${safeId}" title="${online ? 'В сети' : 'Не в сети'}"></span>`;
    },

    updateContactOnlineUI(contactId) {
        const online = this.isContactOnline(contactId);
        const dot = document.querySelector(`[data-presence-for="${contactId}"]`);
        if (dot) {
            dot.classList.toggle('online', !!online);
            dot.classList.toggle('offline', !online);
        }
    },

    setupTabNavigation() {
        // Вкладки убраны — единый список
    },

    showTab(tabId) {
        this.activeTab = 'chats';
        this.renderUnifiedList();
    },

    // --- Единый список (чаты + контакты + действия) ---
    async renderUnifiedList() {
        await this.renderChatsList();
    },

    async renderChatsList() {
        const list = this.elements.chatsList;
        const empty = this.elements.chatsEmpty;
        if (!list) return;
        // Fetch chats with last message
        let chats = this._cachedChats || [];
        try {
            const res = await this.authFetch(this.SERVER_URL + '/api/me/chats', { headers: this.getSubscriberHeaders() });
            const data = await res.json();
            if (data.success) {
                chats = data.chats || [];
                this._cachedChats = chats;
            }
        } catch (e) {}
        list.innerHTML = '';
        if (empty) empty.style.display = chats.length === 0 ? 'block' : 'none';
        chats.forEach((c) => {
            const contact = { id: c.contactId, name: c.name, avatarUrl: c.avatarUrl };
            const item = document.createElement('div');
            item.className = 'list-item';
            const lastBody = c.lastMessage ? this._esc(c.lastMessage.body).slice(0, 40) : 'Написать сообщение';
            const lastTime = c.lastMessage ? this._formatTime(c.lastMessage.createdAt) : '';
            item.innerHTML = `
                <div class="list-item-avatar">${this.getAvatarHtml(c)}</div>
                <div class="list-item-body" data-contact-id="${this._esc(c.contactId)}">
                    <div class="list-item-title">${this._esc(c.name || 'Без имени')} ${this.getOnlineIndicatorHtml(c.contactId)}</div>
                    <div class="list-item-subtitle">${lastBody}</div>
                </div>
                <div class="list-item-meta">
                    <span class="list-item-time">${lastTime}</span>
                    ${c.lastMessage && c.lastMessage.fromId !== this.getMySubscriberId() && !this._isRead(c.contactId, c.lastMessage.createdAt) ? '<span class="unread-badge"></span>' : ''}
                </div>
                <div class="list-item-actions">
                    <button class="icon-btn list-action-btn" data-action="audio" title="Аудио-звонок" aria-label="Аудио"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></button>
                    <button class="icon-btn list-action-btn" data-action="video" title="Видео-звонок" aria-label="Видео"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></button>
                </div>`;
            item.querySelector('.list-item-body')?.addEventListener('click', (e) => { e.stopPropagation(); this.openChat(contact); });
            const btnAudio = item.querySelector('.list-action-btn[data-action="audio"]');
            const btnVideo = item.querySelector('.list-action-btn[data-action="video"]');
            if (btnAudio) btnAudio.addEventListener('click', (e) => { e.stopPropagation(); this.initiateCall(contact, 'audio'); });
            if (btnVideo) btnVideo.addEventListener('click', (e) => { e.stopPropagation(); this.initiateCall(contact, 'video'); });
            list.appendChild(item);
        });
    },


    // --- Contact Profile ---
    showContactProfile(contact) {
        this.selectedContact = contact;
        const el = this.elements;
        if (el.profileAvatar) el.profileAvatar.innerHTML = this.getAvatarHtml(contact, 96);
        if (el.profileName) el.profileName.textContent = contact.name || 'Без имени';
        if (el.profilePresence) el.profilePresence.innerHTML = this.getOnlineIndicatorHtml(contact.id);
        if (el.profileId) el.profileId.textContent = contact.id || '';
        if (el.btnProfileChat) el.btnProfileChat.onclick = () => { this.hideOverlay('contactProfile'); this.openChat(contact); };
        if (el.btnProfileAudioCall) el.btnProfileAudioCall.onclick = () => { this.hideOverlay('contactProfile'); this.initiateCall(contact, 'audio'); };
        if (el.btnProfileVideoCall) el.btnProfileVideoCall.onclick = () => { this.hideOverlay('contactProfile'); this.initiateCall(contact, 'video'); };
        if (el.btnProfileRemove) el.btnProfileRemove.onclick = () => { this.hideOverlay('contactProfile'); this.removeContact(contact.id); };
        if (el.btnBackFromProfile) el.btnBackFromProfile.onclick = () => this.hideOverlay('contactProfile');
        this.showOverlay('contactProfile');
    },

    // --- Chat Screen ---
    openChat(contact) {
        this.selectedContact = contact;
        this._markRead(contact.id);
        if (this.elements.chatContactName) this.elements.chatContactName.innerHTML = this._esc(contact.name || 'Без имени') + ' ' + this.getOnlineIndicatorHtml(contact.id);
        if (this.elements.typingIndicator) this.elements.typingIndicator.style.display = 'none';
        if (this.elements.btnBackFromChat) this.elements.btnBackFromChat.onclick = () => {
            this.hideOverlay('chatScreen');
            this._markRead(contact.id);
            this._cachedChats = null;
                    this.renderChatsList();
        };
        if (this.elements.btnAudioCallFromChat) this.elements.btnAudioCallFromChat.onclick = () => { this.hideOverlay('chatScreen'); this.initiateCall(contact, 'audio'); };
        if (this.elements.btnVideoCallFromChat) this.elements.btnVideoCallFromChat.onclick = () => { this.hideOverlay('chatScreen'); this.initiateCall(contact, 'video'); };
        this.showOverlay('chatScreen');
        this.loadChatMessages();
    },

    showOverlay(id) {
        const el = this.elements[id];
        if (el) el.style.display = 'flex';
    },

    hideOverlay(id) {
        const el = this.elements[id];
        if (el) el.style.display = 'none';
    },

    _esc(str) {
        return (str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    _isRead(contactId, msgTimestamp) {
        try {
            const key = 'conference:read:' + contactId;
            const ts = parseInt(localStorage.getItem(key) || '0', 10);
            return ts >= msgTimestamp;
        } catch (e) { return false; }
    },

    _markRead(contactId) {
        try {
            localStorage.setItem('conference:read:' + contactId, String(Date.now()));
        } catch (e) {}
    },

    async fetchProfileAndSync() {
        if (!this.getSubscriberHeaders().Authorization) return;
        try {
            const res = await this.authFetch(this.SERVER_URL + '/api/me/profile', { headers: this.getSubscriberHeaders() });
            const data = await res.json();
            if (data.success && data.profile) {
                const p = data.profile;
                if (p.name) {
                    this.displayName = p.name;
                    try { localStorage.setItem('conference:displayName', p.name); } catch (e) {}
                }
                if (p.avatarUrl !== undefined && p.avatarUrl !== null) {
                    this.myAvatarUrl = p.avatarUrl;
                    try { localStorage.setItem('conference:avatarUrl', p.avatarUrl); } catch (e) {}
                } else if (p.avatarUrl === null) {
                    this.myAvatarUrl = null;
                    try { localStorage.removeItem('conference:avatarUrl'); } catch (e) {}
                }
            }
        } catch (e) { /* используем данные из localStorage */ }
    },

    updateHeaderUser() {
        const el = this.elements;
        if (!el.headerAvatar || !el.headerUserName) return;
        const url = this.myAvatarUrl;
        if (url) el.headerAvatar.innerHTML = `<img src="${url}" alt="">`;
        else el.headerAvatar.textContent = (this.displayName || '?').charAt(0).toUpperCase();
        el.headerUserName.textContent = this.displayName || 'Вы';
    },

    // --- Settings ---
    async showSettings() {
        const el = this.elements;
        if (el.settingsAvatar) {
            const url = this.myAvatarUrl;
            if (url) el.settingsAvatar.innerHTML = `<img src="${url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            else el.settingsAvatar.textContent = (this.displayName || '?').charAt(0).toUpperCase();
        }
        if (el.settingsDisplayName) el.settingsDisplayName.textContent = this.displayName || '—';
        if (el.inputSettingsName) el.inputSettingsName.value = this.displayName || '';
        if (el.settingsNameView) el.settingsNameView.style.display = '';
        if (el.settingsNameEdit) el.settingsNameEdit.style.display = 'none';
        if (el.settingsUserId) el.settingsUserId.textContent = this.getMySubscriberId();
        if (el.settingsAndroidDownload) el.settingsAndroidDownload.style.display = this.isInNativeApp() ? 'none' : 'block';
        if (el.adminLinkSection) {
            try {
                const res = await this.authFetch(this.SERVER_URL + '/api/me/is-admin', { headers: this.getSubscriberHeaders() });
                const data = await res.json();
                el.adminLinkSection.style.display = (data.isAdmin === true) ? 'block' : 'none';
            } catch (e) {
                el.adminLinkSection.style.display = 'none';
            }
        }
        this.showOverlay('settingsOverlay');
    },

    startEditName() {
        const el = this.elements;
        if (el.settingsNameView) el.settingsNameView.style.display = 'none';
        if (el.settingsNameEdit) el.settingsNameEdit.style.display = 'flex';
        if (el.inputSettingsName) {
            el.inputSettingsName.value = this.displayName || '';
            el.inputSettingsName.focus();
        }
    },

    async saveProfile() {
        const name = this.elements.inputSettingsName?.value?.trim();
        if (!name) { this.showMessage('Введите имя', 'error'); return; }
        try {
            const res = await this.authFetch(this.SERVER_URL + '/api/me/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...this.getSubscriberHeaders() },
                body: JSON.stringify({ name }),
            });
            const data = await res.json();
            if (data.success) {
                this.displayName = data.profile.name;
                try { localStorage.setItem('conference:displayName', data.profile.name); } catch(e){}
                this.updateHeaderUser();
                if (this.elements.settingsDisplayName) this.elements.settingsDisplayName.textContent = data.profile.name;
                if (this.elements.settingsNameView) this.elements.settingsNameView.style.display = '';
                if (this.elements.settingsNameEdit) this.elements.settingsNameEdit.style.display = 'none';
                this.showMessage('Профиль обновлён', 'success');
            } else { this.showMessage(data.error || 'Ошибка', 'error'); }
        } catch (err) { this.showMessage('Ошибка сети', 'error'); }
    },

    async resizeImageForAvatar(file) {
        const maxSize = 400;
        const maxBytes = 800 * 1024;
        const quality = 0.85;
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось загрузить изображение')); };
            img.onload = () => {
                URL.revokeObjectURL(url);
                let w = img.width, h = img.height;
                if (w <= maxSize && h <= maxSize && file.size <= maxBytes) {
                    resolve(file);
                    return;
                }
                const scale = Math.min(maxSize / w, maxSize / h, 1);
                w = Math.round(w * scale);
                h = Math.round(h * scale);
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob((blob) => {
                    if (!blob) { resolve(file); return; }
                    resolve(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
                }, 'image/jpeg', quality);
            };
            img.src = url;
        });
    },

    async uploadAvatar(file) {
        const resized = await this.resizeImageForAvatar(file);
        const formData = new FormData();
        formData.append('avatar', resized);
        try {
            const res = await this.authFetch(this.SERVER_URL + '/api/me/avatar', {
                method: 'POST',
                headers: this.getSubscriberHeaders(),
                body: formData,
            });
            const text = await res.text();
            let data;
            try { data = text ? JSON.parse(text) : {}; } catch (_) { data = {}; }
            if (data.success) {
                this.myAvatarUrl = data.avatarUrl;
                try { localStorage.setItem('conference:avatarUrl', data.avatarUrl); } catch(e){}
                if (this.elements.settingsAvatar && this.isSafeAvatarUrl(data.avatarUrl)) {
                    this.elements.settingsAvatar.innerHTML = `<img src="${String(data.avatarUrl).replace(/"/g, '&quot;')}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
                }
                this.updateHeaderUser();
                this.showMessage('Аватарка обновлена', 'success');
            } else {
                this.showMessage(data.error || 'Ошибка загрузки', 'error');
            }
        } catch (err) {
            console.warn('[uploadAvatar]', err);
            const msg = err?.message?.includes('Session expired') ? 'Сессия истекла, войдите снова'
                : err?.message?.includes('Failed to fetch') || err?.name === 'TypeError' ? 'Проверьте соединение и настройки прокси'
                : err?.message || 'Ошибка сети';
            this.showMessage(msg, 'error');
        }
    },

    isSafeAvatarUrl(url) {
        if (!url || typeof url !== 'string') return false;
        const s = url.trim().toLowerCase();
        if (s.startsWith('https://') || s.startsWith('http://')) return true;
        if (s.startsWith('data:image/')) return true;
        // Относительный путь к загруженным аватаркам (same-origin)
        if (s.startsWith('/uploads/avatars/') && !s.includes('..')) return true;
        return false;
    },

    getAvatarHtml(subscriber, size = 48) {
        const url = subscriber?.avatarUrl;
        if (url && this.isSafeAvatarUrl(url)) {
            const safeSize = Math.min(Math.max(Number(size) || 48, 16), 256);
            return `<img src="${url.replace(/"/g, '&quot;')}" style="width:${safeSize}px;height:${safeSize}px;border-radius:50%;object-fit:cover;">`;
        }
        return (subscriber?.name || '?').charAt(0).toUpperCase();
    },

    registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        navigator.serviceWorker.register('/service-worker.js').catch((err) => {
            console.warn('Service Worker registration failed:', err);
        });
    },

    setupServiceWorkerMessages() {
        if (!('serviceWorker' in navigator)) return;
        navigator.serviceWorker.addEventListener('message', (event) => {
            const { type, action, payload } = event.data || {};
            if (type === 'incoming-call' && payload) {
                this.showMainApp();
                const call = payload.call || {
                    id: payload.callId,
                    callType: payload.callType || 'audio',
                    from: { name: payload.fromName || 'Кто-то' },
                };
                if (action === 'accept') {
                    this.pendingIncomingCall = call;
                    this.acceptIncomingCall();
                } else {
                    this.showIncomingCallModal(call);
                }
            }
            if (type === 'contact-request' && payload) {
                this.showMainApp();
                this.showTab('chats');
                this.loadContactRequests();
                this.showMessage((payload.fromName || 'Кто-то') + ' хочет добавить вас в контакты', 'info');
            }
            if (type === 'new-message' && payload) {
                this.showMainApp();
                this.showTab('chats');
                if (payload.fromName) this.showMessage('Сообщение от ' + payload.fromName, 'info');
            }
        });
    },

    async registerPushSubscription() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        if (!('Notification' in window) || Notification.permission === 'denied') return;
        try {
            const reg = await navigator.serviceWorker.ready;
            const res = await fetch(this.SERVER_URL + '/api/me/push-public-key');
            const { publicKey, available } = await res.json();
            if (!available || !publicKey) return;
            if (Notification.permission === 'default') {
                const perm = await Notification.requestPermission();
                if (perm !== 'granted') return;
            }
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this._urlBase64ToUint8Array(publicKey),
            });
            const pushRes = await fetch(this.SERVER_URL + '/api/me/push-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getSubscriberHeaders() },
                body: JSON.stringify({ subscription: sub.toJSON ? sub.toJSON() : sub }),
            });
            if (pushRes.status === 401) return;
        } catch (e) {
            console.warn('[App] Push subscription failed:', e);
        }
    },

    async registerFcmTokenIfNative() {
        if (!this.isInNativeApp()) return;
        try {
            const cap = window.Capacitor;
            if (cap?.getPlatform?.() !== 'android') return;
            const PushNotifications = cap.Plugins?.PushNotifications;
            if (!PushNotifications) return;
            const perm = await PushNotifications.requestPermissions();
            if (perm?.receive !== 'granted') return;
            PushNotifications.addListener('registration', async (ev) => {
                const token = ev?.value;
                if (token) {
                    try {
                        await this.authFetch(this.SERVER_URL + '/api/me/fcm-token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...this.getSubscriberHeaders() },
                            body: JSON.stringify({ token }),
                        });
                    } catch (e) { console.warn('[App] FCM token save failed:', e); }
                }
            });
            await PushNotifications.register();
        } catch (e) { console.warn('[App] FCM registration failed:', e); }
    },

    compareVersions(a, b) {
        const parse = (v) => (String(v || '0').match(/\d+/g) || ['0']).map(Number);
        const pa = parse(a);
        const pb = parse(b);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const na = pa[i] || 0;
            const nb = pb[i] || 0;
            if (na > nb) return 1;
            if (na < nb) return -1;
        }
        return 0;
    },

    setupAppUpdateCheckOnResume() {
        if (!this.isInNativeApp()) return;
        try {
            const App = window.Capacitor?.Plugins?.App;
            if (!App?.addListener) return;
            App.addListener('appStateChange', ({ isActive }) => {
                if (isActive) this.checkForAppUpdate();
            });
        } catch (e) { console.warn('[App] AppState listener failed:', e); }
    },

    async checkForAppUpdate() {
        if (!this.isInNativeApp()) return;
        try {
            const cap = window.Capacitor;
            const App = cap?.Plugins?.App;
            if (!App?.getInfo) return;
            const info = await App.getInfo();
            const currentVersion = String(info?.version || info?.appVersion || '0').trim();
            const res = await fetch(this.SERVER_URL + '/app-version.json?t=' + Date.now());
            if (!res.ok) return;
            const data = await res.json();
            const serverVersion = (data?.version || '').trim();
            const downloadUrl = data?.downloadUrl || '/conference-app.apk';
            if (!serverVersion || this.compareVersions(serverVersion, currentVersion) <= 0) return;
            if (this.elements.updateBanner) this.elements.updateBanner.style.display = 'flex';
            if (this.elements.btnUpdateApp) {
                const fullUrl = downloadUrl.startsWith('http') ? downloadUrl : this.SERVER_URL + downloadUrl;
                this.elements.btnUpdateApp.onclick = () => {
                    const Browser = window.Capacitor?.Plugins?.Browser;
                    if (Browser?.open) {
                        Browser.open({ url: fullUrl }).catch(() => {
                            if (App?.openUrl) App.openUrl({ url: fullUrl }).catch(() => window.open(fullUrl));
                            else window.open(fullUrl);
                        });
                    } else if (App?.openUrl) {
                        App.openUrl({ url: fullUrl }).catch(() => window.open(fullUrl));
                    } else {
                        window.open(fullUrl);
                    }
                };
            }
        } catch (e) { console.warn('[App] Version check failed:', e); }
    },

    setupFullScreenCallListener() {
        if (!this.isInNativeApp()) return;
        try {
            const cap = window.Capacitor;
            if (cap?.getPlatform?.() !== 'android') return;
            const FullScreenNotification = cap.Plugins?.FullScreenNotification;
            if (!FullScreenNotification) return;
            FullScreenNotification.addListener('launch', (data) => {
                const fullScreenId = data?.fullScreenId || '';
                const actionId = data?.actionId || '';
                if (!fullScreenId.startsWith('call:')) return;
                const parts = fullScreenId.split(':');
                const callId = parts[1];
                const callType = parts[2] || 'audio';
                if (!callId) return;
                FullScreenNotification.cancelNotification?.();
                const base = new URL('/', window.location.origin).href;
                if (actionId === 'accept') {
                    window.location.href = base + '?acceptCall=' + encodeURIComponent(callId) + '&callType=' + encodeURIComponent(callType);
                } else if (actionId === 'decline') {
                    window.location.href = base + '?declineCall=' + encodeURIComponent(callId);
                } else {
                    window.location.href = base + '?acceptCall=' + encodeURIComponent(callId) + '&callType=' + encodeURIComponent(callType);
                }
            });
        } catch (e) { console.warn('[App] FullScreen listener failed:', e); }
    },

    _urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(base64);
        const output = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
        return output;
    },

    connectSocketForCalls() {
        if (typeof io === 'undefined') return;
        if (this.socket) return;
        const subscriberId = this.getMySubscriberId();
        this.socket = io(this.SERVER_URL, {
            path: '/socket.io/',
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5,
            auth: { subscriberId },
        });
        this.socket.on('connect', () => {
            this.selfId = this.socket.id;
            this.updatePresenceWorkerContacts(); // немедленное обновление presence после переподключения
            if (this.conferenceJoinPending) {
                this.conferenceJoinPending = false;
                this.connectionInProgress = false;
                this.emitRoomJoinAndShowConference();
            }
        });
        this.socket.on('call:initiated', (data) => {
            const myId = this.getMySubscriberId();
            if (String(data?.to?.id) === String(myId)) {
                this.showMainApp();
                this.showIncomingCallModal(data);
            }
        });
        this.socket.on('call:ack', (data) => {
            const myId = this.getMySubscriberId();
            if (data?.status === 'declined' && String(data?.call?.from?.id) === String(myId)) {
                this.showMessage('Звонок отклонён', 'info');
                this.disconnect();
            }
            if (data?.status === 'cancelled' && String(data?.call?.to?.id) === String(myId)) {
                this.hideIncomingCallModal();
            }
        });
        this.socket.on('connect_error', (error) => {
            if (this.connectionInProgress) {
                this.connectionInProgress = false;
                this.showMessage('Ошибка подключения к серверу', 'error');
                if (this.elements.btnConnect) this.elements.btnConnect.disabled = false;
                if (this.isPublicRoomGuest && this.elements.btnPublicRoomJoin) this.elements.btnPublicRoomJoin.disabled = false;
                this.setConnectStatusMessage('Ошибка подключения к серверу', 'error');
            }
        });
        this.socket.on('disconnect', (reason) => {
            this.selfId = null;
            if (this.connectionInProgress) {
                this.handleSocketDisconnect(reason);
            }
        });
        if (!this.socketEventsSetup) {
            this.socketEventsSetup = true;
            this.setupSocketEvents();
        }
    },

    emitRoomJoinAndShowConference() {
        if (!this.socket?.connected) return;
        this.socket.emit('room:join', {
            roomId: this.currentRoomId,
            displayName: this.displayName
        });
        this.ensurePresenceRecord(this.socket.id, {
            media: this.getLocalMediaState(),
            connectedAt: Date.now(),
            displayName: this.displayName
        });
        const main = document.getElementById('mainAppScreen');
        const publicJoin = document.getElementById('publicRoomJoinScreen');
        const shouldShowConference = (main && main.classList.contains('active')) || (publicJoin && publicJoin.classList.contains('active'));
        if (shouldShowConference) {
            this.showScreen('conferenceScreen');
        }
        setTimeout(() => this.clearConnectStatusMessage(), 1000);
        const isP2PCall = this.currentRoomId?.startsWith('call_');
        if (this.elements.conferenceRoomTitle) {
            this.elements.conferenceRoomTitle.textContent = 'Комната: ' + this.currentRoomId;
        }
        if (this.elements.inviteLink) {
            this.elements.inviteLink.value = window.location.origin + window.location.pathname + '?room=' + encodeURIComponent(this.currentRoomId);
        }
        const headerEl = document.getElementById('conferenceHeader');
        const participantsEl = document.getElementById('participantsList');
        const statusEl = document.getElementById('conferenceStatus');
        if (this.isPublicRoomGuest) {
            if (headerEl) headerEl.style.display = 'none';
            if (participantsEl) participantsEl.style.display = 'none';
            if (statusEl) statusEl.style.display = 'none';
        } else if (isP2PCall) {
            if (headerEl) headerEl.style.display = 'none';
            if (participantsEl) participantsEl.style.display = '';
            if (statusEl) statusEl.style.display = '';
        } else {
            if (headerEl) headerEl.style.display = '';
            if (participantsEl) participantsEl.style.display = '';
            if (statusEl) statusEl.style.display = '';
        }
        this.updateConferenceStatus();
        this.updateParticipantsList();
        this.updateVideoGridLayout();
        this.updateMuteButton();
        this.updateVideoButton();
        this.syncLocalMediaStatus({ force: true });
        this.updateLocalVideoStatusIcons();
    },

    initElements() {
        this.elements = {
            // Screens
            landingScreen: document.getElementById('landingScreen'),
            publicRoomJoinScreen: document.getElementById('publicRoomJoinScreen'),
            mainAppScreen: document.getElementById('mainAppScreen'),
            conferenceScreen: document.getElementById('conferenceScreen'),
            callScreen: document.getElementById('callScreen'),
            // Landing
            inputNameLanding: document.getElementById('inputNameLanding'),
            btnContinue: document.getElementById('btnContinue'),
            // Tabs
            tabChats: document.getElementById('tabChats'),
            tabCalls: document.getElementById('tabCalls'),
            tabContacts: document.getElementById('tabContacts'),
            chatsList: document.getElementById('chatsList'),
            chatsEmpty: document.getElementById('chatsEmpty'),
            callHistory: document.getElementById('callHistory'),
            callsEmpty: document.getElementById('callsEmpty'),
            // Contacts tab
            inputSearch: document.getElementById('inputSearch'),
            searchResults: document.getElementById('searchResults'),
            myContactsList: document.getElementById('myContactsList'),
            contactsEmpty: document.getElementById('contactsEmpty'),
            updateBanner: document.getElementById('updateBanner'),
            btnUpdateApp: document.getElementById('btnUpdateApp'),
            contactRequestsBanner: document.getElementById('contactRequestsBanner'),
            contactRequestsList: document.getElementById('contactRequestsList'),
            btnShowRequests: document.getElementById('btnShowRequests'),
            requestsCount: document.getElementById('requestsCount'),
            // Global search
            globalSearchOverlay: document.getElementById('globalSearchOverlay'),
            btnGlobalSearch: document.getElementById('btnGlobalSearch'),
            btnCloseGlobalSearch: document.getElementById('btnCloseGlobalSearch'),
            inputGlobalSearch: document.getElementById('inputGlobalSearch'),
            globalSearchResults: document.getElementById('globalSearchResults'),
            // Chat overlay
            chatScreen: document.getElementById('chatScreen'),
            btnBackFromChat: document.getElementById('btnBackFromChat'),
            chatContactName: document.getElementById('chatContactName'),
            chatMessages: document.getElementById('chatMessages'),
            inputChatMessage: document.getElementById('inputChatMessage'),
            btnSendMessage: document.getElementById('btnSendMessage'),
            typingIndicator: document.getElementById('typingIndicator'),
            btnAudioCallFromChat: document.getElementById('btnAudioCallFromChat'),
            btnVideoCallFromChat: document.getElementById('btnVideoCallFromChat'),
            // Profile overlay
            contactProfile: document.getElementById('contactProfile'),
            btnBackFromProfile: document.getElementById('btnBackFromProfile'),
            profileAvatar: document.getElementById('profileAvatar'),
            profileName: document.getElementById('profileName'),
            profilePresence: document.getElementById('profilePresence'),
            profileId: document.getElementById('profileId'),
            btnProfileChat: document.getElementById('btnProfileChat'),
            btnProfileAudioCall: document.getElementById('btnProfileAudioCall'),
            btnProfileVideoCall: document.getElementById('btnProfileVideoCall'),
            btnProfileRemove: document.getElementById('btnProfileRemove'),
            // Public room join screen
            inputPublicDisplayName: document.getElementById('inputPublicDisplayName'),
            btnPublicRoomJoin: document.getElementById('btnPublicRoomJoin'),
            publicRoomJoinError: document.getElementById('publicRoomJoinError'),
            // Join room overlay
            joinRoomOverlay: document.getElementById('joinRoomOverlay'),
            btnBackFromJoinRoom: document.getElementById('btnBackFromJoinRoom'),
            btnJoinRoom: document.getElementById('btnJoinRoom'),
            btnCreateRoom: document.getElementById('btnCreateRoom'),
            inputRoomId: document.getElementById('inputRoomId'),
            inputDisplayName: document.getElementById('inputDisplayName'),
            btnConnect: document.getElementById('btnConnect'),
            connectStatusMessage: document.getElementById('connectStatusMessage'),
            // P2P Call screen
            callAvatar: document.getElementById('callAvatar'),
            callContactName: document.getElementById('callContactName'),
            callStatus: document.getElementById('callStatus'),
            callTimer: document.getElementById('callTimer'),
            callVideoContainer: document.getElementById('callVideoContainer'),
            remoteVideo: document.getElementById('remoteVideo'),
            localVideoSmall: document.getElementById('localVideoSmall'),
            btnCallMute: document.getElementById('btnCallMute'),
            btnCallVideo: document.getElementById('btnCallVideo'),
            btnCallHangup: document.getElementById('btnCallHangup'),
            // Conference screen
            btnDisconnect: document.getElementById('btnDisconnect'),
            btnMute: document.getElementById('btnMute'),
            participantsList: document.getElementById('participantsList'),
            statusMessage: document.getElementById('statusMessage'),
            conferenceStatus: document.getElementById('conferenceStatus'),
            videoGrid: document.getElementById('videoGrid'),
            localVideo: document.getElementById('localVideo'),
            localVideoTile: document.querySelector('#videoGrid .video-tile.self'),
            localVideoLabel: document.querySelector('#videoGrid .video-tile.self .video-label'),
            btnVideo: document.getElementById('btnVideo'),
            inviteLink: document.getElementById('inviteLink'),
            btnCopyInvite: document.getElementById('btnCopyInvite'),
            conferenceRoomTitle: document.getElementById('conferenceRoomTitle'),
            btnChangeRoom: document.getElementById('btnChangeRoom'),
            // Incoming call modal
            incomingCallModal: document.getElementById('incomingCallModal'),
            incomingCallTitle: document.getElementById('incomingCallTitle'),
            incomingCallFrom: document.getElementById('incomingCallFrom'),
            incomingCallType: document.getElementById('incomingCallType'),
            incomingCallAvatar: document.getElementById('incomingCallAvatar'),
            btnAcceptCall: document.getElementById('btnAcceptCall'),
            btnRejectCall: document.getElementById('btnRejectCall'),
            // Settings
            btnOpenSettings: document.getElementById('btnOpenSettings'),
            settingsOverlay: document.getElementById('settingsOverlay'),
            btnBackFromSettings: document.getElementById('btnBackFromSettings'),
            settingsAvatar: document.getElementById('settingsAvatar'),
            inputAvatarFile: document.getElementById('inputAvatarFile'),
            inputSettingsName: document.getElementById('inputSettingsName'),
            settingsNameView: document.getElementById('settingsNameView'),
            settingsNameEdit: document.getElementById('settingsNameEdit'),
            settingsDisplayName: document.getElementById('settingsDisplayName'),
            btnEditName: document.getElementById('btnEditName'),
            btnSaveName: document.getElementById('btnSaveName'),
            settingsUserId: document.getElementById('settingsUserId'),
            settingsAndroidDownload: document.getElementById('settingsAndroidDownload'),
            btnLogout: document.getElementById('btnLogout'),
            adminLinkSection: document.getElementById('adminLinkSection'),
            headerUser: document.getElementById('headerUser'),
            headerAvatar: document.getElementById('headerAvatar'),
            headerUserName: document.getElementById('headerUserName'),
            // Toast
            toastContainer: document.getElementById('toastContainer'),
        };
        this.currentRoomId = 'general';
        this.currentCallType = 'audio';
        this.displayName = '';
        this.myAvatarUrl = null;
        this.myContacts = [];
        this.contactRequests = [];
        this.selectedContact = null;
        this.chatMessages = [];
        this.pendingIncomingCall = null;
        this.activeTab = 'chats';
    },

    isInNativeApp() {
        try {
            return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
        } catch (e) { return false; }
    },

    getSubscriberHeaders() {
        try {
            const token = localStorage.getItem('conference:token');
            if (token) return { 'Authorization': 'Bearer ' + token };
        } catch (e) {}
        return {};
    },

    async authFetch(url, options = {}) {
        const opts = { ...options, headers: { ...this.getSubscriberHeaders(), ...(options.headers || {}) } };
        const res = await fetch(url, opts);
        if (res.status === 401) {
            this.logout();
            throw new Error('Session expired');
        }
        return res;
    },

    getMySubscriberId() {
        const key = 'conference:subscriberId';
        let id = null;
        try {
            id = localStorage.getItem(key);
        } catch (e) {}
        if (!id) {
            id = typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : 'user_' + Math.random().toString(36).slice(2, 15);
            try {
                localStorage.setItem(key, id);
            } catch (e) {}
        }
        return id;
    },

    getMyDisplayNameForCalls() {
        if (this.displayName) return this.displayName;
        try {
            const v = localStorage.getItem('conference:displayName');
            if (v) return v;
        } catch (e) {}
        return 'Участник';
    },

    getRoomIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('room') || '';
    },

    updateConnectButton() {
        const input = this.elements.inputDisplayName;
        const btn = this.elements.btnConnect;
        const hint = this.elements.displayNameHint;
        if (!input || !btn) return;
        const name = (input.value || '').trim();
        const valid = name.length > 0;
        btn.disabled = !valid;
        if (hint) {
            hint.style.display = valid ? 'none' : 'block';
        }
    },

    getDisplayName() {
        if (this.displayName) return this.displayName;
        const input = this.elements.inputDisplayName;
        return input ? (input.value || '').trim() : this.getMyDisplayNameForCalls();
    },

    getRoomId() {
        const fromUrl = this.getRoomIdFromUrl();
        if (fromUrl) return fromUrl;
        const input = this.elements.inputRoomId;
        const val = input ? (input.value || '').trim() : '';
        return val || 'general';
    },

    generateRoomId() {
        return 'room_' + Math.random().toString(36).slice(2, 12);
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
        // Conference controls
        if (this.elements.btnConnect) {
            this.elements.btnConnect.addEventListener('click', () => {
                this.ensureAudioContextUnlocked('connect-button');
                this.connect();
            });
        }
        if (this.elements.btnDisconnect) this.elements.btnDisconnect.addEventListener('click', () => this.disconnect());
        if (this.elements.btnMute) this.elements.btnMute.addEventListener('click', () => this.toggleMute());
        if (this.elements.btnVideo) this.elements.btnVideo.addEventListener('click', () => this.toggleVideo());
        // Room actions
        if (this.elements.btnCreateRoom) {
            this.elements.btnCreateRoom.addEventListener('click', () => {
                this.ensureAudioContextUnlocked('create-room');
                const id = this.generateRoomId();
                if (this.elements.inputRoomId) this.elements.inputRoomId.value = id;
                if (this.elements.inputDisplayName) this.elements.inputDisplayName.value = this.displayName || this.getMyDisplayNameForCalls();
                this.connect();
            });
        }
        if (this.elements.btnJoinRoom) {
            this.elements.btnJoinRoom.addEventListener('click', () => {
                if (this.elements.inputDisplayName) this.elements.inputDisplayName.value = this.displayName || this.getMyDisplayNameForCalls();
                this.showOverlay('joinRoomOverlay');
            });
        }
        if (this.elements.btnBackFromJoinRoom) {
            this.elements.btnBackFromJoinRoom.addEventListener('click', () => this.hideOverlay('joinRoomOverlay'));
        }
        // Invite & room
        if (this.elements.btnCopyInvite) {
            this.elements.btnCopyInvite.addEventListener('click', async () => {
                const el = this.elements.inviteLink;
                const text = el?.value;
                if (!text) return;
                try {
                    if (navigator.clipboard) await navigator.clipboard.writeText(text);
                    else if (document.execCommand) { el.select(); document.execCommand('copy'); }
                    this.showMessage('Ссылка скопирована', 'success');
                } catch (err) { try { this.elements.inviteLink.select(); document.execCommand('copy'); this.showMessage('Скопировано', 'success'); } catch(e){} }
            });
        }
        if (this.elements.btnChangeRoom) this.elements.btnChangeRoom.addEventListener('click', () => this.disconnect());
        // Incoming call modal
        if (this.elements.btnAcceptCall) this.elements.btnAcceptCall.addEventListener('click', () => this.acceptIncomingCall());
        if (this.elements.btnRejectCall) this.elements.btnRejectCall.addEventListener('click', () => this.rejectIncomingCall());
        // Global search
        if (this.elements.btnGlobalSearch) {
            this.elements.btnGlobalSearch.addEventListener('click', () => {
                this.showOverlay('globalSearchOverlay');
                if (this.elements.inputGlobalSearch) this.elements.inputGlobalSearch.focus();
            });
        }
        if (this.elements.btnCloseGlobalSearch) {
            this.elements.btnCloseGlobalSearch.addEventListener('click', () => this.hideOverlay('globalSearchOverlay'));
        }
        if (this.elements.inputGlobalSearch) {
            let timeout;
            this.elements.inputGlobalSearch.addEventListener('input', () => {
                clearTimeout(timeout);
                const q = (this.elements.inputGlobalSearch.value || '').trim();
                if (q.length < 2) { if (this.elements.globalSearchResults) this.elements.globalSearchResults.innerHTML = ''; return; }
                timeout = setTimeout(() => this.globalSearch(q), 300);
            });
        }
        // Chat input
        if (this.elements.btnSendMessage) this.elements.btnSendMessage.addEventListener('click', () => this.sendChatMessage());
        if (this.elements.inputChatMessage) {
            this.elements.inputChatMessage.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.sendChatMessage();
                }
            });
            let typingTimeout;
            this.elements.inputChatMessage.addEventListener('input', () => {
                if (!this.selectedContact || !this.socket) return;
                this.socket.emit('chat:typing', { toId: this.selectedContact.id, typing: true });
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                    if (this.selectedContact && this.socket) this.socket.emit('chat:typing', { toId: this.selectedContact.id, typing: false });
                }, 2000);
            });
        }
        // P2P call controls
        if (this.elements.btnCallHangup) this.elements.btnCallHangup.addEventListener('click', () => this.hangupP2PCall());
        if (this.elements.btnCallMute) this.elements.btnCallMute.addEventListener('click', () => this.toggleMute());
        if (this.elements.btnCallVideo) this.elements.btnCallVideo.addEventListener('click', () => this.toggleVideo());
        // Settings
        if (this.elements.btnOpenSettings) this.elements.btnOpenSettings.addEventListener('click', () => this.showSettings());
        if (this.elements.headerUser) this.elements.headerUser.addEventListener('click', () => this.showSettings());
        if (this.elements.btnBackFromSettings) this.elements.btnBackFromSettings.addEventListener('click', () => this.hideOverlay('settingsOverlay'));
        if (this.elements.btnLogout) this.elements.btnLogout.addEventListener('click', () => this.logout());
        if (this.elements.btnEditName) this.elements.btnEditName.addEventListener('click', () => this.startEditName());
        if (this.elements.btnSaveName) this.elements.btnSaveName.addEventListener('click', () => this.saveProfile());
        if (this.elements.inputSettingsName) this.elements.inputSettingsName.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.saveProfile(); });
        if (this.elements.inputAvatarFile) this.elements.inputAvatarFile.addEventListener('change', (e) => { if (e.target.files?.[0]) this.uploadAvatar(e.target.files[0]); });
    },

    async loadMyContacts() {
        try {
            const res = await this.authFetch(this.SERVER_URL + '/api/me/contacts', {
                headers: this.getSubscriberHeaders(),
            });
            const data = await res.json();
            if (data.success && Array.isArray(data.contacts)) {
                this.myContacts = data.contacts;
                this.updatePresenceWorkerContacts();
                this.renderMyContacts();
            }
        } catch (err) {
            console.warn('Не удалось загрузить контакты:', err);
            if (err?.message !== 'Session expired') {
                this.showMessage('Не удалось загрузить контакты. Проверьте подключение.', 'error');
            }
        }
    },

    renderMyContacts() {
        this.renderChatsList();
    },

    setupContactsTabSearch() {
        let searchTimeout;
        if (this.elements.inputSearch) {
            this.elements.inputSearch.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                const q = (this.elements.inputSearch.value || '').trim();
                if (q.length < 2) {
                    if (this.elements.searchResults) this.elements.searchResults.style.display = 'none';
                    return;
                }
                searchTimeout = setTimeout(() => this.searchSubscribers(q), 300);
            });
            this.elements.inputSearch.addEventListener('blur', () => {
                setTimeout(() => {
                    if (this.elements.searchResults) this.elements.searchResults.style.display = 'none';
                }, 200);
            });
        }
        this.attachChatSocketListener();
    },

    attachChatSocketListener() {
        if (!this.socket || this.socketChatSetup) return;
        this.socketChatSetup = true;
        this.socket.on('presence:subscriber:online', (data) => {
            if (data?.subscriberId) {
                this.subscriberPresence.set(data.subscriberId, { online: true });
                    this.renderChatsList();
                if (this.activeTab === 'contacts') this.renderContactsList();
                if (this.selectedContact?.id === data.subscriberId) this.updateContactOnlineUI(data.subscriberId);
            }
        });
        this.socket.on('presence:subscriber:offline', (data) => {
            if (data?.subscriberId) {
                this.subscriberPresence.set(data.subscriberId, { online: false });
                    this.renderChatsList();
                if (this.activeTab === 'contacts') this.renderContactsList();
                if (this.selectedContact?.id === data.subscriberId) this.updateContactOnlineUI(data.subscriberId);
            }
        });
        this.socket.on('contact:request', (data) => {
            if (!data?.fromId) return;
            const fromName = data.fromName || data.fromId;
            this.showMessage(fromName + ' хочет добавить вас в контакты', 'info');
            this.loadContactRequests();
        });
        this.socket.on('contact:request:accepted', (data) => {
            if (!data?.contactName) return;
            this.showMessage(data.contactName + ' принял(а) ваш запрос', 'success');
            this.loadMyContacts();
        });
        // contact:request:declined не отправляется — отправитель не узнаёт об отклонении
        this.socket.on('chat:typing', (data) => {
            if (!data?.fromId) return;
            const indicator = this.elements.typingIndicator;
            if (!indicator) return;
            if (this.selectedContact && data.fromId === this.selectedContact.id && data.typing) {
                indicator.style.display = 'block';
                clearTimeout(this._typingHideTimeout);
                this._typingHideTimeout = setTimeout(() => { indicator.style.display = 'none'; }, 3000);
            } else {
                indicator.style.display = 'none';
            }
        });
        this.socket.on('chat:message:new', (msg) => {
            if (!msg) return;
            const myId = this.getMySubscriberId();
            if (msg.toId !== myId && msg.fromId !== myId) return;
            // Update open chat if it matches
            const isInOpenChat = this.selectedContact && (msg.fromId === this.selectedContact.id || msg.toId === this.selectedContact.id);
            if (isInOpenChat) {
                this.chatMessages.push(msg);
                this.renderChatMessages();
            }
            // Звук уведомления для входящего сообщения (только если чат не открыт и сообщение адресовано мне)
            if (msg.toId === myId && !isInOpenChat) {
                this.playMessageSound();
            }
            // Always refresh chats list for last message preview
            this.renderChatsList();
        });
    },

    async searchSubscribers(q) {
        try {
            const res = await fetch(this.SERVER_URL + '/api/subscribers/search?q=' + encodeURIComponent(q));
            const data = await res.json();
            const results = (data.subscribers || []).filter((s) => s.id !== this.getMySubscriberId());
            const myIds = new Set((this.myContacts || []).map((c) => c.id));
            const list = this.elements.searchResults;
            if (!list) return;
            list.innerHTML = '';
            list.style.display = 'block';
            if (results.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'search-empty';
                empty.textContent = 'Ничего не найдено';
                list.appendChild(empty);
                return;
            }
            results.slice(0, 10).forEach((s) => {
                const row = document.createElement('div');
                row.className = 'search-result-row';
                row.innerHTML = `<span class="search-result-name">${this._esc(s.name || 'Без имени')}</span>`;
                const btn = document.createElement('button');
                btn.className = 'btn btn-small';
                const inContacts = myIds.has(s.id);
                btn.textContent = inContacts ? 'В контактах' : 'Добавить';
                btn.disabled = inContacts;
                btn.addEventListener('click', () => {
                    if (!inContacts) { this.addContactById(s.id); btn.textContent = 'Отправлено'; btn.disabled = true; }
                });
                row.appendChild(btn);
                list.appendChild(row);
            });
        } catch (err) {
            console.warn('Поиск не удался:', err);
            const list = this.elements.searchResults;
            if (list) {
                list.innerHTML = '<div class="search-empty">Ошибка поиска</div>';
                list.style.display = 'block';
            }
        }
    },

    async globalSearch(q) {
        try {
            const res = await fetch(this.SERVER_URL + '/api/subscribers/search?q=' + encodeURIComponent(q));
            const data = await res.json();
            const results = (data.subscribers || []).filter((s) => s.id !== this.getMySubscriberId());
            const list = this.elements.globalSearchResults;
            if (!list) return;
            list.innerHTML = '';
            if (results.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'search-empty';
                empty.textContent = 'Ничего не найдено';
                list.appendChild(empty);
                return;
            }
            const myIds = new Set((this.myContacts || []).map((c) => c.id));
            results.slice(0, 20).forEach((s) => {
                const item = document.createElement('div');
                item.className = 'list-item';
                const inContacts = myIds.has(s.id);
                item.innerHTML = `
                    <div class="list-item-avatar">${(s.name || '?').charAt(0).toUpperCase()}</div>
                    <div class="list-item-body">
                        <div class="list-item-title">${this._esc(s.name || 'Без имени')}</div>
                        <div class="list-item-subtitle">${inContacts ? 'В контактах' : ''}</div>
                    </div>`;
                if (inContacts) {
                    item.addEventListener('click', () => { this.hideOverlay('globalSearchOverlay'); this.openChat(s); });
                } else {
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-small btn-primary';
                    btn.textContent = 'Добавить';
                    btn.addEventListener('click', (e) => { e.stopPropagation(); this.addContactById(s.id); btn.textContent = 'Отправлено'; btn.disabled = true; });
                    item.appendChild(btn);
                }
                list.appendChild(item);
            });
        } catch (err) {
            console.warn('Глобальный поиск не удался:', err);
            const list = this.elements.globalSearchResults;
            if (list) {
                list.innerHTML = '<div class="search-empty">Ошибка поиска</div>';
            }
        }
    },

    async addContactById(contactId) {
        try {
            const res = await this.authFetch(this.SERVER_URL + '/api/me/contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getSubscriberHeaders() },
                body: JSON.stringify({ contactId: String(contactId) }),
                credentials: 'include',
            });
            let data;
            try { data = await res.json(); } catch (_) { data = {}; }
            if (res.ok && data.success) {
                if (this.elements.searchResults) this.elements.searchResults.style.display = 'none';
                this.showMessage('Запрос на добавление отправлен', 'success');
                if (typeof this.loadMyContacts === 'function') this.loadMyContacts();
                if (typeof this.loadContactRequests === 'function') this.loadContactRequests();
            } else {
                this.showMessage(data.error || (res.status === 401 ? 'Требуется авторизация' : 'Не удалось отправить запрос'), 'error');
            }
        } catch (err) {
            this.showMessage('Ошибка сети. Проверьте подключение.', 'error');
        }
    },

    async removeContact(contactId) {
        try {
            await this.authFetch(this.SERVER_URL + '/api/me/contacts/' + encodeURIComponent(contactId), {
                method: 'DELETE',
                headers: this.getSubscriberHeaders(),
            });
            await this.loadMyContacts();
            if (this.selectedContact?.id === contactId) {
                this.selectedContact = null;
            }
            this.showMessage('Контакт удалён', 'info');
        } catch (err) {
            this.showMessage('Ошибка удаления', 'error');
        }
    },

    // --- Contact Requests ---
    setupContactRequestsUI() {
        if (this.elements.btnShowRequests) {
            this.elements.btnShowRequests.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const list = this.elements.contactRequestsList;
                if (!list) return;
                const isHidden = list.style.display === 'none' || !list.style.display;
                list.style.display = isHidden ? 'block' : 'none';
            });
        }
    },

    async loadContactRequests() {
        try {
            const res = await this.authFetch(this.SERVER_URL + '/api/me/contacts/requests', {
                headers: this.getSubscriberHeaders(),
            });
            const data = await res.json();
            if (data.success && Array.isArray(data.requests)) {
                this.contactRequests = data.requests;
                this.renderContactRequests();
            }
        } catch (err) {
            console.warn('Не удалось загрузить запросы:', err);
            if (err?.message !== 'Session expired') {
                this.showMessage('Не удалось загрузить запросы', 'error');
            }
        }
    },

    renderContactRequests() {
        const banner = this.elements.contactRequestsBanner;
        const list = this.elements.contactRequestsList;
        const count = this.elements.requestsCount;
        const requests = this.contactRequests || [];
        if (banner) banner.style.display = requests.length > 0 ? 'block' : 'none';
        if (count) count.textContent = requests.length;
        if (!list) return;
        list.innerHTML = '';
        if (requests.length === 0) {
            list.style.display = 'none';
            return;
        }
        // Auto-show when there are pending requests
        list.style.display = 'block';
        requests.forEach((r) => {
            const row = document.createElement('div');
            row.className = 'contact-request-row';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'contact-request-name';
            nameSpan.textContent = r.fromName || r.fromId;
            const actions = document.createElement('div');
            actions.className = 'contact-request-actions';
            const btnAccept = document.createElement('button');
            btnAccept.className = 'btn btn-small btn-primary';
            btnAccept.textContent = 'Принять';
            btnAccept.addEventListener('click', () => this.respondContactRequest(r.id, 'accept'));
            const btnDecline = document.createElement('button');
            btnDecline.className = 'btn btn-small btn-ghost';
            btnDecline.textContent = 'Отклонить';
            btnDecline.addEventListener('click', () => this.respondContactRequest(r.id, 'decline'));
            actions.appendChild(btnAccept);
            actions.appendChild(btnDecline);
            row.appendChild(nameSpan);
            row.appendChild(actions);
            list.appendChild(row);
        });
    },

    async respondContactRequest(requestId, action) {
        try {
            const res = await this.authFetch(
                this.SERVER_URL + '/api/me/contacts/requests/' + encodeURIComponent(requestId) + '/' + action,
                { method: 'POST', headers: this.getSubscriberHeaders() }
            );
            const data = await res.json();
            if (data.success) {
                this.showMessage(action === 'accept' ? 'Контакт добавлен' : 'Запрос отклонён', action === 'accept' ? 'success' : 'info');
                await this.loadContactRequests();
                if (action === 'accept') {
                    await this.loadMyContacts();
                }
            } else {
                this.showMessage(data.error || 'Ошибка', 'error');
            }
        } catch (err) {
            this.showMessage('Ошибка сети', 'error');
        }
    },

    selectContact(contact) {
        this.openChat(contact);
    },

    async loadChatMessages() {
        if (!this.selectedContact) return;
        try {
            const res = await this.authFetch(
                this.SERVER_URL + '/api/me/messages?contactId=' + encodeURIComponent(this.selectedContact.id),
                { headers: this.getSubscriberHeaders() }
            );
            const data = await res.json();
            this.chatMessages = data.messages || [];
            this.renderChatMessages();
        } catch (err) {
            this.chatMessages = [];
            this.renderChatMessages();
        }
    },

    renderChatMessages() {
        const list = this.elements.chatMessages;
        if (!list) return;
        const myId = this.getMySubscriberId();
        list.innerHTML = '';
        let lastDate = '';
        (this.chatMessages || []).forEach((m) => {
            // Date separator
            const msgDate = this._formatDate(m.createdAt);
            if (msgDate !== lastDate) {
                lastDate = msgDate;
                const sep = document.createElement('div');
                sep.className = 'chat-date-sep';
                sep.textContent = msgDate;
                list.appendChild(sep);
            }
            const div = document.createElement('div');
            div.className = 'chat-msg ' + (m.fromId === myId ? 'out' : 'in');
            const body = document.createElement('div');
            body.className = 'chat-msg-body';
            body.textContent = m.body || '';
            div.appendChild(body);
            const time = document.createElement('div');
            time.className = 'chat-msg-time';
            time.textContent = this._formatTime(m.createdAt);
            div.appendChild(time);
            list.appendChild(div);
        });
        list.scrollTop = list.scrollHeight;
    },

    _formatTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    },

    _formatDate(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const diff = (today - msgDay) / 86400000;
        if (diff === 0) return 'Сегодня';
        if (diff === 1) return 'Вчера';
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    },

    async sendChatMessage() {
        const input = this.elements.inputChatMessage;
        const btnSend = this.elements.btnSendMessage;
        if (!this.selectedContact || !input) return;
        const body = (input.value || '').trim();
        if (!body) return;
        if (this._sendingMessage) return;
        this._sendingMessage = true;
        if (btnSend) btnSend.disabled = true;
        try {
            const res = await this.authFetch(this.SERVER_URL + '/api/me/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getSubscriberHeaders() },
                body: JSON.stringify({ toId: this.selectedContact.id, body }),
            });
            const data = await res.json();
            if (data.success && data.message) {
                this.chatMessages.push(data.message);
                this.renderChatMessages();
                input.value = '';
                // Refresh chats list for last message preview
                this._cachedChats = null;
                this.renderChatsList();
            } else {
                this.showMessage(data.error || 'Ошибка отправки', 'error');
            }
        } catch (err) {
            if (err?.message !== 'Session expired') {
                this.showMessage('Ошибка отправки', 'error');
            }
        } finally {
            this._sendingMessage = false;
            if (btnSend) btnSend.disabled = false;
        }
    },

    async initiateCall(contact, callType = 'audio') {
        const myId = this.getMySubscriberId();
        const myName = this.getMyDisplayNameForCalls();
        this.currentCallType = callType;
        try {
            const res = await this.authFetch(this.SERVER_URL + '/api/calls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getSubscriberHeaders() },
                body: JSON.stringify({
                    toId: contact.id,
                    fromName: myName,
                    callType,
                })
            });
            const data = await res.json();
            if (data.success) {
                this.pendingOutgoingCall = data.call;
                if (data.call?.id) {
                    this.joinCallRoom(data.call.id, callType);
                }
            } else {
                this.showMessage(data.error || 'Ошибка', 'error');
            }
        } catch (err) {
            this.showMessage('Ошибка звонка', 'error');
        }
    },

    async hangupP2PCall() {
        const callId = this.pendingOutgoingCall?.id || (this.currentRoomId?.startsWith('call_') ? this.currentRoomId : null);
        if (callId) {
            try {
                await this.authFetch(this.SERVER_URL + '/api/calls/' + encodeURIComponent(callId) + '/ack', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...this.getSubscriberHeaders() },
                    body: JSON.stringify({ status: 'cancelled' })
                });
            } catch (e) {}
        }
        this.disconnect();
    },

    joinCallRoom(callId, callType) {
        const roomId = callId.startsWith('call_') ? callId : 'call_' + callId;
        this.currentRoomId = roomId;
        if (callType) this.currentCallType = callType;
        const name = this.displayName || this.getMyDisplayNameForCalls();
        this.displayName = name;
        if (this.elements.inputDisplayName) this.elements.inputDisplayName.value = name;
        if (this.elements.inputRoomId) this.elements.inputRoomId.value = roomId;
        this.connect();
    },

    playCallRingtone() {
        this.stopCallRingtone();
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.callRingtoneContext = ctx;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = 800;
            gain.gain.value = 0.3;
            osc.start();
            this.callRingtoneOscillator = osc;
            this.callRingtoneGain = gain;
            let on = true;
            this.callRingtoneInterval = setInterval(() => {
                if (!this.callRingtoneGain) return;
                this.callRingtoneGain.gain.setTargetAtTime(on ? 0.3 : 0, ctx.currentTime, 0.05);
                on = !on;
            }, 600);
        } catch (e) { console.warn('Ringtone:', e); }
    },

    stopCallRingtone() {
        if (this.callRingtoneInterval) {
            clearInterval(this.callRingtoneInterval);
            this.callRingtoneInterval = null;
        }
        if (this.callRingtoneOscillator) {
            try { this.callRingtoneOscillator.stop(); } catch (e) {}
            this.callRingtoneOscillator = null;
        }
        this.callRingtoneGain = null;
        if (this.callRingtoneContext) {
            try { this.callRingtoneContext.close(); } catch (e) {}
            this.callRingtoneContext = null;
        }
    },

    playMessageSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = 660;
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.15);
        } catch (e) { console.warn('Message sound:', e); }
    },

    showIncomingCallModal(call) {
        this.pendingIncomingCall = call;
        const callType = call?.callType || 'audio';
        if (this.elements.incomingCallTitle) this.elements.incomingCallTitle.textContent = callType === 'video' ? 'Видео-звонок' : 'Аудио-звонок';
        if (this.elements.incomingCallFrom) this.elements.incomingCallFrom.textContent = call?.from?.name || 'Неизвестный';
        if (this.elements.incomingCallType) this.elements.incomingCallType.textContent = callType === 'video' ? 'Входящий видео-звонок' : 'Входящий аудио-звонок';
        if (this.elements.incomingCallAvatar) this.elements.incomingCallAvatar.textContent = (call?.from?.name || '?').charAt(0).toUpperCase();
        const modal = this.elements.incomingCallModal;
        if (modal) {
            modal.style.display = 'flex';
            modal.style.zIndex = '2147483647';
            modal.classList.add('incoming-call-overlay');
        }
        this.playCallRingtone();
    },

    hideIncomingCallModal() {
        this.stopCallRingtone();
        this.pendingIncomingCall = null;
        const modal = this.elements.incomingCallModal;
        if (modal) {
            modal.style.display = 'none';
            modal.style.zIndex = '';
            modal.classList.remove('incoming-call-overlay');
        }
    },

    async acceptIncomingCall() {
        const call = this.pendingIncomingCall;
        if (!call?.id) {
            this.hideIncomingCallModal();
            return;
        }
        try {
            await this.authFetch(this.SERVER_URL + '/api/calls/' + encodeURIComponent(call.id) + '/ack', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getSubscriberHeaders() },
                body: JSON.stringify({ status: 'acknowledged' })
            });
            this.hideIncomingCallModal();
            this.joinCallRoom(call.id, call.callType || 'audio');
        } catch (err) {
            this.showMessage('Ошибка при приёме звонка', 'error');
        }
    },

    async rejectIncomingCall() {
        const call = this.pendingIncomingCall;
        if (call?.id) {
            try {
                await this.authFetch(this.SERVER_URL + '/api/calls/' + encodeURIComponent(call.id) + '/ack', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...this.getSubscriberHeaders() },
                    body: JSON.stringify({ status: 'declined' })
                });
            } catch (e) {}
        }
        this.hideIncomingCallModal();
    },

    resetPresenceState() {
        this.presence = new Map();
        this.lastSentMediaStatus = { cam: false, mic: false };
        this.selfId = null;
        if (this.pendingPlaybackElements) {
            this.pendingPlaybackElements.clear();
        }
        this.removeSelfParticipantEntry();
        this.updateVideoButton();
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
            connectedAt: Date.now(),
            displayName: ''
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

        if (typeof data.displayName === 'string') {
            existing.displayName = data.displayName;
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

        // Проверяем, что в потоке есть активные аудио треки
        const audioTracks = remoteStream.getAudioTracks();
        if (!audioTracks || audioTracks.length === 0) {
            console.log(`⚠️ Нет аудио треков в потоке для ${debugLabel}`);
            return;
        }

        // Проверяем, что есть хотя бы один активный трек
        const activeAudioTracks = audioTracks.filter(track => 
            track.readyState === 'live' && !track.muted && track.enabled
        );
        if (activeAudioTracks.length === 0) {
            console.log(`⚠️ Нет активных аудио треков в потоке для ${debugLabel}`);
            return;
        }

        try {
            const sourceNode = this.audioContext.createMediaStreamSource(remoteStream);
            sourceNode.connect(this.audioContext.destination);
            participantRecord.audioSourceNode = sourceNode;
            participantRecord.audioSourceStreamId = currentStreamId;
            console.log(`✅ AudioContext источник создан для потока ${currentStreamId} (${debugLabel})`);
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

    handleForceDisconnect(payload = {}) {
        const { reason } = payload;
        const message = reason || 'Конференция завершена';
        this.disconnect();
        this.showMessage(message, 'info');
    },

    handleRoomClosed(payload = {}) {
        const msg = 'Конференция завершена. Автор вышел из комнаты.';
        this.disconnect();
        this.showMessage(msg, 'info');
        if (this.isPublicRoomGuest && this.elements.publicRoomJoinError) {
            this.elements.publicRoomJoinError.textContent = msg;
        }
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
            this.updateVideoGridLayout();
        }

        this.presence = new Map();
        this.selfId = null;
        this.lastSentMediaStatus = this.getLocalMediaState();

        this.updateParticipantsList();
        this.updateConferenceStatus();
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
                connectedAt: participant.connectedAt,
                displayName: participant.displayName || ''
            });

            if (participant.id !== this.selfId) {
                toConnect.push(participant.id);
            }
        });

        const selfId = this.selfId || this.socket?.id;
        if (selfId && !this.presence.has(selfId)) {
            this.ensurePresenceRecord(selfId, {
                media: this.getLocalMediaState(),
                connectedAt: Date.now(),
                displayName: this.displayName || ''
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
                connectedAt: participant.connectedAt,
                displayName: participant.displayName || ''
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
            // P2P: если собеседник ушёл — завершаем звонок и у себя
            if (this.currentRoomId?.startsWith('call_') && this.participants.size === 0) {
                this.disconnect();
            }
        }

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
            this.updateLocalVideoStatusIcons();
        }

        this.updateParticipantUI(id);
    },

    showMessage(message, type = 'info') {
        // Toast notification
        const container = this.elements.toastContainer || document.getElementById('toastContainer');
        if (container) {
            const toast = document.createElement('div');
            toast.className = 'toast ' + type;
            toast.textContent = message;
            container.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
            return;
        }
        // Fallback for conference screen
        const statusEl = this.elements.statusMessage;
        if (!statusEl) return;
        statusEl.textContent = message;
        statusEl.className = `status-message ${type} show`;
        setTimeout(() => { statusEl.classList.remove('show'); }, 3000);
    },

    async connect() {
        const displayName = this.getDisplayName();
        if (!displayName) {
            this.setConnectStatusMessage('Введите имя', 'error');
            this.showMessage('Введите ник или имя перед входом', 'error');
            return;
        }

        if (this.socket && this.socket.connected && this.localStream) {
            console.log('ℹ️ Уже подключены к конференции');
            this.currentRoomId = this.getRoomId();
            this.emitRoomJoinAndShowConference();
            return;
        }
        if (this.connectionInProgress) {
            console.log('⏳ Подключение уже выполняется, ожидаем завершения');
            return;
        }

        this.displayName = displayName;
        if (!this.currentRoomId || !this.currentRoomId.startsWith('call_')) {
            this.currentRoomId = this.getRoomId();
        }

        this.connectionInProgress = true;
        this.setConnectStatusMessage('Подключение...', 'info');
        console.log('Подключение к конференции...');
        if (this.elements.btnConnect) this.elements.btnConnect.disabled = true;
        if (this.isPublicRoomGuest && this.elements.btnPublicRoomJoin) this.elements.btnPublicRoomJoin.disabled = true;
        this.showMessage('Подключение...', 'info');

        try {
            if (typeof io === 'undefined') {
                throw new Error('Socket.IO не загружен');
            }

            this.connectSocketForCalls();

            // Получаем медиа поток (audio + video сразу — иначе в ряде браузеров аудио не передаётся)
            console.log('Запрос доступа к микрофону и камере...');
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: true
                });
                console.log('✅ Доступ к медиа получен');
                const [videoTrack] = this.localStream.getVideoTracks() || [];
                if (videoTrack) {
                    this.videoTrack = videoTrack;
                    this.videoTrack.enabled = false;
                    this.isVideoEnabled = false;
                }
                this.updateMuteButton();
                this.syncLocalMediaStatus({ force: true });
                this.attachLocalStreamToPreview();
                this.updateVideoButton();

                const audioAttached = await this.attachAudioTracksToAllParticipants();
                if (audioAttached) {
                    await this.renegotiateAllPeers('initial-audio', { forceLocalInitiator: true });
                }

                if (this.socket?.connected) {
                    this.connectionInProgress = false;
                    this.emitRoomJoinAndShowConference();
                } else {
                    this.conferenceJoinPending = true;
                }
            } catch (error) {
                console.error('❌ Ошибка доступа к микрофону:', error);
                this.showMessage('Не удалось получить доступ к микрофону. Разрешите доступ и попробуйте снова.', 'error');
                if (this.elements.btnConnect) this.elements.btnConnect.disabled = false;
                if (this.isPublicRoomGuest && this.elements.btnPublicRoomJoin) this.elements.btnPublicRoomJoin.disabled = false;
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
            if (this.elements.btnConnect) this.elements.btnConnect.disabled = false;
            if (this.isPublicRoomGuest && this.elements.btnPublicRoomJoin) this.elements.btnPublicRoomJoin.disabled = false;
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
        this.socket.on('room:closed', (data) => this.handleRoomClosed(data));

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
            const existingParticipant = this.participants.get(targetSocketId);
            // Если соединение активно, не переподключаемся
            if (existingParticipant && existingParticipant.peerConnection && 
                existingParticipant.peerConnection.connectionState !== 'closed' &&
                existingParticipant.peerConnection.connectionState !== 'failed') {
                console.log('Уже подключен к', targetSocketId);
                return;
            }
            // Если соединение закрыто, очищаем старое перед созданием нового
            console.log('Очистка старого соединения для', targetSocketId);
            this.disconnectFromPeer(targetSocketId);
        }

        try {
            const peerConnection = new RTCPeerConnection({ iceServers: this.ICE_SERVERS });

            // ВАЖНО: Добавляем АУДИО первым — порядок m= в SDP должен совпадать у обеих сторон.
            // Аудио критично для звонков; добавление первым устраняет асимметрию направления (кто кого слышит).
            let audioSender = null;
            const audioTracks = this.localStream?.getAudioTracks() || [];
            if (audioTracks.length > 0) {
                audioSender = peerConnection.addTrack(audioTracks[0], this.localStream);
                console.log('✅ Аудио-трек добавлен первым для', targetSocketId);
            } else {
                console.warn('⚠️ Нет аудио-трека в localStream для', targetSocketId);
            }

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
                videoSender = videoTransceiver.sender;
            }

            const media = this.createParticipantMedia(targetSocketId);

            const participantRecord = {
                peerConnection,
                mediaElement: media.mediaElement,
                tileElement: media.tileElement,
                labelElement: media.labelElement,
                statusIconsElement: media.statusIconsElement,
                pendingCandidates: [],
                connected: false,
                videoEnabled: false,
                videoSender: videoSender,
                videoTransceiver,
                audioSender,
                audioSourceNode: null,
                audioSourceStreamId: null,
                renegotiating: false,
                pendingRenegotiation: false,
                isInitiator
            };

            this.participants.set(targetSocketId, participantRecord);

            peerConnection.ontrack = (event) => {
                const trackKind = event.track ? event.track.kind : 'unknown';
                console.log('🎥 Получен трек от', targetSocketId, trackKind, event);

                if (!participantRecord.mediaElement || !event.track) {
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
                } else if (!participantRecord.mediaElement.srcObject || participantRecord.mediaElement.srcObject.id !== remoteStream.id) {
                    // Новый поток - заменяем полностью
                    participantRecord.mediaElement.srcObject = remoteStream;
                } else {
                    // Используем существующий поток
                    remoteStream = participantRecord.mediaElement.srcObject;
                }

                // Удаляем старые треки того же типа перед добавлением нового
                if (event.track && remoteStream instanceof MediaStream) {
                    const existingTracks = remoteStream.getTracks().filter(t => t.kind === event.track.kind);
                    existingTracks.forEach(oldTrack => {
                        if (oldTrack.id !== event.track.id) {
                            console.log(`🗑️ Удаляем старый ${event.track.kind} трек`, oldTrack.id);
                            remoteStream.removeTrack(oldTrack);
                            oldTrack.stop();
                        }
                    });
                    
                    // Добавляем новый трек только если его еще нет
                    if (!remoteStream.getTracks().includes(event.track)) {
                        remoteStream.addTrack(event.track);
                    }
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
                    // Маршрутируем удалённый звук через AudioContext (качество и контроль)
                    const currentStreamId = remoteStream.id;
                    if (!participantRecord.audioSourceNode || participantRecord.audioSourceStreamId !== currentStreamId) {
                        this.attachStreamToAudioContext(participantRecord, remoteStream, targetSocketId);
                        // Отключаем звук у mediaElement — воспроизведение идёт через AudioContext, иначе дублирование/эхо
                        participantRecord.mediaElement.muted = true;
                    }
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
                this.updateParticipantStatusIcons(data.fromSocketId);

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

        // Останавливаем все треки перед закрытием соединения
        if (participant.mediaElement && participant.mediaElement.srcObject instanceof MediaStream) {
            const stream = participant.mediaElement.srcObject;
            stream.getTracks().forEach(track => {
                track.stop();
                console.log(`🛑 Остановлен трек ${track.kind} для ${socketId}`);
            });
        }

        if (participant.peerConnection) {
            // Останавливаем все senders перед закрытием
            if (typeof participant.peerConnection.getSenders === 'function') {
                participant.peerConnection.getSenders().forEach(sender => {
                    if (sender.track) {
                        sender.track.stop();
                    }
                });
            }
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
        this.updateVideoGridLayout();
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

        if (this.videoTrack && this.videoTrack.readyState !== 'ended') {
            this.videoTrack.enabled = true;
            this.isVideoEnabled = true;
            this.attachLocalStreamToPreview();
            this.syncLocalMediaStatus();
            this.updateLocalVideoStatusIcons();
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
        this.updateLocalVideoStatusIcons();

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

        if (videoTrack && videoTrack.readyState !== 'ended') {
            videoTrack.enabled = false;
            this.isVideoEnabled = false;
            this.attachLocalStreamToPreview();
            this.syncLocalMediaStatus();
            this.updateLocalVideoStatusIcons();
            return;
        }

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
        this.updateLocalVideoStatusIcons();

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
                    // Микрофон был выключен, теперь включили
                    this.elements.btnMute.classList.add('active');
                    this.elements.btnMute.classList.remove('muted');
                } else {
                    // Микрофон был включен, теперь выключили
                    this.elements.btnMute.classList.remove('active');
                    this.elements.btnMute.classList.add('muted');
                }
            }

            this.syncLocalMediaStatus();
            this.updateLocalVideoStatusIcons();
        }
    },

    updateMuteButton() {
        // Обновляем текст кнопки в соответствии с текущим состоянием микрофона
        if (!this.localStream || !this.elements.btnMute) return;

        const audioTracks = this.localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            const isEnabled = audioTracks[0].enabled;
            if (isEnabled) {
                this.elements.btnMute.classList.add('active');
                this.elements.btnMute.classList.remove('muted');
            } else {
                this.elements.btnMute.classList.remove('active');
                this.elements.btnMute.classList.add('muted');
            }
        }
    },

    updateParticipantsList() {
        const list = this.elements.participantsList;
        if (!list) return;

        // Список скрыт через CSS, не выполняем лишнюю работу
        // Статусы теперь показываются на видео тайлах
        if (list.style.display === 'none' || window.getComputedStyle(list).display === 'none') {
            return;
        }

        // Clear the list but keep it visible if it will have content
        const hasParticipants = this.presence.size > 0 || this.participants.size > 0;
        
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
            this.updateParticipantStatusIcons(socketId);
        }
        this.updateVideoGridLayout();
    },

    getStatusIconSizeClass(count) {
        if (count <= 2) return 'size-large';
        if (count <= 4) return 'size-medium';
        if (count <= 6) return 'size-compact';
        return 'size-minimal';
    },

    createStatusIcon(type, status, tooltip) {
        const icon = document.createElement('div');
        icon.className = `video-status-icon ${type}-${status}`;
        if (tooltip) {
            icon.setAttribute('title', tooltip);
        }

        let svgContent = '';
        if (type === 'connection') {
            if (status === 'connected') {
                svgContent = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path>
                    </svg>
                `;
            } else {
                svgContent = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path>
                        <line x1="23" y1="1" x2="1" y2="23"></line>
                    </svg>
                `;
            }
        } else if (type === 'mic') {
            if (status === 'on') {
                svgContent = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        <line x1="12" y1="19" x2="12" y2="23"></line>
                        <line x1="8" y1="23" x2="16" y2="23"></line>
                    </svg>
                `;
            } else {
                svgContent = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        <line x1="12" y1="19" x2="12" y2="23"></line>
                        <line x1="8" y1="23" x2="16" y2="23"></line>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                `;
            }
        } else if (type === 'cam') {
            if (status === 'on') {
                svgContent = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                        <circle cx="12" cy="13" r="4"></circle>
                    </svg>
                `;
            } else {
                svgContent = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                        <circle cx="12" cy="13" r="4"></circle>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                `;
            }
        }

        icon.innerHTML = svgContent;
        return icon;
    },

    updateParticipantStatusIcons(socketId) {
        const participant = this.participants.get(socketId);
        if (!participant || !participant.statusIconsElement) {
            return;
        }

        const presenceRecord = this.presence.get(socketId);
        const media = presenceRecord?.media || { cam: false, mic: false };

        const connState = participant.peerConnection ? participant.peerConnection.connectionState : 'new';
        const iceState = participant.peerConnection ? participant.peerConnection.iceConnectionState : 'new';
        const isConnected = connState === 'connected' || iceState === 'connected' || iceState === 'completed';
        const hasProblems = connState === 'disconnected' || connState === 'failed' || iceState === 'failed' || iceState === 'disconnected' || connState === 'connecting';

        // Получаем количество участников для определения размера индикаторов
        const grid = this.elements.videoGrid;
        const tileCount = grid ? grid.querySelectorAll('.video-tile').length : 1;

        const icons = participant.statusIconsElement.querySelectorAll('.video-status-icon');
        if (icons.length >= 3) {
            // Connection icon (first) - показываем только при проблемах
            const connectionIcon = icons[0];
            if (hasProblems) {
                connectionIcon.className = 'video-status-icon disconnected';
                connectionIcon.innerHTML = this.createStatusIcon('connection', 'disconnected', 'Отключено').innerHTML;
                connectionIcon.setAttribute('title', 'Отключено');
                connectionIcon.classList.remove('hide-when-connected');
            } else {
                connectionIcon.classList.add('hide-when-connected');
            }

            // Microphone icon (second)
            const micIcon = icons[1];
            const micStatus = media.mic ? 'on' : 'off';
            micIcon.className = `video-status-icon mic-${micStatus}`;
            micIcon.innerHTML = this.createStatusIcon('mic', micStatus).innerHTML;
            micIcon.setAttribute('title', media.mic ? 'Микрофон включен' : 'Микрофон выключен');

            // Camera icon (third)
            const camIcon = icons[2];
            const camStatus = media.cam ? 'on' : 'off';
            camIcon.className = `video-status-icon cam-${camStatus}`;
            camIcon.innerHTML = this.createStatusIcon('cam', camStatus).innerHTML;
            camIcon.setAttribute('title', media.cam ? 'Камера включена' : 'Камера выключена');
        }
    },

    updateVideoGridLayout() {
        const grid = this.elements.videoGrid;
        if (!grid) return;

        // Count all video tiles (including self)
        const tileCount = grid.querySelectorAll('.video-tile').length;
        
        // Remove all grid classes
        grid.classList.remove('grid-1', 'grid-2', 'grid-3', 'grid-4', 'grid-5', 
                              'grid-6', 'grid-7', 'grid-8', 'grid-9', 'grid-10');
        
        // Apply appropriate grid class based on count
        if (tileCount > 0 && tileCount <= 10) {
            grid.classList.add(`grid-${tileCount}`);
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
        this.updateVideoGridLayout();
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
        if (this.isPublicRoomGuest) {
            this.showScreen('publicRoomJoinScreen');
            if (this.elements.btnPublicRoomJoin) this.elements.btnPublicRoomJoin.disabled = false;
        } else {
            this.showScreen('mainAppScreen');
        }
        if (this.elements.btnConnect) this.elements.btnConnect.disabled = false;
        this.socketChatSetup = false;
        this.socketEventsSetup = false;
        if (!this.isPublicRoomGuest) {
            this.connectSocketForCalls();
            this.attachChatSocketListener();
        }
    },

    showScreen(screenName) {
        ['landingScreen', 'publicRoomJoinScreen', 'mainAppScreen', 'conferenceScreen', 'callScreen'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('active');
        });
        const target = document.getElementById(screenName);
        if (target) target.classList.add('active');
    },

    showPanel(panelId) {
        // Legacy: panels removed in WhatsApp redesign. No-op.
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
                labelElement: null,
                statusIconsElement: null
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
        const pr = this.presence?.get(socketId);
        const dn = pr?.displayName?.trim();
        labelElement.textContent = dn || `Участник ${socketId.substring(0, 8)}`;

        // Status icons container
        const statusIconsElement = document.createElement('div');
        statusIconsElement.className = 'video-status-icons';

        // Connection status icon (скрыт по умолчанию, показывается только при проблемах)
        const connectionIcon = this.createStatusIcon('connection', 'disconnected', 'Отключено');
        connectionIcon.classList.add('hide-when-connected');
        statusIconsElement.appendChild(connectionIcon);

        // Microphone status icon
        const micIcon = this.createStatusIcon('mic', 'off', 'Микрофон выключен');
        statusIconsElement.appendChild(micIcon);

        // Camera status icon
        const camIcon = this.createStatusIcon('cam', 'off', 'Камера выключена');
        statusIconsElement.appendChild(camIcon);

        tileElement.appendChild(videoElement);
        tileElement.appendChild(labelElement);
        tileElement.appendChild(statusIconsElement);
        grid.appendChild(tileElement);
        
        // Update grid layout after adding tile
        this.updateVideoGridLayout();

        return {
            tileElement,
            mediaElement: videoElement,
            labelElement,
            statusIconsElement
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
            const displayName = presenceRecord?.displayName?.trim();
            const baseLabel = displayName || `Участник ${socketId.substring(0, 8)}`;
            const expectedCam = !!presenceRecord?.media?.cam;
            const labelText = (expectedCam && !participant.videoEnabled)
                ? `${baseLabel} (ожидание видео)`
                : baseLabel;

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
            btn.classList.add('muted');
            btn.classList.remove('active');
            this.updateLocalVideoState(false);
            return;
        }

        btn.disabled = !!this.videoToggleInProgress;
        if (this.isVideoEnabled) {
            btn.classList.add('active');
            btn.classList.remove('muted');
            this.updateLocalVideoState(true);
        } else {
            btn.classList.remove('active');
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
            label.textContent = this.displayName || 'Вы';
        }

        // Update local video status icons
        this.updateLocalVideoStatusIcons();
    },

    updateLocalVideoStatusIcons() {
        const tile = this.elements.localVideoTile;
        if (!tile) {
            return;
        }

        // Get or create status icons container for local video
        let statusIconsElement = tile.querySelector('.video-status-icons');
        if (!statusIconsElement) {
            statusIconsElement = document.createElement('div');
            statusIconsElement.className = 'video-status-icons';

            // Connection status icon (скрыт по умолчанию)
            const connectionIcon = this.createStatusIcon('connection', 'connected', 'Подключено');
            connectionIcon.classList.add('hide-when-connected');
            statusIconsElement.appendChild(connectionIcon);

            // Microphone status icon
            const micIcon = this.createStatusIcon('mic', 'off', 'Микрофон выключен');
            statusIconsElement.appendChild(micIcon);

            // Camera status icon
            const camIcon = this.createStatusIcon('cam', 'off', 'Камера выключена');
            statusIconsElement.appendChild(camIcon);

            tile.appendChild(statusIconsElement);
        }

        const selfMedia = this.getLocalMediaState();
        const isConnected = this.socket && this.socket.connected;
        const hasProblems = !isConnected;

        const icons = statusIconsElement.querySelectorAll('.video-status-icon');
        if (icons.length >= 3) {
            // Connection icon - показываем только при проблемах
            const connectionIcon = icons[0];
            if (hasProblems) {
                connectionIcon.className = 'video-status-icon disconnected';
                connectionIcon.innerHTML = this.createStatusIcon('connection', 'disconnected', 'Отключено').innerHTML;
                connectionIcon.setAttribute('title', 'Отключено');
                connectionIcon.classList.remove('hide-when-connected');
            } else {
                connectionIcon.classList.add('hide-when-connected');
            }

            // Microphone icon
            const micIcon = icons[1];
            const micStatus = selfMedia.mic ? 'on' : 'off';
            micIcon.className = `video-status-icon mic-${micStatus}`;
            micIcon.innerHTML = this.createStatusIcon('mic', micStatus).innerHTML;
            micIcon.setAttribute('title', selfMedia.mic ? 'Микрофон включен' : 'Микрофон выключен');

            // Camera icon
            const camIcon = icons[2];
            const camStatus = selfMedia.cam ? 'on' : 'off';
            camIcon.className = `video-status-icon cam-${camStatus}`;
            camIcon.innerHTML = this.createStatusIcon('cam', camStatus).innerHTML;
            camIcon.setAttribute('title', selfMedia.cam ? 'Камера включена' : 'Камера выключена');
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
            this.updateLocalVideoStatusIcons();
        } else {
            localVideo.srcObject = null;
            localVideo.style.visibility = 'hidden';
            this.updateLocalVideoState(false);
            this.updateLocalVideoStatusIcons();
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
