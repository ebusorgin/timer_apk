/**
 * Тесты для подключения к чату
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupDOM } from './helpers/setup-dom.js';
import { clearServerState } from './helpers/socket-mock.js';
import { mockGetUserMedia } from './helpers/webrtc-mock.js';

// Импортируем createMockSocket из socket-mock
import * as socketMockModule from './helpers/socket-mock.js';

// Создаем простую заглушку для createMockSocket если она не экспортируется
const createMockSocket = socketMockModule.createMockSocket || socketMockModule.default?.createMockSocket || (() => {
  const mockSocket = {
    connected: true,
    emit: vi.fn((event, data, callback) => {
      // Симулируем callback для join-chat
      if (event === 'join-chat' && callback) {
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
  const voiceRoomModule = await import('../www/js/voice-room.js');
  VoiceRoom = window.VoiceRoom || voiceRoomModule.VoiceRoom || voiceRoomModule.default;
  
  // Если модуль не загружен, создаем минимальную версию для тестов
  if (!VoiceRoom) {
    console.warn('VoiceRoom module not found, creating minimal mock');
    VoiceRoom = {
      socket: null,
      localStream: null,
      peers: new Map(),
      isConnected: false,
      myUserId: null,
      isConnecting: false,
      elements: {},
      showNotification: vi.fn(),
      sanitizeString: (str) => str?.trim()?.substring(0, 20) || '',
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
    btnConnect: document.getElementById('btnConnect'),
    statusMessage: document.getElementById('statusMessage'),
    usersGrid: document.getElementById('usersGrid'),
    loginScreen: document.getElementById('loginScreen'),
    roomScreen: document.getElementById('roomScreen')
  };
  
  // Сброс состояния
  VoiceRoom.socket = null;
  VoiceRoom.localStream = null;
  VoiceRoom.peers.clear();
  VoiceRoom.isConnected = false;
  VoiceRoom.myUserId = null;
  VoiceRoom.isConnecting = false;
});

afterEach(() => {
  VoiceRoom.isConnecting = false;
  VoiceRoom.isConnected = false;
  vi.clearAllMocks();
});

describe('Подключение к чату', () => {
  it('должно устанавливать флаг isConnecting при начале подключения', () => {
    const mockSocket = createMockSocket();
    VoiceRoom.socket = mockSocket;
    VoiceRoom.initSocket = vi.fn();
    
    VoiceRoom.connect();
    
    expect(VoiceRoom.isConnecting).toBe(true);
  });
  
  it('должно сбрасывать флаг isConnecting после успешного подключения', async () => {
    const mockSocket = createMockSocket();
    VoiceRoom.socket = mockSocket;
    VoiceRoom.initSocket = vi.fn();
    
    // Мокаем initMedia
    VoiceRoom.initMedia = vi.fn().mockResolvedValue(undefined);
    VoiceRoom.addUserToGrid = vi.fn();
    VoiceRoom.showRoomScreen = vi.fn();
    VoiceRoom.createPeerConnection = vi.fn();
    
    // Симулируем успешное подключение
    const connectPromise = new Promise((resolve) => {
      VoiceRoom.connect();
      
      // Эмулируем ответ от сервера
      setTimeout(() => {
        const emitCall = mockSocket.emit.mock.calls.find(call => call[0] === 'join-chat');
        if (emitCall && emitCall[2]) {
          emitCall[2]({
            userId: 'user123',
            users: []
          });
        }
        resolve();
      }, 100);
    });
    
    await connectPromise;
    
    // Ждем завершения асинхронных операций
    await new Promise(resolve => setTimeout(resolve, 200));
    
    expect(VoiceRoom.isConnecting).toBe(false);
    expect(VoiceRoom.isConnected).toBe(true);
  });
  
  it('должно сбрасывать флаг isConnecting при ошибке подключения', async () => {
    const mockSocket = createMockSocket();
    VoiceRoom.socket = mockSocket;
    VoiceRoom.initSocket = vi.fn();
    
    const connectPromise = new Promise((resolve) => {
      VoiceRoom.connect();
      
      // Эмулируем ошибку от сервера
      setTimeout(() => {
        const emitCall = mockSocket.emit.mock.calls.find(call => call[0] === 'join-chat');
        if (emitCall && emitCall[2]) {
          emitCall[2]({
            error: 'Chat is full'
          });
        }
        resolve();
      }, 100);
    });
    
    await connectPromise;
    
    // Ждем завершения асинхронных операций
    await new Promise(resolve => setTimeout(resolve, 200));
    
    expect(VoiceRoom.isConnecting).toBe(false);
    expect(VoiceRoom.isConnected).toBe(false);
  });
  
  it('должно предотвращать повторные попытки подключения если флаг установлен', () => {
    const mockSocket = createMockSocket();
    VoiceRoom.socket = mockSocket;
    VoiceRoom.initSocket = vi.fn();
    
    VoiceRoom.isConnecting = true;
    
    const emitSpy = vi.spyOn(mockSocket, 'emit');
    
    VoiceRoom.connect();
    
    // Не должно вызывать emit если уже подключаемся
    expect(emitSpy).not.toHaveBeenCalled();
  });
  
  it('должно инициализировать socket если он не подключен', async () => {
    const mockSocket = createMockSocket();
    mockSocket.connected = false;
    VoiceRoom.socket = mockSocket;
    VoiceRoom.initSocket = vi.fn();
    
    // Мокаем подключение через setTimeout
    setTimeout(() => {
      mockSocket.connected = true;
      if (mockSocket.once.mock.calls.length > 0) {
        const connectHandler = mockSocket.once.mock.calls.find(call => call[0] === 'connect')?.[1];
        if (connectHandler) {
          connectHandler();
        }
      }
    }, 50);
    
    await VoiceRoom.connect();
    
    expect(VoiceRoom.initSocket).toHaveBeenCalled();
  });
  
  it('должно устанавливать isConnected после успешного подключения', async () => {
    const mockSocket = createMockSocket();
    VoiceRoom.socket = mockSocket;
    VoiceRoom.initSocket = vi.fn();
    VoiceRoom.initMedia = vi.fn().mockResolvedValue(undefined);
    VoiceRoom.addUserToGrid = vi.fn();
    VoiceRoom.showRoomScreen = vi.fn();
    VoiceRoom.createPeerConnection = vi.fn();
    
    const connectPromise = new Promise((resolve) => {
      VoiceRoom.connect();
      
      setTimeout(() => {
        const emitCall = mockSocket.emit.mock.calls.find(call => call[0] === 'join-chat');
        if (emitCall && emitCall[2]) {
          emitCall[2]({
            userId: 'user123',
            users: []
          });
        }
        resolve();
      }, 100);
    });
    
    await connectPromise;
    await new Promise(resolve => setTimeout(resolve, 200));
    
    expect(VoiceRoom.isConnected).toBe(true);
    expect(VoiceRoom.myUserId).toBe('user123');
  });
  
  it('должно очищать peer connections перед подключением', () => {
    const mockSocket = createMockSocket();
    VoiceRoom.socket = mockSocket;
    VoiceRoom.initSocket = vi.fn();
    
    // Добавляем mock peer
    const mockPeer = { close: vi.fn() };
    VoiceRoom.peers.set('user1', mockPeer);
    
    VoiceRoom.connect();
    
    expect(VoiceRoom.peers.size).toBe(0);
  });
});
