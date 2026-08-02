/**
 * Horas locales del negocio en formato 'HH:mm'; fechas locales en 'YYYY-MM-DD'.
 * Los instantes (slots) viajan siempre como ISO 8601 UTC: la conversión a hora
 * local es responsabilidad de quien renderiza, usando el timezone del tenant.
 */

export interface ServiceResponse {
  id: string;
  name: string;
  durationMin: number;
  priceClp: number;
  active: boolean;
}

export interface CreateServiceRequest {
  name: string;
  durationMin: number;
  /** CLP entero: el peso chileno no tiene decimales y Webpay recibe enteros. */
  priceClp: number;
}

export interface UpdateServiceRequest {
  name?: string;
  durationMin?: number;
  priceClp?: number;
  /** Reactivar un servicio desactivado (el DELETE es soft). */
  active?: boolean;
}

export interface AvailabilityRuleResponse {
  id: string;
  /** 0=domingo … 6=sábado, igual que en la BD. */
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotIntervalMin: number;
}

export interface CreateAvailabilityRuleRequest {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotIntervalMin: number;
}

export interface AvailabilityExceptionResponse {
  id: string;
  date: string;
  closed: boolean;
  /** Horario especial del día; solo cuando closed = false. */
  startTime: string | null;
  endTime: string | null;
}

export interface CreateAvailabilityExceptionRequest {
  date: string;
  closed: boolean;
  startTime?: string;
  endTime?: string;
}

/** Un integrante del equipo del negocio (barbero, médico, etc.). */
export interface TeamMemberResponse {
  name: string;
  role: string;
  /** Retrato (URL a storage externo); si es null, se muestra la inicial. */
  photoUrl: string | null;
}

/**
 * Personalización de la página pública del negocio. Va toda en un jsonb —lo
 * visual y el contenido editorial de las secciones— para poder crecer sin
 * migrar el esquema por cada campo nuevo. Todo es opcional: cada sección se
 * dibuja solo si el negocio la llenó.
 */
export interface TenantBrandingResponse {
  logoUrl: string | null;
  /** Color de acento en hex (`#1d4ed8`); si es null, la página usa el suyo. */
  primaryColor: string | null;
  /**
   * Imagen de portada del negocio (URL a un storage externo, nunca un archivo
   * del repo). La página la usa como hero; si es null, cae a un gradiente
   * derivado del color de marca.
   */
  coverImageUrl: string | null;

  // ── Contenido de las secciones ──────────────────────────────────────────
  /** Lema breve para el hero de Inicio. */
  tagline: string | null;
  /** Descripción/historia del negocio, para la sección Nosotros. */
  about: string | null;
  /** El equipo que atiende. */
  team: TeamMemberResponse[] | null;
  /** Dirección física. */
  address: string | null;
  /** Horario de atención, en texto libre (puede traer varias líneas). */
  hours: string | null;
}

/**
 * El negocio visto desde su página pública. No expone `id` ni `active`: quien
 * entra por el slug no necesita el uuid, y un negocio inactivo responde 404.
 */
export interface PublicTenantResponse {
  name: string;
  slug: string;
  /** Timezone IANA, para que el front muestre los slots en hora local. */
  timezone: string;
  branding: TenantBrandingResponse | null;
}

/** Lo que la página pública puede saber de un servicio. Sin `active`: solo se listan activos. */
export interface PublicServiceResponse {
  id: string;
  name: string;
  durationMin: number;
  priceClp: number;
}

export interface AvailabilitySlot {
  /** Instante ISO 8601 UTC. */
  startsAt: string;
  endsAt: string;
}

export interface PublicAvailabilityResponse {
  serviceId: string;
  /** El día consultado, en fecha local del negocio. */
  date: string;
  /** Timezone IANA del negocio, para que el front muestre horas locales. */
  timezone: string;
  slots: AvailabilitySlot[];
}
