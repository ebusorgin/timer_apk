import { createRequestValidator, stringField } from '../middleware/validation.mjs';
import { emitToSubscriber } from '../sockets/chat.mjs';
import { sendNewMessagePush } from '../services/push.mjs';

function assertPersistence(persistence) {
  if (!persistence) {
    throw new Error('registerMeMessagesRoutes: persistence is required');
  }
  const required = ['listMessages', 'insertMessage', 'getSubscriberById', 'listContacts'];
  const missing = required.filter((m) => typeof persistence[m] !== 'function');
  if (missing.length) {
    throw new Error(`registerMeMessagesRoutes: persistence missing: ${missing.join(', ')}`);
  }
}

export function registerMeMessagesRoutes({ app, persistence, io, subscriberAuth, logger }) {
  if (!app) throw new Error('registerMeMessagesRoutes: app is required');
  assertPersistence(persistence);

  const log = logger?.child?.({ scope: 'routes:meMessages' }) || logger || console;

  const validateContactIdQuery = createRequestValidator({
    query: {
      contactId: stringField({ required: true, maxLength: 128, label: 'contactId' }),
    },
  });

  const validateSendMessage = createRequestValidator({
    body: {
      toId: stringField({ required: true, maxLength: 128, label: 'toId' }),
      body: stringField({ required: true, maxLength: 4096, label: 'body' }),
    },
  });

  // GET /api/me/chats — список чатов с последним сообщением
  app.get('/api/me/chats', subscriberAuth, async (req, res) => {
    try {
      const myId = req.subscriberId;
      const contacts = await persistence.listContacts(myId);
      const chats = await Promise.all(
        contacts.map(async (c) => {
          const sub = await persistence.getSubscriberById(c.contactId);
          const messages = await persistence.listMessages(myId, c.contactId);
          const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
          // Count unread: messages from contact that are newer than 0 (client tracks read state)
          const unreadCount = messages.filter((m) => m.fromId === c.contactId).length;
          return {
            contactId: c.contactId,
            name: sub?.name || 'Без имени',
            avatarUrl: sub?.avatarUrl || null,
            lastMessage: lastMsg ? { body: lastMsg.body, createdAt: lastMsg.createdAt, fromId: lastMsg.fromId } : null,
            totalFromContact: unreadCount,
          };
        })
      );
      // Sort by last message time (newest first), contacts without messages at end
      chats.sort((a, b) => {
        const ta = a.lastMessage?.createdAt || 0;
        const tb = b.lastMessage?.createdAt || 0;
        return tb - ta;
      });
      res.json({ success: true, chats });
    } catch (error) {
      log.error?.('Ошибка получения чатов', { error: error?.message });
      res.status(500).json({ success: false, error: 'Не удалось получить чаты' });
    }
  });

  app.get('/api/me/messages', subscriberAuth, validateContactIdQuery, async (req, res) => {
    try {
      const fromId = req.subscriberId;
      const contactId = req.validated?.query?.contactId?.trim();
      const messages = await persistence.listMessages(fromId, contactId);
      res.json({ success: true, messages });
    } catch (error) {
      log.error?.('Ошибка получения сообщений', { error: error?.message });
      res.status(500).json({ success: false, error: 'Не удалось получить сообщения' });
    }
  });

  app.post('/api/me/messages', subscriberAuth, validateSendMessage, async (req, res) => {
    try {
      const fromId = req.subscriberId;
      const toId = (req.validated?.body?.toId || '').trim();
      const body = (req.validated?.body?.body || '').trim();
      const toSubscriber = await persistence.getSubscriberById(toId);
      if (!toSubscriber) {
        res.status(404).json({ success: false, error: 'Получатель не найден' });
        return;
      }
      const contacts = await persistence.listContacts(fromId);
      const isContact = contacts.some((c) => c.contactId === toId);
      if (!isContact) {
        res.status(403).json({ success: false, error: 'Можно отправлять сообщения только контактам' });
        return;
      }
      const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const record = {
        id,
        fromId,
        toId,
        body,
        createdAt: Date.now(),
      };
      await persistence.insertMessage(record);
      if (io) {
        emitToSubscriber(io, toId, 'chat:message:new', record);
      }
      const fromSubscriber = await persistence.getSubscriberById(fromId);
      sendNewMessagePush(
        (id) => persistence.getPushSubscription(id),
        toId,
        { fromName: fromSubscriber?.name || 'Кто-то', body: record.body }
      ).catch(() => {});
      res.json({ success: true, message: record });
    } catch (error) {
      log.error?.('Ошибка отправки сообщения', { error: error?.message });
      res.status(500).json({ success: false, error: 'Не удалось отправить сообщение' });
    }
  });
}

export default registerMeMessagesRoutes;
