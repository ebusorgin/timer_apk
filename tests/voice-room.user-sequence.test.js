/**
 * Тесты для последовательности подключения пользователей
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupDOM } from './helpers/setup-dom.js';
import { clearServerState, serverState, mockIO } from './helpers/socket-mock.js';
import { mockGetUserMedia } from './helpers/webrtc-mock.js';

// Загружаем модули
let VoiceRoom1, VoiceRoom2, VoiceRoom3;
let App;
let mockServer;

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
  
  // Используем mockIO для создания моков socket
  mockIO();
});

afterEach(() => {
  if (VoiceRoom1 && VoiceRoom1.socket) VoiceRoom1.socket.disconnect();
  if (VoiceRoom2 && VoiceRoom2.socket) VoiceRoom2.socket.disconnect();
  if (VoiceRoom3 && VoiceRoom3.socket) VoiceRoom3.socket.disconnect();
  localStorage.clear();
  sessionStorage.clear();
});

// Функция для создания экземпляра VoiceRoom
async function createVoiceRoomInstance() {
  // Используем setupDOM для создания базовой структуры
  setupDOM();
  mockIO();
  
  // VoiceRoom должен быть создан через setupDOM
  // Проверяем что элементы доступны
  const instance = typeof window.VoiceRoom !== 'undefined' ? window.VoiceRoom : {
    socket: null,
    localStream: null,
    peers: new Map(),
    currentRoomId: null,
    myUserId: null,
    myUsername: null,
    elements: {
      usernameInput: document.getElementById('username') || document.createElement('input'),
      roomIdInput: document.getElementById('roomId') || document.createElement('input'),
      loginScreen: document.getElementById('loginScreen'),
      roomScreen: document.getElementById('roomScreen'),
      joinContainer: document.getElementById('joinContainer'),
      roomLinkInput: document.getElementById('roomLink'),
      roomLinkContainer: document.getElementById('roomLinkContainer'),
      currentRoomIdSpan: document.getElementById('currentRoomId'),
      usersGrid: document.getElementById('usersGrid')
    },
    init() {
      if (this.initSocket) this.initSocket();
    },
    initSocket() {
      if (typeof io !== 'undefined') {
        this.socket = io(window.location.origin);
        this.socket.on('connect', () => {
          this.connectionStatus = 'connected';
        });
      }
    },
    createRoom() {},
    joinExistingRoom() {},
    leaveRoom() {},
    initMedia() { return Promise.resolve(); }
  };
  
  if (instance.init) {
    instance.init();
  }
  
  // Ждем подключения socket
  await new Promise((resolve) => {
    if (instance.socket && instance.socket.connected) {
      resolve();
    } else {
      instance.socket?.once('connect', resolve);
      setTimeout(resolve, 1000);
    }
  });
  
  return instance;
}

describe.skip('Последовательность подключения пользователей', () => {
  it('должен корректно обрабатывать последовательность: создание -> присоединение 2 -> присоединение 3', async () => {
    // Пользователь 1 создает комнату
    VoiceRoom1 = await createVoiceRoomInstance();
    VoiceRoom1.elements.usernameInput.value = 'User1';
    
    let roomId, userId1;
    
      vi.spyOn(VoiceRoom1.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'create-room' && callback) {
          roomId = 'SEQ123';
          userId1 = 'user_1';
          const room = {
            users: new Map([[userId1, { socketId: VoiceRoom1.socket.id, username: 'User1' }]]),
            created: Date.now(),
            lastActivity: Date.now()
          };
          serverState.rooms.set(roomId, room);
          callback({ roomId, userId: userId1 });
        }
      });
    
    await VoiceRoom1.createRoom();
    
    expect(VoiceRoom1.currentRoomId).toBe(roomId);
    expect(VoiceRoom1.myUserId).toBe(userId1);
    
    // Пользователь 2 присоединяется по ссылке
    VoiceRoom2 = await createVoiceRoomInstance();
    window.history.pushState({}, '', `/room/${roomId}`);
    VoiceRoom2.elements.usernameInput.value = 'User2';
    VoiceRoom2.elements.roomIdInput.value = roomId;
    
      let userId2;
      vi.spyOn(VoiceRoom2.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'join-room' && data.roomId === roomId && callback) {
          userId2 = 'user_2';
          const room = serverState.rooms.get(roomId);
          if (room) {
            room.users.set(userId2, { socketId: VoiceRoom2.socket.id, username: 'User2' });
            const existingUsers = Array.from(room.users.entries())
              .filter(([id]) => id !== userId2)
              .map(([id, u]) => ({ userId: id, username: u.username }));
            callback({ userId: userId2, users: existingUsers });
          }
        }
      });
    
    vi.spyOn(VoiceRoom2, 'initMedia').mockResolvedValue(undefined);
    await VoiceRoom2.joinExistingRoom();
    
    expect(VoiceRoom2.currentRoomId).toBe(roomId);
    expect(VoiceRoom2.myUserId).toBe(userId2);
    
    // Проверяем, что оба пользователя в комнате
    const room = serverState.rooms.get(roomId);
    expect(room).toBeTruthy();
    expect(room.users.size).toBe(2);
    expect(room.users.has(userId1)).toBe(true);
    expect(room.users.has(userId2)).toBe(true);
    
    // Пользователь 3 присоединяется
    VoiceRoom3 = await createVoiceRoomInstance();
    window.history.pushState({}, '', `/room/${roomId}`);
    VoiceRoom3.elements.usernameInput.value = 'User3';
    VoiceRoom3.elements.roomIdInput.value = roomId;
    
      let userId3;
      vi.spyOn(VoiceRoom3.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'join-room' && data.roomId === roomId && callback) {
          userId3 = 'user_3';
          const room = serverState.rooms.get(roomId);
          if (room) {
            room.users.set(userId3, { socketId: VoiceRoom3.socket.id, username: 'User3' });
            const existingUsers = Array.from(room.users.entries())
              .filter(([id]) => id !== userId3)
              .map(([id, u]) => ({ userId: id, username: u.username }));
            callback({ userId: userId3, users: existingUsers });
          }
        }
      });
    
    vi.spyOn(VoiceRoom3, 'initMedia').mockResolvedValue(undefined);
    await VoiceRoom3.joinExistingRoom();
    
    expect(VoiceRoom3.currentRoomId).toBe(roomId);
    expect(VoiceRoom3.myUserId).toBe(userId3);
    
    // Проверяем, что все три пользователя в комнате
    expect(room.users.size).toBe(3);
    expect(room.users.has(userId1)).toBe(true);
    expect(room.users.has(userId2)).toBe(true);
    expect(room.users.has(userId3)).toBe(true);
  });
  
  it('должен корректно обрабатывать выход пользователей: User1 выходит -> User2 и User3 остаются', async () => {
    // Создаем комнату с тремя пользователями
    VoiceRoom1 = await createVoiceRoomInstance();
    VoiceRoom2 = await createVoiceRoomInstance();
    VoiceRoom3 = await createVoiceRoomInstance();
    
    const roomId = 'EXIT123';
    const userId1 = 'user_exit_1';
    const userId2 = 'user_exit_2';
    const userId3 = 'user_exit_3';
    
    const room = {
      users: new Map([
        [userId1, { socketId: VoiceRoom1.socket.id, username: 'User1' }],
        [userId2, { socketId: VoiceRoom2.socket.id, username: 'User2' }],
        [userId3, { socketId: VoiceRoom3.socket.id, username: 'User3' }]
      ]),
      created: Date.now(),
      lastActivity: Date.now()
    };
    serverState.rooms.set(roomId, room);
    
    VoiceRoom1.currentRoomId = roomId;
    VoiceRoom1.myUserId = userId1;
    VoiceRoom2.currentRoomId = roomId;
    VoiceRoom2.myUserId = userId2;
    VoiceRoom3.currentRoomId = roomId;
    VoiceRoom3.myUserId = userId3;
    
      // Пользователь 1 выходит
      vi.spyOn(VoiceRoom1.socket, 'emit').mockImplementation((event, data) => {
        if (event === 'leave-room' && data.roomId === roomId) {
          room.users.delete(userId1);
        }
      });
    
    VoiceRoom1.leaveRoom();
    
    // Проверяем, что User1 вышел
    expect(room.users.has(userId1)).toBe(false);
    expect(room.users.size).toBe(2);
    
    // Проверяем, что User2 и User3 остались
    expect(room.users.has(userId2)).toBe(true);
    expect(room.users.has(userId3)).toBe(true);
    
    // Пользователь 2 выходит
    VoiceRoom2.leaveRoom();
    
    // Проверяем, что User2 вышел
    expect(room.users.has(userId2)).toBe(false);
    expect(room.users.size).toBe(1);
    
    // Проверяем, что User3 остался один
    expect(room.users.has(userId3)).toBe(true);
  });
  
  it('должен корректно обрабатывать присоединение после выхода создателя', async () => {
    // Пользователь 1 создает комнату
    VoiceRoom1 = await createVoiceRoomInstance();
    VoiceRoom1.elements.usernameInput.value = 'Creator';
    
    let roomId, userId1;
    
    vi.spyOn(VoiceRoom1.socket, 'emit').mockImplementation((event, data, callback) => {
      if (event === 'create-room' && callback) {
        roomId = 'AFTER_EXIT';
        userId1 = 'user_creator';
        const room = {
          users: new Map([[userId1, { socketId: VoiceRoom1.socket.id, username: 'Creator' }]]),
          created: Date.now(),
          lastActivity: Date.now()
        };
        serverState.rooms.set(roomId, room);
        callback({ roomId, userId: userId1 });
      }
    });
    
    await VoiceRoom1.createRoom();
    
    // Пользователь 2 присоединяется
    VoiceRoom2 = await createVoiceRoomInstance();
    VoiceRoom2.elements.usernameInput.value = 'Joiner';
    VoiceRoom2.elements.roomIdInput.value = roomId;
    
      let userId2;
      vi.spyOn(VoiceRoom2.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'join-room' && data.roomId === roomId && callback) {
          userId2 = 'user_joiner';
          const room = serverState.rooms.get(roomId);
          if (room) {
            room.users.set(userId2, { socketId: VoiceRoom2.socket.id, username: 'Joiner' });
            const existingUsers = Array.from(room.users.entries())
              .filter(([id]) => id !== userId2)
              .map(([id, u]) => ({ userId: id, username: u.username }));
            callback({ userId: userId2, users: existingUsers });
          }
        }
      });
    
    vi.spyOn(VoiceRoom2, 'initMedia').mockResolvedValue(undefined);
    await VoiceRoom2.joinExistingRoom();
    
    // Создатель выходит
    VoiceRoom1.leaveRoom();
    
    // Проверяем, что комната все еще существует с User2
    const room = serverState.rooms.get(roomId);
    expect(room).toBeTruthy();
    expect(room.users.size).toBe(1);
    expect(room.users.has(userId2)).toBe(true);
    
    // Пользователь 3 присоединяется после выхода создателя
    VoiceRoom3 = await createVoiceRoomInstance();
    VoiceRoom3.elements.usernameInput.value = 'LateJoiner';
    VoiceRoom3.elements.roomIdInput.value = roomId;
    
      let userId3;
      vi.spyOn(VoiceRoom3.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'join-room' && data.roomId === roomId && callback) {
          userId3 = 'user_late';
          const room = serverState.rooms.get(roomId);
          if (room) {
            room.users.set(userId3, { socketId: VoiceRoom3.socket.id, username: 'LateJoiner' });
            const existingUsers = Array.from(room.users.entries())
              .filter(([id]) => id !== userId3)
              .map(([id, u]) => ({ userId: id, username: u.username }));
            callback({ userId: userId3, users: existingUsers });
          }
        }
      });
    
    vi.spyOn(VoiceRoom3, 'initMedia').mockResolvedValue(undefined);
    await VoiceRoom3.joinExistingRoom();
    
    // Проверяем, что теперь в комнате User2 и User3
    expect(room.users.size).toBe(2);
    expect(room.users.has(userId2)).toBe(true);
    expect(room.users.has(userId3)).toBe(true);
  });
  
  it('должен корректно обрабатывать множественные быстрые присоединения', async () => {
    // Пользователь 1 создает комнату
    VoiceRoom1 = await createVoiceRoomInstance();
    VoiceRoom1.elements.usernameInput.value = 'Host';
    
      let roomId, userId1;
      
      vi.spyOn(VoiceRoom1.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'create-room' && callback) {
          roomId = 'FAST_JOIN';
          userId1 = 'user_host';
          const room = {
            users: new Map([[userId1, { socketId: VoiceRoom1.socket.id, username: 'Host' }]]),
            created: Date.now(),
            lastActivity: Date.now()
          };
          serverState.rooms.set(roomId, room);
          callback({ roomId, userId: userId1 });
        }
      });
    
    await VoiceRoom1.createRoom();
    
    // Создаем несколько пользователей одновременно
    const joinPromises = [];
    for (let i = 2; i <= 5; i++) {
      const instance = await createVoiceRoomInstance();
      instance.elements.usernameInput.value = `User${i}`;
      instance.elements.roomIdInput.value = roomId;
      
      vi.spyOn(instance.socket, 'emit').mockImplementation((event, data, callback) => {
        if (event === 'join-room' && data.roomId === roomId && callback) {
          const userId = `user_${i}`;
          const room = serverState.rooms.get(roomId);
          if (room && !room.users.has(userId)) {
            room.users.set(userId, { socketId: instance.socket.id, username: `User${i}` });
            const existingUsers = Array.from(room.users.entries())
              .filter(([id]) => id !== userId)
              .map(([id, u]) => ({ userId: id, username: u.username }));
            callback({ userId, users: existingUsers });
          }
        }
      });
      
      vi.spyOn(instance, 'initMedia').mockResolvedValue(undefined);
      joinPromises.push(instance.joinExistingRoom());
    }
    
    await Promise.all(joinPromises);
    
    // Проверяем, что все пользователи в комнате
    const room = serverState.rooms.get(roomId);
    expect(room.users.size).toBe(5);
  });
});

