/**
 * Mock para APIs externas (Supabase, Gmail, Calendar, etc.)
 * Permite simular respuestas de APIs sin hacer llamadas reales
 */

import { vi } from 'vitest';

/**
 * Mock de Supabase Client
 */
export class MockSupabaseClient {
  private mockData: Map<string, any[]> = new Map();
  private mockErrors: Map<string, Error> = new Map();
  
  constructor(initialData?: Record<string, any[]>) {
    if (initialData) {
      Object.entries(initialData).forEach(([table, data]) => {
        this.mockData.set(table, data);
      });
    }
  }

  /**
   * Configura datos mock para una tabla
   */
  setMockData(table: string, data: any[]) {
    this.mockData.set(table, data);
  }

  /**
   * Configura un error mock para una tabla
   */
  setMockError(table: string, error: Error) {
    this.mockErrors.set(table, error);
  }

  /**
   * Simula operación de SELECT
   */
  from(table: string) {
    const error = this.mockErrors.get(table);
    if (error) {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error }),
        single: vi.fn().mockResolvedValue({ data: null, error })
      };
    }

    const data = this.mockData.get(table) || [];
    let filteredData = [...data];

    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((field: string, value: any) => {
        filteredData = filteredData.filter(row => row[field] === value);
        return this.from(table);
      }),
      ilike: vi.fn((field: string, value: string) => {
        const searchTerm = value.replace(/%/g, '').toLowerCase();
        filteredData = filteredData.filter(row => 
          row[field]?.toLowerCase().includes(searchTerm)
        );
        return this.from(table);
      }),
      or: vi.fn((conditions: string) => {
        // Parse OR conditions (simplified)
        return this.from(table);
      }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn((count: number) => {
        const limited = filteredData.slice(0, count);
        return Promise.resolve({ data: limited, error: null });
      }),
      single: vi.fn(() => {
        return Promise.resolve({ 
          data: filteredData[0] || null, 
          error: filteredData.length === 0 ? new Error('No rows found') : null 
        });
      })
    };
  }
}

/**
 * Mock de Google Gmail API
 */
export class MockGmailAPI {
  private sentEmails: any[] = [];
  private mockError: Error | null = null;

  constructor() {
    this.sentEmails = [];
  }

  /**
   * Configura un error para simular fallas
   */
  setMockError(error: Error | null) {
    this.mockError = error;
  }

  /**
   * Simula envío de email
   */
  async sendEmail(params: {
    to: string;
    subject: string;
    body: string;
    from?: string;
    attachments?: any[];
  }): Promise<any> {
    if (this.mockError) {
      throw this.mockError;
    }

    const email = {
      id: `email_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      threadId: `thread_${Date.now()}`,
      labelIds: ['SENT'],
      ...params,
      sentAt: new Date().toISOString()
    };

    this.sentEmails.push(email);

    return {
      status: 200,
      data: email
    };
  }

  /**
   * Obtiene lista de emails enviados (para verificación)
   */
  getSentEmails(): any[] {
    return this.sentEmails;
  }

  /**
   * Busca emails por criterios
   */
  async searchEmails(query: {
    to?: string;
    subject?: string;
    from?: string;
    after?: Date;
  }): Promise<any[]> {
    if (this.mockError) {
      throw this.mockError;
    }

    let results = [...this.sentEmails];

    if (query.to) {
      results = results.filter(email => email.to === query.to);
    }

    if (query.subject) {
      results = results.filter(email => 
        email.subject.toLowerCase().includes(query.subject!.toLowerCase())
      );
    }

    if (query.from) {
      results = results.filter(email => email.from === query.from);
    }

    if (query.after) {
      results = results.filter(email => 
        new Date(email.sentAt) > query.after!
      );
    }

    return results;
  }

  /**
   * Limpia emails enviados
   */
  clear() {
    this.sentEmails = [];
    this.mockError = null;
  }
}

/**
 * Mock de Google Calendar API
 */
export class MockGoogleCalendarAPI {
  private events: any[] = [];
  private mockError: Error | null = null;

  constructor() {
    this.events = [];
  }

  /**
   * Configura un error para simular fallas
   */
  setMockError(error: Error | null) {
    this.mockError = error;
  }

  /**
   * Crea un evento en el calendario
   */
  async createEvent(params: {
    summary: string;
    description?: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
    attendees?: Array<{ email: string }>;
    location?: string;
  }): Promise<any> {
    if (this.mockError) {
      throw this.mockError;
    }

    const event = {
      id: `event_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      kind: 'calendar#event',
      status: 'confirmed',
      htmlLink: `https://calendar.google.com/event?eid=${Date.now()}`,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      ...params
    };

    this.events.push(event);

    return {
      status: 200,
      data: event
    };
  }

  /**
   * Obtiene eventos creados
   */
  getEvents(): any[] {
    return this.events;
  }

  /**
   * Busca eventos por criterios
   */
  async searchEvents(query: {
    summary?: string;
    after?: Date;
    before?: Date;
  }): Promise<any[]> {
    if (this.mockError) {
      throw this.mockError;
    }

    let results = [...this.events];

    if (query.summary) {
      results = results.filter(event => 
        event.summary.toLowerCase().includes(query.summary!.toLowerCase())
      );
    }

    if (query.after) {
      results = results.filter(event => 
        new Date(event.start.dateTime) > query.after!
      );
    }

    if (query.before) {
      results = results.filter(event => 
        new Date(event.start.dateTime) < query.before!
      );
    }

    return results;
  }

  /**
   * Actualiza un evento existente
   */
  async updateEvent(eventId: string, updates: Partial<any>): Promise<any> {
    if (this.mockError) {
      throw this.mockError;
    }

    const eventIndex = this.events.findIndex(e => e.id === eventId);
    
    if (eventIndex === -1) {
      throw new Error(`Event ${eventId} not found`);
    }

    this.events[eventIndex] = {
      ...this.events[eventIndex],
      ...updates,
      updated: new Date().toISOString()
    };

    return {
      status: 200,
      data: this.events[eventIndex]
    };
  }

  /**
   * Elimina un evento
   */
  async deleteEvent(eventId: string): Promise<void> {
    if (this.mockError) {
      throw this.mockError;
    }

    const eventIndex = this.events.findIndex(e => e.id === eventId);
    
    if (eventIndex === -1) {
      throw new Error(`Event ${eventId} not found`);
    }

    this.events.splice(eventIndex, 1);
  }

  /**
   * Limpia eventos
   */
  clear() {
    this.events = [];
    this.mockError = null;
  }
}

/**
 * Mock de Google Gemini AI API
 */
export class MockGeminiAPI {
  private mockResponses: Map<string, any> = new Map();
  private defaultResponse: any = null;
  private callHistory: Array<{ prompt: string; config?: any }> = [];

  /**
   * Configura una respuesta específica para un prompt
   */
  setMockResponse(promptPattern: string | RegExp, response: any) {
    const key = typeof promptPattern === 'string' 
      ? promptPattern 
      : promptPattern.source;
    this.mockResponses.set(key, response);
  }

  /**
   * Configura respuesta por defecto
   */
  setDefaultResponse(response: any) {
    this.defaultResponse = response;
  }

  /**
   * Simula generación de contenido
   */
  async generateContent(params: {
    model: string;
    contents: string;
    config?: any;
  }): Promise<any> {
    this.callHistory.push({
      prompt: params.contents,
      config: params.config
    });

    // Buscar respuesta específica
    for (const [pattern, response] of this.mockResponses.entries()) {
      if (params.contents.includes(pattern)) {
        return {
          text: typeof response === 'string' ? response : JSON.stringify(response),
          candidates: [{ content: { parts: [{ text: typeof response === 'string' ? response : JSON.stringify(response) }] } }]
        };
      }
    }

    // Usar respuesta por defecto
    if (this.defaultResponse) {
      return {
        text: typeof this.defaultResponse === 'string' ? this.defaultResponse : JSON.stringify(this.defaultResponse),
        candidates: [{ content: { parts: [{ text: typeof this.defaultResponse === 'string' ? this.defaultResponse : JSON.stringify(this.defaultResponse) }] } }]
      };
    }

    // Respuesta genérica
    return {
      text: '{"success": true, "message": "Mock response"}',
      candidates: [{ content: { parts: [{ text: '{"success": true, "message": "Mock response"}' }] } }]
    };
  }

  /**
   * Obtiene historial de llamadas
   */
  getCallHistory() {
    return this.callHistory;
  }

  /**
   * Limpia estado
   */
  clear() {
    this.mockResponses.clear();
    this.defaultResponse = null;
    this.callHistory = [];
  }
}

/**
 * Factory para crear mocks de Supabase
 */
export function createMockSupabaseClient(initialData?: Record<string, any[]>): any {
  return new MockSupabaseClient(initialData);
}

/**
 * Factory para crear mocks de Gmail
 */
export function createMockGmailAPI(): MockGmailAPI {
  return new MockGmailAPI();
}

/**
 * Factory para crear mocks de Google Calendar
 */
export function createMockGoogleCalendarAPI(): MockGoogleCalendarAPI {
  return new MockGoogleCalendarAPI();
}

/**
 * Factory para crear mocks de Gemini
 */
export function createMockGeminiAPI(): MockGeminiAPI {
  return new MockGeminiAPI();
}
