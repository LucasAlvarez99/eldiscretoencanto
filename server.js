'use strict';
// Arranque local: npm start  →  http://localhost:3000  (panel: /admin)
const app = require('./lib/app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`El Discreto Encanto → http://localhost:${PORT}  (panel: /admin)`);
  if (!process.env.ADMIN_PASSWORD) console.warn('⚠️  Usás la contraseña por defecto ("cambiame"). Definí ADMIN_PASSWORD antes de publicar.');
});
