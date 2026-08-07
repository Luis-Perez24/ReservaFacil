export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface ChatRequest {
  message: string;
  /**
   * Turnos previos, ya en texto plano. El detalle de function calling de
   * Gemini (llamadas a función, sus resultados) se resuelve entero dentro de
   * un solo request al backend — nunca cruza a este contrato.
   */
  history?: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
  history: ChatMessage[];
  /**
   * `true` si Gemini no respondió tras los reintentos (día 12, parte 1): la
   * IA es una comodidad, nunca un camino crítico (adr/0004) — el frontend
   * debe ofrecer el buscador manual en vez de insistir con el chat.
   */
  degraded?: boolean;
}
