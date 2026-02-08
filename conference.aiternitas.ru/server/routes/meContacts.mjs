import { createRequestValidator, stringField } from '../middleware/validation.mjs';
import { emitToSubscriber } from '../sockets/chat.mjs';
import { sendContactRequestPush } from '../services/push.mjs';

function assertPersistence(persistence) {
  if (!persistence) {
    throw new Error('registerMeContactsRoutes: persistence is required');
  }
  const required = [
    'listContacts', 'addContact', 'removeContact', 'getSubscriberById', 'getSubscriberByLogin',
    'createContactRequest', 'listContactRequests', 'listOutgoingContactRequests',
    'getContactRequestById', 'updateContactRequestStatus',
  ];
  const missing = required.filter((m) => typeof persistence[m] !== 'function');
  if (missing.length) {
    throw new Error(`registerMeContactsRoutes: persistence missing: ${missing.join(', ')}`);
  }
}

export function registerMeContactsRoutes({ app, persistence, io, subscriberAuth, logger }) {
  if (!app) throw new Error('registerMeContactsRoutes: app is required');
  assertPersistence(persistence);

  const log = logger?.child?.({ scope: 'routes:meContacts' }) || logger || console;

  const validateAddContact = createRequestValidator({
    body: {
      contactId: stringField({ required: true, maxLength: 128, label: 'contactId' }),
    },
  });

  const validateContactIdParam = createRequestValidator({
    params: {
      contactId: stringField({ required: true, maxLength: 128, label: 'contactId' }),
    },
  });

  const validateRequestIdParam = createRequestValidator({
    params: {
      requestId: stringField({ required: true, maxLength: 128, label: 'requestId' }),
    },
  });

  // GET /api/me/contacts — список подтверждённых контактов
  app.get('/api/me/contacts', subscriberAuth, async (req, res) => {
    try {
      const ownerId = req.subscriberId;
      const contactRecords = await persistence.listContacts(ownerId);
      const enriched = await Promise.all(
        contactRecords.map(async (c) => {
          const sub = await persistence.getSubscriberById(c.contactId);
          return {
            id: c.contactId,
            name: sub?.name || 'Без имени',
            createdAt: c.createdAt,
          };
        })
      );
      res.json({ success: true, contacts: enriched });
    } catch (error) {
      log.error?.('Ошибка получения контактов', { error: error?.message });
      res.status(500).json({ success: false, error: 'Не удалось получить контакты' });
    }
  });

  // POST /api/me/contacts — отправить запрос на добавление (не добавляет сразу!)
  app.post('/api/me/contacts', subscriberAuth, validateAddContact, async (req, res) => {
    try {
      const ownerId = req.subscriberId;
      const owner = await persistence.getSubscriberById(ownerId);
      if (!owner) {
        res.status(401).json({ success: false, error: 'Сессия устарела. Войдите снова.' });
        return;
      }
      const ownerIdCanonical = String(owner.id);
      let contactId = (req.validated?.body?.contactId || '').trim();
      if (ownerIdCanonical === contactId) {
        res.status(400).json({ success: false, error: 'Нельзя добавить себя в контакты' });
        return;
      }
      let target = await persistence.getSubscriberById(contactId);
      if (!target && typeof persistence.getSubscriberByLogin === 'function') {
        target = await persistence.getSubscriberByLogin(contactId);
        if (target) contactId = String(target.id);
      }
      if (!target) {
        res.status(404).json({ success: false, error: 'Пользователь не найден' });
        return;
      }
      const contactIdCanonical = String(target.id);
      // Проверяем, не добавлен ли уже
      const existing = await persistence.listContacts(ownerIdCanonical);
      if (existing.some((c) => String(c.contactId || c.contact_id) === contactIdCanonical)) {
        res.status(409).json({ success: false, error: 'Пользователь уже в контактах' });
        return;
      }
      // Проверяем обратный запрос — если contactId уже отправил запрос ownerId, автопринятие
      const incomingRequests = await persistence.listContactRequests(ownerIdCanonical);
      const reverseRequest = incomingRequests.find((r) => String(r.fromId) === contactIdCanonical && r.status === 'pending');
      if (reverseRequest) {
        await persistence.updateContactRequestStatus(reverseRequest.id, 'accepted');
        await persistence.addContact(ownerIdCanonical, contactIdCanonical);
        await persistence.addContact(contactIdCanonical, ownerIdCanonical);
        if (io) {
          emitToSubscriber(io, contactIdCanonical, 'contact:request:accepted', {
            requestId: reverseRequest.id,
            contactId: ownerIdCanonical,
            contactName: owner?.name || ownerIdCanonical,
          });
        }
        res.json({ success: true, autoAccepted: true, contact: { id: target.id, name: target.name } });
        return;
      }
      // Уже отправленный запрос — не дублируем уведомления
      const outgoing = await persistence.listOutgoingContactRequests(ownerIdCanonical);
      const existingOutgoing = outgoing.find((r) => String(r.toId) === contactIdCanonical && r.status === 'pending');
      if (existingOutgoing) {
        res.json({ success: true, request: existingOutgoing });
        return;
      }
      // Создаём запрос
      const requestId = `cr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const record = await persistence.createContactRequest({
        id: requestId,
        fromId: ownerIdCanonical,
        fromName: owner?.name || ownerIdCanonical,
        toId: contactIdCanonical,
        toName: target.name || contactIdCanonical,
        status: 'pending',
        createdAt: Date.now(),
      });
      // Уведомляем получателя: socket (если онлайн) + push (для офлайн/закрытого приложения)
      if (io) {
        emitToSubscriber(io, contactIdCanonical, 'contact:request', {
          id: record.id,
          fromId: ownerIdCanonical,
          fromName: owner?.name || ownerIdCanonical,
        });
      }
      sendContactRequestPush(
        (id) => persistence.getPushSubscription(id),
        contactIdCanonical,
        { fromName: owner?.name || ownerIdCanonical, requestId: record.id }
      ).catch(() => {});
      res.json({
        success: true,
        request: record,
      });
    } catch (error) {
      log.error?.('Ошибка отправки запроса на контакт', { error: error?.message, stack: error?.stack });
      const msg = (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')
        ? (error?.message || 'Не удалось отправить запрос')
        : 'Не удалось отправить запрос';
      res.status(500).json({ success: false, error: msg });
    }
  });

  // GET /api/me/contacts/requests — входящие запросы (pending)
  app.get('/api/me/contacts/requests', subscriberAuth, async (req, res) => {
    try {
      const requests = await persistence.listContactRequests(req.subscriberId);
      res.json({ success: true, requests });
    } catch (error) {
      log.error?.('Ошибка получения запросов', { error: error?.message });
      res.status(500).json({ success: false, error: 'Не удалось получить запросы' });
    }
  });

  // POST /api/me/contacts/requests/:requestId/accept
  app.post('/api/me/contacts/requests/:requestId/accept', subscriberAuth, validateRequestIdParam, async (req, res) => {
    try {
      const myId = req.subscriberId;
      const { requestId } = req.validated.params;
      const request = await persistence.getContactRequestById(requestId);
      if (!request || String(request.toId) !== String(myId)) {
        res.status(404).json({ success: false, error: 'Запрос не найден' });
        return;
      }
      if (request.status !== 'pending') {
        res.status(400).json({ success: false, error: 'Запрос уже обработан' });
        return;
      }
      await persistence.updateContactRequestStatus(String(request.id), 'accepted');
      // Добавляем контакт обоим пользователям
      await persistence.addContact(request.fromId, request.toId);
      await persistence.addContact(request.toId, request.fromId);
      // Уведомляем инициатора
      const acceptor = await persistence.getSubscriberById(myId);
      if (io) {
        emitToSubscriber(io, request.fromId, 'contact:request:accepted', {
          requestId,
          contactId: myId,
          contactName: acceptor?.name || myId,
        });
      }
      res.json({ success: true, accepted: true });
    } catch (error) {
      log.error?.('Ошибка принятия запроса', { error: error?.message });
      res.status(500).json({ success: false, error: 'Не удалось принять запрос' });
    }
  });

  // POST /api/me/contacts/requests/:requestId/decline
  // Отклонить запрос. Отправитель НЕ узнаёт об отклонении (по требованию).
  app.post('/api/me/contacts/requests/:requestId/decline', subscriberAuth, validateRequestIdParam, async (req, res) => {
    try {
      const myId = req.subscriberId;
      const { requestId } = req.validated.params;
      const request = await persistence.getContactRequestById(requestId);
      if (!request || String(request.toId) !== String(myId)) {
        res.status(404).json({ success: false, error: 'Запрос не найден' });
        return;
      }
      if (request.status !== 'pending') {
        res.status(400).json({ success: false, error: 'Запрос уже обработан' });
        return;
      }
      await persistence.updateContactRequestStatus(String(request.id), 'declined');
      // Специально НЕ уведомляем отправителя — он не должен знать об отклонении
      res.json({ success: true, declined: true });
    } catch (error) {
      log.error?.('Ошибка отклонения запроса', { error: error?.message });
      res.status(500).json({ success: false, error: 'Не удалось отклонить запрос' });
    }
  });

  // DELETE /api/me/contacts/:contactId
  app.delete('/api/me/contacts/:contactId', subscriberAuth, validateContactIdParam, async (req, res) => {
    try {
      const ownerId = req.subscriberId;
      const contactId = req.validated?.params?.contactId?.trim();
      await persistence.removeContact(ownerId, contactId);
      res.json({ success: true, deleted: true });
    } catch (error) {
      log.error?.('Ошибка удаления контакта', { error: error?.message });
      res.status(500).json({ success: false, error: 'Не удалось удалить контакт' });
    }
  });
}

export default registerMeContactsRoutes;
