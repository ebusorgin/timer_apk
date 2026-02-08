/**
 * Relay server routes: POST /messages, GET /messages?receiver_id=
 * Blind relay: validate format only; no decryption.
 */

import { RelayStore } from '../store.mjs';

/**
 * @param {RelayStore} store
 * @returns {(req: import('express').Request, res: import('express').Response) => void}
 */
export function postMessage(store) {
  return (req, res) => {
    const result = store.put(req.body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(202).json({ ok: true });
  };
}

/**
 * @param {RelayStore} store
 * @returns {(req: import('express').Request, res: import('express').Response) => void}
 */
export function getMessages(store) {
  return (req, res) => {
    const receiverId = req.query.receiver_id;
    if (typeof receiverId !== 'string' || !receiverId) {
      res.status(400).json({ error: 'receiver_id required' });
      return;
    }
    const messages = store.getForReceiver(receiverId);
    res.json({ messages });
  };
}
