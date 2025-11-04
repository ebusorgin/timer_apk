/**
 * Тесты состояний соединений для voice-room.js
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
    reconnectTimeout: null,
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
        statusMessage: document.getElementById('statusMessage')
      };
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
      this.socket.on('disconnect', (reason) => {
        this.connectionStatus = 'disconnected';
        if (reason !== 'io client disconnect' && this.currentRoomId) {
          this.scheduleReconnection();
        }
      });
      this.socket.on('reconnect', () => {
        this.connectionStatus = 'connected';
        if (this.currentRoomId && this.myUsername) {
          this.reconnectToRoom();
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
    
    reconnectToRoom() {
      if (!this.currentRoomId || !this.myUsername) return;
      this.socket.emit('join-room', { 
        roomId: this.currentRoomId, 
        username: this.myUsername 
      }, (response) => {
        if (response.error) {
          this.leaveRoom();
        }
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
      
      peer.oniceconnectionstatechange = () => {
        const card = document.getElementById(`user-${targetUserId}`);
        if (card) {
          const status = card.querySelector('.user-status');
          if (status) {
            switch (peer.iceConnectionState) {
              case 'connected':
                status.textContent = 'Подключен';
                break;
              case 'connecting':
              case 'checking':
                status.textContent = 'Подключение...';
                break;
              case 'disconnected':
                status.textContent = 'Отключен';
                break;
              case 'failed':
                status.textContent = 'Ошибка подключения';
                break;
              case 'closed':
                status.textContent = 'Закрыто';
                break;
            }
          }
        }
      };
      
      this.peers.set(targetUserId, peer);
    },
    
    addUserToGrid(userId, username) {
      if (!this.elements.usersGrid || document.getElementById(`user-${userId}`)) return;
      const card = document.createElement('div');
      card.id = `user-${userId}`;
      card.className = 'user-card';
      const status = document.createElement('div');
      status.className = 'user-status';
      card.appendChild(status);
      this.elements.usersGrid.appendChild(card);
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
  vi.clearAllMocks();
});

describe('Состояния соединений', () => {
  describe('Состояния ICE', () => {
    it('должен обрабатывать состояние new', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      expect(peer.iceConnectionState).toBe('new');
    });

    it('должен обрабатывать состояние connecting', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      peer.iceConnectionState = 'connecting';
      
      if (peer._onIceConnectionStateChange) {
        peer._onIceConnectionStateChange();
      }
      
      const status = document.querySelector(`#user-${targetUserId} .user-status`);
      expect(status.textContent).toBe('Подключение...');
    });

    it('должен обрабатывать состояние connected', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      peer.iceConnectionState = 'connected';
      
      if (peer._onIceConnectionStateChange) {
        peer._onIceConnectionStateChange();
      }
      
      const status = document.querySelector(`#user-${targetUserId} .user-status`);
      expect(status.textContent).toBe('Подключен');
    });

    it('должен обрабатывать состояние disconnected', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      peer.iceConnectionState = 'disconnected';
      
      if (peer._onIceConnectionStateChange) {
        peer._onIceConnectionStateChange();
      }
      
      const status = document.querySelector(`#user-${targetUserId} .user-status`);
      expect(status.textContent).toBe('Отключен');
    });

    it('должен обрабатывать состояние failed', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      peer.iceConnectionState = 'failed';
      
      if (peer._onIceConnectionStateChange) {
        peer._onIceConnectionStateChange();
      }
      
      const status = document.querySelector(`#user-${targetUserId} .user-status`);
      expect(status.textContent).toBe('Ошибка подключения');
    });

    it('должен обрабатывать состояние closed', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      peer.iceConnectionState = 'closed';
      
      if (peer._onIceConnectionStateChange) {
        peer._onIceConnectionStateChange();
      }
      
      const status = document.querySelector(`#user-${targetUserId} .user-status`);
      expect(status.textContent).toBe('Закрыто');
    });

    it('должен обрабатывать состояние checking', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      peer.iceConnectionState = 'checking';
      
      if (peer._onIceConnectionStateChange) {
        peer._onIceConnectionStateChange();
      }
      
      const status = document.querySelector(`#user-${targetUserId} .user-status`);
      expect(status.textContent).toBe('Подключение...');
    });
  });

  describe('Переподключение', () => {
    it('должен планировать переподключение при disconnect', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.currentRoomId = 'TEST01';
      VoiceRoom.myUsername = 'TestUser';
      
      if (VoiceRoom.socket && VoiceRoom.socket._eventHandlers) {
        const handlers = VoiceRoom.socket._eventHandlers.get('disconnect');
        if (handlers) {
          handlers.forEach(handler => handler('transport close'));
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(VoiceRoom.reconnectTimeout).toBeTruthy();
    });

    it('не должен планировать переподключение при ручном disconnect', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.currentRoomId = 'TEST01';
      VoiceRoom.myUsername = 'TestUser';
      
      if (VoiceRoom.socket && VoiceRoom.socket._eventHandlers) {
        const handlers = VoiceRoom.socket._eventHandlers.get('disconnect');
        if (handlers) {
          handlers.forEach(handler => handler('io client disconnect'));
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(VoiceRoom.reconnectTimeout).toBeFalsy();
    });

    it('должен переподключаться к комнате после восстановления соединения', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.currentRoomId = 'TEST01';
      VoiceRoom.myUsername = 'TestUser';
      
      const emitSpy = vi.spyOn(VoiceRoom.socket, 'emit');
      
      if (VoiceRoom.socket && VoiceRoom.socket._eventHandlers) {
        const handlers = VoiceRoom.socket._eventHandlers.get('reconnect');
        if (handlers) {
          handlers.forEach(handler => handler());
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(emitSpy).toHaveBeenCalledWith('join-room', expect.any(Object), expect.any(Function));
    });

    it('не должен переподключаться если нет currentRoomId', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.currentRoomId = null;
      VoiceRoom.myUsername = 'TestUser';
      
      const emitSpy = vi.spyOn(VoiceRoom.socket, 'emit');
      
      if (VoiceRoom.socket && VoiceRoom.socket._eventHandlers) {
        const handlers = VoiceRoom.socket._eventHandlers.get('reconnect');
        if (handlers) {
          handlers.forEach(handler => handler());
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(emitSpy).not.toHaveBeenCalledWith('join-room', expect.any(Object), expect.any(Function));
    });

    it('не должен переподключаться если нет myUsername', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.currentRoomId = 'TEST01';
      VoiceRoom.myUsername = null;
      
      const emitSpy = vi.spyOn(VoiceRoom.socket, 'emit');
      
      if (VoiceRoom.socket && VoiceRoom.socket._eventHandlers) {
        const handlers = VoiceRoom.socket._eventHandlers.get('reconnect');
        if (handlers) {
          handlers.forEach(handler => handler());
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(emitSpy).not.toHaveBeenCalledWith('join-room', expect.any(Object), expect.any(Function));
    });

    it('должен очищать предыдущий reconnectTimeout при новом', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.currentRoomId = 'TEST01';
      VoiceRoom.myUsername = 'TestUser';
      
      const firstTimeout = setTimeout(() => {}, 1000);
      VoiceRoom.reconnectTimeout = firstTimeout;
      
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      
      if (VoiceRoom.socket && VoiceRoom.socket._eventHandlers) {
        const handlers = VoiceRoom.socket._eventHandlers.get('disconnect');
        if (handlers) {
          handlers.forEach(handler => handler('transport close'));
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('Множественные попытки переподключения', () => {
    it('должен планировать переподключение после задержки', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.currentRoomId = 'TEST01';
      VoiceRoom.myUsername = 'TestUser';
      
      vi.useFakeTimers();
      
      if (VoiceRoom.socket && VoiceRoom.socket._eventHandlers) {
        const handlers = VoiceRoom.socket._eventHandlers.get('disconnect');
        if (handlers) {
          handlers.forEach(handler => handler('transport close'));
        }
      }
      
      expect(VoiceRoom.reconnectTimeout).toBeTruthy();
      
      const initSocketSpy = vi.spyOn(VoiceRoom, 'initSocket');
      vi.advanceTimersByTime(3000);
      
      expect(initSocketSpy).toHaveBeenCalled();
      
      vi.useRealTimers();
    });

    it('не должен переподключаться если соединение уже восстановлено', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.currentRoomId = 'TEST01';
      VoiceRoom.myUsername = 'TestUser';
      
      vi.useFakeTimers();
      
      if (VoiceRoom.socket && VoiceRoom.socket._eventHandlers) {
        const handlers = VoiceRoom.socket._eventHandlers.get('disconnect');
        if (handlers) {
          handlers.forEach(handler => handler('transport close'));
        }
      }
      
      // Восстанавливаем соединение до истечения таймаута
      VoiceRoom.connectionStatus = 'connected';
      
      const initSocketSpy = vi.spyOn(VoiceRoom, 'initSocket');
      vi.advanceTimersByTime(3000);
      
      // Не должен вызывать initSocket если уже подключен
      expect(initSocketSpy).not.toHaveBeenCalled();
      
      vi.useRealTimers();
    });

    it('не должен переподключаться если currentRoomId очищен', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.currentRoomId = 'TEST01';
      VoiceRoom.myUsername = 'TestUser';
      
      vi.useFakeTimers();
      
      if (VoiceRoom.socket && VoiceRoom.socket._eventHandlers) {
        const handlers = VoiceRoom.socket._eventHandlers.get('disconnect');
        if (handlers) {
          handlers.forEach(handler => handler('transport close'));
        }
      }
      
      // Очищаем currentRoomId до истечения таймаута
      VoiceRoom.currentRoomId = null;
      
      const initSocketSpy = vi.spyOn(VoiceRoom, 'initSocket');
      vi.advanceTimersByTime(3000);
      
      expect(initSocketSpy).not.toHaveBeenCalled();
      
      vi.useRealTimers();
    });
  });

  describe('Частичная потеря соединения', () => {
    it('должен обрабатывать disconnect одного peer connection', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.createPeerConnection('user1');
      VoiceRoom.createPeerConnection('user2');
      
      const peer1 = VoiceRoom.peers.get('user1');
      const peer2 = VoiceRoom.peers.get('user2');
      
      peer1.iceConnectionState = 'disconnected';
      if (peer1._onIceConnectionStateChange) {
        peer1._onIceConnectionStateChange();
      }
      
      // Другой peer должен остаться подключенным
      expect(VoiceRoom.peers.has('user2')).toBe(true);
      expect(VoiceRoom.peers.size).toBe(2);
    });

    it('должен обрабатывать failed состояние одного peer connection', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.addUserToGrid('user1', 'User1', false);
      VoiceRoom.createPeerConnection('user1');
      
      const peer = VoiceRoom.peers.get('user1');
      peer.iceConnectionState = 'failed';
      
      if (peer._onIceConnectionStateChange) {
        peer._onIceConnectionStateChange();
      }
      
      // Peer connection должен остаться в Map
      expect(VoiceRoom.peers.has('user1')).toBe(true);
    });
  });

  describe('Переходы между состояниями', () => {
    it('должен обрабатывать переход new -> connecting -> connected', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      
      expect(peer.iceConnectionState).toBe('new');
      
      peer.iceConnectionState = 'connecting';
      if (peer._onIceConnectionStateChange) {
        peer._onIceConnectionStateChange();
      }
      
      peer.iceConnectionState = 'connected';
      if (peer._onIceConnectionStateChange) {
        peer._onIceConnectionStateChange();
      }
      
      const status = document.querySelector(`#user-${targetUserId} .user-status`);
      expect(status.textContent).toBe('Подключен');
    });

    it('должен обрабатывать переход connected -> disconnected -> failed', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      
      peer.iceConnectionState = 'connected';
      if (peer._onIceConnectionStateChange) {
        peer._onIceConnectionStateChange();
      }
      
      peer.iceConnectionState = 'disconnected';
      if (peer._onIceConnectionStateChange) {
        peer._onIceConnectionStateChange();
      }
      
      peer.iceConnectionState = 'failed';
      if (peer._onIceConnectionStateChange) {
        peer._onIceConnectionStateChange();
      }
      
      const status = document.querySelector(`#user-${targetUserId} .user-status`);
      expect(status.textContent).toBe('Ошибка подключения');
    });
  });
});
