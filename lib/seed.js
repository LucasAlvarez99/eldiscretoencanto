'use strict';
const crypto = require('crypto');
const id = () => crypto.randomUUID();

// Carta real de El Discreto Encanto (QR - Carta digital).
// Todo se edita desde el panel (/admin) sin tocar código.
module.exports = function seed() {
  const cats = [
    { id: id(), group: 'Bebidas', name: 'Cafetería', mainLabel: 'Caliente', altLabel: 'Frío', note: '', order: 1 },
    {
      id: id(), group: 'Bebidas', name: 'Para refrescarte', mainLabel: '', altLabel: '', order: 2,
      note: 'Servimos el café molido en el momento.\nUtilizamos únicamente leche deslactosada.\nPreparamos el café caliente, no a temperatura barista.',
    },
    {
      id: id(), group: 'Para comer', name: 'Los clásicos', mainLabel: '', altLabel: '', order: 3,
      note: 'Consultá las opciones del día.\nHorneamos en pocas cantidades para ofrecerte la mejor calidad.',
    },
  ];
  const [cafe, refresh, clasicos] = cats;
  const it = (c, name, price, priceAlt = null) => ({
    id: id(), categoryId: c.id, name, description: '', price, priceAlt, available: true, tag: '',
  });

  return {
    settings: {
      name: 'El Discreto Encanto',
      tagline: 'Es una excusa para quedarte un rato más.',
      whatsapp: '5491178237284',
      phoneDisplay: '11-7823-7284',
      instagram: 'lediscretoencanto',
      address: 'Av. Piedrabuena 4978, CABA',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Av.+Piedrabuena+4978%2C+CABA',
      hours: '',
    },
    categories: cats,
    items: [
      it(cafe, 'Café', 2700),
      it(cafe, 'Americano', 3200, 3500),
      it(cafe, 'Cortado', 4000),
      it(cafe, 'Café con leche', 4500, 4800),
      it(cafe, 'Cappuccino', 4000),
      it(cafe, 'Té', 3000, 3800),
      it(cafe, 'Chocolatada', 4500, 4800),
      it(refresh, 'Exprimido de naranja', 5000),
      it(refresh, 'Agua / Agua con gas', 4000),
      it(refresh, 'Coca-Cola de vidrio', 5000),
      it(refresh, 'Gaseosa en lata', 5000),
      it(clasicos, 'Medialuna de manteca', 3200),
      it(clasicos, 'Medialuna rellena', 8000),
      it(clasicos, 'Sfogliatella', 5000),
      it(clasicos, 'Tostado', 8400),
      it(clasicos, 'Chipá', 3000),
      it(clasicos, 'Chipepa', 5000),
      it(clasicos, 'Galletita Pepito', 5000),
      it(clasicos, 'Alfajor de maicena', 5500),
      it(clasicos, 'Jorgito blanco', 6000),
      it(clasicos, 'Porción de budín', 4500),
    ],
    events: [],
  };
};
