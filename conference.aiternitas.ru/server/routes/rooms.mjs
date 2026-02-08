import { getRoomsSnapshot } from '../sockets/presence.mjs';

export function registerRoomsRoutes({ app }) {
  if (!app) {
    throw new Error('registerRoomsRoutes: app is required');
  }

  app.get('/api/rooms', (req, res) => {
    try {
      const rooms = getRoomsSnapshot();
      res.json({
        success: true,
        rooms,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Не удалось получить список комнат',
      });
    }
  });
}

export default registerRoomsRoutes;
