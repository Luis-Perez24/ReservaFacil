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
}
