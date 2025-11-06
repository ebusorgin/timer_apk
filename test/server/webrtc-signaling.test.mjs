import { expect } from 'chai';
import { io as Client } from 'socket.io-client';
import { startTestServer, stopTestServer, cleanupTestDB } from '../helpers/test-server.mjs';

describe('WebRTC Signaling Tests', () => {
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

    describe('Peer Initialization', () => {
        it('should initialize peer connection', (done) => {
            const client1 = Client(`http://localhost:${port}`);
            const client2 = Client(`http://localhost:${port}`);
            let userId1, userId2;

            client1.on('connect', () => {
                client1.emit('register', { name: 'User1' }, (response1) => {
                    userId1 = response1.user.id;
                    
                    client2.on('connect', () => {
                        client2.emit('register', { name: 'User2' }, (response2) => {
                            userId2 = response2.user.id;
                            
                            client2.on('peer-init', (data) => {
                                expect(data.fromUserId).to.equal(userId1);
                                expect(data.fromName).to.equal('User1');
                                expect(data.fromDeviceId).to.exist;
                                
                                client1.disconnect();
                                client2.disconnect();
                                done();
                            });

                            client1.emit('init-peer', { targetUserId: userId2 }, (response) => {
                                expect(response.success).to.be.true;
                            });
                        });
                    });
                });
            });
        });

        it('should fail init-peer for non-existent user', (done) => {
            const client = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            
            client.on('connect', () => {
                client.emit('register', { name: 'User1' }, () => {
                    client.emit('init-peer', { targetUserId: 99999 }, (response) => {
                        expect(response.error).to.exist;
                        expect(response.success).to.be.undefined;
                        
                        client.disconnect();
                        done();
                    });
                });
            });
        });

        it('should fail init-peer without registration', (done) => {
            const client = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
            
            client.on('connect', () => {
                client.emit('init-peer', { targetUserId: 1 }, (response) => {
                    expect(response.error).to.exist;
                    
                    client.disconnect();
                    done();
                });
            });
        });
    });

    describe('WebRTC Signal Transmission', () => {
        it('should transmit offer signal', (done) => {
            const client1 = Client(`http://localhost:${port}`);
            const client2 = Client(`http://localhost:${port}`);
            let userId1, userId2;
            const testOffer = {
                type: 'offer',
                sdp: 'test-sdp-offer'
            };

            client1.on('connect', () => {
                client1.emit('register', { name: 'User1' }, (response1) => {
                    userId1 = response1.user.id;
                    
                    client2.on('connect', () => {
                        client2.emit('register', { name: 'User2' }, (response2) => {
                            userId2 = response2.user.id;
                            
                            client2.on('webrtc-signal', (data) => {
                                expect(data.fromUserId).to.equal(userId1);
                                expect(data.type).to.equal('offer');
                                expect(data.signal).to.deep.equal(testOffer);
                                
                                client1.disconnect();
                                client2.disconnect();
                                done();
                            });

                            client1.emit('webrtc-signal', {
                                targetUserId: userId2,
                                signal: testOffer,
                                type: 'offer'
                            });
                        });
                    });
                });
            });
        });

        it('should transmit answer signal', (done) => {
            const client1 = Client(`http://localhost:${port}`);
            const client2 = Client(`http://localhost:${port}`);
            let userId1, userId2;
            const testAnswer = {
                type: 'answer',
                sdp: 'test-sdp-answer'
            };

            client1.on('connect', () => {
                client1.emit('register', { name: 'User1' }, (response1) => {
                    userId1 = response1.user.id;
                    
                    client2.on('connect', () => {
                        client2.emit('register', { name: 'User2' }, (response2) => {
                            userId2 = response2.user.id;
                            
                            client1.on('webrtc-signal', (data) => {
                                expect(data.fromUserId).to.equal(userId2);
                                expect(data.type).to.equal('answer');
                                expect(data.signal).to.deep.equal(testAnswer);
                                
                                client1.disconnect();
                                client2.disconnect();
                                done();
                            });

                            client2.emit('webrtc-signal', {
                                targetUserId: userId1,
                                signal: testAnswer,
                                type: 'answer'
                            });
                        });
                    });
                });
            });
        });

        it('should transmit ICE candidate', (done) => {
            const client1 = Client(`http://localhost:${port}`);
            const client2 = Client(`http://localhost:${port}`);
            let userId1, userId2;
            const testCandidate = {
                candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host',
                sdpMLineIndex: 0,
                sdpMid: '0'
            };

            client1.on('connect', () => {
                client1.emit('register', { name: 'User1' }, (response1) => {
                    userId1 = response1.user.id;
                    
                    client2.on('connect', () => {
                        client2.emit('register', { name: 'User2' }, (response2) => {
                            userId2 = response2.user.id;
                            
                            client2.on('webrtc-signal', (data) => {
                                expect(data.fromUserId).to.equal(userId1);
                                expect(data.type).to.equal('ice-candidate');
                                expect(data.signal).to.deep.equal(testCandidate);
                                
                                client1.disconnect();
                                client2.disconnect();
                                done();
                            });

                            client1.emit('webrtc-signal', {
                                targetUserId: userId2,
                                signal: testCandidate,
                                type: 'ice-candidate'
                            });
                        });
                    });
                });
            });
        });

        it('should not transmit signal to offline user', (done) => {
            const client1 = Client(`http://localhost:${port}`);
            let userId1;

            client1.on('connect', () => {
                client1.emit('register', { name: 'User1' }, (response1) => {
                    userId1 = response1.user.id;
                    
                    // Пытаемся отправить сигнал несуществующему пользователю
                    client1.emit('webrtc-signal', {
                        targetUserId: 99999,
                        signal: { type: 'offer' },
                        type: 'offer'
                    });

                    // Сигнал не должен быть доставлен
                    setTimeout(() => {
                        client1.disconnect();
                        done();
                    }, 100);
                });
            });
        });

        it('should not transmit signal without registration', (done) => {
            const client1 = Client(`http://localhost:${port}`);
            const client2 = Client(`http://localhost:${port}`);
            let userId2;
            let signalReceived = false;

            client1.on('connect', () => {
                client2.on('connect', () => {
                    client2.emit('register', { name: 'User2' }, (response2) => {
                        userId2 = response2.user.id;
                        
                        client2.on('webrtc-signal', () => {
                            signalReceived = true;
                        });

                        // client1 не зарегистрирован, сигнал не должен быть отправлен
                        client1.emit('webrtc-signal', {
                            targetUserId: userId2,
                            signal: { type: 'offer' },
                            type: 'offer'
                        });

                        setTimeout(() => {
                            expect(signalReceived).to.be.false;
                            client1.disconnect();
                            client2.disconnect();
                            done();
                        }, 100);
                    });
                });
            });
        });
    });

    describe('Multiple Peer Connections', () => {
        it('should handle multiple peer signals', (done) => {
            const clients = [];
            const userIds = [];
            const userCount = 3;
            let registeredCount = 0;
            let signalsReceived = 0;

            for (let i = 0; i < userCount; i++) {
                const client = Client(`http://127.0.0.1:${port}`, {
                transports: ['websocket', 'polling']
            });
                clients.push(client);

                client.on('connect', () => {
                    client.emit('register', { name: `User${i + 1}` }, (response) => {
                        userIds.push(response.user.id);
                        registeredCount++;

                        if (registeredCount === userCount) {
                            // Каждый пользователь отправляет сигнал всем остальным
                            clients.forEach((sender, senderIdx) => {
                                userIds.forEach((targetId, targetIdx) => {
                                    if (senderIdx !== targetIdx) {
                                        clients[targetIdx].once('webrtc-signal', (data) => {
                                            expect(data.fromUserId).to.equal(userIds[senderIdx]);
                                            signalsReceived++;
                                            
                                            if (signalsReceived === userCount * (userCount - 1)) {
                                                clients.forEach(c => c.disconnect());
                                                done();
                                            }
                                        });

                                        sender.emit('webrtc-signal', {
                                            targetUserId: targetId,
                                            signal: { type: 'offer', test: true },
                                            type: 'offer'
                                        });
                                    }
                                });
                            });
                        }
                    });
                });
            }
        });
    });
});

