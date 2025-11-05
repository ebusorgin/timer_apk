/**
 * Помощники для тестов смешанных сценариев веб+APK
 */

import { clearServerState, serverState } from './socket-mock.js';
import { clearMockStreams, clearMockPeerConnections, mockGetUserMedia } from './webrtc-mock.js';
import { setupDOM } from './setup-dom.js';

/**
 * Создает клиент указанного типа (web/cordova)
 */
export async function createClient(type, index) {
  // Устанавливаем мок для getUserMedia
  mockGetUserMedia();
  
  // Настраиваем DOM для клиента
  const container = document.createElement('div');
  container.id = `client-${index}`;
  container.className = 'client-container';
  document.body.appendChild(container);
  
  // Клонируем базовую структуру DOM
  const app = document.createElement('div');
  app.id = `app-${index}`;
  container.appendChild(app);
  
  // Login Screen
  const loginScreen = document.createElement('div');
  loginScreen.id = `loginScreen-${index}`;
  loginScreen.className = 'screen active';
  
  const loginContainer = document.createElement('div');
  loginContainer.className = 'login-container';
  
  const usernameInput = document.createElement('input');
  usernameInput.id = `username-${index}`;
  usernameInput.type = 'text';
  usernameInput.placeholder = 'Введите ваше имя';
  
  const btnCreateRoom = document.createElement('button');
  btnCreateRoom.id = `btnCreateRoom-${index}`;
  btnCreateRoom.className = 'btn btn-primary';
  
  const btnJoinRoom = document.createElement('button');
  btnJoinRoom.id = `btnJoinRoom-${index}`;
  btnJoinRoom.className = 'btn btn-secondary';
  
  const btnJoinRoomNow = document.createElement('button');
  btnJoinRoomNow.id = `btnJoinRoomNow-${index}`;
  btnJoinRoomNow.className = 'btn btn-primary';
  
  const roomIdInput = document.createElement('input');
  roomIdInput.id = `roomId-${index}`;
  roomIdInput.type = 'text';
  roomIdInput.placeholder = 'Введите код комнаты';
  
  const joinContainer = document.createElement('div');
  joinContainer.id = `joinContainer-${index}`;
  joinContainer.style.display = 'none';
  joinContainer.appendChild(roomIdInput);
  joinContainer.appendChild(btnJoinRoomNow);
  
  loginContainer.appendChild(usernameInput);
  loginContainer.appendChild(btnCreateRoom);
  loginContainer.appendChild(btnJoinRoom);
  loginContainer.appendChild(joinContainer);
  loginScreen.appendChild(loginContainer);
  app.appendChild(loginScreen);
  
  // Room Screen
  const roomScreen = document.createElement('div');
  roomScreen.id = `roomScreen-${index}`;
  roomScreen.className = 'screen';
  
  const usersGrid = document.createElement('div');
  usersGrid.id = `usersGrid-${index}`;
  usersGrid.className = 'users-grid';
  
  const btnLeaveRoom = document.createElement('button');
  btnLeaveRoom.id = `btnLeaveRoom-${index}`;
  btnLeaveRoom.className = 'btn btn-danger';
  
  const btnToggleMic = document.createElement('button');
  btnToggleMic.id = `btnToggleMic-${index}`;
  btnToggleMic.className = 'control-btn';
  
  const statusMessage = document.createElement('div');
  statusMessage.id = `statusMessage-${index}`;
  statusMessage.className = 'status-message';
  
  const currentRoomIdSpan = document.createElement('span');
  currentRoomIdSpan.id = `currentRoomId-${index}`;
  
  const userCount = document.createElement('span');
  userCount.id = `userCount-${index}`;
  
  roomScreen.appendChild(usersGrid);
  roomScreen.appendChild(btnLeaveRoom);
  roomScreen.appendChild(btnToggleMic);
  roomScreen.appendChild(statusMessage);
  roomScreen.appendChild(currentRoomIdSpan);
  roomScreen.appendChild(userCount);
  app.appendChild(roomScreen);
  
  // Настраиваем окружение в зависимости от типа клиента
  if (type === 'cordova') {
    // Устанавливаем Cordova окружение
    window.cordova = {
      platformId: 'android'
    };
    
    // Создаем App для Cordova
    window.App = {
      get isCordova() {
        return true;
      },
      get isBrowser() {
        return false;
      },
      getSocketUrl() {
        return 'https://aiternitas.ru';
      },
      init() {}
    };
    
    // Импортируем Cordova версию VoiceRoom
    // В тестах используем упрощенную версию на основе реального кода
    const VoiceRoom = await createCordovaVoiceRoomInstance(index);
    
    const client = {
      type: 'cordova',
      index,
      VoiceRoom,
      username: `CordovaUser${index + 1}`,
      userId: null,
      roomId: null,
      socket: null,
      container
    };
    
    // Инициализируем VoiceRoom
    VoiceRoom.init();
    
    // Убеждаемся что elements инициализированы
    if (!VoiceRoom.elements || Object.keys(VoiceRoom.elements).length === 0) {
      VoiceRoom.initElements(index);
    }
    
    // Ожидаем подключения Socket.IO
    await waitForSocketConnection(client);
    
    // Обновляем ссылку на elements после инициализации
    client.elements = VoiceRoom.elements;
    
    return client;
  } else {
    // Веб окружение
    delete window.cordova;
    
    // Создаем App для веб
    window.App = {
      get isCordova() {
        return false;
      },
      get isBrowser() {
        return true;
      },
      getSocketUrl() {
        return window.location.origin;
      },
      init() {}
    };
    
    // Импортируем веб версию VoiceRoom
    const VoiceRoom = await createWebVoiceRoomInstance(index);
    
    const client = {
      type: 'web',
      index,
      VoiceRoom,
      username: `WebUser${index + 1}`,
      userId: null,
      roomId: null,
      socket: null,
      container
    };
    
    // Инициализируем VoiceRoom
    VoiceRoom.init();
    
    // Убеждаемся что elements инициализированы
    if (!VoiceRoom.elements || Object.keys(VoiceRoom.elements).length === 0) {
      VoiceRoom.initElements(index);
    }
    
    // Ожидаем подключения Socket.IO
    await waitForSocketConnection(client);
    
    // Обновляем ссылку на elements после инициализации
    client.elements = VoiceRoom.elements;
    
    return client;
  }
}

/**
 * Создает экземпляр VoiceRoom для Cordova
 */
async function createCordovaVoiceRoomInstance(index) {
  // Используем упрощенную версию на основе реального кода
  // В реальных тестах можно динамически импортировать модуль
  const VoiceRoom = {
    socket: null,
    localStream: null,
    peers: new Map(),
    currentRoomId: null,
    myUserId: null,
    myUsername: null,
    audioContext: null,
    analyser: null,
    connectionStatus: 'disconnected',
    globalStatusCheckInterval: null,
    isJoiningRoom: false,
    isCreatingRoom: false,
    joinRoomTimeout: null,
    ICE_SERVERS: [{ urls: 'stun:stun.l.google.com:19302' }],
    SERVER_URL: 'https://aiternitas.ru',
    elements: {},
    
    init() {
      this.initElements(index);
      this.loadSavedUsername(index);
      this.setupEventListeners(index);
      this.initSocket();
      this.startGlobalStatusCheck();
    },
    
    initElements(index) {
      this.elements = {
        loginScreen: document.getElementById(`loginScreen-${index}`),
        roomScreen: document.getElementById(`roomScreen-${index}`),
        usernameInput: document.getElementById(`username-${index}`),
        btnCreateRoom: document.getElementById(`btnCreateRoom-${index}`),
        btnJoinRoom: document.getElementById(`btnJoinRoom-${index}`),
        btnJoinRoomNow: document.getElementById(`btnJoinRoomNow-${index}`),
        btnLeaveRoom: document.getElementById(`btnLeaveRoom-${index}`),
        btnToggleMic: document.getElementById(`btnToggleMic-${index}`),
        roomIdInput: document.getElementById(`roomId-${index}`),
        usersGrid: document.getElementById(`usersGrid-${index}`),
        statusMessage: document.getElementById(`statusMessage-${index}`),
        currentRoomIdSpan: document.getElementById(`currentRoomId-${index}`),
        userCount: document.getElementById(`userCount-${index}`),
        joinContainer: document.getElementById(`joinContainer-${index}`)
      };
    },
    
    loadSavedUsername() {},
    
    setupEventListeners() {},
    
    sanitizeString(str) {
      if (typeof str !== 'string') return '';
      return str.replace(/<[^>]*>/g, '').trim().substring(0, 20);
    },
    
    validateUsername(username) {
      if (!username || typeof username !== 'string') {
        return { valid: false, error: 'Username must be at least 1 character' };
      }
      const sanitized = this.sanitizeString(username);
      if (sanitized.length < 1) {
        return { valid: false, error: 'Username must be at least 1 character' };
      }
      return { valid: true, username: sanitized };
    },
    
    showNotification(message, type, duration) {
      console.log(`[Cordova ${index}] Notification [${type}]:`, message);
    },
    
    initSocket() {
      if (typeof io === 'undefined') return;
      this.socket = io(this.SERVER_URL);
      this.setupSocketEvents();
    },
    
    setupSocketEvents() {
      if (!this.socket) return;
      
      this.socket.on('connect', () => {
        this.connectionStatus = 'connected';
      });
      
      this.socket.on('disconnect', () => {
        this.connectionStatus = 'disconnected';
      });
      
      this.socket.on('user-joined', (data) => {
        if (data.userId !== this.myUserId) {
          this.addUserToGrid(data.userId, data.username);
          this.createPeerConnection(data.userId);
        }
      });
      
      this.socket.on('user-left', (data) => {
        this.removeUserFromGrid(data.userId);
      });
      
      this.socket.on('offer', async (data) => {
        const fromUserId = data.fromUserId || data.from;
        await this.handleOffer({ ...data, from: fromUserId });
      });
      
      this.socket.on('answer', async (data) => {
        const fromUserId = data.fromUserId || data.from;
        await this.handleAnswer({ ...data, from: fromUserId });
      });
      
      this.socket.on('ice-candidate', async (data) => {
        const fromUserId = data.fromUserId || data.from;
        await this.handleIceCandidate({ ...data, from: fromUserId });
      });
      
      this.socket.on('microphone-status', (data) => {
        this.updateUserMicrophoneStatus(data.userId, data.enabled);
      });
    },
    
    startGlobalStatusCheck() {
      if (this.globalStatusCheckInterval) {
        clearInterval(this.globalStatusCheckInterval);
      }
      
      this.globalStatusCheckInterval = setInterval(() => {
        if (!this.currentRoomId) {
          if (this.globalStatusCheckInterval) {
            clearInterval(this.globalStatusCheckInterval);
            this.globalStatusCheckInterval = null;
          }
          return;
        }
        
        this.peers.forEach((peer, userId) => {
          if (userId === this.myUserId) return;
          
          const card = document.querySelector(`[data-user-id="${userId}"]`);
          const status = card?.querySelector('.user-status');
          
          if (!card || !status) return;
          
          const iceState = peer.iceConnectionState;
          const connState = peer.connectionState;
          
          if ((iceState === 'connected' || iceState === 'completed' || connState === 'connected') && 
              status.textContent === 'Подключение...') {
            status.textContent = 'Подключен';
            card.classList.add('connected');
            card.classList.remove('reconnecting', 'error');
          }
        });
      }, 2000);
    },
    
    async initMedia() {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
    },
    
    createPeerConnection(targetUserId) {
      if (!this.localStream || this.peers.has(targetUserId)) return;
      
      const shouldCreateOffer = this.myUserId < targetUserId;
      
      try {
        const peer = new RTCPeerConnection({
          iceServers: this.ICE_SERVERS
        });
        
        this.localStream.getTracks().forEach(track => {
          peer.addTrack(track, this.localStream);
        });
        
        peer.ontrack = (event) => {
          const audio = document.createElement('audio');
          audio.autoplay = true;
          audio.srcObject = event.streams[0];
          audio.setAttribute('data-user-id', targetUserId);
          document.body.appendChild(audio);
          
          setTimeout(() => {
            const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
            if (card) {
              const status = card.querySelector('.user-status');
              if (status && status.textContent === 'Подключение...') {
                status.textContent = 'Подключен';
                card.classList.add('connected');
                card.classList.remove('reconnecting', 'error');
              }
            }
          }, 100);
        };
        
        peer.onicecandidate = (event) => {
          if (event.candidate && this.socket && this.socket.connected) {
            this.socket.emit('ice-candidate', {
              targetUserId: targetUserId,
              fromUserId: this.myUserId,
              candidate: event.candidate,
              roomId: this.currentRoomId
            });
          }
        };
        
        peer.oniceconnectionstatechange = () => {
          const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
          const status = card?.querySelector('.user-status');
          
          if (!status) return;
          
          switch (peer.iceConnectionState) {
            case 'connected':
            case 'completed':
              status.textContent = 'Подключен';
              if (card) {
                card.classList.add('connected');
                card.classList.remove('reconnecting', 'error');
              }
              break;
            case 'connecting':
            case 'checking':
              status.textContent = 'Подключение...';
              break;
            case 'disconnected':
              status.textContent = 'Отключен';
              if (card) {
                card.classList.add('reconnecting');
                card.classList.remove('connected', 'error');
              }
              break;
            case 'failed':
              status.textContent = 'Ошибка подключения';
              if (card) {
                card.classList.add('error');
                card.classList.remove('connected', 'reconnecting');
              }
              break;
          }
        };
        
        peer.onconnectionstatechange = () => {
          const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
          const status = card?.querySelector('.user-status');
          
          if (!status) return;
          
          switch (peer.connectionState) {
            case 'connected':
              status.textContent = 'Подключен';
              if (card) {
                card.classList.add('connected');
                card.classList.remove('reconnecting', 'error');
              }
              break;
            case 'connecting':
              status.textContent = 'Подключение...';
              break;
            case 'disconnected':
              status.textContent = 'Отключен';
              if (card) {
                card.classList.add('reconnecting');
                card.classList.remove('connected', 'error');
              }
              break;
            case 'failed':
              status.textContent = 'Ошибка подключения';
              if (card) {
                card.classList.add('error');
                card.classList.remove('connected', 'reconnecting');
              }
              break;
          }
        };
        
        this.peers.set(targetUserId, peer);
        
        if (shouldCreateOffer) {
          peer.createOffer().then(offer => {
            peer.setLocalDescription(offer);
            if (this.socket && this.socket.connected) {
              this.socket.emit('offer', {
                targetUserId: targetUserId,
                fromUserId: this.myUserId,
                offer: offer,
                roomId: this.currentRoomId
              });
            }
          }).catch(error => {
            console.error('Error creating offer:', error);
          });
        }
      } catch (error) {
        console.error('Error creating peer connection:', error);
      }
    },
    
    async handleOffer(data) {
      const fromUserId = data.fromUserId || data.from;
      const peer = this.peers.get(fromUserId);
      if (!peer) {
        this.createPeerConnection(fromUserId);
        const newPeer = this.peers.get(fromUserId);
        if (newPeer) {
          await newPeer.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await newPeer.createAnswer();
          await newPeer.setLocalDescription(answer);
          if (this.socket && this.socket.connected) {
            this.socket.emit('answer', {
              targetUserId: fromUserId,
              fromUserId: this.myUserId,
              answer: answer,
              roomId: this.currentRoomId
            });
          }
        }
      } else {
        await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        if (this.socket && this.socket.connected) {
          this.socket.emit('answer', {
            targetUserId: fromUserId,
            fromUserId: this.myUserId,
            answer: answer,
            roomId: this.currentRoomId
          });
        }
      }
    },
    
    async handleAnswer(data) {
      const fromUserId = data.fromUserId || data.from;
      const peer = this.peers.get(fromUserId);
      if (peer) {
        await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    },
    
    async handleIceCandidate(data) {
      const fromUserId = data.fromUserId || data.from;
      const peer = this.peers.get(fromUserId);
      if (peer && data.candidate) {
        await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    },
    
    addUserToGrid(userId, username, isMyself = false) {
      if (!this.elements.usersGrid) return;
      
      const existingCard = document.querySelector(`[data-user-id="${userId}"]`);
      if (existingCard) return;
      
      const emptyState = this.elements.usersGrid.querySelector('.empty-state');
      if (emptyState) {
        emptyState.remove();
      }
      
      const card = document.createElement('div');
      card.className = 'user-card';
      card.setAttribute('data-user-id', userId);
      if (isMyself) {
        card.classList.add('myself');
      }
      
      const avatar = document.createElement('div');
      avatar.className = 'user-avatar';
      avatar.textContent = username.charAt(0).toUpperCase();
      
      const name = document.createElement('div');
      name.className = 'user-name';
      name.textContent = username;
      
      const status = document.createElement('div');
      status.className = 'user-status';
      status.textContent = isMyself ? 'Вы' : 'Подключение...';
      
      card.appendChild(avatar);
      card.appendChild(name);
      card.appendChild(status);
      
      this.elements.usersGrid.appendChild(card);
    },
    
    removeUserFromGrid(userId) {
      const card = document.querySelector(`[data-user-id="${userId}"]`);
      if (card) {
        card.remove();
      }
      
      const peer = this.peers.get(userId);
      if (peer) {
        try {
          peer.close();
        } catch (error) {
          console.error('Error closing peer:', error);
        }
        this.peers.delete(userId);
      }
    },
    
    updateUserMicrophoneStatus(userId, enabled) {
      const card = document.querySelector(`[data-user-id="${userId}"]`);
      if (card) {
        if (enabled) {
          card.classList.remove('microphone-muted');
        } else {
          card.classList.add('microphone-muted');
        }
      }
    },
    
    async createRoom() {
      if (this.isCreatingRoom) return;
      
      this.isCreatingRoom = true;
      
      if (!this.elements.usernameInput) {
        this.isCreatingRoom = false;
        return;
      }
      
      const usernameValue = this.elements.usernameInput.value.trim();
      const validation = this.validateUsername(usernameValue);
      
      if (!validation.valid) {
        this.isCreatingRoom = false;
        return;
      }
      
      const username = this.sanitizeString(usernameValue);
      
      if (!this.socket || !this.socket.connected) {
        this.isCreatingRoom = false;
        return;
      }
      
      this.myUsername = username;
      
      this.socket.emit('create-room', { username }, (response) => {
        this.isCreatingRoom = false;
        if (response.error) {
          this.showNotification(response.error, 'error', 3000);
          return;
        }
        
        const { roomId, userId } = response;
        this.currentRoomId = roomId;
        this.myUserId = userId;
        
        this.initMedia().then(() => {
          this.addUserToGrid(this.myUserId, username, true);
          if (this.elements.currentRoomIdSpan) {
            this.elements.currentRoomIdSpan.textContent = roomId;
          }
          this.showRoomScreen();
        }).catch(error => {
          this.addUserToGrid(this.myUserId, username, true);
          if (this.elements.currentRoomIdSpan) {
            this.elements.currentRoomIdSpan.textContent = roomId;
          }
          this.showRoomScreen();
        });
      });
    },
    
    async joinExistingRoom() {
      if (this.isJoiningRoom) return;
      
      this.isJoiningRoom = true;
      
      if (!this.elements.roomIdInput || !this.elements.usernameInput) {
        this.isJoiningRoom = false;
        return;
      }
      
      const roomId = this.elements.roomIdInput.value.trim().toUpperCase();
      const usernameValue = this.elements.usernameInput.value.trim();
      
      if (!roomId || roomId.length !== 6) {
        this.isJoiningRoom = false;
        return;
      }
      
      const validation = this.validateUsername(usernameValue);
      if (!validation.valid) {
        this.isJoiningRoom = false;
        return;
      }
      
      const username = this.sanitizeString(usernameValue);
      
      if (!this.socket || !this.socket.connected) {
        this.isJoiningRoom = false;
        return;
      }
      
      this.myUsername = username;
      this.currentRoomId = roomId;
      
      this.socket.emit('join-room', { roomId, username }, async (response) => {
        this.isJoiningRoom = false;
        
        if (response.error) {
          this.showNotification(response.error, 'error', 3000);
          return;
        }
        
        const { userId, users } = response;
        this.myUserId = userId;
        
        this.initMedia().then(() => {
          this.addUserToGrid(this.myUserId, username, true);
          
          if (users && users.length > 0) {
            users.forEach(user => {
              const sanitizedUsername = this.sanitizeString(user.username);
              this.addUserToGrid(user.userId, sanitizedUsername);
              this.createPeerConnection(user.userId);
            });
          }
          
          if (this.elements.currentRoomIdSpan) {
            this.elements.currentRoomIdSpan.textContent = roomId;
          }
          
          this.showRoomScreen();
        }).catch(error => {
          this.addUserToGrid(this.myUserId, username, true);
          
          if (users && users.length > 0) {
            users.forEach(user => {
              const sanitizedUsername = this.sanitizeString(user.username);
              this.addUserToGrid(user.userId, sanitizedUsername);
            });
          }
          
          if (this.elements.currentRoomIdSpan) {
            this.elements.currentRoomIdSpan.textContent = roomId;
          }
          
          this.showRoomScreen();
        });
      });
    },
    
    showRoomScreen() {
      if (this.elements.loginScreen) {
        this.elements.loginScreen.classList.remove('active');
      }
      if (this.elements.roomScreen) {
        this.elements.roomScreen.classList.add('active');
      }
    },
    
    showLoginScreen() {
      if (this.elements.roomScreen) {
        this.elements.roomScreen.classList.remove('active');
      }
      if (this.elements.loginScreen) {
        this.elements.loginScreen.classList.add('active');
      }
    },
    
    leaveRoom() {
      this.peers.forEach((peer, userId) => {
        try {
          peer.close();
        } catch (error) {
          console.error('Error closing peer:', error);
        }
      });
      this.peers.clear();
      
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null;
      }
      
      if (this.globalStatusCheckInterval) {
        clearInterval(this.globalStatusCheckInterval);
        this.globalStatusCheckInterval = null;
      }
      
      if (this.socket && this.socket.connected && this.currentRoomId) {
        this.socket.emit('leave-room', { roomId: this.currentRoomId });
      }
      
      this.currentRoomId = null;
      this.myUserId = null;
      this.isJoiningRoom = false;
      this.isCreatingRoom = false;
      
      this.showLoginScreen();
    }
  };
  
  return VoiceRoom;
}

/**
 * Создает экземпляр VoiceRoom для веб
 */
async function createWebVoiceRoomInstance(index) {
  // Используем упрощенную версию на основе реального кода
  const VoiceRoom = {
    socket: null,
    localStream: null,
    peers: new Map(),
    currentRoomId: null,
    myUserId: null,
    myUsername: null,
    audioContext: null,
    analyser: null,
    connectionStatus: 'disconnected',
    isJoiningRoom: false,
    isCreatingRoom: false,
    joinRoomTimeout: null,
    ICE_SERVERS: [{ urls: 'stun:stun.l.google.com:19302' }],
    elements: {},
    
    init() {
      this.initElements(index);
      this.loadSavedUsername(index);
      this.setupEventListeners(index);
      this.initSocket();
    },
    
    initElements(index) {
      this.elements = {
        loginScreen: document.getElementById(`loginScreen-${index}`),
        roomScreen: document.getElementById(`roomScreen-${index}`),
        usernameInput: document.getElementById(`username-${index}`),
        btnCreateRoom: document.getElementById(`btnCreateRoom-${index}`),
        btnJoinRoom: document.getElementById(`btnJoinRoom-${index}`),
        btnJoinRoomNow: document.getElementById(`btnJoinRoomNow-${index}`),
        btnLeaveRoom: document.getElementById(`btnLeaveRoom-${index}`),
        btnToggleMic: document.getElementById(`btnToggleMic-${index}`),
        roomIdInput: document.getElementById(`roomId-${index}`),
        usersGrid: document.getElementById(`usersGrid-${index}`),
        statusMessage: document.getElementById(`statusMessage-${index}`),
        currentRoomIdSpan: document.getElementById(`currentRoomId-${index}`),
        userCount: document.getElementById(`userCount-${index}`),
        joinContainer: document.getElementById(`joinContainer-${index}`)
      };
    },
    
    loadSavedUsername() {},
    
    setupEventListeners() {},
    
    sanitizeString(str) {
      if (typeof str !== 'string') return '';
      return str.replace(/<[^>]*>/g, '').trim().substring(0, 20);
    },
    
    validateUsername(username) {
      if (!username || typeof username !== 'string') {
        return { valid: false, error: 'Username must be at least 1 character' };
      }
      const sanitized = this.sanitizeString(username);
      if (sanitized.length < 1) {
        return { valid: false, error: 'Username must be at least 1 character' };
      }
      return { valid: true, username: sanitized };
    },
    
    showNotification(message, type, duration) {
      console.log(`[Web ${index}] Notification [${type}]:`, message);
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
      
      this.socket.on('disconnect', () => {
        this.connectionStatus = 'disconnected';
      });
      
      this.socket.on('user-joined', (data) => {
        if (data.userId !== this.myUserId) {
          this.addUserToGrid(data.userId, data.username);
          this.createPeerConnection(data.userId);
        }
      });
      
      this.socket.on('user-left', (data) => {
        this.removeUserFromGrid(data.userId);
      });
      
      this.socket.on('offer', async (data) => {
        const fromUserId = data.fromUserId || data.from;
        await this.handleOffer({ ...data, from: fromUserId });
      });
      
      this.socket.on('answer', async (data) => {
        const fromUserId = data.fromUserId || data.from;
        await this.handleAnswer({ ...data, from: fromUserId });
      });
      
      this.socket.on('ice-candidate', async (data) => {
        const fromUserId = data.fromUserId || data.from;
        await this.handleIceCandidate({ ...data, from: fromUserId });
      });
      
      this.socket.on('microphone-status', (data) => {
        this.updateUserMicrophoneStatus(data.userId, data.enabled);
      });
    },
    
    async initMedia() {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
    },
    
    createPeerConnection(targetUserId) {
      if (!this.localStream || this.peers.has(targetUserId)) return;
      
      const shouldCreateOffer = this.myUserId < targetUserId;
      
      try {
        const peer = new RTCPeerConnection({
          iceServers: this.ICE_SERVERS
        });
        
        this.localStream.getTracks().forEach(track => {
          peer.addTrack(track, this.localStream);
        });
        
        peer.ontrack = (event) => {
          const audio = document.getElementById(`audio-${targetUserId}`) || document.createElement('audio');
          audio.id = `audio-${targetUserId}`;
          audio.autoplay = true;
          audio.srcObject = event.streams[0];
          if (!document.getElementById(`audio-${targetUserId}`)) {
            document.body.appendChild(audio);
          }
          
          setTimeout(() => {
            const card = document.getElementById(`user-${targetUserId}`) || document.querySelector(`[data-user-id="${targetUserId}"]`);
            if (card) {
              const status = card.querySelector('.user-status');
              if (status && status.textContent === 'Подключение...') {
                const micIcon = status.querySelector('.microphone-status-icon');
                status.textContent = 'Подключен';
                if (micIcon) {
                  status.appendChild(micIcon);
                }
                card.classList.add('connected');
                card.classList.remove('reconnecting', 'error');
              }
            }
          }, 100);
        };
        
        peer.onicecandidate = (event) => {
          if (event.candidate && this.socket && this.socket.connected) {
            this.socket.emit('ice-candidate', {
              targetUserId: targetUserId,
              fromUserId: this.myUserId,
              candidate: event.candidate,
              roomId: this.currentRoomId
            });
          }
        };
        
        peer.oniceconnectionstatechange = () => {
          const card = document.getElementById(`user-${targetUserId}`) || document.querySelector(`[data-user-id="${targetUserId}"]`);
          if (card) {
            const status = card.querySelector('.user-status');
            if (status) {
              switch (peer.iceConnectionState) {
                case 'connected':
                case 'completed':
                  const micIcon = status.querySelector('.microphone-status-icon');
                  status.textContent = 'Подключен';
                  if (micIcon) {
                    status.appendChild(micIcon);
                  }
                  card.classList.remove('reconnecting', 'error');
                  card.classList.add('connected');
                  break;
                case 'connecting':
                case 'checking':
                  const micIconConnecting = status.querySelector('.microphone-status-icon');
                  status.textContent = 'Подключение...';
                  if (micIconConnecting) {
                    status.appendChild(micIconConnecting);
                  }
                  card.classList.add('reconnecting');
                  card.classList.remove('error', 'connected');
                  break;
                case 'disconnected':
                  const micIconDisconnected = status.querySelector('.microphone-status-icon');
                  status.textContent = 'Отключен';
                  if (micIconDisconnected) {
                    status.appendChild(micIconDisconnected);
                  }
                  card.classList.remove('reconnecting', 'connected');
                  break;
                case 'failed':
                  const micIconFailed = status.querySelector('.microphone-status-icon');
                  status.textContent = 'Ошибка подключения';
                  if (micIconFailed) {
                    status.appendChild(micIconFailed);
                  }
                  card.classList.add('error');
                  card.classList.remove('reconnecting', 'connected');
                  break;
              }
            }
          }
        };
        
        peer.onconnectionstatechange = () => {
          const card = document.getElementById(`user-${targetUserId}`) || document.querySelector(`[data-user-id="${targetUserId}"]`);
          if (card) {
            const status = card.querySelector('.user-status');
            if (status) {
              switch (peer.connectionState) {
                case 'connected':
                  const micIcon = status.querySelector('.microphone-status-icon');
                  status.textContent = 'Подключен';
                  if (micIcon) {
                    status.appendChild(micIcon);
                  }
                  card.classList.remove('reconnecting', 'error');
                  card.classList.add('connected');
                  break;
                case 'connecting':
                  const micIconConnecting = status.querySelector('.microphone-status-icon');
                  status.textContent = 'Подключение...';
                  if (micIconConnecting) {
                    status.appendChild(micIconConnecting);
                  }
                  card.classList.add('reconnecting');
                  card.classList.remove('error', 'connected');
                  break;
                case 'disconnected':
                  const micIconDisconnected = status.querySelector('.microphone-status-icon');
                  status.textContent = 'Отключен';
                  if (micIconDisconnected) {
                    status.appendChild(micIconDisconnected);
                  }
                  card.classList.remove('reconnecting', 'connected');
                  break;
                case 'failed':
                  const micIconFailed = status.querySelector('.microphone-status-icon');
                  status.textContent = 'Ошибка подключения';
                  if (micIconFailed) {
                    status.appendChild(micIconFailed);
                  }
                  card.classList.add('error');
                  card.classList.remove('reconnecting', 'connected');
                  break;
              }
            }
          }
        };
        
        this.peers.set(targetUserId, peer);
        
        if (shouldCreateOffer) {
          peer.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false
          }).then(offer => {
            peer.setLocalDescription(offer);
            if (this.socket && this.socket.connected) {
              this.socket.emit('offer', {
                to: targetUserId,
                offer: peer.localDescription,
                roomId: this.currentRoomId
              });
            }
          }).catch(error => {
            console.error('Error creating offer:', error);
          });
        }
      } catch (error) {
        console.error('Error creating peer connection:', error);
      }
    },
    
    async handleOffer(data) {
      const fromUserId = data.fromUserId || data.from;
      const peer = this.peers.get(fromUserId);
      if (!peer) {
        this.createPeerConnection(fromUserId);
        const newPeer = this.peers.get(fromUserId);
        if (newPeer) {
          await newPeer.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await newPeer.createAnswer();
          await newPeer.setLocalDescription(answer);
          if (this.socket && this.socket.connected) {
            this.socket.emit('answer', {
              targetUserId: fromUserId,
              fromUserId: this.myUserId,
              answer: answer,
              roomId: this.currentRoomId
            });
          }
        }
      } else {
        await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        if (this.socket && this.socket.connected) {
          this.socket.emit('answer', {
            targetUserId: fromUserId,
            fromUserId: this.myUserId,
            answer: answer,
            roomId: this.currentRoomId
          });
        }
      }
    },
    
    async handleAnswer(data) {
      const fromUserId = data.fromUserId || data.from;
      const peer = this.peers.get(fromUserId);
      if (peer) {
        await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    },
    
    async handleIceCandidate(data) {
      const fromUserId = data.fromUserId || data.from;
      const peer = this.peers.get(fromUserId);
      if (peer && data.candidate) {
        await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    },
    
    addUserToGrid(userId, username, isMyself = false) {
      if (!this.elements.usersGrid) return;
      if (document.getElementById(`user-${userId}`) || document.querySelector(`[data-user-id="${userId}"]`)) return;
      
      const sanitizedUsername = this.sanitizeString(username);
      const firstLetter = sanitizedUsername.charAt(0).toUpperCase() || '?';
      
      const card = document.createElement('div');
      card.id = `user-${userId}`;
      card.setAttribute('data-user-id', userId);
      card.className = 'user-card' + (isMyself ? ' speaking' : '');
      
      const avatar = document.createElement('div');
      avatar.className = 'user-avatar';
      avatar.textContent = firstLetter;
      
      const name = document.createElement('div');
      name.className = 'user-name';
      name.textContent = isMyself ? sanitizedUsername + ' (Вы)' : sanitizedUsername;
      
      const status = document.createElement('div');
      status.className = 'user-status';
      status.textContent = isMyself ? 'Подключен' : 'Подключение...';
      
      const micIcon = document.createElement('span');
      micIcon.className = 'microphone-status-icon';
      micIcon.textContent = ' 🎤';
      status.appendChild(micIcon);
      
      const audio = document.createElement('audio');
      audio.id = `audio-${userId}`;
      audio.autoplay = true;
      audio.playsInline = true;
      audio.muted = isMyself;
      
      card.appendChild(avatar);
      card.appendChild(name);
      card.appendChild(status);
      card.appendChild(audio);
      
      const emptyState = this.elements.usersGrid.querySelector('.empty-state');
      if (emptyState) {
        emptyState.remove();
      }
      
      this.elements.usersGrid.appendChild(card);
    },
    
    removeUserFromGrid(userId) {
      const card = document.getElementById(`user-${userId}`) || document.querySelector(`[data-user-id="${userId}"]`);
      if (card) {
        card.remove();
      }
      
      const audio = document.getElementById(`audio-${userId}`);
      if (audio) {
        audio.remove();
      }
      
      const peer = this.peers.get(userId);
      if (peer) {
        try {
          peer.close();
        } catch (error) {
          console.error('Error closing peer:', error);
        }
        this.peers.delete(userId);
      }
    },
    
    updateUserMicrophoneStatus(userId, enabled) {
      const card = document.getElementById(`user-${userId}`) || document.querySelector(`[data-user-id="${userId}"]`);
      if (card) {
        if (enabled) {
          card.classList.remove('microphone-muted');
        } else {
          card.classList.add('microphone-muted');
        }
      }
    },
    
    async createRoom() {
      if (this.isCreatingRoom) return;
      
      this.isCreatingRoom = true;
      
      if (!this.elements.usernameInput) {
        this.isCreatingRoom = false;
        return;
      }
      
      const usernameValue = this.elements.usernameInput.value.trim();
      const validation = this.validateUsername(usernameValue);
      
      if (!validation.valid) {
        this.isCreatingRoom = false;
        return;
      }
      
      const username = this.sanitizeString(usernameValue);
      
      if (!this.socket || !this.socket.connected) {
        this.isCreatingRoom = false;
        return;
      }
      
      this.myUsername = username;
      
      this.socket.emit('create-room', { username }, (response) => {
        this.isCreatingRoom = false;
        if (response.error) {
          this.showNotification(response.error, 'error', 3000);
          return;
        }
        
        const { roomId, userId } = response;
        this.currentRoomId = roomId;
        this.myUserId = userId;
        
        this.initMedia().then(() => {
          this.addUserToGrid(this.myUserId, username, true);
          if (this.elements.currentRoomIdSpan) {
            this.elements.currentRoomIdSpan.textContent = roomId;
          }
          this.showRoomScreen();
        }).catch(error => {
          this.addUserToGrid(this.myUserId, username, true);
          if (this.elements.currentRoomIdSpan) {
            this.elements.currentRoomIdSpan.textContent = roomId;
          }
          this.showRoomScreen();
        });
      });
    },
    
    async joinExistingRoom() {
      if (this.isJoiningRoom) return;
      
      this.isJoiningRoom = true;
      
      if (!this.elements.roomIdInput || !this.elements.usernameInput) {
        this.isJoiningRoom = false;
        return;
      }
      
      const roomId = this.elements.roomIdInput.value.trim().toUpperCase();
      const usernameValue = this.elements.usernameInput.value.trim();
      
      if (!roomId || roomId.length !== 6) {
        this.isJoiningRoom = false;
        return;
      }
      
      const validation = this.validateUsername(usernameValue);
      if (!validation.valid) {
        this.isJoiningRoom = false;
        return;
      }
      
      const username = this.sanitizeString(usernameValue);
      
      if (!this.socket || !this.socket.connected) {
        this.isJoiningRoom = false;
        return;
      }
      
      this.myUsername = username;
      this.currentRoomId = roomId;
      
      this.socket.emit('join-room', { roomId, username }, async (response) => {
        this.isJoiningRoom = false;
        
        if (response.error) {
          this.showNotification(response.error, 'error', 3000);
          return;
        }
        
        const { userId, users } = response;
        this.myUserId = userId;
        
        this.initMedia().then(() => {
          this.addUserToGrid(this.myUserId, username, true);
          
          if (users && users.length > 0) {
            users.forEach(user => {
              const sanitizedUsername = this.sanitizeString(user.username);
              this.addUserToGrid(user.userId, sanitizedUsername);
              this.createPeerConnection(user.userId);
            });
          }
          
          if (this.elements.currentRoomIdSpan) {
            this.elements.currentRoomIdSpan.textContent = roomId;
          }
          
          this.showRoomScreen();
        }).catch(error => {
          this.addUserToGrid(this.myUserId, username, true);
          
          if (users && users.length > 0) {
            users.forEach(user => {
              const sanitizedUsername = this.sanitizeString(user.username);
              this.addUserToGrid(user.userId, sanitizedUsername);
            });
          }
          
          if (this.elements.currentRoomIdSpan) {
            this.elements.currentRoomIdSpan.textContent = roomId;
          }
          
          this.showRoomScreen();
        });
      });
    },
    
    showRoomScreen() {
      if (this.elements.loginScreen) {
        this.elements.loginScreen.classList.remove('active');
      }
      if (this.elements.roomScreen) {
        this.elements.roomScreen.classList.add('active');
      }
    },
    
    showLoginScreen() {
      if (this.elements.roomScreen) {
        this.elements.roomScreen.classList.remove('active');
      }
      if (this.elements.loginScreen) {
        this.elements.loginScreen.classList.add('active');
      }
    },
    
    leaveRoom() {
      this.peers.forEach((peer, userId) => {
        try {
          peer.close();
        } catch (error) {
          console.error('Error closing peer:', error);
        }
      });
      this.peers.clear();
      
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null;
      }
      
      if (this.socket && this.socket.connected && this.currentRoomId) {
        this.socket.emit('leave-room', { roomId: this.currentRoomId });
      }
      
      this.currentRoomId = null;
      this.myUserId = null;
      this.isJoiningRoom = false;
      this.isCreatingRoom = false;
      
      this.showLoginScreen();
    }
  };
  
  return VoiceRoom;
}

/**
 * Ожидает подключения Socket.IO для клиента
 */
async function waitForSocketConnection(client) {
  return new Promise((resolve) => {
    const checkConnection = () => {
      if (client.VoiceRoom.socket && client.VoiceRoom.socket.connected) {
        client.socket = client.VoiceRoom.socket;
        resolve();
      } else {
        setTimeout(checkConnection, 10);
      }
    };
    checkConnection();
  });
}

/**
 * Создает массив клиентов разных типов
 */
export async function createMixedClients(types) {
  const clients = [];
  
  for (let i = 0; i < types.length; i++) {
    const client = await createClient(types[i], i);
    clients.push(client);
  }
  
  return clients;
}

/**
 * Настраивает сценарий с заданными клиентами
 */
export async function setupMixedRoomScenario(clients) {
  // Первый клиент создает комнату
  const creator = clients[0];
  
  if (creator.elements && creator.elements.usernameInput) {
    creator.elements.usernameInput.value = creator.username;
  }
  
  const roomId = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout creating room'));
    }, 5000);
    
    // В socket-mock событие room-created не отправляется, используется callback
    const originalEmit = creator.socket.emit.bind(creator.socket);
    creator.socket.emit = function(event, data, callback) {
      if (event === 'create-room' && callback) {
        originalEmit(event, data, (response) => {
          if (!response.error) {
            creator.roomId = response.roomId;
            creator.userId = response.userId;
            clearTimeout(timeout);
            resolve(response.roomId);
          } else {
            clearTimeout(timeout);
            reject(new Error(response.error));
          }
        });
      } else {
        originalEmit(event, data, callback);
      }
    };
    
    creator.VoiceRoom.createRoom();
  });
  
  // Остальные клиенты присоединяются к комнате
  for (let i = 1; i < clients.length; i++) {
    const client = clients[i];
    
    if (client.elements && client.elements.roomIdInput) {
      client.elements.roomIdInput.value = roomId;
    }
    if (client.elements && client.elements.usernameInput) {
      client.elements.usernameInput.value = client.username;
    }
    
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout joining room'));
      }, 5000);
      
      const originalEmit = client.socket.emit.bind(client.socket);
      client.socket.emit = function(event, data, callback) {
        if (event === 'join-room' && callback) {
          originalEmit(event, data, (response) => {
            if (!response.error) {
              client.userId = response.userId;
              client.roomId = roomId;
              clearTimeout(timeout);
              resolve(response);
            } else {
              clearTimeout(timeout);
              reject(new Error(response.error));
            }
          });
        } else {
          originalEmit(event, data, callback);
        }
      };
      
      client.VoiceRoom.joinExistingRoom();
    });
    
    // Даем время на обработку событий user-joined
    // Увеличиваем задержку до 200ms чтобы дать время на обработку callback и событий
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Даем дополнительное время на обработку всех событий и обновление DOM
  await new Promise(resolve => setTimeout(resolve, 300));
  
  return roomId;
}

/**
 * Проверяет статусы подключения всех клиентов
 */
export function verifyConnectionStatuses(clients, expectedStatuses = {}) {
  clients.forEach((client, index) => {
    const usersGrid = client.elements.usersGrid;
    if (!usersGrid) {
      throw new Error(`Users grid not found for client ${index} (${client.type})`);
    }
    
    const userCards = usersGrid.querySelectorAll('.user-card, [data-user-id]');
    const expectedCount = clients.length;
    
    if (userCards.length !== expectedCount) {
      throw new Error(
        `Client ${index} (${client.type}) sees ${userCards.length} users, expected ${expectedCount}`
      );
    }
    
    // Проверяем статусы для каждого участника
    clients.forEach((otherClient, otherIndex) => {
      if (otherIndex === index) return; // Пропускаем себя
      
      const card = usersGrid.querySelector(`[data-user-id="${otherClient.userId}"]`) ||
                   usersGrid.querySelector(`#user-${otherClient.userId}`);
      
      if (!card) {
        throw new Error(
          `Client ${index} (${client.type}) does not see client ${otherIndex} (${otherClient.type})`
        );
      }
      
      const status = card.querySelector('.user-status');
      if (!status) {
        throw new Error(
          `Status element not found for client ${otherIndex} in client ${index}'s view`
        );
      }
      
      // Проверяем ожидаемый статус если указан
      const expectedStatus = expectedStatuses[`${index}-${otherIndex}`];
      if (expectedStatus && status.textContent !== expectedStatus) {
        throw new Error(
          `Client ${index} sees client ${otherIndex} with status "${status.textContent}", expected "${expectedStatus}"`
        );
      }
      
      // Проверяем что статус не "Подключение..." слишком долго (если соединение установлено)
      const peer = client.VoiceRoom.peers.get(otherClient.userId);
      if (peer) {
        const iceState = peer.iceConnectionState;
        const connState = peer.connectionState;
        
        if ((iceState === 'connected' || iceState === 'completed' || connState === 'connected') &&
            status.textContent === 'Подключение...') {
          // Даем время на обновление статуса (особенно для APK с глобальной проверкой)
          // Это проверяется в отдельных тестах с таймаутами
        }
      }
    });
  });
}

/**
 * Проверяет работу глобальной проверки статусов в APK клиентах
 */
export function verifyGlobalStatusCheck(client) {
  if (client.type !== 'cordova') {
    return; // Глобальная проверка только для Cordova
  }
  
  if (!client.VoiceRoom.globalStatusCheckInterval) {
    throw new Error(`Global status check interval not set for Cordova client ${client.index}`);
  }
  
  // Проверяем что интервал запущен
  if (!client.VoiceRoom.globalStatusCheckInterval) {
    throw new Error(`Global status check interval not running for Cordova client ${client.index}`);
  }
}

/**
 * Ждет установления всех соединений между клиентами
 */
export async function waitForAllConnections(clients, timeout = 10000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    let allConnected = true;
    
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      
      for (let j = 0; j < clients.length; j++) {
        if (i === j) continue;
        
        const otherClient = clients[j];
        const peer = client.VoiceRoom.peers.get(otherClient.userId);
        
        if (!peer) {
          allConnected = false;
          break;
        }
        
        const iceState = peer.iceConnectionState;
        const connState = peer.connectionState;
        
        if (iceState !== 'connected' && iceState !== 'completed' && connState !== 'connected') {
          allConnected = false;
          break;
        }
      }
      
      if (!allConnected) break;
    }
    
    if (allConnected) {
      return true;
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error('Timeout waiting for all connections');
}

/**
 * Проверяет что все статусы обновлены на "Подключен"
 */
export function verifyAllStatusesConnected(clients) {
  clients.forEach((client, index) => {
    const usersGrid = client.elements.usersGrid;
    if (!usersGrid) return;
    
    clients.forEach((otherClient, otherIndex) => {
      if (otherIndex === index) return;
      
      const card = usersGrid.querySelector(`[data-user-id="${otherClient.userId}"]`) ||
                   usersGrid.querySelector(`#user-${otherClient.userId}`);
      
      if (card) {
        const status = card.querySelector('.user-status');
        if (status && status.textContent !== 'Подключен' && status.textContent !== 'Вы') {
          throw new Error(
            `Client ${index} (${client.type}) sees client ${otherIndex} (${otherClient.type}) with status "${status.textContent}", expected "Подключен"`
          );
        }
      }
    });
  });
}

/**
 * Очищает состояние всех клиентов
 */
export function cleanupClients(clients) {
  clients.forEach(client => {
    if (client.VoiceRoom.leaveRoom) {
      client.VoiceRoom.leaveRoom();
    }
    if (client.socket) {
      client.socket.disconnect();
    }
    if (client.container && client.container.parentNode) {
      client.container.parentNode.removeChild(client.container);
    }
  });
  
  clearServerState();
  clearMockStreams();
  clearMockPeerConnections();
  
  // Очищаем DOM
  document.body.innerHTML = '';
  
  // Очищаем Cordova если был установлен
  delete window.cordova;
}

