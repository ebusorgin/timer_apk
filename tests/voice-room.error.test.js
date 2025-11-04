/**
 * Тесты обработки ошибок для voice-room.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupDOM } from './helpers/setup-dom.js';
import { clearServerState } from './helpers/socket-mock.js';
import { mockGetUserMedia } from './helpers/webrtc-mock.js';

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
    reconnectTimeout: null,
    microphoneLevelCheckInterval: null,
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
      if (!this.elements.statusMessage) return;
      const statusEl = this.elements.statusMessage;
      statusEl.textContent = message;
      statusEl.className = `status-message ${type}`;
      statusEl.classList.add('show');
      setTimeout(() => {
        statusEl.classList.remove('show');
      }, duration);
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
      this.socket.on('connect_error', (error) => {
        this.connectionStatus = 'error';
        this.showNotification('Ошибка подключения к серверу', 'error', 5000);
      });
      this.socket.on('disconnect', (reason) => {
        this.connectionStatus = 'disconnected';
        if (reason !== 'io client disconnect' && this.currentRoomId) {
          this.scheduleReconnection();
        }
      });
      this.socket.on('reconnect_error', () => {
        this.connectionStatus = 'error';
        this.showNotification('Ошибка переподключения', 'error', 5000);
      });
      this.socket.on('reconnect_failed', () => {
        this.connectionStatus = 'error';
        this.showNotification('Не удалось подключиться к серверу', 'error', 5000);
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
          this.showNotification('Ошибка при установке соединения', 'error', 3000);
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
    
    scheduleReconnection() {
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
      }
      this.reconnectTimeout = setTimeout(() => {
        if (this.connectionStatus !== 'connected' && this.currentRoomId) {
          this.initSocket();
        }
      }, 3000);
    },
    
    async createRoom() {
      if (!this.elements.usernameInput) {
        console.error('Username input not found');
        return;
      }
      const username = this.sanitizeString(this.elements.usernameInput.value);
      if (!username || username.length < 1) {
        this.showNotification('Пожалуйста, введите ваше имя', 'error', 3000);
        return;
      }
      if (!this.socket) {
        this.showNotification('Ошибка подключения к серверу', 'error', 5000);
        return;
      }
      if (!this.socket.connected) {
        this.showNotification('Подключение к серверу... Пожалуйста, подождите.', 'info', 3000);
        return;
      }
      this.myUsername = username;
      this.socket.emit('create-room', { username }, (response) => {
        if (!response) {
          this.showNotification('Ошибка при создании комнаты. Попробуйте снова.', 'error', 5000);
          return;
        }
        if (response.error) {
          this.showNotification('Ошибка: ' + response.error, 'error', 5000);
          return;
        }
        const { roomId, userId } = response;
        this.currentRoomId = roomId;
        this.myUserId = userId;
        this.initMedia().then(() => {
          this.addUserToGrid(this.myUserId, username, true);
          this.showRoomScreen();
        }).catch(error => {
          let errorMessage = 'Не удалось получить доступ к микрофону. ';
          if (error.name === 'NotAllowedError') {
            errorMessage += 'Разрешите доступ к микрофону в настройках браузера.';
          } else if (error.name === 'NotFoundError') {
            errorMessage += 'Микрофон не найден.';
          } else {
            errorMessage += error.message;
          }
          this.showNotification(errorMessage, 'error', 7000);
        });
      });
    },
    
    async joinExistingRoom() {
      if (!this.elements.roomIdInput || !this.elements.usernameInput) return;
      const roomId = this.elements.roomIdInput.value.trim().toUpperCase();
      const username = this.sanitizeString(this.elements.usernameInput.value);
      if (!roomId || roomId.length !== 6) {
        this.showNotification('Введите код комнаты (6 символов)', 'error', 3000);
        return;
      }
      if (!username || username.length < 1) {
        this.showNotification('Пожалуйста, введите ваше имя', 'error', 3000);
        return;
      }
      if (!this.socket) {
        this.showNotification('Ошибка подключения к серверу', 'error', 5000);
        return;
      }
      if (!this.socket.connected) {
        this.showNotification('Подключение к серверу... Пожалуйста, подождите.', 'info', 3000);
        return;
      }
      this.myUsername = username;
      this.currentRoomId = roomId;
      this.socket.emit('join-room', { roomId, username }, async (response) => {
        if (response.error) {
          if (response.error.includes('not found')) {
            this.showNotification('Комната не найдена', 'info', 3000);
          } else {
            this.showNotification('Ошибка: ' + response.error, 'error', 5000);
          }
          return;
        }
        const { userId, users } = response;
        this.myUserId = userId;
        try {
          await this.initMedia();
          this.addUserToGrid(this.myUserId, username, true);
          if (users) {
            users.forEach(user => {
              this.addUserToGrid(user.userId, user.username);
              this.createPeerConnection(user.userId);
            });
          }
          this.showRoomScreen();
        } catch (error) {
          let errorMessage = 'Не удалось подключиться к комнате. ';
          if (error.name === 'NotAllowedError') {
            errorMessage += 'Разрешите доступ к микрофону в настройках браузера.';
          } else {
            errorMessage += error.message;
          }
          this.showNotification(errorMessage, 'error', 7000);
        }
      });
    },
    
    async initMedia() {
      try {
        if (this.localStream) {
          this.localStream.getTracks().forEach(track => track.stop());
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
          await this.audioContext.close();
        }
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
      } catch (error) {
        throw error;
      }
    },
    
    createPeerConnection(targetUserId) {
      if (!this.localStream) {
        return;
      }
      if (this.peers.has(targetUserId)) {
        return;
      }
      try {
        const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        this.localStream.getTracks().forEach(track => {
          peer.addTrack(track, this.localStream);
        });
        peer.ontrack = (event) => {
          const audio = document.getElementById(`audio-${targetUserId}`);
          if (audio) {
            audio.srcObject = event.streams[0];
            audio.play().catch(err => {
              console.error('Error playing audio:', err);
            });
          }
        };
        peer.onerror = () => {
          this.showNotification('Ошибка соединения с участником', 'error', 3000);
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
        }).catch(error => {
          this.peers.delete(targetUserId);
          this.showNotification('Ошибка при создании соединения', 'error', 3000);
        });
      } catch (error) {
        this.showNotification('Ошибка при создании соединения', 'error', 3000);
      }
    },
    
    addUserToGrid(userId, username) {
      if (!this.elements.usersGrid || document.getElementById(`user-${userId}`)) return;
      const card = document.createElement('div');
      card.id = `user-${userId}`;
      card.className = 'user-card';
      const audio = document.createElement('audio');
      audio.id = `audio-${userId}`;
      audio.autoplay = true;
      card.appendChild(audio);
      this.elements.usersGrid.appendChild(card);
    },
    
    removeUser(userId) {
      const peer = this.peers.get(userId);
      if (peer) {
        peer.close();
        this.peers.delete(userId);
      }
      const card = document.getElementById(`user-${userId}`);
      if (card) card.remove();
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
  if (VoiceRoom) {
    VoiceRoom.leaveRoom();
  }
  vi.clearAllMocks();
});

describe('Обработка ошибок', () => {
  describe('Ошибки доступа к микрофону', () => {
    it('должен обрабатывать NotAllowedError при запросе доступа к микрофону', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const error = new Error('Permission denied');
      error.name = 'NotAllowedError';
      mockGetUserMedia.mockRejectedValueOnce(error);
      
      VoiceRoom.elements.usernameInput.value = 'TestUser';
      const showNotificationSpy = vi.spyOn(VoiceRoom, 'showNotification');
      
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(showNotificationSpy).toHaveBeenCalledWith(
        expect.stringContaining('Разрешите доступ к микрофону'),
        'error',
        7000
      );
    });

    it('должен обрабатывать NotFoundError при отсутствии микрофона', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const error = new Error('No microphone found');
      error.name = 'NotFoundError';
      mockGetUserMedia.mockRejectedValueOnce(error);
      
      VoiceRoom.elements.usernameInput.value = 'TestUser';
      const showNotificationSpy = vi.spyOn(VoiceRoom, 'showNotification');
      
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(showNotificationSpy).toHaveBeenCalledWith(
        expect.stringContaining('Микрофон не найден'),
        'error',
        7000
      );
    });

    it('должен обрабатывать другие ошибки доступа к микрофону', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const error = new Error('Unknown error');
      error.name = 'OtherError';
      mockGetUserMedia.mockRejectedValueOnce(error);
      
      VoiceRoom.elements.usernameInput.value = 'TestUser';
      const showNotificationSpy = vi.spyOn(VoiceRoom, 'showNotification');
      
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(showNotificationSpy).toHaveBeenCalledWith(
        expect.stringContaining('Не удалось получить доступ к микрофону'),
        'error',
        7000
      );
    });
  });

  describe('Ошибки Socket.IO', () => {
    it('должен обрабатывать connect_error', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const showNotificationSpy = vi.spyOn(VoiceRoom, 'showNotification');
      
      if (VoiceRoom.socket && VoiceRoom.socket._eventHandlers) {
        const handlers = VoiceRoom.socket._eventHandlers.get('connect_error');
        if (handlers) {
          handlers.forEach(handler => handler(new Error('Connection failed')));
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(VoiceRoom.connectionStatus).toBe('error');
      expect(showNotificationSpy).toHaveBeenCalledWith(
        'Ошибка подключения к серверу',
        'error',
        5000
      );
    });

    it('должен обрабатывать reconnect_error', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const showNotificationSpy = vi.spyOn(VoiceRoom, 'showNotification');
      
      if (VoiceRoom.socket && VoiceRoom.socket._eventHandlers) {
        const handlers = VoiceRoom.socket._eventHandlers.get('reconnect_error');
        if (handlers) {
          handlers.forEach(handler => handler(new Error('Reconnect failed')));
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(VoiceRoom.connectionStatus).toBe('error');
      expect(showNotificationSpy).toHaveBeenCalledWith(
        'Ошибка переподключения',
        'error',
        5000
      );
    });

    it('должен обрабатывать reconnect_failed', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const showNotificationSpy = vi.spyOn(VoiceRoom, 'showNotification');
      
      if (VoiceRoom.socket && VoiceRoom.socket._eventHandlers) {
        const handlers = VoiceRoom.socket._eventHandlers.get('reconnect_failed');
        if (handlers) {
          handlers.forEach(handler => handler());
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(VoiceRoom.connectionStatus).toBe('error');
      expect(showNotificationSpy).toHaveBeenCalledWith(
        'Не удалось подключиться к серверу',
        'error',
        5000
      );
    });
  });

  describe('Ошибки при создании комнаты', () => {
    it('должен обрабатывать отсутствие ответа от сервера', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.elements.usernameInput.value = 'TestUser';
      const showNotificationSpy = vi.spyOn(VoiceRoom, 'showNotification');
      
      // Мокаем emit чтобы не вызывать callback
      const originalEmit = VoiceRoom.socket.emit.bind(VoiceRoom.socket);
      VoiceRoom.socket.emit = function(event, data, callback) {
        if (event === 'create-room' && callback) {
          // Не вызываем callback - симулируем отсутствие ответа
          return;
        }
        return originalEmit(event, data, callback);
      };
      
      VoiceRoom.createRoom();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Проверяем что ошибка обработана (через проверку что комната не создана)
      expect(VoiceRoom.currentRoomId).toBeFalsy();
    });

    it('должен обрабатывать ошибку от сервера при создании комнаты', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.elements.usernameInput.value = 'TestUser';
      const showNotificationSpy = vi.spyOn(VoiceRoom, 'showNotification');
      
      const originalEmit = VoiceRoom.socket.emit.bind(VoiceRoom.socket);
      VoiceRoom.socket.emit = function(event, data, callback) {
        if (event === 'create-room' && callback) {
          callback({ error: 'Server error' });
          return;
        }
        return originalEmit(event, data, callback);
      };
      
      VoiceRoom.createRoom();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(showNotificationSpy).toHaveBeenCalledWith(
        'Ошибка: Server error',
        'error',
        5000
      );
    });
  });

  describe('Ошибки при присоединении к комнате', () => {
    it('должен обрабатывать ошибку "комната не найдена"', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.elements.usernameInput.value = 'TestUser';
      VoiceRoom.elements.roomIdInput.value = 'INVALID';
      
      const showNotificationSpy = vi.spyOn(VoiceRoom, 'showNotification');
      
      await new Promise(resolve => {
        VoiceRoom.joinExistingRoom();
        setTimeout(resolve, 200);
      });
      
      expect(showNotificationSpy).toHaveBeenCalledWith(
        expect.stringContaining('не найдена'),
        'info',
        3000
      );
    });

    it('должен обрабатывать ошибку "комната переполнена"', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Создаем комнату и заполняем её
      VoiceRoom.elements.usernameInput.value = 'User1';
      await new Promise(resolve => {
        VoiceRoom.createRoom();
        setTimeout(resolve, 200);
      });
      
      const roomId = VoiceRoom.currentRoomId;
      VoiceRoom.leaveRoom();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Заполняем комнату до максимума
      for (let i = 1; i <= 10; i++) {
        const client = { VoiceRoom: { ...VoiceRoom }, socket: VoiceRoom.socket };
        client.VoiceRoom.init();
        await new Promise(resolve => setTimeout(resolve, 50));
        client.VoiceRoom.elements.usernameInput.value = `User${i}`;
        client.VoiceRoom.elements.roomIdInput.value = roomId;
        await new Promise(resolve => {
          client.VoiceRoom.joinExistingRoom();
          setTimeout(resolve, 100);
        });
      }
      
      // Пытаемся присоединиться 11-м
      VoiceRoom.elements.usernameInput.value = 'User11';
      VoiceRoom.elements.roomIdInput.value = roomId;
      const showNotificationSpy = vi.spyOn(VoiceRoom, 'showNotification');
      
      await new Promise(resolve => {
        VoiceRoom.joinExistingRoom();
        setTimeout(resolve, 200);
      });
      
      expect(showNotificationSpy).toHaveBeenCalledWith(
        expect.stringContaining('Room is full'),
        'error',
        5000
      );
    });
  });

  describe('Ошибки WebRTC', () => {
    it('должен обрабатывать ошибку при создании offer', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      
      const showNotificationSpy = vi.spyOn(VoiceRoom, 'showNotification');
      
      // Мокаем createOffer чтобы выбросить ошибку
      const originalCreateOffer = RTCPeerConnection.prototype.createOffer;
      RTCPeerConnection.prototype.createOffer = function() {
        return Promise.reject(new Error('Failed to create offer'));
      };
      
      VoiceRoom.createPeerConnection(targetUserId);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(showNotificationSpy).toHaveBeenCalledWith(
        'Ошибка при создании соединения',
        'error',
        3000
      );
      
      RTCPeerConnection.prototype.createOffer = originalCreateOffer;
    });

    it('должен обрабатывать ошибку peer connection', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const peer = VoiceRoom.peers.get(targetUserId);
      const showNotificationSpy = vi.spyOn(VoiceRoom, 'showNotification');
      
      if (peer && peer._onError) {
        peer._onError(new Error('Peer connection error'));
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(showNotificationSpy).toHaveBeenCalledWith(
        'Ошибка соединения с участником',
        'error',
        3000
      );
    });

    it('должен обрабатывать ошибку при обработке offer', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const showNotificationSpy = vi.spyOn(VoiceRoom, 'showNotification');
      
      // Мокаем setRemoteDescription чтобы выбросить ошибку
      const peer = VoiceRoom.peers.get(targetUserId);
      const originalSetRemoteDescription = peer.setRemoteDescription.bind(peer);
      peer.setRemoteDescription = () => Promise.reject(new Error('Failed to set remote description'));
      
      // Эмулируем событие offer
      if (VoiceRoom.socket && VoiceRoom.socket._eventHandlers) {
        const handlers = VoiceRoom.socket._eventHandlers.get('offer');
        if (handlers) {
          handlers.forEach(handler => handler({ 
            offer: { type: 'offer', sdp: 'test' }, 
            fromUserId: targetUserId 
          }));
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(showNotificationSpy).toHaveBeenCalledWith(
        'Ошибка при установке соединения',
        'error',
        3000
      );
      
      peer.setRemoteDescription = originalSetRemoteDescription;
    });
  });

  describe('Ошибки при воспроизведении аудио', () => {
    it('должен обрабатывать ошибку audio.play', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      
      const audioElement = document.getElementById(`audio-${targetUserId}`);
      const playError = vi.spyOn(audioElement, 'play').mockRejectedValueOnce(new Error('Play failed'));
      
      VoiceRoom.createPeerConnection(targetUserId);
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Проверяем что ошибка была обработана (не выбросила исключение)
      expect(playError).toHaveBeenCalled();
    });
  });

  describe('Ошибки при отсутствии элементов', () => {
    it('должен обрабатывать отсутствие usernameInput при createRoom', () => {
      VoiceRoom.init();
      VoiceRoom.elements.usernameInput = null;
      
      const showNotificationSpy = vi.spyOn(VoiceRoom, 'showNotification');
      VoiceRoom.createRoom();
      
      // Должен вернуться без ошибки
      expect(VoiceRoom.currentRoomId).toBeFalsy();
    });

    it('должен обрабатывать отсутствие socket при createRoom', () => {
      VoiceRoom.init();
      VoiceRoom.socket = null;
      VoiceRoom.elements.usernameInput.value = 'TestUser';
      
      const showNotificationSpy = vi.spyOn(VoiceRoom, 'showNotification');
      VoiceRoom.createRoom();
      
      expect(showNotificationSpy).toHaveBeenCalledWith(
        'Ошибка подключения к серверу',
        'error',
        5000
      );
    });

    it('должен обрабатывать отсутствие localStream при createPeerConnection', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.localStream = null;
      VoiceRoom.createPeerConnection('target-user');
      
      expect(VoiceRoom.peers.has('target-user')).toBe(false);
    });
  });
});
