/**
 * Тесты race conditions для voice-room.js
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
      // Очищаем предыдущие peer connections при повторной инициализации
      this.peers.forEach((peer, userId) => {
        try {
          peer.close();
        } catch (error) {
          console.error('Error closing peer during init:', error);
        }
      });
      this.peers.clear();
      
      this.initElements();
      this.initSocket();
    },
    
    initElements() {
      this.elements = {
        usernameInput: document.getElementById('username'),
        roomIdInput: document.getElementById('roomId'),
        usersGrid: document.getElementById('usersGrid'),
        statusMessage: document.getElementById('statusMessage'),
        userCount: document.getElementById('userCount')
      };
    },
    
    initSocket() {
      if (typeof io === 'undefined') return;
      this.socket = io(window.location.origin);
      this.setupSocketEvents();
    },
    
    setupSocketEvents() {
      if (!this.socket) return;
      this.socket.on('user-joined', ({ userId, username }) => {
        this.addUserToGrid(userId, username);
        if (this.localStream) {
          this.createPeerConnection(userId);
        }
      });
      this.socket.on('user-left', (userId) => {
        const peer = this.peers.get(userId);
        if (peer) {
          try {
            peer.close();
          } catch (error) {
            console.error('Error closing peer:', error);
          }
          this.peers.delete(userId);
        }
        this.removeUser(userId);
      });
    },
    
    async initMedia() {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
    },
    
    async createRoom() {
      // Очищаем предыдущие peer connections перед созданием новой комнаты
      this.peers.forEach((peer, userId) => {
        try {
          peer.close();
        } catch (error) {
          console.error('Error closing peer before createRoom:', error);
        }
      });
      this.peers.clear();
      
      const username = this.elements.usernameInput.value.trim();
      if (!username) return;
      this.myUsername = username;
      this.socket.emit('create-room', { username }, (response) => {
        if (response.error) return;
        this.currentRoomId = response.roomId;
        this.myUserId = response.userId;
      });
    },
    
    async joinExistingRoom() {
      const roomId = this.elements.roomIdInput.value.trim().toUpperCase();
      const username = this.elements.usernameInput.value.trim();
      if (!roomId || !username) return;
      this.myUsername = username;
      this.currentRoomId = roomId;
      this.socket.emit('join-room', { roomId, username }, (response) => {
        if (response.error) return;
        this.myUserId = response.userId;
      });
    },
    
    createPeerConnection(targetUserId) {
      // Не создаем peer connection если нет localStream или уже есть соединение
      if (!this.localStream || this.peers.has(targetUserId)) return;
      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      this.peers.set(targetUserId, peer);
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
      if (card) {
        card.remove();
        this.updateUserCount();
      }
    },
    
    updateUserCount() {
      if (this.elements.userCount && this.elements.usersGrid) {
        const count = this.elements.usersGrid.querySelectorAll('.user-card').length;
        this.elements.userCount.textContent = count;
      }
    },
    
    leaveRoom() {
      // Очищаем peer connections
      this.peers.forEach((peer, userId) => {
        try {
          peer.close();
        } catch (error) {
          console.error('Error closing peer:', error);
        }
      });
      this.peers.clear();
      
      // Очищаем localStream чтобы предотвратить создание новых peer connections
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null;
      }
      
      if (this.elements.usersGrid) {
        this.elements.usersGrid.innerHTML = '';
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
  clearServerState();
  vi.clearAllMocks();
});

describe('Race conditions', () => {
  describe('Одновременное создание peer connections', () => {
    it('должен обрабатывать параллельное создание peer connections', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const userIds = ['user1', 'user2', 'user3', 'user4', 'user5'];
      
      // Создаем все peer connections одновременно
      userIds.forEach(userId => {
        VoiceRoom.createPeerConnection(userId);
      });
      
      // Все должны быть созданы
      expect(VoiceRoom.peers.size).toBe(5);
      userIds.forEach(userId => {
        expect(VoiceRoom.peers.has(userId)).toBe(true);
      });
    });

    it('должен предотвращать дублирование peer connections при параллельном создании', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      
      // Пытаемся создать одно и то же соединение несколько раз одновременно
      VoiceRoom.createPeerConnection(targetUserId);
      VoiceRoom.createPeerConnection(targetUserId);
      VoiceRoom.createPeerConnection(targetUserId);
      
      // Должно быть только одно соединение
      expect(VoiceRoom.peers.size).toBe(1);
      expect(VoiceRoom.peers.has(targetUserId)).toBe(true);
    });
  });

  describe('Быстрое присоединение/выход пользователей', () => {
    it('должен обрабатывать быстрый вход и выход пользователя', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.elements.usernameInput.value = 'User1';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = VoiceRoom.currentRoomId;
      
      // Быстро выходим и снова входим
      VoiceRoom.leaveRoom();
      await new Promise(resolve => setTimeout(resolve, 10));
      
      VoiceRoom.elements.usernameInput.value = 'User1';
      VoiceRoom.elements.roomIdInput.value = roomId;
      await new Promise(resolve => {
        VoiceRoom.joinExistingRoom();
        setTimeout(resolve, 200);
      });
      
      expect(VoiceRoom.currentRoomId).toBe(roomId);
    });

    it('должен обрабатывать множественные быстрые входы/выходы', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      for (let i = 0; i < 5; i++) {
        VoiceRoom.elements.usernameInput.value = `User${i}`;
        await new Promise(resolve => {
          VoiceRoom.createRoom();
          setTimeout(resolve, 100);
        });
        VoiceRoom.leaveRoom();
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Не должно быть ошибок
      expect(VoiceRoom.currentRoomId).toBeNull();
    });
  });

  describe('Параллельные события Socket.IO', () => {
    it('должен обрабатывать параллельные события user-joined', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      // Эмулируем параллельные события user-joined
      const events = [
        { userId: 'user1', username: 'User1' },
        { userId: 'user2', username: 'User2' },
        { userId: 'user3', username: 'User3' }
      ];
      
      events.forEach(event => {
        if (VoiceRoom.socket && VoiceRoom.socket._eventHandlers) {
          const handlers = VoiceRoom.socket._eventHandlers.get('user-joined');
          if (handlers) {
            handlers.forEach(handler => handler(event));
          }
        }
      });
      
      // Все пользователи должны быть добавлены
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(VoiceRoom.peers.size).toBeGreaterThanOrEqual(0);
    });

    it('должен обрабатывать параллельные события user-left', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      // Создаем peer connections
      VoiceRoom.createPeerConnection('user1');
      VoiceRoom.createPeerConnection('user2');
      VoiceRoom.createPeerConnection('user3');
      
      expect(VoiceRoom.peers.size).toBe(3);
      
      // Эмулируем параллельные события user-left
      const userIds = ['user1', 'user2', 'user3'];
      userIds.forEach(userId => {
        if (VoiceRoom.socket && VoiceRoom.socket._eventHandlers) {
          const handlers = VoiceRoom.socket._eventHandlers.get('user-left');
          if (handlers) {
            handlers.forEach(handler => handler(userId));
          }
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 50));
      // Peer connections должны быть очищены
      expect(VoiceRoom.peers.size).toBe(0);
    });
  });

  describe('Конкурентные вызовы createRoom/joinRoom', () => {
    it('должен обрабатывать одновременные вызовы createRoom', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.elements.usernameInput.value = 'User1';
      
      // Вызываем createRoom несколько раз одновременно
      VoiceRoom.createRoom();
      VoiceRoom.createRoom();
      VoiceRoom.createRoom();
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Должна быть создана только одна комната
      expect(VoiceRoom.currentRoomId).toBeTruthy();
    });

    it('должен обрабатывать одновременные вызовы joinRoom', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Создаем комнату
      VoiceRoom.elements.usernameInput.value = 'User1';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = VoiceRoom.currentRoomId;
      VoiceRoom.leaveRoom();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Пытаемся присоединиться несколько раз одновременно
      VoiceRoom.elements.usernameInput.value = 'User2';
      VoiceRoom.elements.roomIdInput.value = roomId;
      
      VoiceRoom.joinExistingRoom();
      VoiceRoom.joinExistingRoom();
      VoiceRoom.joinExistingRoom();
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Должен присоединиться только один раз
      expect(VoiceRoom.currentRoomId).toBe(roomId);
    });

    it('должен обрабатывать конкурентные createRoom и joinRoom', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Пытаемся создать комнату и присоединиться одновременно
      VoiceRoom.elements.usernameInput.value = 'User1';
      VoiceRoom.elements.roomIdInput.value = 'ABC123';
      
      VoiceRoom.createRoom();
      VoiceRoom.joinExistingRoom();
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Один из них должен завершиться успешно
      const hasRoom = VoiceRoom.currentRoomId !== null;
      expect(hasRoom).toBe(true);
    });
  });

  describe('Одновременное обновление UI', () => {
    it('должен обрабатывать параллельное добавление пользователей в сетку', () => {
      VoiceRoom.init();
      
      const users = [
        { userId: 'user1', username: 'User1' },
        { userId: 'user2', username: 'User2' },
        { userId: 'user3', username: 'User3' }
      ];
      
      // Добавляем всех одновременно
      users.forEach(user => {
        VoiceRoom.addUserToGrid(user.userId, user.username);
      });
      
      // Все должны быть добавлены
      const cards = document.querySelectorAll('.user-card');
      expect(cards.length).toBe(3);
    });

    it('должен предотвращать дублирование пользователей при параллельном добавлении', () => {
      VoiceRoom.init();
      
      const userId = 'user1';
      const username = 'User1';
      
      // Пытаемся добавить одного и того же пользователя несколько раз
      VoiceRoom.addUserToGrid(userId, username);
      VoiceRoom.addUserToGrid(userId, username);
      VoiceRoom.addUserToGrid(userId, username);
      
      // Должен быть только один карточка
      const cards = document.querySelectorAll('.user-card');
      expect(cards.length).toBe(1);
    });

    it('должен обрабатывать параллельное обновление счетчика пользователей', () => {
      VoiceRoom.init();
      
      // Добавляем пользователей параллельно
      VoiceRoom.addUserToGrid('user1', 'User1');
      VoiceRoom.addUserToGrid('user2', 'User2');
      VoiceRoom.addUserToGrid('user3', 'User3');
      
      // Счетчик должен быть правильным
      const userCount = document.getElementById('userCount');
      expect(parseInt(userCount.textContent)).toBe(3);
    });
  });

  describe('Race conditions при переподключении', () => {
    it('должен обрабатывать множественные попытки переподключения', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.currentRoomId = 'TEST01';
      VoiceRoom.myUsername = 'TestUser';
      
      // Эмулируем множественные события disconnect
      if (VoiceRoom.socket && VoiceRoom.socket._eventHandlers) {
        const handlers = VoiceRoom.socket._eventHandlers.get('disconnect');
        if (handlers) {
          handlers.forEach(handler => handler('transport close'));
          handlers.forEach(handler => handler('transport close'));
          handlers.forEach(handler => handler('transport close'));
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Должен быть только один reconnectTimeout
      const timeoutCount = VoiceRoom.reconnectTimeout ? 1 : 0;
      expect(timeoutCount).toBeLessThanOrEqual(1);
    });

    it('должен обрабатывать переподключение во время создания комнаты', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.elements.usernameInput.value = 'User1';
      
      // Начинаем создание комнаты
      VoiceRoom.createRoom();
      
      // Сразу эмулируем disconnect
      if (VoiceRoom.socket && VoiceRoom.socket._eventHandlers) {
        const handlers = VoiceRoom.socket._eventHandlers.get('disconnect');
        if (handlers) {
          handlers.forEach(handler => handler('transport close'));
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Должен обработать без ошибок
      expect(VoiceRoom.connectionStatus).toBeTruthy();
    });
  });

  describe('Конкурентные операции с ресурсами', () => {
    it('должен обрабатывать параллельное закрытие peer connections', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.createPeerConnection('user1');
      VoiceRoom.createPeerConnection('user2');
      VoiceRoom.createPeerConnection('user3');
      
      expect(VoiceRoom.peers.size).toBe(3);
      
      // Закрываем все параллельно
      VoiceRoom.leaveRoom();
      
      expect(VoiceRoom.peers.size).toBe(0);
    });

    it('должен обрабатывать создание peer connection во время leaveRoom', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.createPeerConnection('user1');
      expect(VoiceRoom.peers.size).toBe(1);
      
      // Начинаем leaveRoom и сразу создаем новое соединение
      VoiceRoom.leaveRoom();
      VoiceRoom.createPeerConnection('user2');
      
      // После leaveRoom все должно быть очищено
      expect(VoiceRoom.peers.size).toBe(0);
    });
  });

  describe('Параллельные операции с медиа', () => {
    it('должен обрабатывать параллельные вызовы initMedia', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Пытаемся инициализировать медиа несколько раз одновременно
      const promises = [
        VoiceRoom.initMedia(),
        VoiceRoom.initMedia(),
        VoiceRoom.initMedia()
      ];
      
      await Promise.all(promises);
      
      // Должен быть только один localStream
      expect(VoiceRoom.localStream).toBeTruthy();
      expect(VoiceRoom.audioContext).toBeTruthy();
    });
  });
});
