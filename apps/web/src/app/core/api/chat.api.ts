import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ChatMessage, ChatResponse } from '@reservafacil/contracts';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ChatApi {
  private readonly http = inject(HttpClient);

  send(slug: string, message: string, history: ChatMessage[]): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(`/public/${encodeURIComponent(slug)}/chat`, {
      message,
      history,
    });
  }
}
