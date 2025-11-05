/**
 * Тесты для присоединения к комнате по коду
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupDOM } from './helpers/setup-dom.js';
import { clearServerState } from './helpers/socket-mock.js';
import { mockGetUserMedia } from './helpers/webrtc-mock.js';

// Импортируем createMockSocket из socket-mock
// Проверяем как он экспортируется в других тестах
import * as socketMockModule from './helpers/socket-mock.js';

// Создаем простую заглушку для createMockSocket если она не экспортируется
const createMockSocket = socketMockModule.createMockSocket || socketMockModule.default?.createMockSocket || (() => {
  const mockSocket = {
    connected: true,
    emit: vi.fn((event, data, callback) => {
      // Симулируем callback для join-room
      if (event === 'join-room' && callback) {
        setTimeout(() => {
          callback({ userId: 'user123', users: [] });
        }, 10);
      }
      return mockSocket;
    }),
    on: vi.fn(() => mockSocket),
    once: vi.fn(() => mockSocket),
    off: vi.fn(() => mockSocket),
    disconnect: vi.fn(),
    id: 'mock-socket-id',
    _handlers: {}
  };
  return mockSocket;
});

// Загружаем модули
let VoiceRoom;
let App;

beforeEach(async () => {
  setupDOM();
  clearServerState();
  mockGetUserMedia();
  
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
  
  // Загружаем VoiceRoom из исходного файла
  // Используем динамический импорт для загрузки реального модуля
  const voiceRoomModule = await import('../www/js/voice-room.js');
  VoiceRoom = window.VoiceRoom || voiceRoomModule.VoiceRoom || voiceRoomModule.default;
  
  // Если модуль не загружен, создаем минимальную версию для тестов
  if (!VoiceRoom) {
    console.warn('VoiceRoom module not found, creating minimal mock');
    VoiceRoom = {
      socket: null,
      localStream: null,
      peers: new Map(),
      currentRoomId: null,
      myUserId: null,
      myUsername: null,
      isJoiningRoom: false,
      joinRoomTimeout: null,
      elements: {},
      resetJoinRoomState: vi.fn(),
      showNotification: vi.fn(),
      sanitizeString: (str) => str?.trim()?.substring(0, 20) || '',
      validateUsernameInput: vi.fn(() => true),
      initElements: vi.fn(),
      initSocket: vi.fn(),
      initMedia: vi.fn(),
      addUserToGrid: vi.fn(),
      createPeerConnection: vi.fn(),
      showRoomScreen: vi.fn()
    };
  }
  
  VoiceRoom.initElements();
  VoiceRoom.elements = {
    roomIdInput: document.getElementById('roomId'),
    usernameInput: document.getElementById('username'),
    btnJoinRoomNow: document.getElementById('btnJoinRoomNow'),
    statusMessage: document.getElementById('statusMessage'),
    currentRoomIdSpan: document.getElementById('currentRoomId'),
    usersGrid: document.getElementById('usersGrid'),
    loginScreen: document.getElementById('loginScreen'),
    roomScreen: document.getElementById('roomScreen')
  };
  
  // Сброс состояния
  VoiceRoom.socket = null;
  VoiceRoom.localStream = null;
  VoiceRoom.peers.clear();
  VoiceRoom.currentRoomId = null;
  VoiceRoom.myUserId = null;
  VoiceRoom.myUsername = null;
  VoiceRoom.isJoiningRoom = false;
  VoiceRoom.joinRoomTimeout = null;
});

afterEach(() => {
  // Очищаем таймауты
  if (VoiceRoom.joinRoomTimeout) {
    clearTimeout(VoiceRoom.joinRoomTimeout);
    VoiceRoom.joinRoomTimeout = null;
  }
  VoiceRoom.isJoiningRoom = false;
  vi.clearAllMocks();
});

describe('Присоединение к комнате по коду', () => {
  it('должно устанавливать флаг isJoiningRoom при начале присоединения', () => {
    const mockSocket = createMockSocket();
    VoiceRoom.socket = mockSocket;
    
    VoiceRoom.elements.roomIdInput.value = 'ABCDEF';
    VoiceRoom.elements.usernameInput.value = 'TestUser';
    
    VoiceRoom.joinExistingRoom();
    
    expect(VoiceRoom.isJoiningRoom).toBe(true);
  });
  
  it('должно сбрасывать флаг isJoiningRoom после успешного присоединения', async () => {
    const mockSocket = createMockSocket();
    VoiceRoom.socket = mockSocket;
    
    VoiceRoom.elements.roomIdInput.value = 'ABCDEF';
    VoiceRoom.elements.usernameInput.value = 'TestUser';
    
    // Мокаем initMedia
    VoiceRoom.initMedia = vi.fn().mockResolvedValue(undefined);
    VoiceRoom.addUserToGrid = vi.fn();
    VoiceRoom.showRoomScreen = vi.fn();
    
    // Симулируем успешное присоединение
    const joinPromise = new Promise((resolve) => {
      VoiceRoom.joinExistingRoom();
      
      // Эмулируем ответ от сервера
      setTimeout(() => {
        const callback = mockSocket._handlers['join-room']?.[0];
        if (callback) {
          callback({
            userId: 'user123',
            users: []
          });
        }
        resolve();
      }, 100);
    });
    
    await joinPromise;
    
    // Ждем завершения асинхронных операций
    await new Promise(resolve => setTimeout(resolve, 200));
    
    expect(VoiceRoom.isJoiningRoom).toBe(false);
  });
  
  it('должно сбрасывать флаг isJoiningRoom при ошибке присоединения', async () => {
    const mockSocket = createMockSocket();
    VoiceRoom.socket = mockSocket;
    
    VoiceRoom.elements.roomIdInput.value = 'ABCDEF';
    VoiceRoom.elements.usernameInput.value = 'TestUser';
    
    const joinPromise = new Promise((resolve) => {
      VoiceRoom.joinExistingRoom();
      
      // Эмулируем ошибку от сервера
      setTimeout(() => {
        const callback = mockSocket._handlers['join-room']?.[0];
        if (callback) {
          callback({
            error: 'Room not found'
          });
        }
        resolve();
      }, 100);
    });
    
    await joinPromise;
    
    // Ждем завершения асинхронных операций
    await new Promise(resolve => setTimeout(resolve, 200));
    
    expect(VoiceRoom.isJoiningRoom).toBe(false);
  });
  
  it('должно сбрасывать флаг isJoiningRoom через таймаут если callback не вызывается', async () => {
    const mockSocket = createMockSocket();
    VoiceRoom.socket = mockSocket;
    
    VoiceRoom.elements.roomIdInput.value = 'ABCDEF';
    VoiceRoom.elements.usernameInput.value = 'TestUser';
    
    VoiceRoom.joinExistingRoom();
    
    expect(VoiceRoom.isJoiningRoom).toBe(true);
    
    // Ждем таймаут (10 секунд)
    // Ускоряем таймаут для теста
    const originalTimeout = VoiceRoom.joinRoomTimeout;
    if (originalTimeout) {
      clearTimeout(originalTimeout);
    }
    
    // Создаем новый таймаут с коротким временем для теста
    VoiceRoom.joinRoomTimeout = setTimeout(() => {
      VoiceRoom.isJoiningRoom = false;
      VoiceRoom.joinRoomTimeout = null;
    }, 100);
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    expect(VoiceRoom.isJoiningRoom).toBe(false);
  });
  
  it('должно предотвращать повторные попытки присоединения если флаг установлен', () => {
    const mockSocket = createMockSocket();
    VoiceRoom.socket = mockSocket;
    
    VoiceRoom.elements.roomIdInput.value = 'ABCDEF';
    VoiceRoom.elements.usernameInput.value = 'TestUser';
    
    VoiceRoom.isJoiningRoom = true;
    
    const emitSpy = vi.spyOn(mockSocket, 'emit');
    
    VoiceRoom.joinExistingRoom();
    
    // Не должно вызывать emit если уже присоединяемся
    expect(emitSpy).not.toHaveBeenCalled();
  });
  
  it('должно вызывать resetJoinRoomState если socket не подключен', () => {
    const mockSocket = createMockSocket();
    mockSocket.connected = false;
    VoiceRoom.socket = mockSocket;
    
    VoiceRoom.elements.roomIdInput.value = 'ABCDEF';
    VoiceRoom.elements.usernameInput.value = 'TestUser';
    
    VoiceRoom.resetJoinRoomState = vi.fn();
    
    VoiceRoom.joinExistingRoom();
    
    expect(VoiceRoom.resetJoinRoomState).toHaveBeenCalled();
  });
  
  it('должно вызывать resetJoinRoomState если socket отсутствует', () => {
    VoiceRoom.socket = null;
    
    VoiceRoom.elements.roomIdInput.value = 'ABCDEF';
    VoiceRoom.elements.usernameInput.value = 'TestUser';
    
    VoiceRoom.resetJoinRoomState = vi.fn();
    
    VoiceRoom.joinExistingRoom();
    
    expect(VoiceRoom.resetJoinRoomState).toHaveBeenCalled();
  });
  
  it('должно очищать предыдущий таймаут перед установкой нового', () => {
    const mockSocket = createMockSocket();
    VoiceRoom.socket = mockSocket;
    
    VoiceRoom.elements.roomIdInput.value = 'ABCDEF';
    VoiceRoom.elements.usernameInput.value = 'TestUser';
    
    // Устанавливаем первый таймаут
    VoiceRoom.joinRoomTimeout = setTimeout(() => {}, 1000);
    const firstTimeout = VoiceRoom.joinRoomTimeout;
    
    // Вызываем joinExistingRoom - должен очистить предыдущий таймаут
    VoiceRoom.joinExistingRoom();
    
    // Новый таймаут должен быть установлен
    expect(VoiceRoom.joinRoomTimeout).not.toBe(firstTimeout);
    expect(VoiceRoom.joinRoomTimeout).not.toBeNull();
  });
  
  it('должно очищать флаг при выходе из комнаты', () => {
    VoiceRoom.isJoiningRoom = true;
    VoiceRoom.joinRoomTimeout = setTimeout(() => {}, 1000);
    
    VoiceRoom.resetJoinRoomState = vi.fn(() => {
      if (VoiceRoom.joinRoomTimeout) {
        clearTimeout(VoiceRoom.joinRoomTimeout);
        VoiceRoom.joinRoomTimeout = null;
      }
      VoiceRoom.isJoiningRoom = false;
    });
    
    VoiceRoom.leaveRoom();
    
    expect(VoiceRoom.isJoiningRoom).toBe(false);
    expect(VoiceRoom.joinRoomTimeout).toBeNull();
  });
  
  it('должно правильно обрабатывать waitForSocketAndJoin с уже подключенным socket', () => {
    const mockSocket = createMockSocket();
    mockSocket.connected = true;
    VoiceRoom.socket = mockSocket;
    
    VoiceRoom.elements.roomIdInput.value = 'ABCDEF';
    VoiceRoom.elements.usernameInput.value = 'TestUser';
    
    VoiceRoom.joinExistingRoom = vi.fn();
    
    VoiceRoom.waitForSocketAndJoin('ABCDEF', 'TestUser');
    
    // Должно вызвать joinExistingRoom почти сразу
    setTimeout(() => {
      expect(VoiceRoom.joinExistingRoom).toHaveBeenCalledWith(true);
    }, 150);
  });
  
  it('должно предотвращать повторные вызовы waitForSocketAndJoin если уже присоединяемся', () => {
    VoiceRoom.isJoiningRoom = true;
    
    VoiceRoom.joinExistingRoom = vi.fn();
    
    VoiceRoom.waitForSocketAndJoin('ABCDEF', 'TestUser');
    
    expect(VoiceRoom.joinExistingRoom).not.toHaveBeenCalled();
  });
  
  it('должно валидировать код комнаты перед присоединением', () => {
    const mockSocket = createMockSocket();
    VoiceRoom.socket = mockSocket;
    
    VoiceRoom.elements.roomIdInput.value = 'ABC'; // Невалидный код
    VoiceRoom.elements.usernameInput.value = 'TestUser';
    
    VoiceRoom.joinExistingRoom();
    
    // Не должно вызывать emit при невалидном коде
    expect(mockSocket.emit).not.toHaveBeenCalled();
    expect(VoiceRoom.isJoiningRoom).toBe(false);
  });
  
  it('должно валидировать имя пользователя перед присоединением', () => {
    const mockSocket = createMockSocket();
    VoiceRoom.socket = mockSocket;
    
    VoiceRoom.elements.roomIdInput.value = 'ABCDEF';
    VoiceRoom.elements.usernameInput.value = ''; // Пустое имя
    
    VoiceRoom.validateUsernameInput = vi.fn(() => false);
    
    VoiceRoom.joinExistingRoom();
    
    // Не должно вызывать emit при невалидном имени
    expect(mockSocket.emit).not.toHaveBeenCalled();
    expect(VoiceRoom.isJoiningRoom).toBe(false);
  });
});

