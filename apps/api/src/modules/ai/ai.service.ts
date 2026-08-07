import { Injectable, NotFoundException } from '@nestjs/common';
import type { ChatMessage, ChatResponse } from '@reservafacil/contracts';
import { DateTime } from 'luxon';

import { AvailabilityService } from '../catalog/availability.service';
import { ServicesService } from '../catalog/services.service';
import { TenantsService } from '../tenants/tenants.service';
import { AI_FUNCTIONS, CONSULTAR_DISPONIBILIDAD, CREAR_RESERVA_TENTATIVA } from './ai-functions';
import type { GeminiContent } from './gemini.client';
import { GeminiClient } from './gemini.client';

const MAX_HISTORY_TURNS = 20;

/**
 * Tope defensivo, no un loop abierto (alcanza para "consultar disponibilidad
 * → confirmar un slot" y variantes cortas): si Gemini encadena más funciones
 * que esto, algo salió raro y es mejor cortar que dejarlo ir para siempre.
 */
const MAX_FUNCTION_CALL_ROUNDS = 4;

/**
 * Solo los campos del catálogo que este módulo necesita — no se importa la
 * entidad `Service` de `catalog` (regla del "puerta de atrás",
 * `architecture.spec.ts`): la frontera de un módulo es lo que exporta su
 * servicio público, no sus entidades internas.
 */
interface CatalogService {
  id: string;
  name: string;
  durationMin: number;
  priceClp: number;
}

/**
 * Orquesta el loop de function calling (adr/0004): Gemini decide qué función
 * llamar, acá se ejecuta de verdad contra `catalog` (mismos servicios que ya
 * usa `PublicController`, cero SQL nuevo) y el resultado vuelve a Gemini para
 * que lo redacte. Gemini nunca toca la BD ni inventa un horario.
 *
 * No depende de `reservations`: `crear_reserva_tentativa` valida y describe,
 * no persiste — la reserva real sigue pasando por `POST /reservations`.
 */
@Injectable()
export class AiService {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly servicesService: ServicesService,
    private readonly availabilityService: AvailabilityService,
    private readonly gemini: GeminiClient,
  ) {}

  async chat(slug: string, message: string, history: ChatMessage[] = []): Promise<ChatResponse> {
    const tenant = await this.tenantsService.findBySlug(slug);

    if (!tenant || !tenant.active) {
      throw new NotFoundException('Negocio no encontrado');
    }

    const services: CatalogService[] = (await this.servicesService.findAllActive(tenant.id)).map(
      (s) => ({ id: s.id, name: s.name, durationMin: s.durationMin, priceClp: s.priceClp }),
    );

    const systemInstruction = this.buildSystemInstruction(tenant.name, tenant.timezone, services);

    // Cap defensivo: el frontend controla el historial que manda, pero un
    // request con un historial gigante no debería inflar cada llamada a Gemini.
    const recentHistory = history.slice(-MAX_HISTORY_TURNS);

    let contents: GeminiContent[] = [
      ...recentHistory.map((turn): GeminiContent => ({ role: turn.role, text: turn.text })),
      { role: 'user', text: message },
    ];

    let reply = 'No pude terminar de procesar tu solicitud, ¿puedes reformularla?';

    for (let ronda = 0; ronda < MAX_FUNCTION_CALL_ROUNDS; ronda++) {
      const result = await this.gemini.send({ systemInstruction, functionDeclarations: AI_FUNCTIONS, contents });

      if (result.kind === 'text') {
        reply = result.text;
        break;
      }

      const functionResult = await this.executeFunction(
        tenant.slug,
        tenant.timezone,
        services,
        result.name,
        result.args,
      );

      contents = [
        ...contents,
        { role: 'model', functionCall: { name: result.name, args: result.args } },
        { role: 'function', functionResponse: { name: result.name, response: functionResult } },
      ];
    }

    return {
      reply,
      history: [...recentHistory, { role: 'user', text: message }, { role: 'model', text: reply }],
    };
  }

  private async executeFunction(
    slug: string,
    timezone: string,
    services: CatalogService[],
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (name) {
      case CONSULTAR_DISPONIBILIDAD:
        return this.consultarDisponibilidad(slug, services, args);
      case CREAR_RESERVA_TENTATIVA:
        return this.crearReservaTentativa(slug, timezone, services, args);
      default:
        return { error: 'Función desconocida' };
    }
  }

  /** Match por texto libre contra el catálogo real — nunca se inventa un servicio. */
  private resolveService(
    services: CatalogService[],
    texto: string,
  ): CatalogService | { ambiguous: CatalogService[] } | null {
    const needle = texto.trim().toLowerCase();
    const matches = services.filter(
      (s) => s.name.toLowerCase().includes(needle) || needle.includes(s.name.toLowerCase()),
    );

    if (matches.length === 1) {
      return matches[0];
    }
    if (matches.length > 1) {
      return { ambiguous: matches };
    }
    return null;
  }

  private async consultarDisponibilidad(
    slug: string,
    services: CatalogService[],
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const servicio = String(args['servicio'] ?? '');
    const fecha = String(args['fecha'] ?? '');

    const resolved = this.resolveService(services, servicio);

    if (resolved === null) {
      return {
        error: `No encontramos un servicio llamado "${servicio}".`,
        serviciosDisponibles: services.map((s) => s.name),
      };
    }
    if ('ambiguous' in resolved) {
      return {
        error: `Hay más de un servicio que calza con "${servicio}", hay que precisar cuál.`,
        opciones: resolved.ambiguous.map((s) => s.name),
      };
    }

    try {
      const availability = await this.availabilityService.getPublicAvailability(slug, resolved.id, fecha);

      return {
        servicio: resolved.name,
        servicioId: resolved.id,
        fecha: availability.date,
        slots: availability.slots,
      };
    } catch {
      return { error: `"${fecha}" no es una fecha válida para consultar.` };
    }
  }

  private async crearReservaTentativa(
    slug: string,
    timezone: string,
    services: CatalogService[],
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const servicioId = String(args['servicioId'] ?? '');
    const startsAt = String(args['startsAt'] ?? '');

    const service = services.find((s) => s.id === servicioId);

    if (!service) {
      return { disponible: false, error: 'Ese servicio ya no existe o no está activo.' };
    }

    const date = DateTime.fromISO(startsAt, { zone: timezone }).toISODate();

    if (!date) {
      return { disponible: false, error: `"${startsAt}" no es un horario válido.` };
    }

    // Re-valida contra la disponibilidad real: nunca confirma un horario que
    // se ocupó entre que Gemini lo vio y que el usuario lo eligió.
    const availability = await this.availabilityService.getPublicAvailability(slug, servicioId, date);
    const sigueLibre = availability.slots.some((slot) => slot.startsAt === startsAt);

    if (!sigueLibre) {
      return { disponible: false, mensaje: 'Ese horario ya no está disponible, hay que elegir otro.' };
    }

    return {
      disponible: true,
      servicio: service.name,
      startsAt,
      precioClp: service.priceClp,
      duracionMin: service.durationMin,
    };
  }

  /** Sin PII: solo nombre del negocio, fecha de hoy y catálogo (todo público). */
  private buildSystemInstruction(tenantName: string, timezone: string, services: CatalogService[]): string {
    const today = DateTime.now().setZone(timezone).toISODate();
    // El id va en el system prompt (no solo en la respuesta de
    // consultar_disponibilidad) porque el historial que cruza turnos es solo
    // texto plano (contrato con el frontend) — sin esto, Gemini "olvida" el
    // id entre un mensaje y el siguiente y no puede llamar
    // crear_reserva_tentativa directo.
    const catalogo = services
      .map((s) => `- ${s.name} (id: ${s.id}, ${s.durationMin} min, $${s.priceClp} CLP)`)
      .join('\n');

    return [
      `Eres el asistente de reservas de "${tenantName}".`,
      `Hoy es ${today} (zona horaria ${timezone}).`,
      'Servicios disponibles:',
      catalogo,
      '',
      'Usa siempre las funciones disponibles para consultar disponibilidad real antes de',
      'responder sobre horarios — nunca inventes un horario. Responde en español, breve y',
      'amable. No pidas ni repitas datos personales del cliente (nombre, teléfono, email):',
      'esos se piden en el formulario de reserva, no en esta conversación.',
    ].join('\n');
  }
}
