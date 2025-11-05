/**
 * Тесты для смешанных сценариев веб+APK клиентов
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupDOM } from './helpers/setup-dom.js';
import { clearServerState } from './helpers/socket-mock.js';
import { clearMockStreams, clearMockPeerConnections, mockGetUserMedia } from './helpers/webrtc-mock.js';
import {
  createMixedClients,
  setupMixedRoomScenario,
  verifyConnectionStatuses,
  verifyGlobalStatusCheck,
  waitForAllConnections,
  verifyAllStatusesConnected,
  cleanupClients
} from './helpers/mixed-clients-helper.js';

beforeEach(async () => {
  setupDOM();
  clearServerState();
  clearMockStreams();
  clearMockPeerConnections();
  mockGetUserMedia();
  
  // Ожидаем загрузки Socket.IO
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
  vi.clearAllMocks();
  
  // Очищаем DOM
  document.body.innerHTML = '';
  
  // Очищаем Cordova если был установлен
  delete window.cordova;
});

describe('Смешанные сценарии веб+APK', () => {
  
  describe('Базовые комбинации (2 участника)', () => {
    
    it('веб → веб: веб создает, веб присоединяется', async () => {
      const clients = await createMixedClients(['web', 'web']);
      
      try {
        const roomId = await setupMixedRoomScenario(clients);
        
        expect(roomId).toBeDefined();
        expect(clients[0].userId).toBeDefined();
        expect(clients[1].userId).toBeDefined();
        expect(clients[0].roomId).toBe(roomId);
        expect(clients[1].roomId).toBe(roomId);
        
        // Ждем установления соединений и обработки всех событий
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Проверяем что все видят друг друга
        verifyConnectionStatuses(clients);
        
        // Ждем обновления статусов
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Проверяем что статусы обновлены на "Подключен"
        verifyAllStatusesConnected(clients);
      } finally {
        cleanupClients(clients);
      }
    });
    
    it('APK → веб: APK создает, веб присоединяется', async () => {
      const clients = await createMixedClients(['cordova', 'web']);
      
      try {
        const roomId = await setupMixedRoomScenario(clients);
        
        expect(roomId).toBeDefined();
        expect(clients[0].userId).toBeDefined();
        expect(clients[1].userId).toBeDefined();
        
        // Проверяем что APK клиент имеет глобальную проверку статусов
        verifyGlobalStatusCheck(clients[0]);
        
        // Ждем установления соединений
        await new Promise(resolve => setTimeout(resolve, 500));
        
        verifyConnectionStatuses(clients);
        
        // Ждем обновления статусов (для APK может потребоваться больше времени)
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        verifyAllStatusesConnected(clients);
      } finally {
        cleanupClients(clients);
      }
    });
    
    it('веб → APK: веб создает, APK присоединяется', async () => {
      const clients = await createMixedClients(['web', 'cordova']);
      
      try {
        const roomId = await setupMixedRoomScenario(clients);
        
        expect(roomId).toBeDefined();
        expect(clients[0].userId).toBeDefined();
        expect(clients[1].userId).toBeDefined();
        
        // Проверяем что APK клиент имеет глобальную проверку статусов
        verifyGlobalStatusCheck(clients[1]);
        
        // Ждем установления соединений
        await new Promise(resolve => setTimeout(resolve, 500));
        
        verifyConnectionStatuses(clients);
        
        // Ждем обновления статусов (для APK может потребоваться больше времени)
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        verifyAllStatusesConnected(clients);
      } finally {
        cleanupClients(clients);
      }
    });
    
    it('APK → APK: APK создает, APK присоединяется', async () => {
      const clients = await createMixedClients(['cordova', 'cordova']);
      
      try {
        const roomId = await setupMixedRoomScenario(clients);
        
        expect(roomId).toBeDefined();
        expect(clients[0].userId).toBeDefined();
        expect(clients[1].userId).toBeDefined();
        
        // Проверяем что оба APK клиента имеют глобальную проверку статусов
        verifyGlobalStatusCheck(clients[0]);
        verifyGlobalStatusCheck(clients[1]);
        
        // Ждем установления соединений
        await new Promise(resolve => setTimeout(resolve, 500));
        
        verifyConnectionStatuses(clients);
        
        // Ждем обновления статусов (для APK может потребоваться больше времени)
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        verifyAllStatusesConnected(clients);
      } finally {
        cleanupClients(clients);
      }
    });
  });
  
  describe('Комбинации из 3 участников', () => {
    
    it('веб+веб+APK: веб создает, затем веб и APK присоединяются', async () => {
      const clients = await createMixedClients(['web', 'web', 'cordova']);
      
      try {
        const roomId = await setupMixedRoomScenario(clients);
        
        expect(roomId).toBeDefined();
        expect(clients.every(c => c.userId)).toBe(true);
        
        verifyGlobalStatusCheck(clients[2]); // APK клиент
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        verifyConnectionStatuses(clients);
        
        // Ждем установления всех соединений
        await waitForAllConnections(clients, 10000);
        
        // Ждем обновления статусов
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        verifyAllStatusesConnected(clients);
      } finally {
        cleanupClients(clients);
      }
    });
    
    it('APK+APK+веб: APK создает, затем APK и веб присоединяются', async () => {
      const clients = await createMixedClients(['cordova', 'cordova', 'web']);
      
      try {
        const roomId = await setupMixedRoomScenario(clients);
        
        expect(roomId).toBeDefined();
        expect(clients.every(c => c.userId)).toBe(true);
        
        verifyGlobalStatusCheck(clients[0]);
        verifyGlobalStatusCheck(clients[1]);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        verifyConnectionStatuses(clients);
        
        await waitForAllConnections(clients, 10000);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        verifyAllStatusesConnected(clients);
      } finally {
        cleanupClients(clients);
      }
    });
    
    it('веб+APK+веб: веб создает, APK присоединяется первым, затем веб', async () => {
      const clients = await createMixedClients(['web', 'cordova', 'web']);
      
      try {
        const roomId = await setupMixedRoomScenario(clients);
        
        expect(roomId).toBeDefined();
        expect(clients.every(c => c.userId)).toBe(true);
        
        verifyGlobalStatusCheck(clients[1]);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        verifyConnectionStatuses(clients);
        
        await waitForAllConnections(clients, 10000);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        verifyAllStatusesConnected(clients);
      } finally {
        cleanupClients(clients);
      }
    });
    
    it('APK+веб+APK: APK создает, веб присоединяется первым, затем APK', async () => {
      const clients = await createMixedClients(['cordova', 'web', 'cordova']);
      
      try {
        const roomId = await setupMixedRoomScenario(clients);
        
        expect(roomId).toBeDefined();
        expect(clients.every(c => c.userId)).toBe(true);
        
        verifyGlobalStatusCheck(clients[0]);
        verifyGlobalStatusCheck(clients[2]);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        verifyConnectionStatuses(clients);
        
        await waitForAllConnections(clients, 10000);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        verifyAllStatusesConnected(clients);
      } finally {
        cleanupClients(clients);
      }
    });
    
    it('веб+веб+веб: все веб клиенты', async () => {
      const clients = await createMixedClients(['web', 'web', 'web']);
      
      try {
        const roomId = await setupMixedRoomScenario(clients);
        
        expect(roomId).toBeDefined();
        expect(clients.every(c => c.userId)).toBe(true);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        verifyConnectionStatuses(clients);
        
        await waitForAllConnections(clients, 10000);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        verifyAllStatusesConnected(clients);
      } finally {
        cleanupClients(clients);
      }
    });
    
    it('APK+APK+APK: все APK клиенты', async () => {
      const clients = await createMixedClients(['cordova', 'cordova', 'cordova']);
      
      try {
        const roomId = await setupMixedRoomScenario(clients);
        
        expect(roomId).toBeDefined();
        expect(clients.every(c => c.userId)).toBe(true);
        
        clients.forEach(client => verifyGlobalStatusCheck(client));
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        verifyConnectionStatuses(clients);
        
        await waitForAllConnections(clients, 10000);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        verifyAllStatusesConnected(clients);
      } finally {
        cleanupClients(clients);
      }
    });
  });
  
  describe('Комбинации из 4+ участников', () => {
    
    it('веб+веб+APK+APK: 2 веб и 2 APK', async () => {
      const clients = await createMixedClients(['web', 'web', 'cordova', 'cordova']);
      
      try {
        const roomId = await setupMixedRoomScenario(clients);
        
        expect(roomId).toBeDefined();
        expect(clients.every(c => c.userId)).toBe(true);
        
        verifyGlobalStatusCheck(clients[2]);
        verifyGlobalStatusCheck(clients[3]);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        verifyConnectionStatuses(clients);
        
        await waitForAllConnections(clients, 15000);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        verifyAllStatusesConnected(clients);
      } finally {
        cleanupClients(clients);
      }
    });
    
    it('веб+APK+веб+APK: чередование веб и APK', async () => {
      const clients = await createMixedClients(['web', 'cordova', 'web', 'cordova']);
      
      try {
        const roomId = await setupMixedRoomScenario(clients);
        
        expect(roomId).toBeDefined();
        expect(clients.every(c => c.userId)).toBe(true);
        
        verifyGlobalStatusCheck(clients[1]);
        verifyGlobalStatusCheck(clients[3]);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        verifyConnectionStatuses(clients);
        
        await waitForAllConnections(clients, 15000);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        verifyAllStatusesConnected(clients);
      } finally {
        cleanupClients(clients);
      }
    });
    
    it('APK+APK+APK+веб: 3 APK и 1 веб', async () => {
      const clients = await createMixedClients(['cordova', 'cordova', 'cordova', 'web']);
      
      try {
        const roomId = await setupMixedRoomScenario(clients);
        
        expect(roomId).toBeDefined();
        expect(clients.every(c => c.userId)).toBe(true);
        
        verifyGlobalStatusCheck(clients[0]);
        verifyGlobalStatusCheck(clients[1]);
        verifyGlobalStatusCheck(clients[2]);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        verifyConnectionStatuses(clients);
        
        await waitForAllConnections(clients, 15000);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        verifyAllStatusesConnected(clients);
      } finally {
        cleanupClients(clients);
      }
    });
  });
  
  describe('Последовательные сценарии', () => {
    
    it('должен корректно обрабатывать пошаговое присоединение участников с проверкой статусов на каждом этапе', async () => {
      const clients = await createMixedClients(['web', 'cordova', 'web']);
      
      try {
        // Шаг 1: Первый клиент создает комнату (используем callback как в setupMixedRoomScenario)
        const creator = clients[0];
        if (creator.elements && creator.elements.usernameInput) {
          creator.elements.usernameInput.value = creator.username;
        }
        
        const roomId = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout creating room'));
          }, 5000);
          
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
        
        expect(roomId).toBeDefined();
        expect(creator.userId).toBeDefined();
        
        // Даем время на обработку всех событий и обновление DOM
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Шаг 2: Второй клиент (APK) присоединяется
        const secondClient = clients[1];
        if (secondClient.elements && secondClient.elements.roomIdInput) {
          secondClient.elements.roomIdInput.value = roomId;
        }
        if (secondClient.elements && secondClient.elements.usernameInput) {
          secondClient.elements.usernameInput.value = secondClient.username;
        }
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout joining room'));
          }, 5000);
          
          const originalEmit = secondClient.socket.emit.bind(secondClient.socket);
          secondClient.socket.emit = function(event, data, callback) {
            if (event === 'join-room' && callback) {
              originalEmit(event, data, (response) => {
                if (!response.error) {
                  secondClient.userId = response.userId;
                  secondClient.roomId = roomId;
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
          
          secondClient.VoiceRoom.joinExistingRoom();
        });
        
        expect(secondClient.userId).toBeDefined();
        
        // Даем время на обработку всех событий и обновление DOM
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Проверяем статусы после присоединения второго клиента
        verifyConnectionStatuses([clients[0], clients[1]]);
        
        // Шаг 3: Третий клиент (веб) присоединяется
        const thirdClient = clients[2];
        if (thirdClient.elements && thirdClient.elements.roomIdInput) {
          thirdClient.elements.roomIdInput.value = roomId;
        }
        if (thirdClient.elements && thirdClient.elements.usernameInput) {
          thirdClient.elements.usernameInput.value = thirdClient.username;
        }
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout joining room'));
          }, 5000);
          
          const originalEmit = thirdClient.socket.emit.bind(thirdClient.socket);
          thirdClient.socket.emit = function(event, data, callback) {
            if (event === 'join-room' && callback) {
              originalEmit(event, data, (response) => {
                if (!response.error) {
                  thirdClient.userId = response.userId;
                  thirdClient.roomId = roomId;
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
          
          thirdClient.VoiceRoom.joinExistingRoom();
        });
        
        expect(thirdClient.userId).toBeDefined();
        
        // Даем время на обработку всех событий и обновление DOM
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Проверяем статусы после присоединения всех клиентов
        verifyConnectionStatuses(clients);
        
        // Ждем установления всех соединений
        await waitForAllConnections(clients, 15000);
        
        // Ждем обновления статусов
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        verifyAllStatusesConnected(clients);
      } finally {
        cleanupClients(clients);
      }
    }, 20000);
  });
  
  describe('Одновременное присоединение', () => {
    
    it('должен корректно обрабатывать одновременное присоединение нескольких участников', async () => {
      const clients = await createMixedClients(['web', 'cordova', 'web', 'cordova']);
      
      try {
        // Первый клиент создает комнату (используем callback как в setupMixedRoomScenario)
        const creator = clients[0];
        if (creator.elements && creator.elements.usernameInput) {
          creator.elements.usernameInput.value = creator.username;
        }
        
        const roomId = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout creating room'));
          }, 5000);
          
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
        
        // Остальные клиенты присоединяются одновременно
        const joinPromises = clients.slice(1).map(client => {
          if (client.elements && client.elements.roomIdInput) {
            client.elements.roomIdInput.value = roomId;
          }
          if (client.elements && client.elements.usernameInput) {
            client.elements.usernameInput.value = client.username;
          }
          
          return new Promise((resolve, reject) => {
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
        });
        
        await Promise.all(joinPromises);
        
        expect(clients.every(c => c.userId)).toBe(true);
        
        // Даем время на обработку всех событий и обновление DOM
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        verifyConnectionStatuses(clients);
        
        await waitForAllConnections(clients, 15000);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        verifyAllStatusesConnected(clients);
      } finally {
        cleanupClients(clients);
      }
    }, 25000);
  });
  
  describe('Выход участников', () => {
    
    it('должен корректно обрабатывать выход участника и обновление статусов', async () => {
      const clients = await createMixedClients(['web', 'cordova', 'web']);
      
      try {
        const roomId = await setupMixedRoomScenario(clients);
        
        expect(roomId).toBeDefined();
        
        // Даем время на обработку всех событий и обновление DOM
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        verifyConnectionStatuses(clients);
        
        await waitForAllConnections(clients, 10000);
        
        // Второй клиент (APK) выходит
        const leavingClient = clients[1];
        leavingClient.VoiceRoom.leaveRoom();
        
        // Даем время на обработку события user-left и обновление DOM
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Проверяем что остальные клиенты видят правильное количество участников
        const remainingClients = [clients[0], clients[2]];
        
        remainingClients.forEach(client => {
          const usersGrid = client.elements.usersGrid;
          if (usersGrid) {
            const userCards = usersGrid.querySelectorAll('.user-card, [data-user-id]');
            expect(userCards.length).toBe(2); // Осталось 2 участника
          }
        });
        
        // Проверяем что ушедший клиент не виден
        remainingClients.forEach(client => {
          const usersGrid = client.elements.usersGrid;
          if (usersGrid) {
            const card = usersGrid.querySelector(`[data-user-id="${leavingClient.userId}"]`) ||
                        usersGrid.querySelector(`#user-${leavingClient.userId}`);
            expect(card).toBeNull();
          }
        });
      } finally {
        cleanupClients(clients);
      }
    });
  });
  
  describe('Переподключение', () => {
    
    it('должен корректно обрабатывать переподключение участника после разрыва соединения', async () => {
      const clients = await createMixedClients(['web', 'cordova']);
      
      try {
        const roomId = await setupMixedRoomScenario(clients);
        
        expect(roomId).toBeDefined();
        
        // Даем время на обработку всех событий и обновление DOM
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        verifyConnectionStatuses(clients);
        
        await waitForAllConnections(clients, 10000);
        
        // Симулируем разрыв соединения для второго клиента
        const disconnectedClient = clients[1];
        if (disconnectedClient.socket) {
          disconnectedClient.socket.connected = false;
          disconnectedClient.socket._emitEvent('disconnect', 'transport close');
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Восстанавливаем соединение
        disconnectedClient.socket.connected = true;
        disconnectedClient.socket._emitEvent('connect');
        
        // Переподключаемся к комнате
        if (disconnectedClient.elements.roomIdInput) {
          disconnectedClient.elements.roomIdInput.value = roomId;
        }
        if (disconnectedClient.elements.usernameInput) {
          disconnectedClient.elements.usernameInput.value = disconnectedClient.username;
        }
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout rejoining room'));
          }, 5000);
          
          const originalEmit = disconnectedClient.socket.emit.bind(disconnectedClient.socket);
          disconnectedClient.socket.emit = function(event, data, callback) {
            if (event === 'join-room' && callback) {
              originalEmit(event, data, (response) => {
                if (!response.error) {
                  disconnectedClient.userId = response.userId;
                  disconnectedClient.roomId = roomId;
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
          
          disconnectedClient.VoiceRoom.joinExistingRoom();
        });
        
        // Даем время на обработку всех событий и обновление DOM
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        verifyConnectionStatuses(clients);
        
        await waitForAllConnections(clients, 10000);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        verifyAllStatusesConnected(clients);
      } finally {
        cleanupClients(clients);
      }
    });
  });
  
  describe('Глобальная проверка статусов в APK', () => {
    
    it('должен обновлять статусы через глобальную проверку в APK клиентах', async () => {
      const clients = await createMixedClients(['cordova', 'web']);
      
      try {
        const roomId = await setupMixedRoomScenario(clients);
        
        expect(roomId).toBeDefined();
        
        const apkClient = clients[0];
        verifyGlobalStatusCheck(apkClient);
        
        // Проверяем что глобальная проверка работает
        expect(apkClient.VoiceRoom.globalStatusCheckInterval).toBeDefined();
        
        // Симулируем установление соединения без обновления статуса через события
        const webClient = clients[1];
        const peer = apkClient.VoiceRoom.peers.get(webClient.userId);
        
        if (peer) {
          // Устанавливаем состояние соединения как connected, но статус остается "Подключение..."
          peer.iceConnectionState = 'connected';
          peer.connectionState = 'connected';
          
          // Ждем выполнения глобальной проверки (каждые 2 секунды)
          await new Promise(resolve => setTimeout(resolve, 2500));
          
          // Проверяем что статус обновился через глобальную проверку
          const card = apkClient.elements.usersGrid.querySelector(`[data-user-id="${webClient.userId}"]`);
          if (card) {
            const status = card.querySelector('.user-status');
            if (status) {
              expect(status.textContent).toBe('Подключен');
            }
          }
        }
      } finally {
        cleanupClients(clients);
      }
    });
    
    it('должен останавливать глобальную проверку при выходе из комнаты', async () => {
      const clients = await createMixedClients(['cordova', 'web']);
      
      try {
        const roomId = await setupMixedRoomScenario(clients);
        
        expect(roomId).toBeDefined();
        
        const apkClient = clients[0];
        verifyGlobalStatusCheck(apkClient);
        
        expect(apkClient.VoiceRoom.globalStatusCheckInterval).toBeDefined();
        
        // Выходим из комнаты
        apkClient.VoiceRoom.leaveRoom();
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Проверяем что глобальная проверка остановлена
        expect(apkClient.VoiceRoom.globalStatusCheckInterval).toBeNull();
      } finally {
        cleanupClients(clients);
      }
    });
  });
  
  describe('Статусы при изменении состояния WebRTC', () => {
    
    it('должен корректно обновлять статусы при изменении состояния ICE соединения', async () => {
      const clients = await createMixedClients(['web', 'cordova']);
      
      try {
        const roomId = await setupMixedRoomScenario(clients);
        
        expect(roomId).toBeDefined();
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const webClient = clients[0];
        const apkClient = clients[1];
        
        const peer = webClient.VoiceRoom.peers.get(apkClient.userId);
        
        if (peer) {
          // Симулируем изменение состояния ICE соединения
          peer.iceConnectionState = 'connecting';
          if (peer.oniceconnectionstatechange) {
            peer.oniceconnectionstatechange();
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const card = webClient.elements.usersGrid.querySelector(`[data-user-id="${apkClient.userId}"]`) ||
                      webClient.elements.usersGrid.querySelector(`#user-${apkClient.userId}`);
          if (card) {
            const status = card.querySelector('.user-status');
            if (status) {
              expect(status.textContent).toBe('Подключение...');
            }
          }
          
          // Симулируем переход в connected
          peer.iceConnectionState = 'connected';
          if (peer.oniceconnectionstatechange) {
            peer.oniceconnectionstatechange();
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
          
          if (card) {
            const status = card.querySelector('.user-status');
            if (status) {
              expect(status.textContent).toBe('Подключен');
            }
          }
        }
      } finally {
        cleanupClients(clients);
      }
    });
  });
});

