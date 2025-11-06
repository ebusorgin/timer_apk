import { expect } from 'chai';
import { io as Client } from 'socket.io-client';
import { startTestServer, stopTestServer, cleanupTestDB } from '../helpers/test-server.mjs';

describe('Registration Tests', () => {
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

    describe('User Registration', () => {
        it('should register a new user', (done) => {
            const client = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            
            client.on('connect', () => {
                client.emit('register', { name: 'TestUser1' }, (response) => {
                    expect(response.success).to.be.true;
                    expect(response.user).to.exist;
                    expect(response.user.id).to.be.a('number');
                    expect(response.user.name).to.equal('TestUser1');
                    expect(response.users).to.be.an('array');
                    
                    client.disconnect();
                    done();
                });
            });
        });

        it('should register user with deviceId', (done) => {
            const client = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            const deviceId = 'test-device-123';
            
            client.on('connect', () => {
                client.emit('register', { 
                    name: 'TestUser2',
                    deviceId: deviceId
                }, (response) => {
                    expect(response.success).to.be.true;
                    expect(response.user.id).to.be.a('number');
                    
                    client.disconnect();
                    done();
                });
            });
        });

        it('should return empty users list for first user', (done) => {
            const client = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            
            client.on('connect', () => {
                client.emit('register', { name: 'FirstUser' }, (response) => {
                    expect(response.success).to.be.true;
                    expect(response.users).to.be.an('array');
                    expect(response.users.length).to.equal(0);
                    
                    client.disconnect();
                    done();
                });
            });
        });

        it('should return existing users for new user', (done) => {
            const client1 = Client(`http://localhost:${port}`);
            let userId1;

            client1.on('connect', () => {
                client1.emit('register', { name: 'User1' }, (response1) => {
                    userId1 = response1.user.id;
                    
                    const client2 = Client(`http://localhost:${port}`);
                    
                    client2.on('connect', () => {
                        client2.emit('register', { name: 'User2' }, (response2) => {
                            expect(response2.success).to.be.true;
                            expect(response2.users).to.be.an('array');
                            expect(response2.users.length).to.equal(1);
                            expect(response2.users[0].id).to.equal(userId1);
                            expect(response2.users[0].name).to.equal('User1');
                            
                            client1.disconnect();
                            client2.disconnect();
                            done();
                        });
                    });
                });
            });
        });
    });

    describe('User Connected Event', () => {
        it('should emit user-connected when new user joins', (done) => {
            const client1 = Client(`http://localhost:${port}`);
            const client2 = Client(`http://localhost:${port}`);
            let userConnectedReceived = false;

            client1.on('connect', () => {
                client1.emit('register', { name: 'User1' }, () => {
                    client2.on('connect', () => {
                        client2.on('user-connected', (data) => {
                            expect(data.user).to.exist;
                            expect(data.user.name).to.equal('User2');
                            expect(data.user.id).to.be.a('number');
                            userConnectedReceived = true;
                        });

                        client2.emit('register', { name: 'User2' }, () => {
                            setTimeout(() => {
                                expect(userConnectedReceived).to.be.true;
                                client1.disconnect();
                                client2.disconnect();
                                done();
                            }, 100);
                        });
                    });
                });
            });
        });
    });

    describe('Users List Event', () => {
        it('should receive users-list after registration', (done) => {
            const client1 = Client(`http://localhost:${port}`);
            const client2 = Client(`http://localhost:${port}`);
            let usersListReceived = false;

            client1.on('connect', () => {
                client1.emit('register', { name: 'User1' }, () => {
                    client2.on('connect', () => {
                        client2.on('users-list', (data) => {
                            expect(data.users).to.be.an('array');
                            expect(data.users.length).to.equal(1);
                            expect(data.users[0].name).to.equal('User1');
                            usersListReceived = true;
                        });

                        client2.emit('register', { name: 'User2' }, () => {
                            setTimeout(() => {
                                expect(usersListReceived).to.be.true;
                                client1.disconnect();
                                client2.disconnect();
                                done();
                            }, 100);
                        });
                    });
                });
            });
        });
    });

    describe('User Disconnection', () => {
        it('should emit user-disconnected when user leaves', (done) => {
            const client1 = Client(`http://localhost:${port}`);
            const client2 = Client(`http://localhost:${port}`);
            let userId1;
            let disconnectedReceived = false;

            client1.on('connect', () => {
                client1.emit('register', { name: 'User1' }, (response) => {
                    userId1 = response.user.id;
                    
                    client2.on('connect', () => {
                        client2.emit('register', { name: 'User2' }, () => {
                            client2.on('user-disconnected', (data) => {
                                expect(data.userId).to.equal(userId1);
                                disconnectedReceived = true;
                            });

                            client1.disconnect();
                            
                            setTimeout(() => {
                                expect(disconnectedReceived).to.be.true;
                                client2.disconnect();
                                done();
                            }, 200);
                        });
                    });
                });
            });
        });
    });

    describe('Multiple Users', () => {
        it('should handle multiple users registration', (done) => {
            const clients = [];
            const userCount = 5;
            let registeredCount = 0;

            for (let i = 0; i < userCount; i++) {
                const client = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
                clients.push(client);

                client.on('connect', () => {
                    client.emit('register', { name: `User${i + 1}` }, (response) => {
                        expect(response.success).to.be.true;
                        registeredCount++;
                        
                        if (registeredCount === userCount) {
                            // Последний пользователь должен видеть всех остальных
                            expect(response.users.length).to.equal(userCount - 1);
                            
                            clients.forEach(c => c.disconnect());
                            setTimeout(done, 100);
                        }
                    });
                });
            }
        });
    });
});

