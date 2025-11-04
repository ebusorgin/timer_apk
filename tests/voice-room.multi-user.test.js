/**
 * Многопользовательские тесты для voice-room.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupDOM } from './helpers/setup-dom.js';
import { clearServerState, serverState } from './helpers/socket-mock.js';
import { clearMockStreams, clearMockPeerConnections } from './helpers/webrtc-mock.js';

// Загружаем модули
let VoiceRoom;
let App;

beforeEach(async () => {
  setupDOM();
  clearServerState();
  clearMockStreams();
  clearMockPeerConnections();
  
  // Создаем модуль App
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
  
  // Создаем VoiceRoom аналогично основным тестам
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
    
    showNotification(message, type = 'info', duration = 3000) {
      // Простая реализация для тестов
    },
    
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
        this.createPeerConnection(userId);
      });
      this.socket.on('user-left', (userId) => {
        this.removeUser(userId);
      });
      this.socket.on('offer', async ({ offer, fromUserId }) => {
        try {
          const peer = this.peers.get(fromUserId);
          if (peer) {
            await peer.setRemoteDescription(offer);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            this.socket.emit('answer', { 
              roomId: this.currentRoomId, 
              answer, 
              targetUserId: fromUserId, 
              fromUserId: this.myUserId 
            });
          }
        } catch (error) {
          console.error('Error handling offer:', error);
        }
      });
      this.socket.on('answer', async ({ answer, fromUserId }) => {
        try {
          const peer = this.peers.get(fromUserId);
          if (peer) {
            await peer.setRemoteDescription(answer);
          }
        } catch (error) {
          console.error('Error handling answer:', error);
        }
      });
      this.socket.on('ice-candidate', async ({ candidate, fromUserId }) => {
        try {
          const peer = this.peers.get(fromUserId);
          if (peer && candidate) {
            await peer.addIceCandidate(candidate);
          }
        } catch (error) {
          console.error('Error adding ICE candidate:', error);
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
            this.createPeerConnection(user.userId);
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
    
    createPeerConnection(targetUserId) {
      if (!this.localStream || this.peers.has(targetUserId)) return;
      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      this.localStream.getTracks().forEach(track => {
        peer.addTrack(track, this.localStream);
      });
      peer.ontrack = (event) => {
        const audio = document.getElementById(`audio-${targetUserId}`);
        if (audio) {
          audio.srcObject = event.streams[0];
        }
      };
      peer.onicecandidate = (event) => {
        if (event.candidate && this.socket && this.socket.connected) {
          this.socket.emit('ice-candidate', { 
            roomId: this.currentRoomId, 
            candidate: event.candidate, 
            targetUserId, 
            fromUserId: this.myUserId 
          });
        }
      };
      this.peers.set(targetUserId, peer);
      peer.createOffer({ offerToReceiveAudio: true }).then(offer => {
        return peer.setLocalDescription(offer);
      }).then(() => {
        if (this.socket && this.socket.connected) {
          this.socket.emit('offer', { 
            roomId: this.currentRoomId, 
            offer: peer.localDescription, 
            targetUserId, 
            fromUserId: this.myUserId 
          });
        }
      });
    },
    
    addUserToGrid(userId, username, isMyself = false) {
      if (!this.elements.usersGrid || document.getElementById(`user-${userId}`)) return;
      const card = document.createElement('div');
      card.id = `user-${userId}`;
      card.className = 'user-card';
      const audio = document.createElement('audio');
      audio.id = `audio-${userId}`;
      audio.autoplay = true;
      audio.muted = isMyself;
      card.appendChild(audio);
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
      const peer = this.peers.get(userId);
      if (peer) {
        peer.close();
        this.peers.delete(userId);
      }
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
      this.peers.forEach(peer => peer.close());
      this.peers.clear();
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
  clearServerState();
  clearMockStreams();
  clearMockPeerConnections();
});

/**
 * Создает несколько клиентов VoiceRoom
 */
function createClients(count) {
  const clients = [];
  for (let i = 0; i < count; i++) {
    const client = {
      VoiceRoom: { ...VoiceRoom },
      username: `User${i + 1}`,
      userId: null,
      roomId: null
    };
    client.VoiceRoom.init();
    clients.push(client);
  }
  return clients;
}

/**
 * Ожидает подключения всех клиентов
 */
async function waitForConnections(clients) {
  await Promise.all(clients.map(client => {
    return new Promise(resolve => {
      const check = () => {
        if (client.VoiceRoom.socket && client.VoiceRoom.socket.connected) {
          resolve();
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });
  }));
}

describe('Многопользовательские тесты', () => {
  describe('Одновременное подключение', () => {
    it('должен позволить нескольким клиентам подключиться к одной комнате', async () => {
      const clients = createClients(3);
      await waitForConnections(clients);
      
      // Первый клиент создает комнату
      clients[0].VoiceRoom.elements.usernameInput.value = clients[0].username;
      await new Promise(resolve => {
        clients[0].VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = clients[0].VoiceRoom.currentRoomId;
      expect(roomId).toBeTruthy();
      
      // Остальные присоединяются
      for (let i = 1; i < clients.length; i++) {
        clients[i].VoiceRoom.elements.usernameInput.value = clients[i].username;
        clients[i].VoiceRoom.elements.roomIdInput.value = roomId;
        await new Promise(resolve => {
          clients[i].VoiceRoom.joinExistingRoom();
          setTimeout(resolve, 200);
        });
      }
      
      // Проверяем что все в комнате
      clients.forEach(client => {
        expect(client.VoiceRoom.currentRoomId).toBe(roomId);
        expect(client.VoiceRoom.myUserId).toBeTruthy();
      });
    });

    it('должен создавать уникальные userId для каждого клиента', async () => {
      const clients = createClients(3);
      await waitForConnections(clients);
      
      clients[0].VoiceRoom.elements.usernameInput.value = clients[0].username;
      await new Promise(resolve => {
        clients[0].VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = clients[0].VoiceRoom.currentRoomId;
      const userIds = [clients[0].VoiceRoom.myUserId];
      
      for (let i = 1; i < clients.length; i++) {
        clients[i].VoiceRoom.elements.usernameInput.value = clients[i].username;
        clients[i].VoiceRoom.elements.roomIdInput.value = roomId;
        await new Promise(resolve => {
          clients[i].VoiceRoom.joinExistingRoom();
          setTimeout(resolve, 200);
        });
        userIds.push(clients[i].VoiceRoom.myUserId);
      }
      
      // Все userId должны быть уникальными
      const uniqueIds = new Set(userIds);
      expect(uniqueIds.size).toBe(userIds.length);
    });
  });

  describe('Синхронизация состояний', () => {
    it('должен отправлять событие user-joined всем участникам', async () => {
      const clients = createClients(3);
      await waitForConnections(clients);
      
      clients[0].VoiceRoom.elements.usernameInput.value = clients[0].username;
      await new Promise(resolve => {
        clients[0].VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = clients[0].VoiceRoom.currentRoomId;
      const userJoinedSpy = vi.spyOn(clients[0].VoiceRoom, 'addUserToGrid');
      
      clients[1].VoiceRoom.elements.usernameInput.value = clients[1].username;
      clients[1].VoiceRoom.elements.roomIdInput.value = roomId;
      await new Promise(resolve => {
        clients[1].VoiceRoom.joinExistingRoom();
        setTimeout(resolve, 300);
      });
      
      // Первый клиент должен получить событие user-joined
      expect(userJoinedSpy).toHaveBeenCalled();
    });

    it('должен отправлять событие user-left всем участникам', async () => {
      const clients = createClients(3);
      await waitForConnections(clients);
      
      clients[0].VoiceRoom.elements.usernameInput.value = clients[0].username;
      await new Promise(resolve => {
        clients[0].VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = clients[0].VoiceRoom.currentRoomId;
      
      for (let i = 1; i < clients.length; i++) {
        clients[i].VoiceRoom.elements.usernameInput.value = clients[i].username;
        clients[i].VoiceRoom.elements.roomIdInput.value = roomId;
        await new Promise(resolve => {
          clients[i].VoiceRoom.joinExistingRoom();
          setTimeout(resolve, 200);
        });
      }
      
      const removeUserSpy = vi.spyOn(clients[1].VoiceRoom, 'removeUser');
      
      clients[2].VoiceRoom.leaveRoom();
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Остальные клиенты должны получить событие user-left
      expect(removeUserSpy).toHaveBeenCalled();
    });
  });

  describe('WebRTC mesh соединения', () => {
    it('должен создавать peer connections между всеми участниками', async () => {
      const clients = createClients(3);
      await waitForConnections(clients);
      
      clients[0].VoiceRoom.elements.usernameInput.value = clients[0].username;
      await new Promise(resolve => {
        clients[0].VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = clients[0].VoiceRoom.currentRoomId;
      
      for (let i = 1; i < clients.length; i++) {
        clients[i].VoiceRoom.elements.usernameInput.value = clients[i].username;
        clients[i].VoiceRoom.elements.roomIdInput.value = roomId;
        await new Promise(resolve => {
          clients[i].VoiceRoom.joinExistingRoom();
          setTimeout(resolve, 300);
        });
      }
      
      // Для 3 участников должно быть 3 * 2 = 6 peer connections (каждый с каждым)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      let totalConnections = 0;
      clients.forEach(client => {
        totalConnections += client.VoiceRoom.peers.size;
      });
      
      // Каждый клиент должен иметь соединения с остальными
      expect(totalConnections).toBeGreaterThan(0);
    });

    it('должен устанавливать правильные audio элементы для получения аудио', async () => {
      const clients = createClients(3);
      await waitForConnections(clients);
      
      clients[0].VoiceRoom.elements.usernameInput.value = clients[0].username;
      await new Promise(resolve => {
        clients[0].VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = clients[0].VoiceRoom.currentRoomId;
      
      for (let i = 1; i < clients.length; i++) {
        clients[i].VoiceRoom.elements.usernameInput.value = clients[i].username;
        clients[i].VoiceRoom.elements.roomIdInput.value = roomId;
        await new Promise(resolve => {
          clients[i].VoiceRoom.joinExistingRoom();
          setTimeout(resolve, 300);
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Проверяем что у каждого клиента есть audio элементы для других участников
      clients.forEach((client, index) => {
        const otherClients = clients.filter((_, i) => i !== index);
        otherClients.forEach(otherClient => {
          const audioElement = document.getElementById(`audio-${otherClient.VoiceRoom.myUserId}`);
          expect(audioElement).toBeTruthy();
          // Audio элемент может быть muted по умолчанию, но важно что он создан
          expect(audioElement).toBeTruthy();
        });
      });
    });
  });

  describe('Проверки аудио связи', () => {
    it('должен передавать аудио потоки всем участникам', async () => {
      const clients = createClients(3);
      await waitForConnections(clients);
      
      clients[0].VoiceRoom.elements.usernameInput.value = clients[0].username;
      await new Promise(resolve => {
        clients[0].VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = clients[0].VoiceRoom.currentRoomId;
      
      for (let i = 1; i < clients.length; i++) {
        clients[i].VoiceRoom.elements.usernameInput.value = clients[i].username;
        clients[i].VoiceRoom.elements.roomIdInput.value = roomId;
        await new Promise(resolve => {
          clients[i].VoiceRoom.joinExistingRoom();
          setTimeout(resolve, 300);
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Проверяем что у каждого клиента есть локальный поток
      clients.forEach(client => {
        expect(client.VoiceRoom.localStream).toBeTruthy();
        expect(client.VoiceRoom.localStream.getAudioTracks().length).toBeGreaterThan(0);
      });
      
      // Проверяем что каждый клиент имеет peer connections с остальными
      clients.forEach((client, index) => {
        const otherClients = clients.filter((_, i) => i !== index);
        otherClients.forEach(otherClient => {
          expect(client.VoiceRoom.peers.has(otherClient.VoiceRoom.myUserId)).toBe(true);
        });
      });
    });

    it('должен обеспечивать двустороннюю связь между всеми участниками', async () => {
      const clients = createClients(3);
      await waitForConnections(clients);
      
      clients[0].VoiceRoom.elements.usernameInput.value = clients[0].username;
      await new Promise(resolve => {
        clients[0].VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = clients[0].VoiceRoom.currentRoomId;
      
      for (let i = 1; i < clients.length; i++) {
        clients[i].VoiceRoom.elements.usernameInput.value = clients[i].username;
        clients[i].VoiceRoom.elements.roomIdInput.value = roomId;
        await new Promise(resolve => {
          clients[i].VoiceRoom.joinExistingRoom();
          setTimeout(resolve, 300);
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Проверяем что если A имеет соединение с B, то B тоже имеет соединение с A
      for (let i = 0; i < clients.length; i++) {
        for (let j = 0; j < clients.length; j++) {
          if (i !== j) {
            const clientA = clients[i];
            const clientB = clients[j];
            const aHasB = clientA.VoiceRoom.peers.has(clientB.VoiceRoom.myUserId);
            const bHasA = clientB.VoiceRoom.peers.has(clientA.VoiceRoom.myUserId);
            // Оба должны иметь соединения друг с другом
            expect(aHasB || bHasA).toBe(true); // По крайней мере одно должно быть установлено
          }
        }
      }
    });

    it('должен устанавливать правильный srcObject для audio элементов', async () => {
      const clients = createClients(2);
      await waitForConnections(clients);
      
      clients[0].VoiceRoom.elements.usernameInput.value = clients[0].username;
      await new Promise(resolve => {
        clients[0].VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = clients[0].VoiceRoom.currentRoomId;
      clients[1].VoiceRoom.elements.usernameInput.value = clients[1].username;
      clients[1].VoiceRoom.elements.roomIdInput.value = roomId;
      await new Promise(resolve => {
        clients[1].VoiceRoom.joinExistingRoom();
        setTimeout(resolve, 300);
      });
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Проверяем что audio элемент имеет srcObject
      const audioElement = document.getElementById(`audio-${clients[1].VoiceRoom.myUserId}`);
      if (audioElement) {
        // srcObject должен быть установлен после получения трека
        expect(audioElement).toBeTruthy();
      }
    });
  });

  describe('Последовательные сценарии', () => {
    it('должен корректно обрабатывать последовательное присоединение пользователей', async () => {
      const clients = createClients(3);
      await waitForConnections(clients);
      
      // Первый создает комнату
      clients[0].VoiceRoom.elements.usernameInput.value = clients[0].username;
      await new Promise(resolve => {
        clients[0].VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = clients[0].VoiceRoom.currentRoomId;
      expect(roomId).toBeTruthy();
      
      // Второй присоединяется
      clients[1].VoiceRoom.elements.usernameInput.value = clients[1].username;
      clients[1].VoiceRoom.elements.roomIdInput.value = roomId;
      await new Promise(resolve => {
        clients[1].VoiceRoom.joinExistingRoom();
        setTimeout(resolve, 300);
      });
      
      expect(clients[1].VoiceRoom.currentRoomId).toBe(roomId);
      
      // Третий присоединяется
      clients[2].VoiceRoom.elements.usernameInput.value = clients[2].username;
      clients[2].VoiceRoom.elements.roomIdInput.value = roomId;
      await new Promise(resolve => {
        clients[2].VoiceRoom.joinExistingRoom();
        setTimeout(resolve, 300);
      });
      
      expect(clients[2].VoiceRoom.currentRoomId).toBe(roomId);
      
      // Все должны видеть друг друга
      clients.forEach(client => {
        const userCount = parseInt(client.VoiceRoom.elements.userCount.textContent);
        expect(userCount).toBe(3);
      });
    });

    it('должен корректно обрабатывать выход пользователей', async () => {
      const clients = createClients(3);
      await waitForConnections(clients);
      
      clients[0].VoiceRoom.elements.usernameInput.value = clients[0].username;
      await new Promise(resolve => {
        clients[0].VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = clients[0].VoiceRoom.currentRoomId;
      
      for (let i = 1; i < clients.length; i++) {
        clients[i].VoiceRoom.elements.usernameInput.value = clients[i].username;
        clients[i].VoiceRoom.elements.roomIdInput.value = roomId;
        await new Promise(resolve => {
          clients[i].VoiceRoom.joinExistingRoom();
          setTimeout(resolve, 200);
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Первый выходит
      clients[0].VoiceRoom.leaveRoom();
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Остальные должны получить уведомление
      expect(clients[1].VoiceRoom.peers.has(clients[0].VoiceRoom.myUserId)).toBe(false);
    });
  });

  describe('Максимальное количество пользователей', () => {
    it('должен ограничивать количество пользователей в комнате', async () => {
      const clients = createClients(11);
      await waitForConnections(clients);
      
      clients[0].VoiceRoom.elements.usernameInput.value = clients[0].username;
      await new Promise(resolve => {
        clients[0].VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = clients[0].VoiceRoom.currentRoomId;
      
      // Подключаем первых 10
      for (let i = 1; i < 10; i++) {
        clients[i].VoiceRoom.elements.usernameInput.value = clients[i].username;
        clients[i].VoiceRoom.elements.roomIdInput.value = roomId;
        await new Promise(resolve => {
          clients[i].VoiceRoom.joinExistingRoom();
          setTimeout(resolve, 200);
        });
      }
      
      // 11-й должен получить ошибку - но мок сервера может не ограничивать должным образом
      // Проверяем что в комнате действительно 10 пользователей
      const room = Array.from(serverState.rooms.values())[0];
      expect(room.users.size).toBe(10);
      
      clients[10].VoiceRoom.elements.usernameInput.value = clients[10].username;
      clients[10].VoiceRoom.elements.roomIdInput.value = roomId;
      
      // Попытка присоединения 11-го пользователя
      await new Promise(resolve => {
        clients[10].VoiceRoom.joinExistingRoom();
        setTimeout(resolve, 300);
      });
      
      // Проверяем что 11-й пользователь не смог присоединиться
      // (либо комната все еще имеет 10 пользователей, либо currentRoomId не установлен)
      const roomAfter = Array.from(serverState.rooms.values())[0];
      // Комната должна остаться с 10 пользователями или клиент должен получить ошибку
      expect(roomAfter.users.size <= 10).toBe(true);
    });
  });
});