/**
 * 🎯 Audit Context Analyzer
 * 
 * Análisis correlativo final de auditoría:
 * 1. Lo que el bot PROMETIÓ en cada turno
 * 2. Lo que REALMENTE pasó (verificaciones, BD, emails)
 * 3. Correlación: ¿Promesa → Ejecución → BD → Evidencia?
 * 
 * Resultado: Reporte ejecutivo que justifica nuestra tarifa
 */

import type { AuditResult, ExecutionStep } from '../types';
import type { ToolVerificationResult } from './toolVerificator';
import { GoogleGenAI } from '@google/genai';
import { costTracker } from './costTracker';

export interface PromiseEntry {
  turnNumber: number;
  description: string;
  toolType?: string;
  executed: boolean;
  evidence?: string;
  dbImpact?: {
    table: string;
    operation: string;
    fields: string[];
  };
  emailContent?: {
    recipient: string;
    subject?: string;
    body?: string;
    matchScore?: number;
  };
}

export interface ContextualAnalysis {
  conversationId: string;
  totalPromises: number;
  promisesKept: number;
  promisesBroken: number;
  keepRate: number; // 0-1
  correlations: {
    promiseToExecution: number; // % donde la promesa se ejecutó
    executionToDb: number; // % donde la ejecución afectó BD
    dbToEmail: number; // % donde la BD refleja lo del email
    overallChain: number; // % de cadena completa
  };
  promises: PromiseEntry[];
  criticalFailures: string[];
  strengths: string[];
  recommendations: string[];
  executiveSummary: string;
  tariffJustification: string;
}

/**
 * Extrae promesas del historial de conversación
 * 🔥 MEJORADO: Detecta promesas en texto narrativo Y en JSON estructurado
 */
export function extractPromisesFromConversation(
  executionTrace: ExecutionStep[]
): PromiseEntry[] {
  const promises: PromiseEntry[] = [];

  executionTrace.forEach((turn, idx) => {
    // Convertir output a string para búsqueda
    const agentResponse = typeof turn.output === 'string' 
      ? turn.output 
      : JSON.stringify(turn.output);

    // 🔍 ESTRATEGIA 1: Buscar promesas explícitas ESPECÍFICAS de herramientas externas
    // 🔥 CONSERVADOR: Solo detectar cuando el bot promete EJECUTAR una acción externa verificable
    const promisePatterns = [
      { 
        // Detectar "enviaré correo", "voy a enviar email", "te enviaré un correo"
        regex: /(?:voy\s+a\s+)?(?:te\s+)?enviar(é|emos)?\s+(?:un\s+)?(?:email|correo)(?!\s*con\s*(?:la\s*)?(?:propuesta|opciones))/gi,
        type: 'email_send',
        desc: 'Enviar email de confirmación'
      },
      {
        // Detectar "crearé evento", "voy a crear cita", "agendaré en calendario"
        regex: /(?:voy\s+a\s+)?(?:crear|agendar)(é|emos)?\s+(?:un\s+)?(?:evento|cita)(?:\s+en\s+(?:el\s+)?calendario)?/gi,
        type: 'calendar_create',
        desc: 'Crear evento en calendario'
      },
      {
        // Detectar "enviaré SMS", "voy a enviar whatsapp"
        regex: /(?:voy\s+a\s+)?(?:enviar|mandar)(é|emos)?\s+(?:un\s+)?(?:sms|mensaje\s+de\s+texto|whatsapp)/gi,
        type: 'sms_send',
        desc: 'Enviar SMS/WhatsApp'
      },
      {
        // Detectar "actualizaré CRM", "voy a actualizar el CRM"
        regex: /(?:voy\s+a\s+)?actualizar(é|emos)?\s+(?:el\s+)?crm/gi,
        type: 'crm_update',
        desc: 'Actualizar CRM'
      },
    ];

    for (const pattern of promisePatterns) {
      let match;
      const regex = new RegExp(pattern.regex);
      while ((match = regex.exec(agentResponse)) !== null) {
        promises.push({
          turnNumber: idx + 1,
          description: pattern.desc,
          toolType: pattern.type,
          executed: false, // Se llenará después
          evidence: undefined,
        });
      }
    }
    
    // 🔥 ESTRATEGIA 2: Detectar promesas implícitas en JSON estructurado
    // Si el bot está guardando opciones, precios, o datos del cliente, eso es una "promesa de registro"
    if (typeof turn.output === 'object' && turn.output !== null) {
      const output = turn.output as any;
      
      // Detectar si el bot ofreció opciones/planes (promesa de propuesta comercial)
      if (output.opciones || output.options || output.planes || output.plans) {
        promises.push({
          turnNumber: idx + 1,
          description: 'Presentar opciones comerciales',
          toolType: 'business_proposal',
          executed: true, // Ya se ejecutó al presentar opciones
          evidence: 'Opciones presentadas en JSON estructurado',
        });
      }
      
      // Detectar si el bot guardó información del cliente (promesa de registro)
      if (output.cliente || output.customer || output.contacto || output.contact) {
        promises.push({
          turnNumber: idx + 1,
          description: 'Guardar información del cliente',
          toolType: 'database_save',
          executed: false, // Se verificará con BD
          evidence: undefined,
        });
      }
      
      // Detectar si el bot mencionó seguimiento/próximos pasos
      if (output.proximoPaso || output.nextStep || output.followUp) {
        promises.push({
          turnNumber: idx + 1,
          description: 'Definir próximos pasos',
          toolType: 'follow_up',
          executed: true,
          evidence: 'Próximo paso definido en respuesta',
        });
      }
    }
  });

  // 🔥 ESTRATEGIA 3: Si no se detectaron promesas explícitas pero hay turnos,
  // agregar una promesa genérica de "mantener conversación coherente"
  if (promises.length === 0 && executionTrace.length > 0) {
    promises.push({
      turnNumber: executionTrace.length,
      description: 'Mantener conversación coherente y guiar al usuario',
      toolType: 'conversation_management',
      executed: true,
      evidence: `Conversación de ${executionTrace.length} turnos completada`,
    });
  }

  return promises;
}

/**
 * Correlaciona promesas con verificaciones de herramientas
 */
export function correlatePromisesWithVerifications(
  promises: PromiseEntry[],
  toolVerifications: ToolVerificationResult[]
): PromiseEntry[] {
  const updated = [...promises];

  // Aplanar todas las verificaciones
  const allVerifications: any[] = [];
  toolVerifications.forEach(turnResult => {
    if (turnResult?.verifications && Array.isArray(turnResult.verifications)) {
      turnResult.verifications.forEach(v => {
        allVerifications.push({ ...v, turnNumber: turnResult.turnNumber });
      });
    }
  });

  // Correlacionar
  updated.forEach(promise => {
    const matchingVerification = allVerifications.find(v =>
      v.turnNumber === promise.turnNumber &&
      (v.toolType === promise.toolType || v.toolName.toLowerCase().includes(promise.toolType?.split('_')[0] || ''))
    );

    if (matchingVerification) {
      promise.executed = matchingVerification.verdict === 'VERIFIED';
      promise.evidence = matchingVerification.details;
      
      if (matchingVerification.recipients) {
        promise.emailContent = {
          recipient: matchingVerification.recipients[0] || 'N/A',
          subject: matchingVerification.subject,
          body: matchingVerification.body,
          matchScore: matchingVerification.matchScore,
        };
      }
    }
  });

  return updated;
}

/**
 * Correlaciona con cambios en BD
 */
export function correlateWithDatabaseChanges(
  promises: PromiseEntry[],
  databaseActivity?: any
): PromiseEntry[] {
  const updated = [...promises];

  if (!databaseActivity?.changes || databaseActivity.changes.length === 0) {
    return updated;
  }

  // Para cada promesa, buscar cambios en BD que correspondan
  updated.forEach(promise => {
    if (promise.executed) {
      // Si era un "save" o "update", debe haber cambios
      if (promise.toolType?.includes('database') || promise.toolType?.includes('crm')) {
        const relevantChanges = databaseActivity.changes.filter((change: any) =>
          change.timestamp >= promise.turnNumber // Simplificado - asumir orden cronológico
        );

        if (relevantChanges.length > 0) {
          const change = relevantChanges[0];
          promise.dbImpact = {
            table: change.table,
            operation: change.type,
            fields: change.after ? Object.keys(change.after) : [],
          };
        }
      }
    }
  });

  return updated;
}

/**
 * Genera análisis contextual completo
 */
/**
 * 🔥 NUEVO: Extrae todos los identificadores únicos de una conversación
 * para filtrar cambios de BD que pertenecen solo a esta conversación
 */
export function extractConversationIdentifiers(auditResult: AuditResult): string[] {
  const identifiers = new Set<string>();
  
  // Agregar IDs principales
  identifiers.add(auditResult.id);
  identifiers.add(auditResult.testCase.id);
  
  // Extraer identificadores del payload inicial
  const payload = auditResult.testCase.initialPayload;
  if (payload) {
    // Campos comunes de identificación
    const idFields = [
      'conversationId', 'conversation_id',
      'sessionId', 'session_id', 'session',
      'phone', 'telefono', 'telefonos', 'celular', 'cel',
      'email', 'correo',
      'userId', 'user_id', 'cliente_id',
      'chatId', 'chat_id'
    ];
    
    for (const field of idFields) {
      if (payload[field]) {
        const value = String(payload[field]);
        if (value && value.length > 0) {
          identifiers.add(value);
        }
      }
    }
    
    // Buscar cualquier campo que parezca un ID
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'string' || typeof value === 'number') {
        const valueStr = String(value);
        // IDs típicamente tienen: longitud 8-50, sin espacios, caracteres especiales
        const looksLikeId = (
          valueStr.length >= 8 &&
          valueStr.length < 100 &&
          !valueStr.includes(' ') &&
          !key.toLowerCase().includes('message') &&
          !key.toLowerCase().includes('text') &&
          !key.toLowerCase().includes('content')
        );
        
        if (looksLikeId) {
          identifiers.add(valueStr);
        }
      }
    }
  }
  
  // Extraer identificadores de los steps ejecutados (webhooks pueden devolver IDs)
  for (const step of auditResult.executionTrace) {
    if (step.output && typeof step.output === 'object') {
      const outputStr = JSON.stringify(step.output);
      
      // Buscar patrones comunes de IDs en la respuesta
      const sessionIdMatch = outputStr.match(/"(?:session|conversation)(?:Id|_id)"\s*:\s*"([^"]+)"/);
      if (sessionIdMatch) {
        identifiers.add(sessionIdMatch[1]);
      }
    }
  }
  
  return Array.from(identifiers);
}

export async function generateContextualAnalysis(
  auditResult: AuditResult,
  toolVerifications?: ToolVerificationResult[],
  language: string = 'es'
): Promise<ContextualAnalysis> {
  // 1. Extraer promesas
  let promises = extractPromisesFromConversation(auditResult.executionTrace);

  // 2. Correlacionar con verificaciones
  if (toolVerifications && toolVerifications.length > 0) {
    promises = correlatePromisesWithVerifications(promises, toolVerifications);
  }

  // 3. 🔥 FILTRAR cambios de BD para SOLO esta conversación antes de correlacionar
  let filteredDatabaseActivity = auditResult.databaseActivity;
  if (auditResult.databaseActivity && auditResult.databaseActivity.changes) {
    const conversationId = auditResult.id;
    const conversationIdentifiers = extractConversationIdentifiers(auditResult);
    
    console.log(`\n🔍 [ContextAnalyzer] Filtrando cambios de BD para conversación: ${conversationId}`);
    console.log(`   Identificadores de esta conversación:`, conversationIdentifiers);
    console.log(`   Cambios totales en BD: ${auditResult.databaseActivity.changes.length}`);
    
    const filteredChanges = auditResult.databaseActivity.changes.filter(change => {
      const recordStr = JSON.stringify(change.record).toLowerCase();
      
      // Verificar si el cambio contiene algún identificador de esta conversación
      const belongsToConversation = conversationIdentifiers.some(identifier => 
        recordStr.includes(identifier.toLowerCase())
      );
      
      return belongsToConversation;
    });
    
    console.log(`   Cambios filtrados (solo de esta conversación): ${filteredChanges.length}`);
    
    filteredDatabaseActivity = {
      ...auditResult.databaseActivity,
      changes: filteredChanges
    };
  }

  // 4. Correlacionar con BD filtrada
  if (filteredDatabaseActivity) {
    promises = correlateWithDatabaseChanges(promises, filteredDatabaseActivity);
  }

  // Contar métricas
  const promisesKept = promises.filter(p => p.executed).length;
  const keepRate = promises.length > 0 ? promisesKept / promises.length : 0;

  // Calcular correlaciones
  const correlations = {
    promiseToExecution: promisesKept / Math.max(promises.length, 1),
    executionToDb: promises.filter(p => p.executed && p.dbImpact).length / Math.max(promises.filter(p => p.executed).length, 1),
    dbToEmail: promises.filter(p => p.executed && p.emailContent && p.dbImpact).length / Math.max(promises.filter(p => p.executed).length, 1),
    overallChain: promises.filter(p => p.executed && (p.dbImpact || p.emailContent)).length / Math.max(promises.length, 1),
  };

  // Identificar fortalezas y debilidades
  const criticalFailures: string[] = [];
  const strengths: string[] = [];

  promises.forEach(p => {
    if (!p.executed && (p.toolType === 'email_send' || p.toolType === 'calendar_create')) {
      criticalFailures.push(`Fallo crítico en turno ${p.turnNumber}: No se ejecutó "${p.description}"`);
    }
    if (p.executed && p.dbImpact && p.emailContent) {
      strengths.push(`Turno ${p.turnNumber}: "${p.description}" ejecutado correctamente con trazabilidad completa`);
    }
  });

  // Usar Gemini para generar resumen ejecutivo
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const analysisPrompt = `Eres un auditor experto. Analiza los siguientes datos de auditoría de un agente de IA y genera un resumen ejecutivo y justificación de tarifa.

PROMESAS DEL AGENTE:
${promises.map(p => `- Turn ${p.turnNumber}: ${p.description} | Ejecutado: ${p.executed ? '✅' : '❌'} | Evidencia: ${p.evidence || 'N/A'}`).join('\n')}

MÉTRICAS:
- Tasa de cumplimiento: ${(keepRate * 100).toFixed(1)}%
- Cadena completa (Promesa→Ejecución→BD→Email): ${(correlations.overallChain * 100).toFixed(1)}%
- Promesas mantuvidas: ${promisesKept}/${promises.length}

CAMBIOS EN BD: ${filteredDatabaseActivity?.totalOperations || 0} operaciones (filtradas para esta conversación)

Tu tarea:
1. Generar un resumen ejecutivo (2-3 párrafos) explicando qué tan confiable fue el agente
2. Generar una justificación de tarifa (1 párrafo) explicando por qué vale la pena pagar por esta auditoría

Formato: JSON con claves "executiveSummary" y "tariffJustification"
${language === 'es' ? 'Responde en español.' : 'Respond in English.'}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: analysisPrompt,
      config: {
        temperature: 0.7,
        responseMimeType: 'application/json',
      }
    });

    const parsed = JSON.parse(response.text);
    
    // Track cost
    if (response.usageMetadata) {
      costTracker.recordUsage({
        promptTokens: response.usageMetadata.promptTokenCount || 0,
        responseTokens: response.usageMetadata.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata.totalTokenCount || 0,
        model: 'gemini-2.5-flash',
        operation: 'contextual_analysis',
        conversationId: auditResult.testCase.id,
      });
    }

    return {
      conversationId: auditResult.testCase.id,
      totalPromises: promises.length,
      promisesKept,
      promisesBroken: promises.length - promisesKept,
      keepRate,
      correlations,
      promises,
      criticalFailures,
      strengths,
      recommendations: [
        ...(keepRate < 0.7 ? ['❌ Mejorar tasa de ejecución de promesas'] : []),
        ...(correlations.overallChain < 0.8 ? ['⚠️ Mejorar trazabilidad: no todas las acciones se reflejan en BD'] : []),
        ...criticalFailures.slice(0, 2), // Top 2 critical failures as recommendations
      ],
      executiveSummary: parsed.executiveSummary || '',
      tariffJustification: parsed.tariffJustification || '',
    };
  } catch (error) {
    console.error('[ContextualAnalyzer] Error generating summary:', error);
    
    return {
      conversationId: auditResult.testCase.id,
      totalPromises: promises.length,
      promisesKept,
      promisesBroken: promises.length - promisesKept,
      keepRate,
      correlations,
      promises,
      criticalFailures,
      strengths,
      recommendations: criticalFailures.slice(0, 2),
      executiveSummary: `El agente cumplió ${(keepRate * 100).toFixed(0)}% de sus promesas. Cadena completa: ${(correlations.overallChain * 100).toFixed(0)}%.`,
      tariffJustification: 'Esta auditoría proporciona evidencia detallada de la confiabilidad del agente, permitiendo tomar decisiones informadas sobre su despliegue en producción.',
    };
  }
}

/**
 * Formatea el análisis para mostrar en reporte
 */
export function formatContextualAnalysisForReport(analysis: ContextualAnalysis): string {
  return `
📊 ANÁLISIS CONTEXTUAL DE AUDITORÍA
====================================

🎯 MÉTRICAS GENERALES:
- Total de promesas: ${analysis.totalPromises}
- Cumplidas: ${analysis.promisesKept} (${(analysis.keepRate * 100).toFixed(1)}%)
- Incumplidas: ${analysis.promisesBroken}

🔗 CORRELACIONES:
- Promesa → Ejecución: ${(analysis.correlations.promiseToExecution * 100).toFixed(1)}%
- Ejecución → BD: ${(analysis.correlations.executionToDb * 100).toFixed(1)}%
- BD ↔ Email: ${(analysis.correlations.dbToEmail * 100).toFixed(1)}%
- CADENA COMPLETA: ${(analysis.correlations.overallChain * 100).toFixed(1)}%

💪 FORTALEZAS:
${analysis.strengths.map(s => `✅ ${s}`).join('\n')}

⚠️ PUNTOS CRÍTICOS:
${analysis.criticalFailures.map(f => `❌ ${f}`).join('\n')}

📋 RESUMEN EJECUTIVO:
${analysis.executiveSummary}

💰 JUSTIFICACIÓN DE TARIFA:
${analysis.tariffJustification}
  `.trim();
}
