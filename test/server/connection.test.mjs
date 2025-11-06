import { expect } from 'chai';
import { io as Client } from 'socket.io-client';
import { startTestServer, stopTestServer, cleanupTestDB } from '../helpers/test-server.mjs';

describe('Connection Tests', () => {
    let testServer;
    let testIo;
    let port;

    before(async () => {
        cleanupTestDB();
        const result = await startTestServer();
        testServer = result.server;
        testIo = result.io;
        port = result.port;
        // Даем серверу время на запуск
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    after(async () => {
        await stopTestServer();
        cleanupTestDB();
    });

    afterEach(() => {
        cleanupTestDB();
    });

    describe('Socket.IO Connection', () => {
        it('should connect to server', (done) => {
            const client = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            
            client.on('connect', () => {
                expect(client.connected).to.be.true;
                client.disconnect();
                done();
            });

            client.on('connect_error', (err) => {
                client.disconnect();
                done(err);
            });
        });

        it('should disconnect from server', (done) => {
            const client = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            
            client.on('connect', () => {
                expect(client.connected).to.be.true;
                client.disconnect();
                
                setTimeout(() => {
                    expect(client.connected).to.be.false;
                    done();
                }, 100);
            });
        });

        it('should handle multiple connections', (done) => {
            const clients = [];
            let connectedCount = 0;
            const totalClients = 5;

            for (let i = 0; i < totalClients; i++) {
                const client = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
                clients.push(client);
                
                client.on('connect', () => {
                    connectedCount++;
                    if (connectedCount === totalClients) {
                        expect(connectedCount).to.equal(totalClients);
                        clients.forEach(c => c.disconnect());
                        done();
                    }
                });
            }
        });
    });

    describe('Connection Status', () => {
        it('should track connection status', (done) => {
            const client = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            
            client.on('connect', () => {
                expect(client.connected).to.be.true;
                expect(client.disconnected).to.be.false;
                
                client.disconnect();
                
                setTimeout(() => {
                    expect(client.connected).to.be.false;
                    expect(client.disconnected).to.be.true;
                    done();
                }, 100);
            });
        });

        it('should emit connection event', (done) => {
            let connectionReceived = false;
            
            testIo.once('connection', (socket) => {
                connectionReceived = true;
                expect(socket).to.exist;
                expect(socket.id).to.be.a('string');
            });

            const client = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            
            client.on('connect', () => {
                setTimeout(() => {
                    expect(connectionReceived).to.be.true;
                    client.disconnect();
                    done();
                }, 50);
            });
        });
    });

    describe('Reconnection', () => {
        it('should handle reconnection', (done) => {
            const client = Client(`http://localhost:${port}`, {
                reconnection: true,
                reconnectionDelay: 100
            });

            let connectCount = 0;

            client.on('connect', () => {
                connectCount++;
                
                if (connectCount === 1) {
                    // Первое подключение
                    client.disconnect();
                } else if (connectCount === 2) {
                    // Переподключение
                    expect(connectCount).to.equal(2);
                    client.disconnect();
                    done();
                }
            });
        });
    });
});

