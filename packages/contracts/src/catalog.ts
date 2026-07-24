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

/** Identidad visual del negocio en su página pública. */
export interface TenantBrandingResponse {
  logoUrl: string | null;
  /** Color de acento en hex (`#1d4ed8`); si es null, la página usa el suyo. */
  primaryColor: string | null;
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
