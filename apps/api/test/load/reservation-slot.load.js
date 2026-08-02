// Prueba de carga del invariante central: 100 clientes disparan al MISMO slot
// a la vez y solo uno puede ganarlo. Es la versión a escala del e2e de dos
// requests; acá el número medido es la evidencia de que el lock pesimista +
// el índice único aguantan la avalancha.
//
//   k6 run test/load/reservation-slot.load.js
//   BASE_URL=http://localhost:3000 SLUG=barberia-demo DATE=2026-07-27 \
//     k6 run test/load/reservation-slot.load.js
//
// El test es autocontenido: descubre el servicio y un slot libre por la API
// pública, así que no hay ids hardcodeados que se pudran.

import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SLUG = __ENV.SLUG || 'barberia-demo';

// Una métrica por desenlace, para que el resumen final diga exactamente cuántas
// reservas se crearon, cuántas chocaron y cuántas fallaron de forma inesperada.
const created = new Counter('reservations_created');
const conflict = new Counter('reservations_conflict');
const unexpected = new Counter('reservations_unexpected');

export const options = {
  scenarios: {
    // 100 VUs, 100 iteraciones: cada cliente dispara una vez, todos encima del
    // mismo slot casi al mismo tiempo.
    thundering_herd: {
      executor: 'shared-iterations',
      vus: 100,
      iterations: 100,
      maxDuration: '30s',
    },
  },
  thresholds: {
    // El invariante: exactamente una reserva creada y ningún error de servidor.
    // Si se crean dos, hubo doble reserva y el test debe fallar.
    reservations_created: ['count==1'],
    reservations_unexpected: ['count==0'],
  },
};

export function setup() {
  const servicesRes = http.get(`${BASE_URL}/public/${SLUG}/services`);
  if (servicesRes.status !== 200) {
    throw new Error(`No se pudo leer servicios de ${SLUG}: HTTP ${servicesRes.status}`);
  }
  const services = servicesRes.json();
  if (!Array.isArray(services) || services.length === 0) {
    throw new Error(`El negocio ${SLUG} no tiene servicios publicados`);
  }
  const serviceId = services[0].id;

  const date = __ENV.DATE || new Date().toISOString().slice(0, 10);
  const availRes = http.get(
    `${BASE_URL}/public/${SLUG}/availability?serviceId=${serviceId}&date=${date}`,
  );
  if (availRes.status !== 200) {
    throw new Error(`No se pudo leer disponibilidad: HTTP ${availRes.status}`);
  }
  const slots = availRes.json('slots');
  if (!Array.isArray(slots) || slots.length === 0) {
    throw new Error(`No hay slots libres para ${SLUG} el ${date}. Prueba con otra fecha (DATE=).`);
  }

  // El primer slot libre es el blanco de los 100 disparos.
  return { serviceId, startsAt: slots[0].startsAt };
}

export default function (data) {
  const payload = JSON.stringify({
    serviceId: data.serviceId,
    startsAt: data.startsAt,
    clientName: `Load VU ${__VU}`,
    clientEmail: `vu${__VU}@loadtest.local`,
  });

  const res = http.post(`${BASE_URL}/public/${SLUG}/reservations`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (res.status === 201) {
    created.add(1);
  } else if (res.status === 409) {
    conflict.add(1);
  } else {
    unexpected.add(1);
    console.error(`Respuesta inesperada: HTTP ${res.status} — ${res.body}`);
  }

  // Toda respuesta debe ser uno de los dos desenlaces válidos: ganó o chocó.
  check(res, {
    'ganó (201) o chocó (409)': (r) => r.status === 201 || r.status === 409,
  });
}
