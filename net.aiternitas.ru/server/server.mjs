/**
 * Start relay + web API server.
 */

import app from './app.mjs';

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
