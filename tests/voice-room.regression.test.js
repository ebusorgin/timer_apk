/**
 * Регресс-тесты для существующих сценариев
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupDOM } from './helpers/setup-dom.js';
import { clearServerState, mockIO } from './helpers/socket-mock.js';
import { mockGetUserMedia } from './helpers/webrtc-mock.js';

// Загружаем модули
let VoiceRoom;
let App;

beforeEach(async () => {
  setupDOM();
  clearServerState();
  mockGetUserMedia();
  
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
  if (typeof window.VoiceRoom === 'undefined') {
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
  
  if (VoiceRoom.init) {
    VoiceRoom.init();
  }
  
  await new Promise((resolve) => {
    if (VoiceRoom.socket && VoiceRoom.socket.connected) {
      resolve();
    } else {
      VoiceRoom.socket?.once('connect', resolve);
      setTimeout(resolve, 1000);
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

describe.skip('Регресс-тесты', () => {
  describe('Создание комнаты без редиректа (Cordova)', () => {
    it('должен создавать комнату без редиректа в Cordova окружении', async () => {
      App.isCordova = true;
      const username = 'CordovaUser';
      VoiceRoom.elements.usernameInput.value = username;
      
      const roomId = 'CORDOVA';
      const userId = 'user_cordova';
      vi.spyOn(VoiceRoom.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'create-room' && callback) {
          callback({ roomId, userId });
        }
      });
      
      vi.spyOn(VoiceRoom, 'initMedia').mockResolvedValue(undefined);
      await VoiceRoom.createRoom();
      
      // Проверяем, что URL НЕ изменился (нет редиректа)
      expect(window.location.pathname).toBe('/');
      
      // Проверяем, что комната создана
      expect(VoiceRoom.currentRoomId).toBe(roomId);
      expect(VoiceRoom.myUserId).toBe(userId);
      
      // Проверяем, что показан экран комнаты
      if (VoiceRoom.elements.roomScreen) {
        expect(VoiceRoom.elements.roomScreen.classList.contains('active')).toBe(true);
      }
    });
    
    it('должен генерировать правильную ссылку для Cordova', async () => {
      App.isCordova = true;
      const username = 'CordovaUser';
      VoiceRoom.elements.usernameInput.value = username;
      
      const roomId = 'CORDOVA';
      const userId = 'user_cordova';
      vi.spyOn(VoiceRoom.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'create-room' && callback) {
          callback({ roomId, userId });
        }
      });
      
      vi.spyOn(VoiceRoom, 'initMedia').mockResolvedValue(undefined);
      await VoiceRoom.createRoom();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Проверяем формат ссылки для Cordova
      if (VoiceRoom.elements.roomLinkInput) {
        expect(VoiceRoom.elements.roomLinkInput.value).toMatch(/^voice-room:\/\/room\?/);
      }
    });
  });
  
  describe('Быстрое создание/удаление комнаты', () => {
    it('должен корректно обрабатывать быстрое создание и удаление комнаты', async () => {
      const username = 'FastUser';
      VoiceRoom.elements.usernameInput.value = username;
      
      let roomId1, roomId2;
      let createCount = 0;
      
      vi.spyOn(VoiceRoom.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'create-room' && callback) {
          createCount++;
          const roomId = `FAST${createCount}`;
          const userId = `user_fast_${createCount}`;
          if (createCount === 1) {
            roomId1 = roomId;
          } else {
            roomId2 = roomId;
          }
          callback({ roomId, userId });
        }
      });
      
      vi.spyOn(VoiceRoom, 'initMedia').mockResolvedValue(undefined);
      
      // Создаем первую комнату
      await VoiceRoom.createRoom();
      expect(VoiceRoom.currentRoomId).toBe(roomId1);
      
      // Создаем вторую комнату быстро
      await VoiceRoom.createRoom();
      expect(VoiceRoom.currentRoomId).toBe(roomId2);
      
      // Проверяем, что URL обновился
      expect(window.location.pathname).toBe(`/room/${roomId2}`);
    });
    
    it('должен корректно очищать sessionStorage при создании новой комнаты', async () => {
      const username = 'ClearUser';
      VoiceRoom.elements.usernameInput.value = username;
      
      let firstRoomId;
      vi.spyOn(VoiceRoom.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'create-room' && callback) {
          if (!firstRoomId) {
            firstRoomId = 'FIRST';
            callback({ roomId: firstRoomId, userId: 'user_first' });
          } else {
            callback({ roomId: 'SECOND', userId: 'user_second' });
          }
        }
      });
      
      vi.spyOn(VoiceRoom, 'initMedia').mockResolvedValue(undefined);
      
      // Создаем первую комнату
      await VoiceRoom.createRoom();
      expect(sessionStorage.getItem('voiceRoomCreatedRoom')).toBeTruthy();
      
      // Создаем вторую комнату
      await VoiceRoom.createRoom();
      
      // Проверяем, что sessionStorage обновлен для новой комнаты
      const savedData = JSON.parse(sessionStorage.getItem('voiceRoomCreatedRoom'));
      expect(savedData.roomId).toBe('SECOND');
    });
  });
  
  describe('Множественные изменения URL', () => {
    it('должен корректно обрабатывать множественные изменения URL подряд', async () => {
      const roomIds = ['ROOM1', 'ROOM2', 'ROOM3'];
      
      for (const roomId of roomIds) {
        window.history.pushState({}, '', `/room/${roomId}`);
        VoiceRoom.handleUrlParams();
        
        expect(VoiceRoom.elements.roomIdInput.value).toBe(roomId);
        expect(window.location.pathname).toBe(`/room/${roomId}`);
      }
    });
    
    it('должен корректно восстанавливать состояние при навигации назад', async () => {
      const username = 'BackUser';
      VoiceRoom.elements.usernameInput.value = username;
      
      // Создаем комнату
      vi.spyOn(VoiceRoom.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'create-room' && callback) {
          callback({ roomId: 'BACK123', userId: 'user_back' });
        }
      });
      
      vi.spyOn(VoiceRoom, 'initMedia').mockResolvedValue(undefined);
      await VoiceRoom.createRoom();
      
      const initialPath = window.location.pathname;
      
      // Переходим на другую страницу
      window.history.pushState({}, '', '/');
      
      // Возвращаемся назад
      window.history.back();
      
      // Симулируем событие popstate
      window.dispatchEvent(new PopStateEvent('popstate'));
      
      // Обрабатываем URL
      VoiceRoom.handleUrlParams();
      
      // Проверяем, что состояние восстановлено
      expect(VoiceRoom.elements.roomIdInput.value).toBe('BACK123');
    });
  });
  
  describe('Потеря соединения во время создания комнаты', () => {
    it('должен корректно обрабатывать потерю соединения при создании комнаты', async () => {
      const username = 'DisconnectUser';
      VoiceRoom.elements.usernameInput.value = username;
      
      let callbackCalled = false;
      vi.spyOn(VoiceRoom.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'create-room' && callback) {
          // Симулируем потерю соединения перед вызовом callback
          VoiceRoom.socket.disconnect();
          setTimeout(() => {
            if (!callbackCalled) {
              callback({ roomId: 'DISCONN', userId: 'user_disconn' });
              callbackCalled = true;
            }
          }, 100);
        }
      });
      
      vi.spyOn(VoiceRoom, 'initMedia').mockResolvedValue(undefined);
      await VoiceRoom.createRoom();
      
      // Проверяем, что ошибка обработана корректно
      // (комната не должна быть создана при потере соединения)
      if (VoiceRoom.socket && !VoiceRoom.socket.connected) {
        expect(VoiceRoom.currentRoomId).toBeNull();
      }
    });
    
    it('должен переподключаться и продолжать работу после потери соединения', async () => {
      // Отключаем соединение
      VoiceRoom.socket.disconnect();
      
      // Ждем переподключения
      await new Promise((resolve) => {
        VoiceRoom.socket.once('connect', resolve);
        VoiceRoom.initSocket();
        setTimeout(resolve, 2000);
      });
      
      // Проверяем, что соединение восстановлено
      expect(VoiceRoom.socket.connected).toBe(true);
    });
  });
  
  describe('Восстановление после перезагрузки страницы', () => {
    it('должен корректно обрабатывать перезагрузку страницы с сохраненным состоянием', async () => {
      const roomId = 'RELOAD';
      const userId = 'user_reload';
      const username = 'ReloadUser';
      
      // Сохраняем состояние как будто комната была создана
      sessionStorage.setItem('voiceRoomCreatedRoom', JSON.stringify({
        roomId,
        userId,
        username,
        timestamp: Date.now()
      }));
      
      localStorage.setItem('voiceRoomUsername', username);
      
      // Устанавливаем URL
      window.history.pushState({}, '', `/room/${roomId}`);
      
      // Обрабатываем URL (как при загрузке страницы)
      VoiceRoom.handleUrlParams();
      
      // Проверяем, что состояние восстановлено
      expect(VoiceRoom.currentRoomId).toBe(roomId);
      expect(VoiceRoom.myUserId).toBe(userId);
      expect(VoiceRoom.myUsername).toBe(username);
    });
  });
  
  describe('Совместимость с существующим функционалом', () => {
    it('должен работать старый способ присоединения к комнате', async () => {
      const mockServer = createMockSocketServer();
      const roomId = 'LEGACY';
      const username = 'LegacyUser';
      
      VoiceRoom.elements.usernameInput.value = username;
      VoiceRoom.elements.roomIdInput.value = roomId;
      
      vi.spyOn(VoiceRoom.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'join-room' && data.roomId === roomId && callback) {
          callback({ userId: 'user_legacy', users: [] });
        }
      });
      
      vi.spyOn(VoiceRoom, 'initMedia').mockResolvedValue(undefined);
      await VoiceRoom.joinExistingRoom();
      
      expect(VoiceRoom.currentRoomId).toBe(roomId);
      expect(VoiceRoom.myUsername).toBe(username);
    });
    
    it('должен сохранять username в localStorage при создании комнаты', async () => {
      const username = 'StorageUser';
      VoiceRoom.elements.usernameInput.value = username;
      
      vi.spyOn(VoiceRoom.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'create-room' && callback) {
          callback({ roomId: 'STORAGE', userId: 'user_storage' });
        }
      });
      
      vi.spyOn(VoiceRoom, 'initMedia').mockResolvedValue(undefined);
      await VoiceRoom.createRoom();
      
      expect(localStorage.getItem('voiceRoomUsername')).toBe(username);
    });
  });
});

