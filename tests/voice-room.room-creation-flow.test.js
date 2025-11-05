/**
 * Тесты для полного flow создания комнаты с использованием History API
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupDOM } from './helpers/setup-dom.js';
import { clearServerState, createMockSocketServer } from './helpers/socket-mock.js';
import { mockGetUserMedia } from './helpers/webrtc-mock.js';

// Загружаем модули
let VoiceRoom;
let App;

beforeEach(async () => {
  setupDOM();
  clearServerState();
  mockGetUserMedia();
  
  // Очищаем localStorage и sessionStorage
  localStorage.clear();
  sessionStorage.clear();
  
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
  
  // VoiceRoom создается через script тег в реальном приложении
  // В тестах мы используем мок, который создается через setupDOM
  // Проверяем что VoiceRoom доступен глобально
  if (typeof window.VoiceRoom === 'undefined') {
    // Если VoiceRoom еще не создан, создаем базовый мок
    VoiceRoom = {
      socket: null,
      localStream: null,
      peers: new Map(),
      currentRoomId: null,
      myUserId: null,
      myUsername: null,
      elements: {},
      init() {},
      createRoom() {},
      handleUrlParams() {},
      initMedia() { return Promise.resolve(); },
      showRoomScreen() {},
      addUserToGrid() {}
    };
    window.VoiceRoom = VoiceRoom;
  } else {
    VoiceRoom = window.VoiceRoom;
  }
  
  // Инициализируем VoiceRoom если метод init существует
  if (VoiceRoom.init) {
    VoiceRoom.init();
  }
  
  // Ждем подключения socket
  await new Promise((resolve) => {
    if (VoiceRoom.socket && VoiceRoom.socket.connected) {
      resolve();
    } else {
      VoiceRoom.socket?.once('connect', resolve);
      setTimeout(resolve, 1000); // Таймаут на случай если не подключится
    }
  });
});

afterEach(() => {
  if (VoiceRoom && VoiceRoom.socket) {
    VoiceRoom.socket.disconnect();
  }
  localStorage.clear();
  sessionStorage.clear();
});

describe('Полный flow создания комнаты', () => {
  describe('Создание комнаты с History API', () => {
    it('должен изменить URL через History API при создании комнаты', async () => {
      const initialPathname = window.location.pathname;
      
      // Устанавливаем имя пользователя
      const username = 'TestUser';
      VoiceRoom.elements.usernameInput.value = username;
      
      // Мокаем socket.emit для create-room
      const roomId = 'ABC123';
      const userId = 'user_123';
      vi.spyOn(VoiceRoom.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'create-room' && callback) {
          callback({ roomId, userId });
        }
      });
      
      vi.spyOn(VoiceRoom, 'initMedia').mockResolvedValue(undefined);
      await VoiceRoom.createRoom();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Проверяем, что URL изменился через History API
      expect(window.location.pathname).toBe(`/room/${roomId}`);
      expect(window.location.pathname).not.toBe(initialPathname);
      
      // Проверяем, что socket соединение осталось активным
      expect(VoiceRoom.socket).toBeTruthy();
      expect(VoiceRoom.socket.connected).toBe(true);
    });
    
    it('должен сохранить состояние комнаты в sessionStorage', async () => {
      const username = 'TestUser';
      VoiceRoom.elements.usernameInput.value = username;
      
      const roomId = 'XYZ789';
      const userId = 'user_456';
      vi.spyOn(VoiceRoom.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'create-room' && callback) {
          callback({ roomId, userId });
        }
      });
      
      vi.spyOn(VoiceRoom, 'initMedia').mockResolvedValue(undefined);
      await VoiceRoom.createRoom();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Проверяем, что состояние сохранено в sessionStorage
      const savedData = sessionStorage.getItem('voiceRoomCreatedRoom');
      expect(savedData).toBeTruthy();
      
      const parsedData = JSON.parse(savedData);
      expect(parsedData.roomId).toBe(roomId);
      expect(parsedData.userId).toBe(userId);
      expect(parsedData.username).toBe(username);
      expect(parsedData.timestamp).toBeGreaterThan(0);
    });
    
    it('должен восстановить состояние из sessionStorage при обработке URL', async () => {
      const roomId = 'RESTORE';
      const userId = 'user_restore';
      const username = 'RestoreUser';
      
      // Сохраняем состояние в sessionStorage
      sessionStorage.setItem('voiceRoomCreatedRoom', JSON.stringify({
        roomId,
        userId,
        username,
        timestamp: Date.now()
      }));
      
      // Устанавливаем URL
      window.history.pushState({}, '', `/room/${roomId}`);
      
      // Обрабатываем URL
      VoiceRoom.handleUrlParams();
      
      // Проверяем, что состояние восстановлено
      expect(VoiceRoom.currentRoomId).toBe(roomId);
      expect(VoiceRoom.myUserId).toBe(userId);
      expect(VoiceRoom.myUsername).toBe(username);
      
      // Проверяем, что join-room НЕ был вызван (мы уже в комнате)
      const joinRoomSpy = vi.spyOn(VoiceRoom.socket, 'emit');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const joinRoomCalls = joinRoomSpy.mock.calls.filter(call => call[0] === 'join-room');
      expect(joinRoomCalls.length).toBe(0);
    });
    
    it('должен показать экран комнаты после создания', async () => {
      const username = 'TestUser';
      VoiceRoom.elements.usernameInput.value = username;
      
      const roomId = 'SHOWROOM';
      const userId = 'user_show';
      vi.spyOn(VoiceRoom.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'create-room' && callback) {
          callback({ roomId, userId });
        }
      });
      
      // Мокаем initMedia
      vi.spyOn(VoiceRoom, 'initMedia').mockResolvedValue(undefined);
      
      await VoiceRoom.createRoom();
      
      // Ждем выполнения асинхронных операций
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Проверяем, что экран комнаты показан
      if (VoiceRoom.elements.roomScreen) {
        expect(VoiceRoom.elements.roomScreen.classList.contains('active')).toBe(true);
      }
      if (VoiceRoom.elements.loginScreen) {
        expect(VoiceRoom.elements.loginScreen.classList.contains('active')).toBe(false);
      }
    });
    
    it('должен сохранить socket соединение после изменения URL', async () => {
      const username = 'TestUser';
      VoiceRoom.elements.usernameInput.value = username;
      
      const socketIdBefore = VoiceRoom.socket?.id;
      
      const roomId = 'SOCKET';
      const userId = 'user_socket';
      vi.spyOn(VoiceRoom.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'create-room' && callback) {
          callback({ roomId, userId });
        }
      });
      
      vi.spyOn(VoiceRoom, 'initMedia').mockResolvedValue(undefined);
      await VoiceRoom.createRoom();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Проверяем, что socket соединение сохранилось
      expect(VoiceRoom.socket).toBeTruthy();
      expect(VoiceRoom.socket.connected).toBe(true);
      if (socketIdBefore) {
        expect(VoiceRoom.socket.id).toBe(socketIdBefore);
      }
    });
  });
  
  describe('Восстановление состояния после изменения URL', () => {
    it('должен восстановить состояние если комната была создана менее 30 секунд назад', async () => {
      const roomId = 'RECENT';
      const userId = 'user_recent';
      const username = 'RecentUser';
      
      // Сохраняем свежие данные (1 секунда назад)
      sessionStorage.setItem('voiceRoomCreatedRoom', JSON.stringify({
        roomId,
        userId,
        username,
        timestamp: Date.now() - 1000
      }));
      
      window.history.pushState({}, '', `/room/${roomId}`);
      VoiceRoom.handleUrlParams();
      
      expect(VoiceRoom.currentRoomId).toBe(roomId);
      expect(VoiceRoom.myUserId).toBe(userId);
    });
    
    it('не должен восстанавливать состояние если прошло более 30 секунд', async () => {
      const roomId = 'OLD';
      const userId = 'user_old';
      const username = 'OldUser';
      
      // Сохраняем старые данные (35 секунд назад)
      sessionStorage.setItem('voiceRoomCreatedRoom', JSON.stringify({
        roomId,
        userId,
        username,
        timestamp: Date.now() - 35000
      }));
      
      window.history.pushState({}, '', `/room/${roomId}`);
      VoiceRoom.handleUrlParams();
      
      // sessionStorage должен быть очищен
      expect(sessionStorage.getItem('voiceRoomCreatedRoom')).toBeNull();
    });
    
    it('не должен восстанавливать состояние если roomId не совпадает', async () => {
      const savedRoomId = 'SAVED';
      const currentRoomId = 'CURRENT';
      const userId = 'user_test';
      const username = 'TestUser';
      
      sessionStorage.setItem('voiceRoomCreatedRoom', JSON.stringify({
        roomId: savedRoomId,
        userId,
        username,
        timestamp: Date.now()
      }));
      
      window.history.pushState({}, '', `/room/${currentRoomId}`);
      VoiceRoom.handleUrlParams();
      
      // sessionStorage должен быть очищен
      expect(sessionStorage.getItem('voiceRoomCreatedRoom')).toBeNull();
    });
  });
  
  describe('Интеграционные тесты', () => {
    it('должен выполнить полный flow: создание -> изменение URL -> восстановление состояния', async () => {
      const username = 'FlowUser';
      VoiceRoom.elements.usernameInput.value = username;
      
      const roomId = 'FLOW123';
      const userId = 'user_flow';
      
      vi.spyOn(VoiceRoom.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'create-room' && callback) {
          callback({ roomId, userId });
        }
      });
      
      vi.spyOn(VoiceRoom, 'initMedia').mockResolvedValue(undefined);
      
      // Шаг 1: Создаем комнату
      await VoiceRoom.createRoom();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Проверяем, что URL изменился
      expect(window.location.pathname).toBe(`/room/${roomId}`);
      
      // Проверяем, что состояние сохранено
      const savedData = JSON.parse(sessionStorage.getItem('voiceRoomCreatedRoom'));
      expect(savedData.roomId).toBe(roomId);
      
      // Шаг 2: Симулируем повторную загрузку страницы (очищаем состояние VoiceRoom, но сохраняем sessionStorage)
      VoiceRoom.currentRoomId = null;
      VoiceRoom.myUserId = null;
      VoiceRoom.myUsername = null;
      
      // Шаг 3: Обрабатываем URL (как при загрузке страницы)
      VoiceRoom.handleUrlParams();
      
      // Проверяем, что состояние восстановлено
      expect(VoiceRoom.currentRoomId).toBe(roomId);
      expect(VoiceRoom.myUserId).toBe(userId);
      expect(VoiceRoom.myUsername).toBe(username);
    });
    
    it('должен показать ссылку на комнату после создания', async () => {
      const username = 'LinkUser';
      VoiceRoom.elements.usernameInput.value = username;
      
      const roomId = 'LINK456';
      const userId = 'user_link';
      vi.spyOn(VoiceRoom.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'create-room' && callback) {
          callback({ roomId, userId });
        }
      });
      
      vi.spyOn(VoiceRoom, 'initMedia').mockResolvedValue(undefined);
      
      await VoiceRoom.createRoom();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Проверяем, что ссылка на комнату отображается
      if (VoiceRoom.elements.roomLinkContainer) {
        expect(VoiceRoom.elements.roomLinkContainer.style.display).toBe('block');
      }
      if (VoiceRoom.elements.roomLinkInput) {
        expect(VoiceRoom.elements.roomLinkInput.value).toContain('/room/LINK456');
      }
    });
  });
});

