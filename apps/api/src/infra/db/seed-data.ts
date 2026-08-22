import type { TenantBranding } from '../../modules/tenants/entities/tenant.entity';

/**
 * Contenido de los negocios de demostración. Está separado de `seed.ts` —que
 * tiene la lógica de escritura— para que cambiar un precio o un texto no
 * obligue a leer el algoritmo, y viceversa.
 *
 * Las imágenes son URLs de servicios públicos, no archivos del repositorio: el
 * branding de un negocio real apunta a su propio storage y el repositorio no
 * es lugar para fotos de terceros.
 */

export interface SeedOwner {
  email: string;
  fullName: string;
  phone: string;
}

export interface SeedService {
  name: string;
  durationMin: number;
  priceClp: number;
}

export interface SeedRule {
  /** 0=domingo … 6=sábado. */
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotIntervalMin: number;
}

export interface SeedException {
  /** 'YYYY-MM-DD' en la zona del negocio. */
  date: string;
  closed: boolean;
  startTime: string | null;
  endTime: string | null;
}

export interface SeedBusiness {
  slug: string;
  name: string;
  timezone: string;
  branding: TenantBranding;
  owner: SeedOwner;
  services: SeedService[];
  rules: SeedRule[];
  exceptions: SeedException[];
}

/**
 * La misma para todas las cuentas de demostración: la demo se publica con sus
 * credenciales a la vista, así que no es un secreto que proteger.
 *
 * `SEED_PASSWORD` permite sembrar con otra sin tocar el código, para cuando la
 * base sembrada no sea la de la demo pública.
 */
export const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'demo1234';

const unsplash = (id: string): string => `https://images.unsplash.com/${id}?w=1920&q=80`;

/**
 * Dos rubros a propósito distintos: uno vende el tiempo de una persona y el
 * otro el uso de un espacio. Comparten las mismas secciones y el mismo motor de
 * reservas; lo único que cambia es su branding.
 */
export const DEMO_BUSINESSES: SeedBusiness[] = [
  {
    slug: 'barberia-nogal',
    name: 'Barbería Nogal',
    timezone: 'America/Santiago',
    branding: {
      logoUrl: null,
      primaryColor: '#b45309',
      coverImageUrl: unsplash('photo-1503951914875-452162b0f3f1'),
      tagline: 'Cortes clásicos y afeitado a navaja en Providencia',
      about:
        'Abrimos en 2016 en un local de dos sillones y seguimos ahí. Trabajamos ' +
        'con hora tomada porque preferimos dedicarle el tiempo que corresponde a ' +
        'cada corte antes que atender a tres personas apuradas. Toallas calientes, ' +
        'navaja de verdad y una conversación si tienes ganas.',
      team: [
        {
          name: 'Matías Fuentes',
          role: 'Barbero y fundador',
          photoUrl: unsplash('photo-1651684215020-f7a5b6610f23'),
        },
        { name: 'Josefina Rivas', role: 'Barbera', photoUrl: unsplash('photo-1627161683077-e34782c24d81') },
        { name: 'Ignacio Vera', role: 'Barbero', photoUrl: unsplash('photo-1568602471122-7832951cc4c5') },
      ],
      address: 'Av. Providencia 1234, Providencia, Santiago',
      hours: 'Lunes a viernes de 10:00 a 19:00 · Sábado de 10:00 a 14:00',
    },
    owner: {
      email: 'matias@barberianogal.cl',
      fullName: 'Matías Fuentes',
      phone: '+56 9 8123 4567',
    },
    services: [
      { name: 'Corte de pelo', durationMin: 30, priceClp: 12000 },
      { name: 'Corte y barba', durationMin: 45, priceClp: 18000 },
      { name: 'Afeitado a navaja', durationMin: 30, priceClp: 10000 },
      { name: 'Corte escolar', durationMin: 30, priceClp: 8000 },
    ],
    rules: [
      { dayOfWeek: 1, startTime: '10:00', endTime: '19:00', slotIntervalMin: 30 },
      { dayOfWeek: 2, startTime: '10:00', endTime: '19:00', slotIntervalMin: 30 },
      { dayOfWeek: 3, startTime: '10:00', endTime: '19:00', slotIntervalMin: 30 },
      { dayOfWeek: 4, startTime: '10:00', endTime: '19:00', slotIntervalMin: 30 },
      { dayOfWeek: 5, startTime: '10:00', endTime: '19:00', slotIntervalMin: 30 },
      { dayOfWeek: 6, startTime: '10:00', endTime: '14:00', slotIntervalMin: 30 },
    ],
    exceptions: [
      // Fiestas patrias: cerrado los dos días.
      { date: '2026-09-18', closed: true, startTime: null, endTime: null },
      { date: '2026-09-19', closed: true, startTime: null, endTime: null },
    ],
  },
  {
    slug: 'padel-arena',
    name: 'Pádel Arena Ñuñoa',
    timezone: 'America/Santiago',
    branding: {
      logoUrl: null,
      primaryColor: '#0f766e',
      coverImageUrl: unsplash('photo-1689942963385-f5bd03f3b270'),
      tagline: 'Cancha techada con luz, todos los días hasta las 23:00',
      about:
        'Somos un club chico de barrio: una cancha techada, buena luz y piso ' +
        'nuevo. Se arrienda por hora y media hora, con o sin paletas. Si vienes ' +
        'solo, deja tu nombre en la pizarra de la entrada y te avisamos cuando ' +
        'falte un cuarto para armar un partido.',
      team: [
        {
          name: 'Daniela Soto',
          role: 'Coordinadora del club',
          photoUrl: unsplash('photo-1611432579699-484f7990b127'),
        },
        {
          name: 'Rodrigo Lagos',
          role: 'Profesor de pádel',
          photoUrl: unsplash('photo-1705645930353-0e335311ef20'),
        },
      ],
      address: 'Av. Irarrázaval 4500, Ñuñoa, Santiago',
      hours: 'Todos los días de 08:00 a 23:00',
    },
    owner: {
      email: 'daniela@padelarena.cl',
      fullName: 'Daniela Soto',
      phone: '+56 9 7654 3210',
    },
    services: [
      { name: 'Cancha por 1 hora', durationMin: 60, priceClp: 16000 },
      { name: 'Cancha por 1 hora y media', durationMin: 90, priceClp: 22000 },
      { name: 'Clase particular', durationMin: 60, priceClp: 25000 },
    ],
    rules: [
      { dayOfWeek: 0, startTime: '09:00', endTime: '21:00', slotIntervalMin: 30 },
      { dayOfWeek: 1, startTime: '08:00', endTime: '23:00', slotIntervalMin: 30 },
      { dayOfWeek: 2, startTime: '08:00', endTime: '23:00', slotIntervalMin: 30 },
      { dayOfWeek: 3, startTime: '08:00', endTime: '23:00', slotIntervalMin: 30 },
      { dayOfWeek: 4, startTime: '08:00', endTime: '23:00', slotIntervalMin: 30 },
      { dayOfWeek: 5, startTime: '08:00', endTime: '23:00', slotIntervalMin: 30 },
      { dayOfWeek: 6, startTime: '09:00', endTime: '23:00', slotIntervalMin: 30 },
    ],
    exceptions: [
      { date: '2026-09-18', closed: true, startTime: null, endTime: null },
      // Mantención de la cancha: ese día se abre solo en la tarde.
      { date: '2026-08-24', closed: false, startTime: '16:00', endTime: '23:00' },
    ],
  },
];

/**
 * Clientes de demostración. Sin `tenant_id`: un cliente es de la plataforma, no
 * de un negocio, y puede reservar en los dos.
 */
export const DEMO_CLIENTS: SeedOwner[] = [
  { email: 'javiera@demo.cl', fullName: 'Javiera Contreras', phone: '+56 9 5551 2233' },
  { email: 'tomas@demo.cl', fullName: 'Tomás Aravena', phone: '+56 9 5551 4455' },
  { email: 'valentina@demo.cl', fullName: 'Valentina Pizarro', phone: '+56 9 5551 6677' },
  { email: 'sebastian@demo.cl', fullName: 'Sebastián Muñoz', phone: '+56 9 5551 8899' },
  { email: 'antonia@demo.cl', fullName: 'Antonia Herrera', phone: '+56 9 5552 1122' },
  { email: 'cristobal@demo.cl', fullName: 'Cristóbal Núñez', phone: '+56 9 5552 3344' },
];
