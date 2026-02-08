/**
 * Federation routes — server-to-server message exchange.
 * No hierarchy; servers push messages to each other.
 */

import { RelayStore } from '../store.mjs';

/**
 * Accept message(s) from another server. Same validation as client POST.
 * @param {RelayStore} store
 * @returns {(req: import('express').Request, res: import('express').Response) => void}
 */
export function postFederationMessages(store) {
  return (req, res) => {
    const body = req.body;
    const list = Array.isArray(body) ? body : [body];
    const accepted = [];
    const errors = [];
    for (const raw of list) {
      const result = store.put(raw);
      if (result.ok) accepted.push(raw.message_id ?? '?');
      else errors.push(result.error);
    }
    res.status(202).json({ accepted: accepted.length, errors });
  };
}
