import { expect } from 'chai';
import { io as Client } from 'socket.io-client';
import { startTestServer, stopTestServer, cleanupTestDB } from '../helpers/test-server.mjs';

describe('Conference Integration Tests', () => {
    let testServer;
    let testIo;
    let port;

    before(async () => {
        cleanupTestDB();
        const result = await startTestServer();
        testServer = result.server;
        testIo = result.io;
        port = result.port;
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    after(async () => {
        await stopTestServer();
        cleanupTestDB();
    });

    afterEach(() => {
        cleanupTestDB();
    });

    describe('Full Conference Flow', () => {
        it('should handle complete conference join flow', (done) => {
            const client1 = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            const client2 = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            const client3 = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            
            let user1Id, user2Id, user3Id;
            const events = {
                user1: { connected: false, list: false },
                user2: { connected: false, list: false },
                user3: { connected: false, list: false }
            };

            // User 1 joins
            client1.on('connect', () => {
                client1.emit('register', { name: 'User1' }, (response1) => {
                    expect(response1.success).to.be.true;
                    user1Id = response1.user.id;
                    expect(response1.users.length).to.equal(0);

                    // User 2 joins
                    client2.on('connect', () => {
                        client2.on('user-connected', (data) => {
                            expect(data.user.name).to.equal('User2');
                            events.user1.connected = true;
                        });

                        client2.emit('register', { name: 'User2' }, (response2) => {
                            expect(response2.success).to.be.true;
                            user2Id = response2.user.id;
                            expect(response2.users.length).to.equal(1);
                            expect(response2.users[0].id).to.equal(user1Id);

                            // User 3 joins
                            client3.on('connect', () => {
                                client3.on('user-connected', (data) => {
                                    expect(data.user.name).to.equal('User3');
                                    events.user2.connected = true;
                                });

                                client1.on('user-connected', (data) => {
                                    expect(data.user.name).to.equal('User3');
                                    events.user1.connected = true;
                                });

                                client3.emit('register', { name: 'User3' }, (response3) => {
                                    expect(response3.success).to.be.true;
                                    user3Id = response3.user.id;
                                    expect(response3.users.length).to.equal(2);

                                    setTimeout(() => {
                                        expect(events.user1.connected).to.be.true;
                                        expect(events.user2.connected).to.be.true;
                                        
                                        client1.disconnect();
                                        client2.disconnect();
                                        client3.disconnect();
                                        done();
                                    }, 200);
                                });
                            });
                        });
                    });
                });
            });
        });

        it('should handle user leaving conference', (done) => {
            const client1 = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            const client2 = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            const client3 = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            
            let user1Id, user2Id, user3Id;
            let disconnectedCount = 0;

            client1.on('connect', () => {
                client1.emit('register', { name: 'User1' }, (response1) => {
                    user1Id = response1.user.id;

                    client2.on('connect', () => {
                        client2.emit('register', { name: 'User2' }, (response2) => {
                            user2Id = response2.user.id;

                            client3.on('connect', () => {
                                client3.emit('register', { name: 'User3' }, (response3) => {
                                    user3Id = response3.user.id;

                                    // Настраиваем обработчики отключения
                                    client2.on('user-disconnected', (data) => {
                                        if (data.userId === user1Id) {
                                            disconnectedCount++;
                                        }
                                    });

                                    client3.on('user-disconnected', (data) => {
                                        if (data.userId === user1Id) {
                                            disconnectedCount++;
                                        }
                                    });

                                    // User1 покидает конференцию
                                    client1.disconnect();

                                    setTimeout(() => {
                                        expect(disconnectedCount).to.equal(2);
                                        
                                        client2.disconnect();
                                        client3.disconnect();
                                        done();
                                    }, 300);
                                });
                            });
                        });
                    });
                });
            });
        });

        it('should handle WebRTC signaling in conference', (done) => {
            const client1 = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            const client2 = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            const client3 = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            
            let user1Id, user2Id, user3Id;
            let signalsReceived = 0;

            client1.on('connect', () => {
                client1.emit('register', { name: 'User1' }, (response1) => {
                    user1Id = response1.user.id;

                    client2.on('connect', () => {
                        client2.emit('register', { name: 'User2' }, (response2) => {
                            user2Id = response2.user.id;

                            client3.on('connect', () => {
                                client3.emit('register', { name: 'User3' }, (response3) => {
                                    user3Id = response3.user.id;

                                    // User2 и User3 слушают сигналы от User1
                                    client2.on('webrtc-signal', (data) => {
                                        if (data.fromUserId === user1Id) {
                                            signalsReceived++;
                                        }
                                    });

                                    client3.on('webrtc-signal', (data) => {
                                        if (data.fromUserId === user1Id) {
                                            signalsReceived++;
                                        }
                                    });

                                    // User1 отправляет сигналы User2 и User3
                                    client1.emit('webrtc-signal', {
                                        targetUserId: user2Id,
                                        signal: { type: 'offer', test: true },
                                        type: 'offer'
                                    });

                                    client1.emit('webrtc-signal', {
                                        targetUserId: user3Id,
                                        signal: { type: 'offer', test: true },
                                        type: 'offer'
                                    });

                                    setTimeout(() => {
                                        expect(signalsReceived).to.equal(2);
                                        
                                        client1.disconnect();
                                        client2.disconnect();
                                        client3.disconnect();
                                        done();
                                    }, 200);
                                });
                            });
                        });
                    });
                });
            });
        });

        it('should handle multiple users joining simultaneously', (done) => {
            const clients = [];
            const userCount = 5;
            let registeredCount = 0;
            let allUsersReceived = 0;

            for (let i = 0; i < userCount; i++) {
                const client = Client(`http://127.0.0.1:${port}`, {
                    transports: ['websocket', 'polling']
                });
                clients.push(client);

                client.on('connect', () => {
                    client.emit('register', { name: `User${i + 1}` }, (response) => {
                        expect(response.success).to.be.true;
                        registeredCount++;

                        // Последний пользователь должен видеть всех остальных
                        if (registeredCount === userCount) {
                            expect(response.users.length).to.equal(userCount - 1);
                            
                            // Проверяем, что все получили уведомления о подключении
                            clients.forEach(c => {
                                c.on('user-connected', () => {
                                    allUsersReceived++;
                                });
                            });

                            setTimeout(() => {
                                clients.forEach(c => c.disconnect());
                                done();
                            }, 300);
                        }
                    });
                });
            }
        });
    });

    describe('Conference Status', () => {
        it('should maintain correct user count', (done) => {
            const clients = [];
            const userCount = 4;
            let registeredCount = 0;

            for (let i = 0; i < userCount; i++) {
                const client = Client(`http://127.0.0.1:${port}`, {
                    transports: ['websocket', 'polling']
                });
                clients.push(client);

                client.on('connect', () => {
                    client.emit('register', { name: `User${i + 1}` }, (response) => {
                        registeredCount++;
                        
                        // Каждый новый пользователь должен видеть правильное количество существующих
                        expect(response.users.length).to.equal(registeredCount - 1);
                        
                        if (registeredCount === userCount) {
                            clients.forEach(c => c.disconnect());
                            done();
                        }
                    });
                });
            }
        });

        it('should update user count when users leave', (done) => {
            const client1 = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            const client2 = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            const client3 = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });

            client1.on('connect', () => {
                client1.emit('register', { name: 'User1' }, () => {
                    client2.on('connect', () => {
                        client2.emit('register', { name: 'User2' }, (response2) => {
                            expect(response2.users.length).to.equal(1);

                            client3.on('connect', () => {
                                client3.emit('register', { name: 'User3' }, (response3) => {
                                    expect(response3.users.length).to.equal(2);

                                    // User1 покидает конференцию
                                    client1.disconnect();

                                    setTimeout(() => {
                                        // User2 и User3 должны получить уведомление об отключении User1
                                        client2.on('user-disconnected', () => {
                                            client3.on('user-disconnected', () => {
                                                client2.disconnect();
                                                client3.disconnect();
                                                done();
                                            });
                                        });
                                    }, 200);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

