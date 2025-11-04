/**
 * 📅 Calendar Integration - Google Calendar API
 * 
 * Permite verificar en tiempo real si se crearon/modificaron eventos de calendario.
 * Usa Google Calendar API para buscar eventos por fecha, asistentes, título.
 * 
 * REQUIERE: OAuth2 credentials configuradas en credentialsManager
 */

import { getCredentialById, type GoogleCalendarOAuthCredential } from '../credentialsManager';

export interface CalendarSearchCriteria {
  calendarId?: string; // ID del calendario (default: 'primary')
  summary?: string; // Título del evento (búsqueda parcial)
  attendees?: string[]; // Emails de asistentes
  afterDate?: Date; // Eventos creados/modificados después de esta fecha
  beforeDate?: Date; // Eventos antes de esta fecha
  location?: string; // Ubicación del evento
  descriptionContains?: string; // Texto en la descripción
}

export interface CalendarEventDetails {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  attendees?: Array<{ email: string; responseStatus?: string }>;
  organizer?: { email: string; displayName?: string };
  created: Date;
  updated: Date;
  status: string; // 'confirmed', 'tentative', 'cancelled'
  htmlLink: string; // URL del evento en Google Calendar
}

export interface CalendarVerificationResult {
  found: boolean;
  event?: CalendarEventDetails;
  searchCriteria: CalendarSearchCriteria;
  totalFound: number;
  message: string;
}

/**
 * Clase principal para interactuar con Google Calendar API
 */
export class GoogleCalendarIntegration {
  private accessToken: string;
  private credentialId?: string;

  constructor(credentialId: string) {
    const credential = getCredentialById(credentialId);
    
    if (!credential || credential.type !== 'google-calendar-oauth') {
      throw new Error(`Credencial Google Calendar no encontrada o inválida: ${credentialId}`);
    }

    const calCred = credential as GoogleCalendarOAuthCredential;
    
    // Si hay accessToken guardado, usarlo; si no, usar refreshToken para obtener uno nuevo
    this.accessToken = calCred.data.accessToken || '';
    this.credentialId = credentialId;
    
    if (!this.accessToken) {
      console.warn(`📅 [Calendar] No hay accessToken disponible - se necesitará refresh`);
      // TODO: Implementar refresh token flow si es necesario
    }
    
    console.log(`📅 [Calendar Integration] Inicializada con credential: ${credentialId}`);
  }

  /**
   * 🔥 NUEVO: Prueba la conexión con Google Calendar API
   * Hace una llamada real para verificar que el token funciona
   * @returns Object con success y mensaje
   */
  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      console.log(`📅 [Calendar] Probando conexión con API...`);
      
      // Hacer una llamada simple: obtener información del calendario primario
      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary',
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorDetail;
        try {
          errorDetail = JSON.parse(errorText);
        } catch {
          errorDetail = { raw: errorText };
        }
        
        console.error(`📅 [Calendar] Error de conexión:`, errorDetail);
        
        // Mensajes específicos según el error
        if (response.status === 401) {
          return {
            success: false,
            message: '❌ Token inválido o expirado. Re-autoriza la aplicación en Google.',
            details: errorDetail
          };
        } else if (response.status === 403) {
          return {
            success: false,
            message: '❌ Acceso denegado. Verifica que el token tenga permisos de Calendar.',
            details: errorDetail
          };
        } else if (response.status === 404) {
          return {
            success: false,
            message: '❌ Calendario no encontrado. Verifica la configuración.',
            details: errorDetail
          };
        } else if (response.status === 429) {
          return {
            success: false,
            message: '⚠️ Límite de rate excedido. Intenta nuevamente en unos minutos.',
            details: errorDetail
          };
        } else {
          return {
            success: false,
            message: `❌ Error ${response.status}: ${response.statusText}`,
            details: errorDetail
          };
        }
      }
      
      const data = await response.json();
      
      console.log(`📅 [Calendar] Conexión exitosa. Calendario: ${data.summary}`);
      
      return {
        success: true,
        message: `✅ Conectado exitosamente a calendario: ${data.summary}`,
        details: {
          calendarId: data.id,
          summary: data.summary,
          timeZone: data.timeZone
        }
      };
      
    } catch (error) {
      console.error(`📅 [Calendar] Error probando conexión:`, error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Detectar errores de red
      if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
        return {
          success: false,
          message: '❌ Error de red. Verifica tu conexión a internet.',
          details: { error: errorMessage }
        };
      }
      
      return {
        success: false,
        message: `❌ Error inesperado: ${errorMessage}`,
        details: { error: errorMessage }
      };
    }
  }

  /**
   * Busca eventos en el calendario según criterios
   */
  async searchEvents(criteria: CalendarSearchCriteria): Promise<CalendarEventDetails[]> {
    try {
      const calendarId = criteria.calendarId || 'primary';
      const params = new URLSearchParams();
      
      // Parámetros básicos
      params.append('maxResults', '10');
      params.append('singleEvents', 'true');
      params.append('orderBy', 'startTime');
      
      // Filtros de fecha
      if (criteria.afterDate) {
        params.append('timeMin', criteria.afterDate.toISOString());
      } else {
        // Por defecto, buscar desde hace 7 días
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        params.append('timeMin', weekAgo.toISOString());
      }
      
      if (criteria.beforeDate) {
        params.append('timeMax', criteria.beforeDate.toISOString());
      }
      
      // Búsqueda por texto (summary, description, location)
      if (criteria.summary) {
        params.append('q', criteria.summary);
      } else if (criteria.descriptionContains) {
        params.append('q', criteria.descriptionContains);
      } else if (criteria.location) {
        params.append('q', criteria.location);
      }
      
      console.log(`📅 [Calendar] Buscando eventos: ${params.toString()}`);
      
      // Llamada a Calendar API
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        throw new Error(`Calendar API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.items || data.items.length === 0) {
        console.log(`📅 [Calendar] No se encontraron eventos`);
        return [];
      }
      
      console.log(`📅 [Calendar] Encontrados ${data.items.length} evento(s)`);
      
      // Parsear eventos
      const events = data.items.map((item: any) => this.parseEvent(item));
      
      // Filtrar por asistentes si se especificó
      let filteredEvents = events;
      if (criteria.attendees && criteria.attendees.length > 0) {
        filteredEvents = events.filter((event) => {
          if (!event.attendees) return false;
          const eventEmails = event.attendees.map(a => a.email.toLowerCase());
          return criteria.attendees!.some(email => 
            eventEmails.includes(email.toLowerCase())
          );
        });
      }
      
      return filteredEvents;
      
    } catch (error) {
      console.error(`📅 [Calendar] Error buscando eventos:`, error);
      throw error;
    }
  }

  /**
   * Obtiene los detalles completos de un evento por su ID
   */
  async getEventDetails(eventId: string, calendarId: string = 'primary'): Promise<CalendarEventDetails | null> {
    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        console.error(`📅 [Calendar] Error obteniendo evento ${eventId}: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      return this.parseEvent(data);
      
    } catch (error) {
      console.error(`📅 [Calendar] Error obteniendo detalles de evento ${eventId}:`, error);
      return null;
    }
  }

  /**
   * Verifica si se creó un evento específico según criterios
   */
  async verifyEventCreated(criteria: CalendarSearchCriteria): Promise<CalendarVerificationResult> {
    try {
      const events = await this.searchEvents(criteria);
      
      if (events.length === 0) {
        return {
          found: false,
          searchCriteria: criteria,
          totalFound: 0,
          message: `No se encontró ningún evento con los criterios especificados`,
        };
      }
      
      // Tomar el más reciente por fecha de creación
      const mostRecent = events.sort((a, b) => b.created.getTime() - a.created.getTime())[0];
      
      const attendeesStr = mostRecent.attendees 
        ? ` con ${mostRecent.attendees.length} asistente(s)`
        : '';
      
      return {
        found: true,
        event: mostRecent,
        searchCriteria: criteria,
        totalFound: events.length,
        message: `✅ Evento encontrado: "${mostRecent.summary}" el ${mostRecent.start.toLocaleString()}${attendeesStr}`,
      };
      
    } catch (error) {
      return {
        found: false,
        searchCriteria: criteria,
        totalFound: 0,
        message: `❌ Error verificando evento: ${error}`,
      };
    }
  }

  /**
   * Parsea un evento de la API de Calendar a nuestro formato interno
   */
  private parseEvent(apiEvent: any): CalendarEventDetails {
    return {
      id: apiEvent.id,
      summary: apiEvent.summary || '(Sin título)',
      description: apiEvent.description,
      location: apiEvent.location,
      start: new Date(apiEvent.start.dateTime || apiEvent.start.date),
      end: new Date(apiEvent.end.dateTime || apiEvent.end.date),
      attendees: apiEvent.attendees?.map((a: any) => ({
        email: a.email,
        responseStatus: a.responseStatus,
      })),
      organizer: apiEvent.organizer ? {
        email: apiEvent.organizer.email,
        displayName: apiEvent.organizer.displayName,
      } : undefined,
      created: new Date(apiEvent.created),
      updated: new Date(apiEvent.updated),
      status: apiEvent.status,
      htmlLink: apiEvent.htmlLink,
    };
  }
}

/**
 * Función de utilidad para verificar rápidamente un evento sin instanciar la clase
 */
export async function verifyEventQuick(
  credentialId: string,
  criteria: CalendarSearchCriteria
): Promise<CalendarVerificationResult> {
  const calendar = new GoogleCalendarIntegration(credentialId);
  return calendar.verifyEventCreated(criteria);
}
