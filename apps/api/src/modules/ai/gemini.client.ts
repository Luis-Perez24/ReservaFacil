import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FunctionCallingConfigMode, GoogleGenAI, Type } from '@google/genai';
import type { Content, FunctionDeclaration, Schema, Tool } from '@google/genai';

import type { EnvironmentVariables } from '../../infra/config/env.validation';

/** Un turno de la conversación, en la forma mínima que necesita este módulo. */
export interface GeminiContent {
  role: 'user' | 'model' | 'function';
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

/** Esquema de parámetros de una función, en JSON Schema plano (sin tipos del SDK). */
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: 'string'; description: string }>;
    required: string[];
  };
}

export type GeminiResult =
  | { kind: 'text'; text: string }
  | { kind: 'function_call'; name: string; args: Record<string, unknown> };

/**
 * Frontera con Gemini. Clase abstracta (no interfaz) por el mismo motivo que
 * `WebpayClient`: Nest necesita un token de inyección real en runtime, así
 * los tests inyectan un doble sin tocar la red — ver `payments/webpay.client.ts`.
 *
 * Los tipos de esta frontera son propios (`GeminiContent`, no `Content` del
 * SDK): quien la use (`AiService`, los tests) no necesita saber que existe
 * `@google/genai` detrás.
 */
@Injectable()
export abstract class GeminiClient {
  abstract send(params: {
    systemInstruction: string;
    functionDeclarations: GeminiFunctionDeclaration[];
    contents: GeminiContent[];
  }): Promise<GeminiResult>;
}

function toSdkContent(content: GeminiContent): Content {
  if (content.functionCall) {
    return { role: 'model', parts: [{ functionCall: content.functionCall }] };
  }
  if (content.functionResponse) {
    return {
      role: 'user',
      parts: [{ functionResponse: content.functionResponse }],
    };
  }
  return { role: content.role === 'model' ? 'model' : 'user', parts: [{ text: content.text ?? '' }] };
}

function toSdkTools(declarations: GeminiFunctionDeclaration[]): Tool[] {
  const functionDeclarations: FunctionDeclaration[] = declarations.map((decl) => ({
    name: decl.name,
    description: decl.description,
    parameters: {
      type: Type.OBJECT,
      properties: Object.fromEntries(
        Object.entries(decl.parameters.properties).map(([key, prop]) => [
          key,
          { type: Type.STRING, description: prop.description } satisfies Schema,
        ]),
      ),
      required: decl.parameters.required,
    },
  }));

  return [{ functionDeclarations }];
}

@Injectable()
export class GoogleGeminiClient extends GeminiClient {
  private readonly logger = new Logger(GoogleGeminiClient.name);
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super();
    this.ai = new GoogleGenAI({ apiKey: config.get('GEMINI_API_KEY', { infer: true }) });
    // Rápido y barato: encaja con un asistente conversacional de demo, no
    // con generación pesada.
    this.model = config.get('GEMINI_MODEL', { infer: true }) ?? 'gemini-2.5-flash';
  }

  async send(params: {
    systemInstruction: string;
    functionDeclarations: GeminiFunctionDeclaration[];
    contents: GeminiContent[];
  }): Promise<GeminiResult> {
    let response;

    try {
      response = await this.ai.models.generateContent({
        model: this.model,
        contents: params.contents.map(toSdkContent),
        config: {
          systemInstruction: params.systemInstruction,
          tools: toSdkTools(params.functionDeclarations),
          toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
        },
      });
    } catch (error) {
      // El backoff/cola de reintentos es del día 12 (adr/0004); acá solo se
      // deja rastro de que Gemini falló, no se reintenta.
      this.logger.error(`Gemini falló: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    const [call] = response.functionCalls ?? [];

    if (call?.name) {
      return { kind: 'function_call', name: call.name, args: call.args ?? {} };
    }

    return { kind: 'text', text: response.text ?? '' };
  }
}
