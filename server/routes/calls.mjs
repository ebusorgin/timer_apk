import { sanitizeDisplayName } from '../utils/subscriberUtils.mjs';
import { CALL_STATUS_SET } from '../persistence/validators.mjs';
import { createRequestValidator, enumField, stringField } from '../middleware/validation.mjs';

function assertPersistence(persistence) {
  if (!persistence) {
    throw new Error('registerCallRoutes: persistence service is not provided');
  }
  const required = ['readCalls', 'writeCalls', 'readSubscribers'];
  const missing = required.filter((method) => typeof persistence[method] !== 'function');
  if (missing.length) {
    throw new Error(`registerCallRoutes: persistence is missing methods: ${missing.join(', ')}`);
  }
}

export function registerCallRoutes({ app, persistence, io, logger }) {
  if (!app) {
    throw new Error('registerCallRoutes: app instance is required');
  }
  assertPersistence(persistence);

  const scopedLogger =
    logger && typeof logger.child === 'function'
      ? logger.child({ scope: 'routes:calls' })
      : logger || console;

  const statusValues = Array.from(CALL_STATUS_SET);

  const validatePendingCalls = createRequestValidator({
    params: {
      subscriberId: stringField({
        required: true,
        maxLength: 128,
        label: 'subscriberId',
      }),
    },
  });

  const validateCallAcknowledgement = createRequestValidator({
    params: {
      callId: stringField({
        required: true,
        maxLength: 128,
        label: 'callId',
      }),
    },
    body: {
      status: enumField({
        required: false,
        values: statusValues,
        defaultValue: 'acknowledged',
        label: 'status',
        caseInsensitive: true,
      }),
    },
  });

  const validateCallCreation = createRequestValidator({
    body: {
      fromId: stringField({
        required: true,
        maxLength: 128,
        label: 'fromId',
      }),
      toId: stringField({
        required: true,
        maxLength: 128,
        label: 'toId',
      }),
      fromName: stringField({
        required: false,
        maxLength: 64,
        sanitize: sanitizeDisplayName,
        label: 'fromName',
      }),
    },
  });

  app.get('/api/calls/pending/:subscriberId', validatePendingCalls, async (req, res) => {
    try {
      const { subscriberId } = req.validated.params;
      const calls = await persistence.readCalls();
      const pending = calls
        .filter((call) => call?.to?.id === subscriberId && call.status === 'pending')
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

      res.json({
        success: true,
        calls: pending,
      });
    } catch (error) {
      scopedLogger.error('Ошибка получения ожидающих звонков', {
        error: error?.message || error,
      });
      res.status(500).json({
        success: false,
        error: 'Не удалось получить список звонков',
      });
    }
  });

  app.post('/api/calls/:callId/ack', validateCallAcknowledgement, async (req, res) => {
    try {
      const { callId } = req.validated.params;
      const { status = 'acknowledged' } = req.validated.body || {};
      const nextStatus = CALL_STATUS_SET.has(status) ? status : 'acknowledged';
      const calls = await persistence.readCalls();
      const index = calls.findIndex((call) => call.id === callId);
      if (index === -1) {
        res.status(404).json({
          success: false,
          error: 'Звонок не найден',
        });
        return;
      }

      const updated = {
        ...calls[index],
        status: nextStatus,
        updatedAt: Date.now(),
      };
      calls[index] = updated;

      const now = Date.now();
      const cleaned = calls.filter((call) => {
        if (call.status === 'pending') {
          return true;
        }
        return now - (call.updatedAt || call.createdAt || 0) < 1000 * 60 * 60;
      });

      await persistence.writeCalls(cleaned);

      if (io) {
        io.emit('call:ack', {
          callId,
          status: nextStatus,
          call: updated,
        });
      }

      scopedLogger.info('Статус звонка обновлён', {
        callId,
        status: nextStatus,
      });

      res.json({
        success: true,
        call: updated,
      });
    } catch (error) {
      scopedLogger.error('Ошибка подтверждения звонка', {
        error: error?.message || error,
      });
      res.status(500).json({
        success: false,
        error: 'Не удалось обновить статус звонка',
      });
    }
  });

  app.post('/api/calls', validateCallCreation, async (req, res) => {
    try {
      const {
        fromId: callerId,
        toId: targetId,
        fromName: providedCallerName,
      } = req.validated.body;
      const subscribers = await persistence.readSubscribers();
      const callerFromStore = subscribers.find((item) => item.id === callerId) || null;
      const targetFromStore = subscribers.find((item) => item.id === targetId) || null;

      const callerName =
        callerFromStore?.name || providedCallerName || 'Неизвестный';
      const targetName = targetFromStore?.name || 'Неизвестный';

      const callRecord = {
        id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        from: {
          id: callerId,
          name: callerName,
        },
        to: {
          id: targetId,
          name: targetName,
        },
        createdAt: Date.now(),
        status: 'pending',
      };

      const calls = await persistence.readCalls();
      calls.push(callRecord);
      await persistence.writeCalls(calls);

      if (io) {
        io.emit('call:initiated', callRecord);
      }

      scopedLogger.info('Звонок инициирован', {
        callId: callRecord.id,
        fromId: callerId,
        toId: targetId,
      });

      res.json({
        success: true,
        call: callRecord,
      });
    } catch (error) {
      scopedLogger.error('Ошибка инициирования звонка', {
        error: error?.message || error,
      });
      res.status(500).json({
        success: false,
        error: 'Не удалось инициировать звонок',
      });
    }
  });
}

export default registerCallRoutes;

