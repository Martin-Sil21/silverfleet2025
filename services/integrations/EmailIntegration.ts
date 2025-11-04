/**
 * 📧 Email Integration - Gmail API
 * 
 * Permite verificar en tiempo real si se enviaron emails durante una conversación.
 * Usa Gmail API para buscar emails enviados por fecha, remitente, asunto, destinatario.
 * 
 * SOPORTA: 
 * - OAuth2 credentials (google-oauth, gmail-oauth)
 * - Service Account credentials (google-service-account) - MÁS SIMPLE, sin configurar redirect URI
 */

import { 
  getCredentialById, 
  saveCredential, 
  type GmailOAuthCredential,
  type GoogleOAuthCredential,
  type GoogleServiceAccountCredential
} from '../credentialsManager';
import { getServiceAccountAccessToken } from '../googleServiceAccountAuth';

export interface EmailSearchCriteria {
  from?: string; // Remitente
  to?: string; // Destinatario
  subject?: string; // Asunto (búsqueda parcial)
  afterDate?: Date; // Emails enviados después de esta fecha
  beforeDate?: Date; // Emails enviados antes de esta fecha
  bodyContains?: string; // Texto en el cuerpo del email
}

export interface EmailDetails {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  subject: string;
  snippet: string; // Primeras líneas del email
  date: Date;
  body?: string; // Cuerpo completo (opcional, requiere fetch adicional)
  labels: string[];
}

export interface EmailVerificationResult {
  found: boolean;
  email?: EmailDetails;
  searchCriteria: EmailSearchCriteria;
  totalFound: number;
  message: string;
}

/**
 * Clase principal para interactuar con Gmail API
 */
export class GmailIntegration {
  private accessToken: string;
  private credentialId: string;
  private credentialType: 'oauth' | 'service-account';
  
  // OAuth specific
  private refreshToken?: string;
  private clientId?: string;
  private clientSecret?: string;
  
  // Service Account specific
  private serviceAccountCredential?: GoogleServiceAccountCredential;

  constructor(credentialId: string) {
    const credential = getCredentialById(credentialId);
    
    if (!credential) {
      throw new Error(`Credencial no encontrada: ${credentialId}`);
    }

    this.credentialId = credentialId;

    // Detectar tipo de credencial
    if (credential.type === 'google-service-account') {
      // Service Account - MÁS SIMPLE
      this.credentialType = 'service-account';
      this.serviceAccountCredential = credential as GoogleServiceAccountCredential;
      this.accessToken = ''; // Se generará on-demand
      // console.log(`📧 [Gmail Integration] Inicializada con Service Account: ${credential.name}`);
    } else if (credential.type === 'gmail-oauth' || credential.type === 'google-oauth') {
      // OAuth - requiere configuración de redirect URI
      this.credentialType = 'oauth';
      const oauthCred = credential as GmailOAuthCredential | GoogleOAuthCredential;
      this.clientId = oauthCred.data.clientId;
      this.clientSecret = oauthCred.data.clientSecret;
      this.refreshToken = oauthCred.data.refreshToken;
      this.accessToken = oauthCred.data.accessToken || '';
      // console.log(`📧 [Gmail Integration] Inicializada con OAuth: ${credential.name}`);
    } else {
      throw new Error(`Tipo de credencial no soportado para Gmail: ${credential.type}`);
    }
  }

  /**
   * Obtiene un access token válido (renueva si es necesario)
   */
  private async getValidAccessToken(): Promise<string> {
    if (this.credentialType === 'service-account') {
      // Service Account: generar token JWT cada vez (son cortos, 1 hora)
      if (!this.serviceAccountCredential) {
        throw new Error('Service Account credential not initialized');
      }
      return getServiceAccountAccessToken(this.serviceAccountCredential);
    } else {
      // OAuth: intentar refresh si el token actual está vacío o puede estar expirado
      // Los access tokens de Google expiran en 1 hora
      if (!this.accessToken) {
        console.log(`🔄 [Gmail OAuth] Access token vacío, renovando...`);
        this.accessToken = await this.refreshOAuthToken();
      }
      return this.accessToken;
    }
  }

  /**
   * Renueva el access token usando el refresh token (solo OAuth)
   */
  private async refreshOAuthToken(): Promise<string> {
    if (this.credentialType !== 'oauth') {
      throw new Error('refreshOAuthToken only works with OAuth credentials');
    }

    try {
      
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.clientId!,
          client_secret: this.clientSecret!,
          refresh_token: this.refreshToken!,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error_description || errorData.error || response.statusText;
        
        if (response.status === 400 && errorMsg.includes('invalid_grant')) {
          throw new Error(`❌ Token expirado o revocado. Necesitas autorizar nuevamente con Google. Error: ${errorMsg}`);
        }
        
        if (response.status === 401 || response.status === 403) {
          throw new Error(`❌ Credenciales OAuth inválidas. Verifica tu Client ID y Client Secret en Google Cloud Console. Error: ${errorMsg}`);
        }
        
        throw new Error(`Failed to refresh token: ${response.status} ${errorMsg}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      
      // Actualizar credencial guardada con el nuevo token
      const credential = getCredentialById(this.credentialId);
      if (credential && (credential.type === 'gmail-oauth' || credential.type === 'google-oauth')) {
        (credential as GmailOAuthCredential | GoogleOAuthCredential).data.accessToken = this.accessToken;
        saveCredential(credential);
      }
      
      return this.accessToken;
    } catch (error) {
      console.error(`📧 [Gmail] Error renovando token:`, error);
      throw error;
    }
  }

  /**
   * 🔥 NUEVO: Prueba la conexión con Gmail API
   * Hace una llamada real para verificar que el token funciona
   * @returns Object con success y mensaje
   */
  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      // console.log(`📧 [Gmail] Probando conexión con API...`);
      
      // Intentar obtener un access token válido
      const token = await this.getValidAccessToken();
      
      // Hacer una llamada simple: obtener perfil del usuario
      const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/profile',
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        // Si falla con 401 y es OAuth, intentar renovar el token
        if (response.status === 401 && this.credentialType === 'oauth') {
          // console.log(`📧 [Gmail] Token expirado, intentando renovar...`);
          try {
            const newToken = await this.refreshOAuthToken();
            
            // Reintentar con el nuevo token
            const retryResponse = await fetch(
              'https://gmail.googleapis.com/gmail/v1/users/me/profile',
              {
                headers: {
                  'Authorization': `Bearer ${newToken}`,
                  'Content-Type': 'application/json',
                },
              }
            );
            
            if (retryResponse.ok) {
              const data = await retryResponse.json();
              return {
                success: true,
                message: `✅ Conectado exitosamente como ${data.emailAddress} (token renovado)`,
                details: {
                  emailAddress: data.emailAddress,
                  messagesTotal: data.messagesTotal,
                  threadsTotal: data.threadsTotal,
                  authType: 'OAuth'
                }
              };
            }
          } catch (refreshError) {
            return {
              success: false,
              message: '❌ No se pudo renovar el token. Verifica Client ID, Client Secret y Refresh Token.',
              details: refreshError
            };
          }
        } else if (response.status === 401 && this.credentialType === 'service-account') {
          return {
            success: false,
            message: '❌ Service Account no autorizado. Verifica que el Service Account tenga permisos para Gmail API.',
            details: await response.text()
          };
        }
        
        const errorText = await response.text();
        let errorDetail;
        try {
          errorDetail = JSON.parse(errorText);
        } catch {
          errorDetail = { raw: errorText };
        }
        
        console.error(`📧 [Gmail] Error de conexión:`, errorDetail);
        
        // Mensajes específicos según el error
        if (response.status === 403) {
          return {
            success: false,
            message: '❌ Acceso denegado. Verifica que el token tenga permisos de Gmail.',
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
      
      // console.log(`📧 [Gmail] Conexión exitosa. Email: ${data.emailAddress}`);
      
      return {
        success: true,
        message: `✅ Conectado exitosamente como ${data.emailAddress}`,
        details: {
          emailAddress: data.emailAddress,
          messagesTotal: data.messagesTotal,
          threadsTotal: data.threadsTotal,
          authType: this.credentialType === 'service-account' ? 'Service Account' : 'OAuth'
        }
      };
      
    } catch (error) {
      console.error(`📧 [Gmail] Error probando conexión:`, error);
      
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
   * Busca emails en la bandeja de enviados según criterios
   */
  async searchSentEmails(criteria: EmailSearchCriteria): Promise<EmailDetails[]> {
    try {
      // Construir query de Gmail API
      // Formato: https://developers.google.com/gmail/api/guides/filtering
      const queryParts: string[] = ['in:sent'];
      
      if (criteria.from) {
        queryParts.push(`from:${criteria.from}`);
      }
      
      if (criteria.to) {
        queryParts.push(`to:${criteria.to}`);
      }
      
      if (criteria.subject) {
        queryParts.push(`subject:"${criteria.subject}"`);
      }
      
      if (criteria.afterDate) {
        const dateStr = criteria.afterDate.toISOString().split('T')[0]; // YYYY-MM-DD
        queryParts.push(`after:${dateStr.replace(/-/g, '/')}`);
      }
      
      if (criteria.beforeDate) {
        const dateStr = criteria.beforeDate.toISOString().split('T')[0];
        queryParts.push(`before:${dateStr.replace(/-/g, '/')}`);
      }
      
      if (criteria.bodyContains) {
        queryParts.push(`"${criteria.bodyContains}"`);
      }
      
      const query = queryParts.join(' ');
      
      console.log(`🔧 [HERRAMIENTA-GMAIL] 🔍 Buscando: ${query}`);
      
      // 🔄 ASEGURAR TOKEN VÁLIDO antes de llamar a Gmail API
      const validToken = await this.getValidAccessToken();
      
      // Llamada a Gmail API
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`,
        {
          headers: {
            'Authorization': `Bearer ${validToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        // Si falla con 401, intentar renovar token una vez más
        if (response.status === 401 && this.credentialType === 'oauth') {
          console.log(`🔄 [Gmail OAuth] Token expirado (401), renovando...`);
          const newToken = await this.refreshOAuthToken();
          this.accessToken = newToken;
          
          // Reintentar con nuevo token
          const retryResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`,
            {
              headers: {
                'Authorization': `Bearer ${newToken}`,
                'Content-Type': 'application/json',
              },
            }
          );
          
          if (!retryResponse.ok) {
            throw new Error(`Gmail API error después de refresh: ${retryResponse.status} ${retryResponse.statusText}`);
          }
          
          const retryData = await retryResponse.json();
          if (!retryData.messages || retryData.messages.length === 0) {
            console.log(`❌ [HERRAMIENTA-GMAIL] ❌ No encontrado`);
            return [];
          }
          
          console.log(`✅ [HERRAMIENTA-GMAIL] ✅ Encontrados ${retryData.messages.length} email(s)`);
          const emailDetails = await Promise.all(
            retryData.messages.map((msg: any) => this.getEmailDetails(msg.id))
          );
          return emailDetails.filter((email): email is EmailDetails => email !== null);
        }
        
        throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.messages || data.messages.length === 0) {
        console.log(`� [HERRAMIENTA-GMAIL] ❌ No encontrado`);
        return [];
      }
      
      console.log(`� [HERRAMIENTA-GMAIL] ✅ Encontrados ${data.messages.length} email(s)`);
      
      // Obtener detalles de cada email
      const emailDetails = await Promise.all(
        data.messages.map((msg: any) => this.getEmailDetails(msg.id))
      );
      
      return emailDetails.filter((email): email is EmailDetails => email !== null);
      
    } catch (error) {
      console.error(`� [HERRAMIENTA-GMAIL] ❌ ERROR:`, error);
      throw error;
    }
  }

  /**
   * Obtiene los detalles completos de un email por su ID
   */
  async getEmailDetails(messageId: string): Promise<EmailDetails | null> {
    try {
      // 🔄 ASEGURAR TOKEN VÁLIDO antes de llamar a Gmail API
      const validToken = await this.getValidAccessToken();
      
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        {
          headers: {
            'Authorization': `Bearer ${validToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        // Si falla con 401, intentar renovar token una vez más
        if (response.status === 401 && this.credentialType === 'oauth') {
          console.log(`🔄 [Gmail OAuth] Token expirado en getEmailDetails (401), renovando...`);
          const newToken = await this.refreshOAuthToken();
          this.accessToken = newToken;
          
          // Reintentar con nuevo token
          const retryResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
            {
              headers: {
                'Authorization': `Bearer ${newToken}`,
                'Content-Type': 'application/json',
              },
            }
          );
          
          if (!retryResponse.ok) {
            console.error(`📧 [Gmail] Error obteniendo email ${messageId} después de refresh: ${retryResponse.status}`);
            return null;
          }
          
          const retryData = await retryResponse.json();
          return this.parseEmailData(retryData);
        }
        
        console.error(`📧 [Gmail] Error obteniendo email ${messageId}: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      return this.parseEmailData(data);
      
    } catch (error) {
      console.error(`📧 [Gmail] Error obteniendo detalles de email ${messageId}:`, error);
      return null;
    }
  }

  /**
   * Parsea los datos de un email desde Gmail API
   */
  private parseEmailData(data: any): EmailDetails {
    // Parsear headers
    const headers = data.payload.headers;
    const getHeader = (name: string) => {
      const header = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
      return header?.value || '';
    };
    
    const from = getHeader('From');
    const to = getHeader('To').split(',').map((t: string) => t.trim());
    const subject = getHeader('Subject');
    const dateStr = getHeader('Date');
    
    // Extraer snippet y body
    const snippet = data.snippet || '';
    let body = '';
    
    // Intentar extraer body (Gmail API puede tener estructura compleja)
    if (data.payload.body?.data) {
      body = this.decodeBase64(data.payload.body.data);
    } else if (data.payload.parts) {
      // Email con múltiples partes (text/html)
      const textPart = data.payload.parts.find((p: any) => p.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        body = this.decodeBase64(textPart.body.data);
      }
    }
    
    return {
      id: data.id,
      threadId: data.threadId,
      from,
      to,
      subject,
      snippet,
      date: new Date(dateStr),
      body: body || snippet,
      labels: data.labelIds || [],
    };
  }

  /**
   * Verifica si se envió un email específico según criterios
   */
  async verifyEmailSent(criteria: EmailSearchCriteria): Promise<EmailVerificationResult> {
    try {
      const emails = await this.searchSentEmails(criteria);
      
      if (emails.length === 0) {
        return {
          found: false,
          searchCriteria: criteria,
          totalFound: 0,
          message: `No se encontró ningún email con los criterios especificados`,
        };
      }
      
      // Tomar el más reciente
      const mostRecent = emails.sort((a, b) => b.date.getTime() - a.date.getTime())[0];
      
      return {
        found: true,
        email: mostRecent,
        searchCriteria: criteria,
        totalFound: emails.length,
        message: `✅ Email encontrado: "${mostRecent.subject}" enviado a ${mostRecent.to.join(', ')}`,
      };
      
    } catch (error) {
      return {
        found: false,
        searchCriteria: criteria,
        totalFound: 0,
        message: `❌ Error verificando email: ${error}`,
      };
    }
  }

  /**
   * Decodifica contenido base64url de Gmail API
   */
  private decodeBase64(encoded: string): string {
    try {
      // Gmail usa base64url (reemplazar - por +, _ por /)
      const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      return atob(base64);
    } catch (error) {
      console.error('Error decodificando base64:', error);
      return '';
    }
  }
}

/**
 * Función de utilidad para verificar rápidamente un email sin instanciar la clase
 */
export async function verifyEmailQuick(
  credentialId: string,
  criteria: EmailSearchCriteria
): Promise<EmailVerificationResult> {
  const gmail = new GmailIntegration(credentialId);
  return gmail.verifyEmailSent(criteria);
}
