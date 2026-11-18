'use strict';
const crypto = require('crypto');
const id = () => crypto.randomUUID();

// OJO: el menú y los precios de acá son DE EJEMPLO.
// Se editan desde el panel (/admin) sin tocar código.
module.exports = function seed() {
  const cats = [
    { id: id(), name: 'Café', order: 1 },
    { id: id(), name: 'Fríos', order: 2 },
    { id: id(), name: 'Pastelería', order: 3 },
    { id: id(), name: 'Salados', order: 4 },
  ];
  const [cafe, frios, pasteleria, salados] = cats;
  const it = (categoryId, name, description, price, tag = '') => ({
    id: id(), categoryId, name, description, price, available: true, tag,
  });

  return {
    settings: {
      name: 'El Discreto Encanto',
      tagline: 'Café de especialidad, pastelería rica y eventos que valen la pena.',
      whatsapp: '5491178237284',
      phoneDisplay: '11 7823-7284',
      instagram: 'lediscretoencanto',
      address: '',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=-34.688188,-58.4743284',
      hours: '',
    },
    categories: cats,
    items: [
      it(cafe.id, 'Espresso', 'Corto, intenso, sin vueltas.', 3500),
      it(cafe.id, 'Americano', 'Espresso largo con agua caliente.', 4000),
      it(cafe.id, 'Flat White', 'Doble shot y leche texturizada.', 5500, 'Más pedido'),
      it(cafe.id, 'Latte', 'Suave y cremoso.', 5500),
      it(cafe.id, 'Cappuccino', 'Espuma densa, café con carácter.', 5200),
      it(frios.id, 'Cold Brew', 'Infusión en frío de 18 horas.', 5500),
      it(frios.id, 'Espresso Tonic', 'Espresso, tónica y cítricos.', 6000),
      it(frios.id, 'Limonada', 'Exprimida al momento.', 4200),
      it(pasteleria.id, 'Medialuna', 'De manteca, recién horneada.', 2500),
      it(pasteleria.id, 'Cookie de chocolate', 'Con chunks de chocolate.', 4000),
      it(pasteleria.id, 'Budín del día', 'Preguntá cuál salió hoy.', 4500),
      it(salados.id, 'Tostado de jamón y queso', 'En pan de campo.', 8500),
      it(salados.id, 'Tostón de palta', 'Palta, huevo y semillas.', 10500),
    ],
    events: [],
  };
};
