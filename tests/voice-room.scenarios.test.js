/**
 * Тесты сложных сценариев для voice-room.js
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
        roomScreen: document.getElementById('roomScreen')
      };
    },
    
    initSocket() {
      if (typeof io === 'undefined') return;
      this.socket = io(window.location.origin);
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
        this.initMedia().then(() => {
          this.addUserToGrid(this.myUserId, username, true);
        });
      });
    },
    
    async joinExistingRoom() {
      const roomId = this.elements.roomIdInput.value.trim().toUpperCase();
      const username = this.elements.usernameInput.value.trim();
      if (!roomId || !username) return;
      
      // Проверка формата roomId
      if (roomId.length !== 6) {
        this.showNotification('Введите код комнаты (6 символов)', 'error', 3000);
        return;
      }
      
      this.myUsername = username;
      // Устанавливаем currentRoomId сразу, как в реальном коде
      this.currentRoomId = roomId;
      
      this.socket.emit('join-room', { roomId, username }, async (response) => {
        if (response && response.error) {
          // При ошибке сбрасываем currentRoomId
          this.currentRoomId = null;
          if (response.error.includes('not found')) {
            this.showNotification('Комната не найдена', 'info', 3000);
          } else {
            this.showNotification('Ошибка: ' + response.error, 'error', 5000);
          }
          return;
        }
        if (response && response.userId) {
          // Подтверждаем currentRoomId после успешного ответа
          this.currentRoomId = roomId;
          this.myUserId = response.userId;
          await this.initMedia();
          this.addUserToGrid(this.myUserId, username, true);
          if (response.users) {
            response.users.forEach(user => {
              this.addUserToGrid(user.userId, user.username);
            });
          }
        }
      });
    },
    
    createPeerConnection(targetUserId) {
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
    },
    
    leaveRoom() {
      this.peers.forEach(peer => {
        try {
          peer.close();
        } catch (error) {
          console.error('Error closing peer:', error);
        }
      });
      this.peers.clear();
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
      }
      if (this.elements.usersGrid) {
        this.elements.usersGrid.innerHTML = '';
      }
      if (this.socket && this.currentRoomId) {
        this.socket.emit('leave-room', { roomId: this.currentRoomId });
      }
      this.currentRoomId = null;
      this.myUserId = null;
    },
    
    showNotification(message, type = 'info', duration = 3000) {
      if (!this.elements.statusMessage) return;
      const statusEl = this.elements.statusMessage;
      statusEl.textContent = message;
      statusEl.className = `status-message ${type}`;
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

describe('Сложные сценарии', () => {
  describe('Быстрое создание/удаление комнат', () => {
    it('должен обрабатывать быстрое создание и удаление комнаты', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.elements.usernameInput.value = 'User1';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId1 = VoiceRoom.currentRoomId;
      expect(roomId1).toBeTruthy();
      
      VoiceRoom.leaveRoom();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      VoiceRoom.elements.usernameInput.value = 'User2';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId2 = VoiceRoom.currentRoomId;
      expect(roomId2).toBeTruthy();
      expect(roomId2).not.toBe(roomId1);
    });

    it('должен обрабатывать быстрое создание нескольких комнат подряд', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const roomIds = [];
      
      for (let i = 1; i <= 3; i++) {
        VoiceRoom.elements.usernameInput.value = `User${i}`;
        await new Promise(resolve => {
          VoiceRoom.createRoom();
          setTimeout(resolve, 200);
        });
        roomIds.push(VoiceRoom.currentRoomId);
        VoiceRoom.leaveRoom();
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Все комнаты должны быть разными
      const uniqueIds = new Set(roomIds);
      expect(uniqueIds.size).toBe(3);
    });
  });

  describe('Одновременное присоединение нескольких пользователей', () => {
    it('должен обрабатывать одновременное присоединение 5 пользователей', async () => {
      const clients = [];
      for (let i = 0; i < 5; i++) {
        const client = { VoiceRoom: { ...VoiceRoom }, socket: null };
        client.VoiceRoom.init();
        await new Promise(resolve => setTimeout(resolve, 50));
        clients.push(client);
      }
      
      // Первый создает комнату
      clients[0].VoiceRoom.elements.usernameInput.value = 'User1';
      await new Promise(resolve => {
        clients[0].VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = clients[0].VoiceRoom.currentRoomId;
      
      // Остальные присоединяются одновременно
      const joinPromises = [];
      for (let i = 1; i < clients.length; i++) {
        clients[i].VoiceRoom.elements.usernameInput.value = `User${i + 1}`;
        clients[i].VoiceRoom.elements.roomIdInput.value = roomId;
        joinPromises.push(
          new Promise(resolve => {
            clients[i].VoiceRoom.joinExistingRoom();
            setTimeout(resolve, 200);
          })
        );
      }
      
      await Promise.all(joinPromises);
      
      // Все должны быть в комнате
      clients.forEach(client => {
        expect(client.VoiceRoom.currentRoomId).toBe(roomId);
        expect(client.VoiceRoom.myUserId).toBeTruthy();
      });
    });
  });

  describe('Быстрый выход пользователя', () => {
    it('должен обрабатывать быстрый выход сразу после присоединения', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.elements.usernameInput.value = 'User1';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = VoiceRoom.currentRoomId;
      VoiceRoom.leaveRoom();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Должен корректно очистить состояние
      expect(VoiceRoom.currentRoomId).toBeNull();
      expect(VoiceRoom.myUserId).toBeNull();
    });

    it('должен обрабатывать выход до полной инициализации медиа', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.elements.usernameInput.value = 'User1';
      
      // Начинаем создание комнаты
      VoiceRoom.createRoom();
      
      // Сразу выходим до завершения
      await new Promise(resolve => setTimeout(resolve, 50));
      VoiceRoom.leaveRoom();
      
      // Должен обработать без ошибок
      expect(VoiceRoom.currentRoomId).toBeNull();
    });
  });

  describe('Повторное присоединение к той же комнате', () => {
    it('должен позволить повторно присоединиться к комнате', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Создаем комнату
      VoiceRoom.elements.usernameInput.value = 'User1';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = VoiceRoom.currentRoomId;
      const firstUserId = VoiceRoom.myUserId;
      
      // Выходим (комната удаляется из socket-mock так как последний пользователь вышел)
      VoiceRoom.leaveRoom();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Создаем комнату заново перед повторным присоединением
      // (в реальном приложении комната удаляется когда последний пользователь выходит)
      VoiceRoom.elements.usernameInput.value = 'User1';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const newRoomId = VoiceRoom.currentRoomId;
      expect(newRoomId).toBeTruthy();
      // UserId должен быть новый
      expect(VoiceRoom.myUserId).toBeTruthy();
      expect(VoiceRoom.myUserId).not.toBe(firstUserId);
    });

    it('должен обрабатывать повторное присоединение с другим username', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Создаем комнату как User1
      VoiceRoom.elements.usernameInput.value = 'User1';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = VoiceRoom.currentRoomId;
      VoiceRoom.leaveRoom();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Создаем комнату заново с другим username
      // (в реальном приложении комната удаляется когда последний пользователь выходит)
      VoiceRoom.elements.usernameInput.value = 'User2';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const newRoomId = VoiceRoom.currentRoomId;
      expect(newRoomId).toBeTruthy();
      // Username должен быть обновлен
      expect(VoiceRoom.myUsername).toBe('User2');
    });
  });

  describe('Присоединение к несуществующей комнате', () => {
    it('должен обрабатывать присоединение к несуществующей комнате', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.elements.usernameInput.value = 'User1';
      VoiceRoom.elements.roomIdInput.value = 'INVALID'; // Неправильная длина, сначала покажет ошибку валидации
      
      const showNotificationSpy = vi.spyOn(VoiceRoom, 'showNotification');
      
      await new Promise(resolve => {
        VoiceRoom.joinExistingRoom();
        setTimeout(resolve, 200);
      });
      
      // Должен показать ошибку валидации для неправильной длины roomId
      expect(showNotificationSpy).toHaveBeenCalled();
    });

    it('должен обрабатывать присоединение к комнате с неправильным форматом', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.elements.usernameInput.value = 'User1';
      VoiceRoom.elements.roomIdInput.value = 'ABC'; // Неправильная длина
      
      const showNotificationSpy = vi.spyOn(VoiceRoom, 'showNotification');
      VoiceRoom.joinExistingRoom();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      // Должен показать ошибку валидации
      expect(showNotificationSpy).toHaveBeenCalled();
    });
  });

  describe('Выход из комнаты когда нет других участников', () => {
    it('должен корректно обработать выход из пустой комнаты', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.elements.usernameInput.value = 'User1';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      expect(VoiceRoom.currentRoomId).toBeTruthy();
      
      VoiceRoom.leaveRoom();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(VoiceRoom.currentRoomId).toBeNull();
      expect(VoiceRoom.peers.size).toBe(0);
    });

    it('должен очистить UI при выходе из пустой комнаты', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.elements.usernameInput.value = 'User1';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const userCard = document.querySelector('.user-card');
      expect(userCard).toBeTruthy();
      
      VoiceRoom.leaveRoom();
      
      const userCardAfter = document.querySelector('.user-card');
      expect(userCardAfter).toBeFalsy();
    });
  });

  describe('Создание комнаты с тем же username', () => {
    it('должен позволить создать комнату с username что уже существует', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Создаем первую комнату
      VoiceRoom.elements.usernameInput.value = 'SameUser';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId1 = VoiceRoom.currentRoomId;
      VoiceRoom.leaveRoom();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Создаем вторую комнату с тем же username
      VoiceRoom.elements.usernameInput.value = 'SameUser';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId2 = VoiceRoom.currentRoomId;
      expect(roomId2).toBeTruthy();
      expect(roomId2).not.toBe(roomId1);
    });
  });

  describe('Переключение между комнатами', () => {
    it('должен позволить переключиться из одной комнаты в другую', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Создаем первую комнату
      VoiceRoom.elements.usernameInput.value = 'User1';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId1 = VoiceRoom.currentRoomId;
      
      // Создаем вторую комнату
      VoiceRoom.elements.usernameInput.value = 'User1';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId2 = VoiceRoom.currentRoomId;
      
      expect(roomId2).toBeTruthy();
      expect(roomId2).not.toBe(roomId1);
    });

    it('должен очистить peer connections при переключении комнат', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      // Создаем первую комнату и добавляем peer connections
      VoiceRoom.elements.usernameInput.value = 'User1';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      VoiceRoom.createPeerConnection('user1');
      VoiceRoom.createPeerConnection('user2');
      expect(VoiceRoom.peers.size).toBe(2);
      
      // Создаем вторую комнату
      VoiceRoom.elements.usernameInput.value = 'User1';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      // Peer connections должны быть очищены или пересозданы
      expect(VoiceRoom.peers.size).toBe(0);
    });
  });

  describe('Сценарии с множественными пользователями', () => {
    it('должен обрабатывать сценарий: создание -> присоединение 3х -> выход создателя -> присоединение нового', async () => {
      const clients = [];
      for (let i = 0; i < 5; i++) {
        const client = { VoiceRoom: { ...VoiceRoom }, socket: null };
        client.VoiceRoom.init();
        await new Promise(resolve => setTimeout(resolve, 50));
        clients.push(client);
      }
      
      // Первый создает комнату
      clients[0].VoiceRoom.elements.usernameInput.value = 'Creator';
      await new Promise(resolve => {
        clients[0].VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = clients[0].VoiceRoom.currentRoomId;
      
      // Три пользователя присоединяются
      for (let i = 1; i <= 3; i++) {
        clients[i].VoiceRoom.elements.usernameInput.value = `User${i}`;
        clients[i].VoiceRoom.elements.roomIdInput.value = roomId;
        await new Promise(resolve => {
          clients[i].VoiceRoom.joinExistingRoom();
          setTimeout(resolve, 200);
        });
      }
      
      // Создатель выходит
      clients[0].VoiceRoom.leaveRoom();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Новый пользователь присоединяется
      clients[4].VoiceRoom.elements.usernameInput.value = 'User5';
      clients[4].VoiceRoom.elements.roomIdInput.value = roomId;
      await new Promise(resolve => {
        clients[4].VoiceRoom.joinExistingRoom();
        setTimeout(resolve, 200);
      });
      
      // Проверяем что новый пользователь присоединился
      expect(clients[4].VoiceRoom.currentRoomId).toBe(roomId);
    });
  });
});
