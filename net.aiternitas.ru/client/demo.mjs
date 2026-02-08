/**
 * Minimal client demo: create identity, send message to relay, poll.
 * Run server first: npm start. Then: npm run client
 */

import { createIdentity, MessengerClient } from '../index.mjs';

const RELAY = process.env.RELAY_URL || 'http://localhost:3000';

async function main() {
  const identity = await createIdentity();
  console.log('Identity:', identity.userId.slice(0, 16) + '...');

  const client = new MessengerClient(identity, [RELAY]);
  const avail = await client.getAvailability();
  console.log('Availability:', avail);

  // For demo we "send to self" using our own box public key (normally you'd use receiver's key).
  const { signKeypairToBox } = await import('../shared/crypto.mjs');
  const boxKeys = signKeypairToBox(identity);

  const msg = await client.send('Hello from net.aiternitas.ru', identity.userId, boxKeys.publicKey, 3600);
  console.log('Sent message_id:', msg.message_id);

  const list = await client.poll();
  console.log('Polled messages:', list.length);
  if (list.length > 0) {
    const plain = await client.decrypt(list[0], boxKeys.publicKey);
    console.log('Decrypted:', plain ? new TextDecoder().decode(plain) : '(expired or invalid)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
