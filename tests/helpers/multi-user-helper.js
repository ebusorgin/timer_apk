/**
 * Помощники для многопользовательских тестов
 */

import { clearServerState } from './socket-mock.js';
import { clearMockStreams, clearMockPeerConnections } from './webrtc-mock.js';

/**
 * Создает несколько клиентов VoiceRoom для тестирования
 */
export async function createClients(count) {
  const clients = [];
  
  // Импортируем модули динамически чтобы избежать проблем с порядком загрузки
  const { default: VoiceRoomModule } = await import('../../www/js/voice-room.js');
  const VoiceRoom = VoiceRoomModule || window.VoiceRoom;
  
  for (let i = 0; i < count; i++) {
    // Создаем отдельный DOM для каждого клиента
    const container = document.createElement('div');
    container.id = `client-${i}`;
    document.body.appendChild(container);
    
    // Клонируем необходимые элементы
    const loginScreen = document.getElementById('loginScreen')?.cloneNode(true);
    const roomScreen = document.getElementById('roomScreen')?.cloneNode(true);
    
    if (loginScreen) {
      loginScreen.id = `loginScreen-${i}`;
      container.appendChild(loginScreen);
    }
    
    if (roomScreen) {
      roomScreen.id = `roomScreen-${i}`;
      container.appendChild(roomScreen);
    }
    
    // Создаем новый экземпляр VoiceRoom
    const client = {
      VoiceRoom: { ...VoiceRoom },
      username: `User${i + 1}`,
      userId: null,
      roomId: null,
      socket: null
    };
    
    // Инициализируем VoiceRoom для этого клиента
    client.VoiceRoom.init();
    
    // Ожидаем подключения Socket.IO
    await new Promise(resolve => {
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
    
    clients.push(client);
  }
  
  return clients;
}

/**
 * Очищает состояние всех клиентов и сервера
 */
export function cleanupClients(clients) {
  clients.forEach(client => {
    if (client.VoiceRoom.leaveRoom) {
      client.VoiceRoom.leaveRoom();
    }
    if (client.socket) {
      client.socket.disconnect();
    }
  });
  
  clearServerState();
  clearMockStreams();
  clearMockPeerConnections();
  
  // Очищаем DOM
  document.body.innerHTML = '';
}

/**
 * Создает комнату первым клиентом и возвращает roomId
 */
export async function createRoom(client) {
  const username = client.username;
  
  // Устанавливаем username в input
  const usernameInput = document.getElementById('username') || 
                        document.querySelector(`#client-0 #username`) ||
                        document.querySelector(`input[id*="username"]`);
  
  if (usernameInput) {
    usernameInput.value = username;
  }
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout creating room'));
    }, 5000);
    
    client.socket.once('room-created', (data) => {
      clearTimeout(timeout);
      client.roomId = data.roomId;
      client.userId = data.userId;
      resolve(data.roomId);
    });
    
    client.VoiceRoom.createRoom();
  });
}

/**
 * Подключает клиента к комнате
 */
export async function joinRoom(client, roomId, username) {
  const roomIdInput = document.getElementById('roomId') || 
                     document.querySelector(`input[id*="roomId"]`);
  
  if (roomIdInput) {
    roomIdInput.value = roomId;
  }
  
  const usernameInput = document.getElementById('username') || 
                        document.querySelector(`input[id*="username"]`);
  
  if (usernameInput) {
    usernameInput.value = username;
  }
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout joining room'));
    }, 5000);
    
    client.socket.once('user-joined', (data) => {
      clearTimeout(timeout);
      if (client.userId === data.userId) {
        resolve(data);
      }
    });
    
    // Также слушаем успешный ответ от сервера
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
}

/**
 * Проверяет что все клиенты видят друг друга
 */
export function verifyAllClientsSeeEachOther(clients) {
  clients.forEach(client => {
    const usersGrid = document.getElementById('usersGrid') || 
                     document.querySelector(`#client-${clients.indexOf(client)} #usersGrid`);
    
    if (!usersGrid) {
      throw new Error(`Users grid not found for client ${clients.indexOf(client)}`);
    }
    
    const userCards = usersGrid.querySelectorAll('.user-card');
    const expectedCount = clients.length;
    
    if (userCards.length !== expectedCount) {
      throw new Error(
        `Client ${clients.indexOf(client)} sees ${userCards.length} users, expected ${expectedCount}`
      );
    }
  });
}

/**
 * Проверяет что у всех клиентов есть peer connections с друг другом
 */
export function verifyPeerConnections(clients) {
  const expectedConnections = clients.length * (clients.length - 1);
  let totalConnections = 0;
  
  clients.forEach(client => {
    if (client.VoiceRoom.peers) {
      totalConnections += client.VoiceRoom.peers.size;
    }
  });
  
  if (totalConnections !== expectedConnections) {
    throw new Error(
      `Expected ${expectedConnections} peer connections, found ${totalConnections}`
    );
  }
}

/**
 * Проверяет что все клиенты получают аудио потоки от всех остальных
 */
export function verifyAudioStreams(clients) {
  clients.forEach((client, index) => {
    // Проверяем что у клиента есть peer connections со всеми остальными
    const otherClients = clients.filter((_, i) => i !== index);
    
    otherClients.forEach(otherClient => {
      if (!client.VoiceRoom.peers || !client.VoiceRoom.peers.has(otherClient.userId)) {
        throw new Error(
          `Client ${index} does not have peer connection to client ${clients.indexOf(otherClient)}`
        );
      }
      
      // Проверяем что audio элемент существует
      const audioElement = document.getElementById(`audio-${otherClient.userId}`) ||
                          document.querySelector(`#client-${index} #audio-${otherClient.userId}`);
      
      if (!audioElement) {
        throw new Error(
          `Audio element not found for client ${index} listening to client ${clients.indexOf(otherClient)}`
        );
      }
      
      // Проверяем что srcObject установлен
      if (!audioElement.srcObject) {
        throw new Error(
          `Audio element srcObject not set for client ${index} listening to client ${clients.indexOf(otherClient)}`
        );
      }
      
      // Проверяем что audio элемент не muted (кроме собственного)
      if (audioElement.muted && otherClient.userId !== client.userId) {
        throw new Error(
          `Audio element should not be muted for client ${index} listening to client ${clients.indexOf(otherClient)}`
        );
      }
    });
  });
}

export { cleanupClients, createRoom, joinRoom, verifyAllClientsSeeEachOther, verifyPeerConnections, verifyAudioStreams };