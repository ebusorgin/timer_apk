/**
 * Тесты для функционала статуса микрофона у собеседников
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupDOM } from './helpers/setup-dom.js';
import { clearServerState, serverState } from './helpers/socket-mock.js';
import { mockGetUserMedia } from './helpers/webrtc-mock.js';

// Загружаем модули
let VoiceRoom;
let App;

beforeEach(async () => {
  setupDOM();
  clearServerState();
  
  // Создаем модуль App
  App = {
    get isCordova() {
      return typeof window.cordova !== 'undefined';
    },
    get isBrowser() {
      return typeof window !== 'undefined' && !this.isCordova;
    },
    getSocketUrl() {
      if (typeof window !== 'undefined') {
        return window.location.origin;
      }
      return 'http://localhost:3000';
    },
    init() {}
  };
  window.App = App;
  
  // Создаем VoiceRoom на основе реального кода
  VoiceRoom = {
    socket: null,
    localStream: null,
    peers: new Map(),
    currentRoomId: null,
    myUserId: null,
    myUsername: null,
    audioContext: null,
    analyser: null,
    connectionStatus: 'disconnected',
    elements: {},
    
    init() {
      this.initElements();
      this.loadSavedUsername();
      this.setupEventListeners();
      this.initSocket();
    },
    
    initElements() {
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
    },
    
    loadSavedUsername() {},
    
    setupEventListeners() {},
    
    sanitizeString(str) {
      if (typeof str !== 'string') return '';
      return str.replace(/[<>]/g, '').trim().substring(0, 20);
    },
    
    showNotification(message, type = 'info', duration = 3000) {},
    
    initSocket() {
      if (typeof io === 'undefined') return;
      this.socket = io(window.location.origin);
      this.setupSocketEvents();
    },
    
    setupSocketEvents() {
      if (!this.socket) return;
      this.socket.on('connect', () => {
        this.connectionStatus = 'connected';
      });
      this.socket.on('user-joined', ({ userId, username }) => {
        this.addUserToGrid(userId, username);
      });
      this.socket.on('user-left', (userId) => {
        this.removeUser(userId);
      });
      this.socket.on('microphone-status', ({ userId, enabled }) => {
        this.updateMicrophoneStatusUI(userId, enabled);
      });
      this.socket.on('request-microphone-status', () => {
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
    },
    
    async createRoom() {
      const username = this.sanitizeString(this.elements.usernameInput.value);
      if (!username) return;
      this.myUsername = username;
      this.socket.emit('create-room', { username }, (response) => {
        if (response.error) return;
        this.currentRoomId = response.roomId;
        this.myUserId = response.userId;
        this.initMedia().then(() => {
          this.addUserToGrid(this.myUserId, username, true);
          this.showRoomScreen();
        });
      });
    },
    
    async joinExistingRoom() {
      const roomId = this.elements.roomIdInput.value.trim().toUpperCase();
      const username = this.sanitizeString(this.elements.usernameInput.value);
      if (!roomId || !username) return;
      this.myUsername = username;
      this.currentRoomId = roomId;
      this.socket.emit('join-room', { roomId, username }, async (response) => {
        if (response.error) return;
        this.myUserId = response.userId;
        await this.initMedia();
        this.addUserToGrid(this.myUserId, username, true);
        if (response.users) {
          response.users.forEach(user => {
            this.addUserToGrid(user.userId, user.username);
            // Запрашиваем статус микрофона у существующих участников
            if (this.socket && this.socket.connected) {
              this.socket.emit('request-microphone-status', {
                roomId: this.currentRoomId,
                targetUserId: user.userId
              });
            }
          });
        }
        this.showRoomScreen();
      });
    },
    
    async initMedia() {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
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
    
    addUserToGrid(userId, username, isMyself = false) {
      if (!this.elements.usersGrid || document.getElementById(`user-${userId}`)) return;
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
      
      card.appendChild(avatar);
      card.appendChild(name);
      card.appendChild(status);
      
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
    
    removeUser(userId) {
      const card = document.getElementById(`user-${userId}`);
      if (card) card.remove();
      this.updateUserCount();
    },
    
    showRoomScreen() {
      if (this.elements.loginScreen) {
        this.elements.loginScreen.classList.remove('active');
      }
      if (this.elements.roomScreen) {
        this.elements.roomScreen.classList.add('active');
      }
    },
    
    leaveRoom() {
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
      }
      if (this.socket && this.currentRoomId) {
        this.socket.emit('leave-room', { roomId: this.currentRoomId });
      }
      this.currentRoomId = null;
      this.myUserId = null;
    }
  };
  
  window.VoiceRoom = VoiceRoom;
  
  await new Promise(resolve => {
    const checkIO = () => {
      if (typeof io !== 'undefined') {
        resolve();
      } else {
        setTimeout(checkIO, 10);
      }
    };
    checkIO();
  });
});

afterEach(() => {
  if (VoiceRoom) {
    VoiceRoom.leaveRoom();
  }
  vi.clearAllMocks();
});

describe('Статус микрофона у собеседников', () => {
  describe('Отправка статуса микрофона', () => {
    it('должен отправлять событие microphone-status при переключении микрофона', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.elements.usernameInput.value = 'TestUser';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const emitSpy = vi.spyOn(VoiceRoom.socket, 'emit');
      
      VoiceRoom.toggleMicrophone();
      
      expect(emitSpy).toHaveBeenCalledWith('microphone-status', expect.objectContaining({
        roomId: VoiceRoom.currentRoomId,
        enabled: expect.any(Boolean),
        userId: VoiceRoom.myUserId
      }));
    });
    
    it('должен отправлять правильное значение enabled при включении микрофона', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.elements.usernameInput.value = 'TestUser';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      // Выключаем микрофон после создания комнаты
      VoiceRoom.localStream.getAudioTracks()[0].enabled = false;
      
      // Очищаем spy после создания комнаты (там тоже отправляется статус)
      const emitSpy = vi.spyOn(VoiceRoom.socket, 'emit');
      emitSpy.mockClear();
      
      // Переключаем микрофон - теперь он должен включиться (стать true)
      VoiceRoom.toggleMicrophone();
      
      expect(emitSpy).toHaveBeenCalledWith('microphone-status', expect.objectContaining({
        enabled: true  // После переключения с false должно стать true
      }));
    });
    
    it('должен отправлять правильное значение enabled при выключении микрофона', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.elements.usernameInput.value = 'TestUser';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const emitSpy = vi.spyOn(VoiceRoom.socket, 'emit');
      
      VoiceRoom.toggleMicrophone();
      
      expect(emitSpy).toHaveBeenCalledWith('microphone-status', expect.objectContaining({
        enabled: false
      }));
    });
    
    it('не должен отправлять событие если нет подключения к серверу', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.currentRoomId = null;
      
      const emitSpy = vi.spyOn(VoiceRoom.socket, 'emit');
      
      VoiceRoom.toggleMicrophone();
      
      expect(emitSpy).not.toHaveBeenCalledWith('microphone-status', expect.anything());
    });
  });
  
  describe('Получение статуса микрофона', () => {
    it('должен обрабатывать событие microphone-status от других участников', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      VoiceRoom.elements.usernameInput.value = 'TestUser';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const otherUserId = 'other-user-123';
      VoiceRoom.addUserToGrid(otherUserId, 'OtherUser', false);
      
      // Эмулируем получение события от другого пользователя
      const handlers = VoiceRoom.socket._eventHandlers.get('microphone-status');
      if (handlers) {
        handlers.forEach(handler => handler({ userId: otherUserId, enabled: false }));
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const card = document.getElementById(`user-${otherUserId}`);
      expect(card).toBeTruthy();
      expect(card.classList.contains('microphone-muted')).toBe(true);
      expect(card.classList.contains('microphone-active')).toBe(false);
      
      const micIcon = card.querySelector('.microphone-status-icon');
      expect(micIcon).toBeTruthy();
      expect(micIcon.textContent).toBe(' 🔇');
    });
    
    it('должен обновлять UI при получении статуса микрофона включен', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      VoiceRoom.elements.usernameInput.value = 'TestUser';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const otherUserId = 'other-user-123';
      VoiceRoom.addUserToGrid(otherUserId, 'OtherUser', false);
      
      // Сначала выключаем микрофон
      const handlers = VoiceRoom.socket._eventHandlers.get('microphone-status');
      if (handlers) {
        handlers.forEach(handler => handler({ userId: otherUserId, enabled: false }));
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Затем включаем
      if (handlers) {
        handlers.forEach(handler => handler({ userId: otherUserId, enabled: true }));
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const card = document.getElementById(`user-${otherUserId}`);
      expect(card.classList.contains('microphone-muted')).toBe(false);
      expect(card.classList.contains('microphone-active')).toBe(true);
      
      const micIcon = card.querySelector('.microphone-status-icon');
      expect(micIcon.textContent).toBe(' 🎤');
    });
  });
  
  describe('Визуальное отображение статуса', () => {
    it('должен создавать иконку статуса микрофона при добавлении пользователя', async () => {
      VoiceRoom.init();
      VoiceRoom.initElements();
      
      VoiceRoom.addUserToGrid('user123', 'TestUser', false);
      
      const card = document.getElementById('user-user123');
      const micIcon = card.querySelector('.microphone-status-icon');
      
      expect(micIcon).toBeTruthy();
      expect(micIcon.textContent).toBe(' 🎤');
      expect(micIcon.title).toBe('Микрофон включен');
    });
    
    it('должен обновлять иконку при изменении статуса микрофона', async () => {
      VoiceRoom.init();
      VoiceRoom.initElements();
      
      const userId = 'user123';
      VoiceRoom.addUserToGrid(userId, 'TestUser', false);
      
      VoiceRoom.updateMicrophoneStatusUI(userId, false);
      
      const card = document.getElementById(`user-${userId}`);
      const micIcon = card.querySelector('.microphone-status-icon');
      
      expect(micIcon.textContent).toBe(' 🔇');
      expect(micIcon.title).toBe('Микрофон выключен');
      expect(card.classList.contains('microphone-muted')).toBe(true);
    });
    
    it('должен добавлять класс microphone-active при включенном микрофоне', async () => {
      VoiceRoom.init();
      VoiceRoom.initElements();
      
      const userId = 'user123';
      VoiceRoom.addUserToGrid(userId, 'TestUser', false);
      
      VoiceRoom.updateMicrophoneStatusUI(userId, true);
      
      const card = document.getElementById(`user-${userId}`);
      expect(card.classList.contains('microphone-active')).toBe(true);
      expect(card.classList.contains('microphone-muted')).toBe(false);
    });
    
    it('должен добавлять класс microphone-muted при выключенном микрофоне', async () => {
      VoiceRoom.init();
      VoiceRoom.initElements();
      
      const userId = 'user123';
      VoiceRoom.addUserToGrid(userId, 'TestUser', false);
      
      VoiceRoom.updateMicrophoneStatusUI(userId, false);
      
      const card = document.getElementById(`user-${userId}`);
      expect(card.classList.contains('microphone-muted')).toBe(true);
      expect(card.classList.contains('microphone-active')).toBe(false);
    });
    
    it('должен устанавливать правильный статус для себя при добавлении в сетку', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.elements.usernameInput.value = 'TestUser';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const myCard = document.getElementById(`user-${VoiceRoom.myUserId}`);
      const micIcon = myCard.querySelector('.microphone-status-icon');
      
      expect(micIcon).toBeTruthy();
      // Статус должен соответствовать реальному состоянию трека
      const enabled = VoiceRoom.localStream.getAudioTracks()[0].enabled;
      expect(micIcon.textContent).toBe(enabled ? ' 🎤' : ' 🔇');
    });
  });
  
  describe('Запрос статуса микрофона', () => {
    it('должен отправлять статус микрофона при получении запроса', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.elements.usernameInput.value = 'TestUser';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const emitSpy = vi.spyOn(VoiceRoom.socket, 'emit');
      
      // Эмулируем получение запроса статуса
      const handlers = VoiceRoom.socket._eventHandlers.get('request-microphone-status');
      if (handlers) {
        handlers.forEach(handler => handler({}));
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(emitSpy).toHaveBeenCalledWith('microphone-status', expect.objectContaining({
        roomId: VoiceRoom.currentRoomId,
        enabled: expect.any(Boolean),
        userId: VoiceRoom.myUserId
      }));
    });
    
    it('не должен отправлять статус если нет localStream', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.elements.usernameInput.value = 'TestUser';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      VoiceRoom.localStream = null;
      
      const emitSpy = vi.spyOn(VoiceRoom.socket, 'emit');
      
      // Эмулируем получение запроса статуса
      const handlers = VoiceRoom.socket._eventHandlers.get('request-microphone-status');
      if (handlers) {
        handlers.forEach(handler => handler({}));
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(emitSpy).not.toHaveBeenCalledWith('microphone-status', expect.anything());
    });
  });
  
  describe('Интеграционные тесты', () => {
    it('должен синхронизировать статус микрофона между двумя пользователями', async () => {
      // Создаем первый клиент
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      // Первый создает комнату
      VoiceRoom.elements.usernameInput.value = 'User1';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = VoiceRoom.currentRoomId;
      const user1Id = VoiceRoom.myUserId;
      
      // Добавляем второго пользователя в сетку (эмулируем присоединение)
      const user2Id = 'user2-123';
      VoiceRoom.addUserToGrid(user2Id, 'User2', false);
      
      // Первый пользователь переключает микрофон
      const initialEnabled = VoiceRoom.localStream.getAudioTracks()[0].enabled;
      VoiceRoom.toggleMicrophone();
      
      // После переключения enabled должен быть противоположным
      const newEnabled = !initialEnabled;
      
      // Эмулируем получение события microphone-status для второго пользователя
      const handlers = VoiceRoom.socket._eventHandlers.get('microphone-status');
      if (handlers) {
        handlers.forEach(handler => handler({ 
          userId: user1Id, 
          enabled: newEnabled 
        }));
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Проверяем что UI обновился для второго пользователя
      const card = document.getElementById(`user-${user1Id}`);
      expect(card).toBeTruthy();
      // Если микрофон выключен, должен быть класс microphone-muted
      expect(card.classList.contains('microphone-muted')).toBe(!newEnabled);
      expect(card.classList.contains('microphone-active')).toBe(newEnabled);
      
      const micIcon = card.querySelector('.microphone-status-icon');
      expect(micIcon).toBeTruthy();
      expect(micIcon.textContent).toBe(newEnabled ? ' 🎤' : ' 🔇');
    });
  });
});

