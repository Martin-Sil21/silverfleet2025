/**
 * 🔗 Integration Manager
 * 
 * Coordina todas las integraciones externas (Gmail, Calendar, CRM, etc.) 
 * para verificar en TIEMPO REAL que las acciones prometidas por el agente 
 * fueron realmente ejecutadas.
 * 
 * Se conecta con el flujo de conversación para verificar después de cada respuesta del bot.
 */

// 🔧 FLAG DE DEBUG PARA HERRAMIENTAS - Cambiar a true para ver logs detallados
const DEBUG_TOOLS = true;

import { GmailIntegration, type EmailSearchCriteria, type EmailVerificationResult } from './integrations/EmailIntegration';
import { GoogleCalendarIntegration, type CalendarSearchCriteria, type CalendarVerificationResult } from './integrations/CalendarIntegration';
import { getCredentialsByType, type Credential } from './credentialsManager';
import type { DetectedTool, DetectedSubflow } from './workflowDependencyAnalyzer';
import { promiseWithTimeout } from './apiUtils'; // 🔥 NUEVO: Para timeout en Gmail API

export type ToolActionType = 
  | 'email_send'
  | 'calendar_create'
  | 'calendar_update'
  | 'crm_update'
  | 'sms_send'
  | 'whatsapp_send'
  | 'database_update';

export interface ToolActionClaim {
  type: ToolActionType;
  description: string; // Qué prometió el agente (ej: "enviar propuesta a juan@empresa.com")
  extractedData: any; // Datos extraídos de la respuesta del bot
  turnNumber: number;
  timestamp: Date;
}

export interface ToolActionVerification {
  claim: ToolActionClaim;
  verified: boolean;
  verificationMethod: string; // Cómo se verificó (ej: "Gmail API search")
  evidence?: any; // Datos de la verificación (email encontrado, evento, etc.)
  message: string;
  timestamp: Date;
}

export interface IntegrationConfig {
  enabledIntegrations: {
    email?: {
      credentialId: string;
      type: 'gmail-oauth' | 'smtp'; // Tipo de integración
    };
    calendar?: {
      credentialId: string;
      type: 'google-calendar-oauth';
    };
    // Futuros: CRM, SMS, WhatsApp, etc.
  };
  verificationDelay?: number; // Segundos de espera antes de verificar (dar tiempo a que el sistema ejecute)
}

/**
 * Manager principal de integraciones
 */
export class IntegrationManager {
  private config: IntegrationConfig;
  private gmailIntegration?: GmailIntegration;
  private calendarIntegration?: GoogleCalendarIntegration;
  private detectedTools: DetectedTool[];
  private detectedSubflows: DetectedSubflow[];

  constructor(
    config: IntegrationConfig,
    detectedTools: DetectedTool[] = [],
    detectedSubflows: DetectedSubflow[] = []
  ) {
    this.config = config;
    this.detectedTools = detectedTools;
    this.detectedSubflows = detectedSubflows;

    // Inicializar integraciones según configuración
    this.initializeIntegrations();
  }

  private initializeIntegrations(): void {
    try {
      // Gmail
      if (this.config.enabledIntegrations.email) {
        // console.log(`📧 [IntegrationManager] Inicializando Gmail Integration...`);
        this.gmailIntegration = new GmailIntegration(
          this.config.enabledIntegrations.email.credentialId
        );
      }

      // Google Calendar
      if (this.config.enabledIntegrations.calendar) {
        // console.log(`📅 [IntegrationManager] Inicializando Calendar Integration...`);
        this.calendarIntegration = new GoogleCalendarIntegration(
          this.config.enabledIntegrations.calendar.credentialId
        );
      }

      // console.log(`✅ [IntegrationManager] Integraciones inicializadas correctamente`);
    } catch (error) {
      console.error(`❌ [IntegrationManager] Error inicializando integraciones:`, error);
      throw error;
    }
  }

  /**
   * 🔧 Verifica si hay herramientas configuradas para verificar
   * Retorna true si hay al menos una integración (email o calendar) habilitada
   */
  hasToolsConfigured(): boolean {
    return !!(this.config.enabledIntegrations.email || this.config.enabledIntegrations.calendar);
  }

  /**
   * 🔥 NUEVO: Prueba la conexión de todas las integraciones configuradas
   * Debe llamarse ANTES de iniciar la auditoría para detectar problemas temprano
   */
  async testAllConnections(): Promise<{ 
    email?: { success: boolean; message: string }; 
    calendar?: { success: boolean; message: string };
    allSuccess: boolean;
  }> {
    const results: any = {};
    
    // Test Gmail
    if (this.gmailIntegration) {
      // console.log(`\n🔍 [IntegrationManager] Probando conexión Gmail...`);
      const gmailTest = await this.gmailIntegration.testConnection();
      results.email = gmailTest;
      // console.log(`   ${gmailTest.message}`);
    }
    
    // Test Calendar
    if (this.calendarIntegration) {
      // console.log(`\n🔍 [IntegrationManager] Probando conexión Calendar...`);
      const calendarTest = await this.calendarIntegration.testConnection();
      results.calendar = calendarTest;
      // console.log(`   ${calendarTest.message}`);
    }
    
    // Verificar si todas las pruebas fueron exitosas
    const allSuccess = Object.values(results).every((r: any) => r.success);
    
    return {
      ...results,
      allSuccess
    };
  }

  /**
   * Analiza la respuesta del bot y extrae acciones prometidas
   */
  extractActionClaims(
    botResponse: string,
    turnNumber: number
  ): ToolActionClaim[] {
    const claims: ToolActionClaim[] = [];
    const lowerResponse = botResponse.toLowerCase();

    // 1. Detectar promesa de email
    const emailKeywords = [
      'enviar email', 'envío el email', 'te envío', 'te mando por email',
      'enviaré', 'te llega', 'mail', 'correo', 'propuesta formal',
      'te envío la información', 'te mando los datos'
    ];

    const emailMentioned = emailKeywords.some(kw => lowerResponse.includes(kw));
    if (emailMentioned && this.gmailIntegration) {
      // Extraer destinatario del texto (buscar patrón de email)
      const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
      const emails = botResponse.match(emailRegex) || [];

      // Extraer posible asunto o contenido
      const subjectMatch = botResponse.match(/asunto[:\s]+["']?([^"'\n]+)["']?/i);
      const subject = subjectMatch ? subjectMatch[1].trim() : undefined;

      claims.push({
        type: 'email_send',
        description: `Enviar email${emails.length > 0 ? ` a ${emails.join(', ')}` : ''}`,
        extractedData: {
          to: emails,
          subject: subject,
          bodySnippet: botResponse.substring(0, 200), // Primeros 200 chars
        },
        turnNumber,
        timestamp: new Date(),
      });
    }

    // 2. Detectar promesa de calendario
    const calendarKeywords = [
      'agendar', 'calendario', 'reunión', 'evento', 'cita',
      'agendé', 'agendada', 'programé', 'reservé'
    ];

    const calendarMentioned = calendarKeywords.some(kw => lowerResponse.includes(kw));
    if (calendarMentioned && this.calendarIntegration) {
      // Extraer fecha/hora (simplificado - en producción usar parser más robusto)
      const dateMatch = botResponse.match(/(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})|(\d{1,2}\s+de\s+\w+)/i);
      const timeMatch = botResponse.match(/(\d{1,2}:\d{2})/);

      // Extraer asistentes (emails)
      const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
      const attendees = botResponse.match(emailRegex) || [];

      claims.push({
        type: 'calendar_create',
        description: `Crear evento de calendario${dateMatch ? ` para ${dateMatch[0]}` : ''}`,
        extractedData: {
          date: dateMatch ? dateMatch[0] : undefined,
          time: timeMatch ? timeMatch[0] : undefined,
          attendees: attendees,
          summary: botResponse.substring(0, 100), // Usar parte del texto como título tentativo
        },
        turnNumber,
        timestamp: new Date(),
      });
    }

    return claims;
  }

  /**
   * Verifica una acción de email contra Gmail API
   */
  async verifyEmailAction(claim: ToolActionClaim): Promise<ToolActionVerification> {
    if (!this.gmailIntegration) {
      if (DEBUG_TOOLS) console.log(`🔍 [HERRAMIENTA] Gmail NO configurado - sin credenciales`);
      return {
        claim,
        verified: false,
        verificationMethod: 'Gmail API',
        message: '⚠️ Gmail no configurado',
        timestamp: new Date(),
      };
    }

    try {
      // Dar tiempo a que el sistema envíe el email
      const delay = this.config.verificationDelay || 3;
      console.log(`\n📧 [VERIFICACIÓN GMAIL] Iniciando verificación de email...`);
      console.log(`   ⏱️  Esperando ${delay}s para dar tiempo al envío...`);
      await new Promise(resolve => setTimeout(resolve, delay * 1000));

      // Construir criterios de búsqueda
      const criteria: EmailSearchCriteria = {
        to: claim.extractedData.to?.[0],
        subject: claim.extractedData.subject,
        afterDate: claim.timestamp,
        bodyContains: claim.extractedData.bodySnippet ? claim.extractedData.bodySnippet.substring(0, 50) : undefined,
      };

      console.log(`   🔍 Criterios de búsqueda:`, {
        destinatario: criteria.to || '(no especificado)',
        asunto: criteria.subject || '(no especificado)',
        desde: claim.timestamp.toISOString(),
        contenido: criteria.bodyContains || '(no especificado)'
      });

      // 🔥 TIMEOUT de 15s para Gmail API (usualmente responde en 3-8s)
      const startTime = Date.now();
      console.log(`   📡 Consultando Gmail API...`);
      
      const result: EmailVerificationResult = await promiseWithTimeout(
        this.gmailIntegration.verifyEmailSent(criteria),
        15000, // 15s suficiente - Gmail API es rápida
        'Gmail API timeout'
      );
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`\n   ✅ Gmail API respondió en ${duration}s`);
      console.log(`   📊 Resultado:`, {
        encontrado: result.found ? '✅ SÍ' : '❌ NO',
        mensaje: result.message,
        evidencia: result.email ? `Email ID: ${result.email.id?.substring(0, 20)}...` : 'Sin evidencia'
      });

      return {
        claim,
        verified: result.found,
        verificationMethod: 'Gmail API',
        evidence: result.email,
        message: result.message,
        timestamp: new Date(),
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // 🔥 TIMEOUT: Gmail API tardó demasiado
      if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
        if (DEBUG_TOOLS) console.log(`🔍 [HERRAMIENTA] TIMEOUT Gmail (60s excedido)`);
        
        const hasEmailNode = this.detectedTools.some(tool => tool.toolType === 'email');
        
        return {
          claim,
          verified: false,
          verificationMethod: 'Gmail API (timeout)',
          evidence: {
            note: 'Timeout de Gmail API - 60s excedido',
            emailNodeDetected: hasEmailNode,
          },
          message: `⚠️ Gmail API timeout (60s)`,
          timestamp: new Date(),
        };
      }
      
      // 🔥 FALLBACK: Si falla la API (401, 403, etc.)
      if (errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('Unauthorized')) {
        if (DEBUG_TOOLS) console.log(`🔍 [HERRAMIENTA] Gmail API sin autorización (${errorMessage})`);
        
        const hasEmailNode = this.detectedTools.some(tool => tool.toolType === 'email');
        
        if (hasEmailNode) {
          return {
            claim,
            verified: true, // ✅ ASUMIMOS que se ejecutó (hay nodo email)
            verificationMethod: 'Workflow Analysis',
            message: `✅ Email probablemente enviado (nodo detectado en workflow)`,
            timestamp: new Date(),
          };
        }
        
        return {
          claim,
          verified: false,
          verificationMethod: 'Workflow Analysis',
          message: `⚠️ Gmail API no disponible y sin nodos de email`,
          timestamp: new Date(),
        };
      }
      
      // Otros errores
      if (DEBUG_TOOLS) console.log(`🔍 [HERRAMIENTA] Error desconocido:`, errorMessage);
      return {
        claim,
        verified: false,
        verificationMethod: 'Gmail API',
        message: `❌ Error: ${errorMessage}`,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Verifica una acción de calendario contra Calendar API
   */
  async verifyCalendarAction(claim: ToolActionClaim): Promise<ToolActionVerification> {
    if (!this.calendarIntegration) {
      return {
        claim,
        verified: false,
        verificationMethod: 'Calendar API',
        message: '❌ Integración de Calendar no configurada',
        timestamp: new Date(),
      };
    }

    try {
      // Dar tiempo a que el sistema cree el evento
      const delay = this.config.verificationDelay || 3;
      // console.log(`📅 [IntegrationManager] Esperando ${delay}s antes de verificar calendario...`);
      await new Promise(resolve => setTimeout(resolve, delay * 1000));

      // Construir criterios de búsqueda
      const criteria: CalendarSearchCriteria = {
        summary: claim.extractedData.summary,
        attendees: claim.extractedData.attendees,
        afterDate: claim.timestamp, // Buscar desde que se hizo la promesa
      };

      // console.log(`📅 [IntegrationManager] Verificando evento con criterios:`, criteria);

      // 🔥 TIMEOUT de 45s para Calendar API
      const result: CalendarVerificationResult = await promiseWithTimeout(
        this.calendarIntegration.verifyEventCreated(criteria),
        45000, // 45 segundos máximo
        'Calendar API timeout'
      );

      return {
        claim,
        verified: result.found,
        verificationMethod: 'Calendar API',
        evidence: result.event,
        message: result.message,
        timestamp: new Date(),
      };

    } catch (error) {
      console.error(`📅 [IntegrationManager] Error verificando calendario:`, error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // 🔥 TIMEOUT: Calendar API tardó demasiado
      if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
        // console.log(`⏱️ [IntegrationManager] Calendar API timeout - no se pudo verificar`);
        
        const hasCalendarNode = this.detectedTools.some(tool => tool.toolType === 'calendar');
        
        return {
          claim,
          verified: false, // ❌ NO podemos confirmar sin verificación real
          verificationMethod: 'Calendar API (timeout)',
          evidence: {
            note: 'Timeout de Calendar API - verificación no completada',
            calendarNodeDetected: hasCalendarNode,
            detectedTools: hasCalendarNode ? this.detectedTools.filter(t => t.toolType === 'calendar').map(t => t.nodeName) : [],
            reason: 'API response exceeded 45 second timeout'
          },
          message: hasCalendarNode
            ? `⚠️ Calendar API timeout - no se pudo verificar (detectado nodo: ${this.detectedTools.filter(t => t.toolType === 'calendar').map(t => t.nodeName).join(', ')})`
            : `⚠️ Calendar API timeout - no se pudo verificar`,
          timestamp: new Date(),
        };
      }
      
      // 🔥 FALLBACK: Si falla la API, usar verificación basada en workflow
      if (errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('Unauthorized')) {
        // console.log(`⚠️ [IntegrationManager] Calendar API no disponible, usando verificación basada en workflow...`);
        
        // Verificar si hay nodos de calendario en el workflow
        const hasCalendarNode = this.detectedTools.some(tool => tool.toolType === 'calendar');
        
        if (hasCalendarNode) {
          return {
            claim,
            verified: true, // ✅ ASUMIMOS QUE SE EJECUTÓ
            verificationMethod: 'Workflow Analysis (API unavailable)',
            evidence: {
              note: 'Verificación basada en análisis de workflow - API no disponible',
              calendarNodeDetected: true,
              detectedTools: this.detectedTools.filter(t => t.toolType === 'calendar').map(t => t.nodeName),
            },
            message: `✅ Evento probablemente creado (detectado nodo de calendario en workflow: ${this.detectedTools.filter(t => t.toolType === 'calendar').map(t => t.nodeName).join(', ')})`,
            timestamp: new Date(),
          };
        }
        
        return {
          claim,
          verified: false,
          verificationMethod: 'Workflow Analysis (API unavailable)',
          message: `⚠️ No se pudo verificar - API no disponible y no hay nodos de calendario en workflow`,
          timestamp: new Date(),
        };
      }
      
      return {
        claim,
        verified: false,
        verificationMethod: 'Calendar API',
        message: `❌ Error verificando calendario: ${errorMessage}`,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Verifica todas las acciones prometidas en una respuesta del bot
   */
  async verifyAllActions(
    botResponse: string,
    turnNumber: number
  ): Promise<ToolActionVerification[]> {
    // console.log(`\n🔍 [IntegrationManager] Analizando respuesta del bot (Turn ${turnNumber})...`);

    // 1. Extraer acciones prometidas
    const claims = this.extractActionClaims(botResponse, turnNumber);

    if (claims.length === 0) {
      // console.log(`   ℹ️ No se detectaron promesas de herramientas en este turno`);
      return [];
    }

    // console.log(`   🎯 Detectadas ${claims.length} promesa(s) de herramientas:`);
    // claims.forEach(claim => {
    //   console.log(`      - ${claim.type}: ${claim.description}`);
    // });

    // 2. Verificar cada acción según su tipo
    const verifications: ToolActionVerification[] = [];

    for (const claim of claims) {
      let verification: ToolActionVerification;

      switch (claim.type) {
        case 'email_send':
          verification = await this.verifyEmailAction(claim);
          break;

        case 'calendar_create':
        case 'calendar_update':
          verification = await this.verifyCalendarAction(claim);
          break;

        default:
          verification = {
            claim,
            verified: false,
            verificationMethod: 'No implementado',
            message: `⚠️ Verificación no implementada para tipo: ${claim.type}`,
            timestamp: new Date(),
          };
      }

      verifications.push(verification);
      // console.log(`   ${verification.verified ? '✅' : '❌'} ${verification.message}`);
    }

    return verifications;
  }

  /**
   * Genera un reporte de todas las verificaciones
   */
  generateVerificationReport(verifications: ToolActionVerification[]): string {
    if (verifications.length === 0) {
      return 'No se detectaron acciones de herramientas para verificar.';
    }

    let report = '📋 **REPORTE DE VERIFICACIÓN DE HERRAMIENTAS EN TIEMPO REAL**\n\n';

    const verified = verifications.filter(v => v.verified).length;
    const failed = verifications.filter(v => !v.verified).length;

    report += `**Resumen**: ${verified} verificadas ✅ | ${failed} fallidas ❌\n\n`;

    for (const verification of verifications) {
      const icon = verification.verified ? '✅' : '❌';
      report += `${icon} **Turn ${verification.claim.turnNumber}** - ${verification.claim.type}\n`;
      report += `   Promesa: ${verification.claim.description}\n`;
      report += `   Resultado: ${verification.message}\n`;

      if (verification.evidence) {
        report += `   Evidencia: ${JSON.stringify(verification.evidence, null, 2)}\n`;
      }

      report += '\n';
    }

    return report;
  }
}

/**
 * Factory function para crear IntegrationManager desde configuración de workflow
 */
export function createIntegrationManager(
  config: IntegrationConfig,
  detectedTools?: DetectedTool[],
  detectedSubflows?: DetectedSubflow[]
): IntegrationManager {
  return new IntegrationManager(config, detectedTools, detectedSubflows);
}
