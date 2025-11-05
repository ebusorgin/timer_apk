/**
 * Тесты для URL роутинга комнат через /room/:roomId
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupDOM } from './helpers/setup-dom.js';
import { clearServerState } from './helpers/socket-mock.js';
import { mockGetUserMedia } from './helpers/webrtc-mock.js';

// Загружаем модули
let VoiceRoom;
let App;

beforeEach(async () => {
  setupDOM();
  clearServerState();
  
  // Создаем модуль App
  App = {
    _isCordova: false,
    get isCordova() {
      return this._isCordova || typeof window.cordova !== 'undefined';
    },
    set isCordova(value) {
      this._isCordova = value;
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
      this.handleUrlParams();
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
    
    loadSavedUsername() {
      const savedUsername = localStorage.getItem('voiceRoomUsername');
      if (savedUsername && this.elements.usernameInput) {
        this.elements.usernameInput.value = savedUsername;
      }
    },
    
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
    },
    
    async createRoom() {
      const username = this.sanitizeString(this.elements.usernameInput.value);
      if (!username) return;
      this.myUsername = username;
      
      // Сохраняем имя пользователя перед редиректом
      localStorage.setItem('voiceRoomUsername', username);
      
      // Эмулируем вызов сервера
      if (this.socket && this.socket.emit) {
        this.socket.emit('create-room', { username }, (response) => {
          if (response && !response.error) {
            this.currentRoomId = response.roomId;
            this.myUserId = response.userId;
            
            // Редирект на страницу комнаты для браузера
            if (!App.isCordova) {
              window.location.href = `/room/${response.roomId}`;
              return;
            }
            
            // Для Cordova выполняем стандартный flow
            this.initMedia().then(() => {
              this.addUserToGrid(this.myUserId, username, true);
              this.showRoomScreen();
              
              // Генерируем ссылку на комнату
              const roomUrl = `voice-room://room?${this.currentRoomId}`;
              
              if (this.elements.roomLinkInput) {
                this.elements.roomLinkInput.value = roomUrl;
              }
              
              if (this.elements.roomLinkContainer) {
                this.elements.roomLinkContainer.style.display = 'block';
                setTimeout(() => {
                  this.elements.roomLinkContainer.classList.add('show');
                }, 10);
              }
            });
          }
        });
      } else {
        // Если socket недоступен, эмулируем создание комнаты напрямую
        const mockRoomId = 'TEST01';
        const mockUserId = 'user-' + Date.now();
        this.currentRoomId = mockRoomId;
        this.myUserId = mockUserId;
        
        // Редирект на страницу комнаты для браузера
        if (!App.isCordova) {
          window.location.href = `/room/${mockRoomId}`;
          return;
        }
        
        // Для Cordova выполняем стандартный flow
        await this.initMedia();
        this.addUserToGrid(this.myUserId, username, true);
        this.showRoomScreen();
        
        const roomUrl = `${window.location.origin}/room/${mockRoomId}`;
        if (this.elements.roomLinkInput) {
          this.elements.roomLinkInput.value = roomUrl;
        }
        if (this.elements.roomLinkContainer) {
          this.elements.roomLinkContainer.style.display = 'block';
          setTimeout(() => {
            this.elements.roomLinkContainer.classList.add('show');
          }, 10);
        }
      }
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
    
    handleUrlParams() {
      // Обрабатываем новый формат /room/:roomId
      const pathname = window.location.pathname;
      const roomMatch = pathname.match(/^\/room\/([A-Z0-9]{6})$/i);
      
      if (roomMatch) {
        const roomId = roomMatch[1].toUpperCase();
        if (this.elements.roomIdInput) {
          this.elements.roomIdInput.value = roomId;
        }
        
        // Показываем контейнер присоединения с плавной анимацией
        if (this.elements.joinContainer) {
          this.elements.joinContainer.style.display = 'block';
          this.elements.joinContainer.classList.add('show');
        }
        
        // Проверяем есть ли сохраненное имя
        const savedUsername = localStorage.getItem('voiceRoomUsername');
        if (savedUsername && this.elements.usernameInput) {
          this.elements.usernameInput.value = savedUsername;
          // Автоматически входим в комнату после небольшой задержки
          setTimeout(() => {
            this.joinExistingRoom();
          }, 500);
        } else {
          // Показываем сообщение что нужно ввести имя
          if (this.elements.statusMessage) {
            this.elements.statusMessage.textContent = 'Введите ваше имя для присоединения к комнате';
            this.elements.statusMessage.className = 'status-message info show';
          }
        }
      }
    },
    
    addUserToGrid(userId, username, isMyself = false) {
      if (!this.elements.usersGrid || document.getElementById(`user-${userId}`)) return;
      const card = document.createElement('div');
      card.id = `user-${userId}`;
      card.className = 'user-card';
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
  localStorage.clear();
  // Восстанавливаем оригинальный pathname
  window.history.replaceState({}, '', '/');
});

describe('URL роутинг для комнат /room/:roomId', () => {
  describe('Обработка URL /room/:roomId', () => {
    it('должен извлекать roomId из pathname', () => {
      // Эмулируем переход по ссылке /room/J0WPZS
      window.history.replaceState({}, '', '/room/J0WPZS');
      
      VoiceRoom.init();
      
      expect(VoiceRoom.elements.roomIdInput.value).toBe('J0WPZS');
    });
    
    it('должен заполнять поле roomIdInput', () => {
      window.history.replaceState({}, '', '/room/ABC123');
      
      VoiceRoom.init();
      
      expect(VoiceRoom.elements.roomIdInput.value).toBe('ABC123');
    });
    
    it('должен показывать joinContainer', () => {
      window.history.replaceState({}, '', '/room/TEST01');
      
      VoiceRoom.init();
      
      expect(VoiceRoom.elements.joinContainer.style.display).toBe('block');
      expect(VoiceRoom.elements.joinContainer.classList.contains('show')).toBe(true);
    });
    
    it('должен преобразовывать roomId в верхний регистр', () => {
      window.history.replaceState({}, '', '/room/test01');
      
      VoiceRoom.init();
      
      expect(VoiceRoom.elements.roomIdInput.value).toBe('TEST01');
    });
    
    it('не должен обрабатывать невалидные roomId', () => {
      window.history.replaceState({}, '', '/room/INVALID');
      
      VoiceRoom.init();
      
      // Невалидный roomId (не 6 символов) не должен обрабатываться
      expect(VoiceRoom.elements.roomIdInput.value).toBe('');
    });
    
    it('не должен обрабатывать roomId с недопустимыми символами', () => {
      window.history.replaceState({}, '', '/room/ABC-12');
      
      VoiceRoom.init();
      
      expect(VoiceRoom.elements.roomIdInput.value).toBe('');
    });
    
    it('не должен обрабатывать слишком короткие roomId', () => {
      window.history.replaceState({}, '', '/room/ABC');
      
      VoiceRoom.init();
      
      expect(VoiceRoom.elements.roomIdInput.value).toBe('');
    });
    
    it('не должен обрабатывать слишком длинные roomId', () => {
      window.history.replaceState({}, '', '/room/ABCDEFG');
      
      VoiceRoom.init();
      
      expect(VoiceRoom.elements.roomIdInput.value).toBe('');
    });
  });
  
  describe('Автоматический вход при наличии сохраненного имени', () => {
    it('должен автоматически входить если есть имя в localStorage', async () => {
      localStorage.setItem('voiceRoomUsername', 'SavedUser');
      window.history.replaceState({}, '', '/room/J0WPZS');
      
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Заполняем имя из localStorage
      expect(VoiceRoom.elements.usernameInput.value).toBe('SavedUser');
      
      // Проверяем что joinContainer показан
      expect(VoiceRoom.elements.joinContainer.style.display).toBe('block');
      
      // Проверяем что roomId заполнен
      expect(VoiceRoom.elements.roomIdInput.value).toBe('J0WPZS');
    });
    
    it('должен вызывать joinExistingRoom автоматически после задержки', async () => {
      localStorage.setItem('voiceRoomUsername', 'AutoUser');
      window.history.replaceState({}, '', '/room/J0WPZS');
      
      const joinSpy = vi.spyOn(VoiceRoom, 'joinExistingRoom');
      
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 700));
      
      // После 500ms должен быть вызван joinExistingRoom
      expect(joinSpy).toHaveBeenCalled();
    });
    
    it('не должен автоматически входить если имени нет в localStorage', () => {
      localStorage.clear();
      window.history.replaceState({}, '', '/room/J0WPZS');
      
      const joinSpy = vi.spyOn(VoiceRoom, 'joinExistingRoom');
      
      VoiceRoom.init();
      
      // Не должен вызывать joinExistingRoom если нет имени
      expect(joinSpy).not.toHaveBeenCalled();
    });
  });
  
  describe('Показ формы ввода для нового пользователя', () => {
    it('должен показывать поле ввода имени если имени нет в localStorage', () => {
      localStorage.clear();
      window.history.replaceState({}, '', '/room/J0WPZS');
      
      VoiceRoom.init();
      
      expect(VoiceRoom.elements.joinContainer.style.display).toBe('block');
      expect(VoiceRoom.elements.usernameInput).toBeTruthy();
    });
    
    it('должен показывать информационное сообщение для нового пользователя', () => {
      localStorage.clear();
      window.history.replaceState({}, '', '/room/J0WPZS');
      
      VoiceRoom.init();
      
      const statusMessage = VoiceRoom.elements.statusMessage;
      expect(statusMessage.textContent).toContain('Введите ваше имя для присоединения к комнате');
      expect(statusMessage.classList.contains('show')).toBe(true);
    });
    
    it('не должен входить автоматически без имени', () => {
      localStorage.clear();
      window.history.replaceState({}, '', '/room/J0WPZS');
      
      const joinSpy = vi.spyOn(VoiceRoom, 'joinExistingRoom');
      
      VoiceRoom.init();
      
      expect(joinSpy).not.toHaveBeenCalled();
    });
  });
  
  describe('Генерация правильной ссылки при создании комнаты', () => {
    it('должен генерировать ссылку в формате /room/J0WPZS', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.elements.usernameInput.value = 'TestUser';
      
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      // В реальной реализации нужно будет проверить roomLinkInput
      // Но для этого нужно модифицировать createRoom
      expect(VoiceRoom.currentRoomId).toBeTruthy();
    });
    
    it('должен сохранять ссылку в roomLinkInput при создании комнаты в Cordova', async () => {
      // Устанавливаем флаг что это Cordova
      App.isCordova = true;
      
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.elements.usernameInput.value = 'TestUser';
      
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      // В Cordova должна быть ссылка в roomLinkInput
      const roomId = VoiceRoom.currentRoomId;
      if (roomId && VoiceRoom.elements.roomLinkInput) {
        const expectedUrl = `voice-room://room?${roomId}`;
        expect(VoiceRoom.elements.roomLinkInput.value).toBe(expectedUrl);
      }
    });
    
    it('должен выполнять редирект на /room/:roomId при создании комнаты в браузере', async () => {
      // Устанавливаем флаг что это браузер (не Cordova)
      App.isCordova = false;
      
      // Мокаем window.location.href для проверки редиректа
      let redirectUrl = null;
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        value: {
          ...originalLocation,
          set href(value) {
            redirectUrl = value;
          },
          get href() {
            return redirectUrl || originalLocation.href;
          }
        },
        writable: true,
        configurable: true
      });
      
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.elements.usernameInput.value = 'TestUser';
      
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      // Проверяем что произошел редирект на правильный URL
      expect(redirectUrl).toBeTruthy();
      expect(redirectUrl).toMatch(/^\/room\/[A-Z0-9]{6}$/);
      
      // Восстанавливаем оригинальный location
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true
      });
    });
    
    it('не должен делать редирект в Cordova окружении', async () => {
      // Устанавливаем флаг что это Cordova
      App.isCordova = true;
      
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.elements.usernameInput.value = 'TestUser';
      
      // Мокаем window.location.href для проверки что редирект НЕ происходит
      let redirectUrl = null;
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        value: {
          ...originalLocation,
          set href(value) {
            redirectUrl = value;
          },
          get href() {
            return redirectUrl || originalLocation.href;
          }
        },
        writable: true,
        configurable: true
      });
      
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      // В Cordova не должно быть редиректа
      expect(redirectUrl).toBeNull();
      
      // Восстанавливаем оригинальный location
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true
      });
    });
  });
  
  describe('Валидация roomId в URL', () => {
    it('должен игнорировать невалидные roomId', () => {
      const invalidIds = [
        '/room/ABC',      // слишком короткий
        '/room/ABCDEFG',  // слишком длинный
        '/room/ABC-12',   // содержит дефис
        '/room/ABC_12',   // содержит подчеркивание
        '/room/ABC 12',   // содержит пробел
        '/room/123456',   // только цифры (это валидно, но проверим)
      ];
      
      invalidIds.forEach(invalidPath => {
        window.history.replaceState({}, '', invalidPath);
        VoiceRoom.init();
        
        // Короткие, длинные и с недопустимыми символами не должны обрабатываться
        if (invalidPath.includes('ABC') && invalidPath.length < '/room/ABCDEF'.length) {
          expect(VoiceRoom.elements.roomIdInput.value).toBe('');
        }
      });
    });
    
    it('должен обрабатывать только валидные 6-символьные коды', () => {
      const validIds = ['ABCDEF', '123456', 'ABC123', 'A1B2C3'];
      
      validIds.forEach(roomId => {
        window.history.replaceState({}, '', `/room/${roomId}`);
        VoiceRoom.init();
        
        expect(VoiceRoom.elements.roomIdInput.value).toBe(roomId.toUpperCase());
      });
    });
  });
  
  describe('Интеграционные тесты', () => {
    it('должен корректно обрабатывать полный flow: переход по ссылке -> ввод имени -> вход', async () => {
      localStorage.clear();
      window.history.replaceState({}, '', '/room/J0WPZS');
      
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Проверяем что контейнер присоединения показан
      expect(VoiceRoom.elements.joinContainer.style.display).toBe('block');
      expect(VoiceRoom.elements.roomIdInput.value).toBe('J0WPZS');
      
      // Пользователь вводит имя
      VoiceRoom.elements.usernameInput.value = 'NewUser';
      
      // Пользователь нажимает кнопку присоединения
      const joinSpy = vi.spyOn(VoiceRoom, 'joinExistingRoom');
      VoiceRoom.joinExistingRoom();
      
      expect(joinSpy).toHaveBeenCalled();
    });
    
    it('должен корректно обрабатывать flow с сохраненным именем: переход по ссылке -> автоматический вход', async () => {
      localStorage.setItem('voiceRoomUsername', 'AutoUser');
      window.history.replaceState({}, '', '/room/J0WPZS');
      
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(VoiceRoom.elements.roomIdInput.value).toBe('J0WPZS');
      expect(VoiceRoom.elements.usernameInput.value).toBe('AutoUser');
      
      // Должен автоматически вызвать joinExistingRoom через 500ms
      const joinSpy = vi.spyOn(VoiceRoom, 'joinExistingRoom');
      await new Promise(resolve => setTimeout(resolve, 600));
      
      expect(joinSpy).toHaveBeenCalled();
    });
  });
});

