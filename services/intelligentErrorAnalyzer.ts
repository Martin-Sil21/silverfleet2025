import { GoogleGenAI } from "@google/genai";
import { getRealDatabaseAuditor } from './realDatabaseAuditor';
import type { ExecutionStep } from '../types';

/**
 * Analizador Inteligente de Errores
 * 
 * Cuando un webhook falla o devuelve vacío, NO asume que es un error.
 * En lugar de eso:
 * 1. Consulta la base de datos
 * 2. Analiza el historial de conversación
 * 3. Usa Gemini AI para determinar si fue intencional
 * 4. Decide si es un error real o comportamiento esperado (ej: bloqueo de usuario)
 */

interface ErrorContext {
  webhookResponse: any;
  webhookError?: string;
  conversationHistory: ExecutionStep[];
  lastBotMessage?: string;
  lastUserMessage?: string;
  conversationId: string;
  userId?: string;
}

interface ErrorAnalysisResult {
  isRealError: boolean;
  actualStatus: 'ERROR' | 'SUCCESS' | 'USER_BLOCKED' | 'INTENTIONAL_END';
  reason: string;
  evidence: string[];
  recommendations?: string[];
}

/**
 * Analiza si un error de webhook es realmente un error o comportamiento esperado
 */
export async function analyzeWebhookError(context: ErrorContext): Promise<ErrorAnalysisResult> {
  console.log(`\n🔍 [Error Analyzer] Analizando error de webhook...`);
  console.log(`   Error: ${context.webhookError || 'Respuesta vacía'}`);
  
  const evidence: string[] = [];
  
  // 1. Consultar base de datos para verificar bloqueo
  const auditor = getRealDatabaseAuditor(context.conversationId);
  let isBlockedInDB = false;
  
  if (auditor && context.userId) {
    try {
      isBlockedInDB = !(await auditor.verifyNotBlocked(context.userId, 'post-error check'));
      if (isBlockedInDB) {
        evidence.push('BD: Usuario tiene is_blocked = true');
        console.log(`   ✅ BD confirma: Usuario bloqueado`);
      }
    } catch (error) {
      console.log(`   ⚠️ No se pudo verificar estado en BD`);
    }
  }
  
  // 2. Analizar último mensaje del bot
  const lastBotMsg = context.lastBotMessage?.toLowerCase() || '';
  const blockingPhrases = [
    'no puedo ayudarte',
    'no puedo continuar',
    'conversación finalizada',
    'debes contactar',
    'hablar con un humano',
    'transferir',
    'derivar',
    'lo siento, no puedo'
  ];
  
  const botIndicatesBlocking = blockingPhrases.some(phrase => lastBotMsg.includes(phrase));
  if (botIndicatesBlocking) {
    evidence.push(`Bot dijo: "${context.lastBotMessage?.substring(0, 100)}..."`);
    console.log(`   ✅ Bot indica bloqueo en su mensaje`);
  }
  
  // 3. Analizar contexto con Gemini AI
  const aiAnalysis = await analyzeWithAI(context, evidence);
  
  // 4. Determinar conclusión
  if (isBlockedInDB && botIndicatesBlocking) {
    return {
      isRealError: false,
      actualStatus: 'USER_BLOCKED',
      reason: 'El bot bloqueó intencionalmente al usuario. Esto NO es un error.',
      evidence: [...evidence, aiAnalysis.reasoning],
      recommendations: [
        'Verificar criterios de bloqueo en el flujo',
        'Confirmar que el bloqueo fue apropiado según las reglas de negocio'
      ]
    };
  }
  
  if (isBlockedInDB || botIndicatesBlocking) {
    return {
      isRealError: false,
      actualStatus: 'INTENTIONAL_END',
      reason: 'El flujo finalizó intencionalmente (bloqueo o transferencia)',
      evidence: [...evidence, aiAnalysis.reasoning],
      recommendations: []
    };
  }
  
  // Si no hay evidencia de bloqueo intencional, es un error real
  return {
    isRealError: true,
    actualStatus: 'ERROR',
    reason: aiAnalysis.reasoning,
    evidence,
    recommendations: [
      'Revisar logs del webhook para entender el error',
      'Verificar conectividad y configuración del endpoint',
      'Validar que el flujo de n8n esté respondiendo correctamente'
    ]
  };
}

/**
 * Usa Gemini AI para analizar el contexto completo
 */
async function analyzeWithAI(context: ErrorContext, evidence: string[]): Promise<{ reasoning: string }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const conversationSummary = context.conversationHistory
    .map((step, idx) => {
      const userMsg = typeof step.input === 'string' ? step.input : JSON.stringify(step.input);
      const botMsg = typeof step.output === 'string' ? step.output : JSON.stringify(step.output);
      return `Turno ${idx + 1}:\nUsuario: ${userMsg}\nBot: ${botMsg}`;
    })
    .join('\n\n');
  
  const prompt = `
Eres un analista experto en sistemas de IA conversacional.

**CONTEXTO:**
Un webhook devolvió vacío o error, pero ANTES de marcarlo como error técnico,
necesito que analices si fue INTENCIONAL (ej: bot bloqueó al usuario).

**CONVERSACIÓN COMPLETA:**
${conversationSummary}

**ÚLTIMO MENSAJE DEL BOT:**
"${context.lastBotMessage || 'N/A'}"

**ÚLTIMO MENSAJE DEL USUARIO:**
"${context.lastUserMessage || 'N/A'}"

**ERROR DEL WEBHOOK:**
${context.webhookError || 'Respuesta vacía'}

**EVIDENCIA RECOPILADA:**
${evidence.join('\n')}

**TU TAREA:**
Determina si el webhook devolvió vacío porque:
A) El bot INTENCIONALMENTE bloqueó/finalizó la conversación (NO es error)
B) Hubo un ERROR TÉCNICO real

**SEÑALES DE BLOQUEO INTENCIONAL:**
- Bot dice "no puedo ayudarte", "conversación finalizada", etc.
- Base de datos muestra is_blocked = true
- Contexto indica que el usuario hizo algo fuera de política
- Bot derivó a humano o cerró el chat

**SEÑALES DE ERROR TÉCNICO:**
- Conversación iba bien y se cortó de repente
- Bot no indicó finalización
- Base de datos NO muestra bloqueo
- Error de timeout o conectividad

**RESPONDE:**
En 1-2 líneas, ¿es bloqueo intencional o error técnico? ¿Por qué?
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: prompt,
    });
    
    const reasoning = response.text.trim();
    console.log(`   🤖 Gemini AI: ${reasoning.substring(0, 100)}...`);
    return { reasoning };
  } catch (error) {
    console.error(`   ❌ Error en análisis con AI:`, error);
    return { 
      reasoning: 'No se pudo analizar con AI. Basándose solo en evidencia disponible.' 
    };
  }
}

/**
 * Extrae el último mensaje del bot del historial
 */
export function extractLastBotMessage(history: ExecutionStep[]): string | undefined {
  if (history.length === 0) return undefined;
  
  const lastStep = history[history.length - 1];
  
  if (typeof lastStep.output === 'string') {
    return lastStep.output;
  }
  
  if (typeof lastStep.output === 'object' && lastStep.output !== null) {
    // Buscar campos comunes de respuesta
    const commonFields = ['response', 'message', 'text', 'output', 'reply', 'answer'];
    for (const field of commonFields) {
      if (lastStep.output[field] && typeof lastStep.output[field] === 'string') {
        return lastStep.output[field];
      }
    }
    
    // Si no encuentra, convertir a JSON
    return JSON.stringify(lastStep.output);
  }
  
  return undefined;
}

/**
 * Extrae el último mensaje del usuario
 */
export function extractLastUserMessage(history: ExecutionStep[]): string | undefined {
  if (history.length === 0) return undefined;
  
  const lastStep = history[history.length - 1];
  
  if (typeof lastStep.input === 'string') {
    return lastStep.input;
  }
  
  if (typeof lastStep.input === 'object' && lastStep.input !== null) {
    const commonFields = ['input', 'message', 'text', 'query', 'prompt'];
    for (const field of commonFields) {
      if (lastStep.input[field] && typeof lastStep.input[field] === 'string') {
        return lastStep.input[field];
      }
    }
    
    return JSON.stringify(lastStep.input);
  }
  
  return undefined;
}


