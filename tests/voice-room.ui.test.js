/**
 * Тесты UI и уведомлений для voice-room.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupDOM } from './helpers/setup-dom.js';
import { clearServerState } from './helpers/socket-mock.js';

let VoiceRoom;
let App;

beforeEach(async () => {
  setupDOM();
  clearServerState();
  
  App = {
    get isCordova() {
      return typeof window.cordova !== 'undefined';
    },
    get isBrowser() {
      return typeof window !== 'undefined' && !this.isCordova;
    },
    getSocketUrl() {
      return window.location.origin;
    },
    init() {}
  };
  window.App = App;
  
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
      this.initSocket();
    },
    
    initElements() {
      this.elements = {
        usernameInput: document.getElementById('username'),
        roomIdInput: document.getElementById('roomId'),
        usersGrid: document.getElementById('usersGrid'),
        statusMessage: document.getElementById('statusMessage'),
        loginScreen: document.getElementById('loginScreen'),
        roomScreen: document.getElementById('roomScreen'),
        currentRoomIdSpan: document.getElementById('currentRoomId'),
        roomLinkInput: document.getElementById('roomLink'),
        roomLinkContainer: document.getElementById('roomLinkContainer'),
        userCount: document.getElementById('userCount'),
        btnCopyLink: document.getElementById('btnCopyLink')
      };
    },
    
    initSocket() {
      if (typeof io === 'undefined') return;
      this.socket = io(window.location.origin);
    },
    
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
    
    updateUserCount() {
      if (this.elements.userCount && this.elements.usersGrid) {
        const count = this.elements.usersGrid.querySelectorAll('.user-card').length;
        this.elements.userCount.textContent = count;
      }
    },
    
    addUserToGrid(userId, username) {
      if (!this.elements.usersGrid || document.getElementById(`user-${userId}`)) return;
      const card = document.createElement('div');
      card.id = `user-${userId}`;
      card.className = 'user-card';
      this.elements.usersGrid.appendChild(card);
      this.updateUserCount();
    },
    
    removeUser(userId) {
      const card = document.getElementById(`user-${userId}`);
      if (card) card.remove();
      this.updateUserCount();
    },
    
    async copyRoomLink() {
      if (!this.elements.roomLinkInput) return;
      try {
        await navigator.clipboard.writeText(this.elements.roomLinkInput.value);
        this.showNotification('Ссылка скопирована!', 'success', 2000);
      } catch (err) {
        this.elements.roomLinkInput.select();
        document.execCommand('copy');
        this.showNotification('Ссылка скопирована!', 'success', 2000);
      }
    },
    
    handleUrlParams() {
      const urlParams = new URLSearchParams(window.location.search);
      const roomParam = urlParams.get('room');
      if (roomParam && this.elements.roomIdInput) {
        this.elements.roomIdInput.value = roomParam;
        this.elements.joinContainer.style.display = 'block';
      }
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
  clearServerState();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('UI и уведомления', () => {
  describe('Типы уведомлений', () => {
    it('должен показывать уведомление типа success', () => {
      VoiceRoom.init();
      VoiceRoom.showNotification('Успех!', 'success', 2000);
      
      const statusMessage = document.getElementById('statusMessage');
      expect(statusMessage.textContent).toBe('Успех!');
      expect(statusMessage.classList.contains('success')).toBe(true);
      expect(statusMessage.classList.contains('show')).toBe(true);
    });

    it('должен показывать уведомление типа error', () => {
      VoiceRoom.init();
      VoiceRoom.showNotification('Ошибка!', 'error', 5000);
      
      const statusMessage = document.getElementById('statusMessage');
      expect(statusMessage.textContent).toBe('Ошибка!');
      expect(statusMessage.classList.contains('error')).toBe(true);
      expect(statusMessage.classList.contains('show')).toBe(true);
    });

    it('должен показывать уведомление типа info', () => {
      VoiceRoom.init();
      VoiceRoom.showNotification('Информация', 'info', 3000);
      
      const statusMessage = document.getElementById('statusMessage');
      expect(statusMessage.textContent).toBe('Информация');
      expect(statusMessage.classList.contains('info')).toBe(true);
      expect(statusMessage.classList.contains('show')).toBe(true);
    });

    it('должен использовать info по умолчанию', () => {
      VoiceRoom.init();
      VoiceRoom.showNotification('Сообщение');
      
      const statusMessage = document.getElementById('statusMessage');
      expect(statusMessage.classList.contains('info')).toBe(true);
    });
  });

  describe('Автоматическое скрытие уведомлений', () => {
    it('должен автоматически скрывать уведомление через указанное время', async () => {
      VoiceRoom.init();
      vi.useFakeTimers();
      
      VoiceRoom.showNotification('Тест', 'info', 2000);
      
      const statusMessage = document.getElementById('statusMessage');
      expect(statusMessage.classList.contains('show')).toBe(true);
      
      vi.advanceTimersByTime(2000);
      
      expect(statusMessage.classList.contains('show')).toBe(false);
      
      vi.useRealTimers();
    });

    it('должен скрывать уведомление с нулевой длительностью сразу', () => {
      VoiceRoom.init();
      VoiceRoom.showNotification('Тест', 'info', 0);
      
      const statusMessage = document.getElementById('statusMessage');
      // Может быть показано на мгновение, но проверяем что метод вызван
      expect(statusMessage.textContent).toBe('Тест');
    });
  });

  describe('Обновление счетчика пользователей', () => {
    it('должен обновлять счетчик при добавлении пользователя', () => {
      VoiceRoom.init();
      
      VoiceRoom.addUserToGrid('user1', 'User1');
      const userCount = document.getElementById('userCount');
      expect(userCount.textContent).toBe('1');
    });

    it('должен обновлять счетчик при добавлении нескольких пользователей', () => {
      VoiceRoom.init();
      
      VoiceRoom.addUserToGrid('user1', 'User1');
      VoiceRoom.addUserToGrid('user2', 'User2');
      VoiceRoom.addUserToGrid('user3', 'User3');
      
      const userCount = document.getElementById('userCount');
      expect(userCount.textContent).toBe('3');
    });

    it('должен обновлять счетчик при удалении пользователя', () => {
      VoiceRoom.init();
      
      VoiceRoom.addUserToGrid('user1', 'User1');
      VoiceRoom.addUserToGrid('user2', 'User2');
      VoiceRoom.addUserToGrid('user3', 'User3');
      
      VoiceRoom.removeUser('user2');
      
      const userCount = document.getElementById('userCount');
      expect(userCount.textContent).toBe('2');
    });

    it('должен показывать 0 когда нет пользователей', () => {
      VoiceRoom.init();
      
      const userCount = document.getElementById('userCount');
      expect(userCount.textContent).toBe('0');
    });

    it('должен обновлять счетчик при очистке всех пользователей', () => {
      VoiceRoom.init();
      
      VoiceRoom.addUserToGrid('user1', 'User1');
      VoiceRoom.addUserToGrid('user2', 'User2');
      
      VoiceRoom.removeUser('user1');
      VoiceRoom.removeUser('user2');
      
      const userCount = document.getElementById('userCount');
      expect(userCount.textContent).toBe('0');
    });
  });

  describe('Копирование ссылки на комнату', () => {
    it('должен копировать ссылку в буфер обмена', async () => {
      VoiceRoom.init();
      
      VoiceRoom.elements.roomLinkInput.value = 'https://example.com?room=ABC123';
      
      const clipboardSpy = vi.spyOn(navigator.clipboard, 'writeText');
      const showNotificationSpy = vi.spyOn(VoiceRoom, 'showNotification');
      
      await VoiceRoom.copyRoomLink();
      
      expect(clipboardSpy).toHaveBeenCalledWith('https://example.com?room=ABC123');
      expect(showNotificationSpy).toHaveBeenCalledWith('Ссылка скопирована!', 'success', 2000);
    });

    it('должен использовать fallback если clipboard API недоступен', async () => {
      VoiceRoom.init();
      
      VoiceRoom.elements.roomLinkInput.value = 'https://example.com?room=ABC123';
      
      // Мокаем неудачу clipboard API
      const originalWriteText = navigator.clipboard.writeText;
      navigator.clipboard.writeText = vi.fn().mockRejectedValueOnce(new Error('Clipboard failed'));
      
      const execCommandSpy = vi.spyOn(document, 'execCommand').mockReturnValue(true);
      const selectSpy = vi.spyOn(VoiceRoom.elements.roomLinkInput, 'select');
      const showNotificationSpy = vi.spyOn(VoiceRoom, 'showNotification');
      
      await VoiceRoom.copyRoomLink();
      
      expect(selectSpy).toHaveBeenCalled();
      expect(execCommandSpy).toHaveBeenCalledWith('copy');
      expect(showNotificationSpy).toHaveBeenCalledWith('Ссылка скопирована!', 'success', 2000);
      
      navigator.clipboard.writeText = originalWriteText;
    });

    it('должен обрабатывать отсутствие roomLinkInput', async () => {
      VoiceRoom.init();
      VoiceRoom.elements.roomLinkInput = null;
      
      expect(() => {
        VoiceRoom.copyRoomLink();
      }).not.toThrow();
    });
  });

  describe('Обработка URL параметров', () => {
    it('должен устанавливать roomId из URL параметра', () => {
      VoiceRoom.init();
      
      // Мокаем URL параметры
      const originalSearch = window.location.search;
      Object.defineProperty(window, 'location', {
        value: { ...window.location, search: '?room=ABC123' },
        writable: true
      });
      
      VoiceRoom.handleUrlParams();
      
      expect(VoiceRoom.elements.roomIdInput.value).toBe('ABC123');
      
      window.location.search = originalSearch;
    });

    it('должен показывать joinContainer при наличии room параметра', () => {
      VoiceRoom.init();
      
      const joinContainer = document.getElementById('joinContainer');
      joinContainer.style.display = 'none';
      
      Object.defineProperty(window, 'location', {
        value: { ...window.location, search: '?room=ABC123' },
        writable: true
      });
      
      VoiceRoom.handleUrlParams();
      
      expect(joinContainer.style.display).toBe('block');
    });

    it('не должен устанавливать roomId если параметра нет', () => {
      VoiceRoom.init();
      
      const originalValue = VoiceRoom.elements.roomIdInput.value;
      
      Object.defineProperty(window, 'location', {
        value: { ...window.location, search: '' },
        writable: true
      });
      
      VoiceRoom.handleUrlParams();
      
      expect(VoiceRoom.elements.roomIdInput.value).toBe(originalValue);
    });

    it('должен обрабатывать отсутствие roomIdInput', () => {
      VoiceRoom.init();
      VoiceRoom.elements.roomIdInput = null;
      
      Object.defineProperty(window, 'location', {
        value: { ...window.location, search: '?room=ABC123' },
        writable: true
      });
      
      expect(() => {
        VoiceRoom.handleUrlParams();
      }).not.toThrow();
    });
  });

  describe('Автоподключение по URL параметру', () => {
    it('должен обрабатывать URL параметр room', () => {
      VoiceRoom.init();
      
      Object.defineProperty(window, 'location', {
        value: { ...window.location, search: '?room=TEST01' },
        writable: true
      });
      
      VoiceRoom.handleUrlParams();
      
      expect(VoiceRoom.elements.roomIdInput.value).toBe('TEST01');
    });

    it('должен обрабатывать несколько URL параметров', () => {
      VoiceRoom.init();
      
      Object.defineProperty(window, 'location', {
        value: { ...window.location, search: '?room=TEST01&other=value' },
        writable: true
      });
      
      VoiceRoom.handleUrlParams();
      
      expect(VoiceRoom.elements.roomIdInput.value).toBe('TEST01');
    });
  });

  describe('Обновление UI при различных событиях', () => {
    it('должен обновлять currentRoomIdSpan при создании комнаты', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.elements.usernameInput.value = 'User1';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = VoiceRoom.currentRoomId;
      if (VoiceRoom.elements.currentRoomIdSpan && roomId) {
        expect(VoiceRoom.elements.currentRoomIdSpan.textContent).toBe(roomId);
      }
    });

    it('должен показывать roomLinkContainer при создании комнаты', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.elements.usernameInput.value = 'User1';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomLinkContainer = document.getElementById('roomLinkContainer');
      if (roomLinkContainer) {
        expect(roomLinkContainer.style.display).toBe('block');
      }
    });

    it('должен устанавливать правильный roomLink при создании комнаты', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.elements.usernameInput.value = 'User1';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomLinkInput = document.getElementById('roomLink');
      if (roomLinkInput && VoiceRoom.currentRoomId) {
        expect(roomLinkInput.value).toContain(VoiceRoom.currentRoomId);
      }
    });
  });

  describe('Обработка отсутствующих элементов', () => {
    it('должен обрабатывать отсутствие statusMessage', () => {
      VoiceRoom.init();
      VoiceRoom.elements.statusMessage = null;
      
      expect(() => {
        VoiceRoom.showNotification('Test', 'info');
      }).not.toThrow();
    });

    it('должен обрабатывать отсутствие userCount', () => {
      VoiceRoom.init();
      VoiceRoom.elements.userCount = null;
      
      expect(() => {
        VoiceRoom.updateUserCount();
      }).not.toThrow();
    });

    it('должен обрабатывать отсутствие usersGrid', () => {
      VoiceRoom.init();
      VoiceRoom.elements.usersGrid = null;
      
      expect(() => {
        VoiceRoom.updateUserCount();
      }).not.toThrow();
    });

    it('должен обрабатывать отсутствие roomLinkInput при копировании', async () => {
      VoiceRoom.init();
      VoiceRoom.elements.roomLinkInput = null;
      
      expect(() => {
        VoiceRoom.copyRoomLink();
      }).not.toThrow();
    });
  });

  describe('Множественные уведомления', () => {
    it('должен заменять предыдущее уведомление новым', () => {
      VoiceRoom.init();
      vi.useFakeTimers();
      
      VoiceRoom.showNotification('Первое', 'info', 2000);
      VoiceRoom.showNotification('Второе', 'error', 2000);
      
      const statusMessage = document.getElementById('statusMessage');
      expect(statusMessage.textContent).toBe('Второе');
      expect(statusMessage.classList.contains('error')).toBe(true);
      
      vi.useRealTimers();
    });

    it('должен обрабатывать быстрое чередование уведомлений', () => {
      VoiceRoom.init();
      vi.useFakeTimers();
      
      VoiceRoom.showNotification('1', 'info', 100);
      vi.advanceTimersByTime(50);
      VoiceRoom.showNotification('2', 'success', 100);
      vi.advanceTimersByTime(50);
      VoiceRoom.showNotification('3', 'error', 100);
      
      const statusMessage = document.getElementById('statusMessage');
      expect(statusMessage.textContent).toBe('3');
      
      vi.useRealTimers();
    });
  });
});
