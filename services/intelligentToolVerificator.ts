/**
 * 🧠 Verificador Inteligente de Herramientas con Gemini AI
 * 
 * Analiza TODO EL CONTEXTO de la conversación para verificar que:
 * 1. Los precios ofrecidos coincidan con la BD de productos
 * 2. Los emails se enviaron al destinatario correcto con el contenido prometido
 * 3. Los datos guardados en BD sean coherentes con lo conversado
 * 4. Los bloqueos/desbloqueos se aplicaron según correspondía
 * 
 * USA GEMINI AI para entender el contexto completo y detectar discrepancias específicas
 */

import { GoogleGenAI } from "@google/genai";
import type { ExecutionStep } from '../types';
import type { DatabaseChange } from '../types';

const API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
const genAI = new GoogleGenAI({
  apiKey: API_KEY
});

export interface DetailedDiscrepancy {
  type: 'price_mismatch' | 'email_wrong_recipient' | 'email_not_sent' | 'data_inconsistent' | 'status_incorrect' | 'missing_action' | 'email_wrong_content' | 'hardcoded_data';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  expected: any;
  actual: any;
  context: string;
  evidence: string[];
  turnNumber: number;
}

export interface IntelligentVerificationResult {
  conversationId: string;
  discrepancies: DetailedDiscrepancy[];
  overallScore: number; // 0-10
  summary: string;
  detailedReport: string;
}

/**
 * Analiza la conversación completa y detecta discrepancias específicas
 */
export async function verifyConversationIntelligently(
  conversationId: string,
  conversationHistory: ExecutionStep[],
  databaseChanges: DatabaseChange[],
  databaseSnapshots: Map<number, any>,
  language: string
): Promise<IntelligentVerificationResult> {
  
  console.log(`\n🧠 [Intelligent Verification] Analizando conversación: ${conversationId}`);
  console.log(`   Turnos: ${conversationHistory.length}`);
  console.log(`   Cambios BD: ${databaseChanges.length}`);
  
  // 1. Construir contexto completo de la conversación
  const conversationContext = conversationHistory.map((step, idx) => {
    const userMsg = extractUserMessage(step.input);
    const botMsg = extractBotMessage(step.output);
    return `[Turno ${idx + 1}]\nUsuario: ${userMsg}\nBot: ${botMsg}`;
  }).join('\n\n');
  
  // 2. Extraer información clave de cambios en BD
  const dbContext = databaseChanges.map((change, idx) => {
    const recordStr = JSON.stringify(change.record, null, 2);
    return `[Cambio ${idx + 1}] ${change.type} en tabla "${change.table}":\n${recordStr}`;
  }).join('\n\n');
  
  // 3. Construir prompt para Gemini AI
  const prompt = `
Eres un auditor experto de sistemas de IA conversacional. Tu trabajo es analizar una conversación completa entre un usuario y un bot, junto con los cambios que se hicieron en la base de datos, para detectar DISCREPANCIAS ESPECÍFICAS.

# CONVERSACIÓN COMPLETA:
${conversationContext}

# CAMBIOS EN BASE DE DATOS:
${dbContext}

# TU TAREA:
Analiza minuciosamente y detecta TODAS las discrepancias específicas entre lo que el bot prometió y lo que realmente sucedió. Enfócate en:

## 1. PRECIOS DE PRODUCTOS
- ¿El bot mencionó precios de productos?
- ¿Los precios mencionados coinciden con los datos guardados en BD?
- ¿Hay sobrevaluación o subvaluación?

## 2. EMAILS
- ¿El bot prometió enviar un email?
- ¿A qué dirección dijo que lo enviaría?
- ¿Se registró el envío en la BD?
- ¿El destinatario en BD coincide con el prometido?
- ¿El asunto/contenido es coherente con lo prometido?

## 3. DATOS GUARDADOS
- ¿Los datos guardados en BD son coherentes con lo que el usuario dijo?
- Ej: Si el usuario dijo "me llamo Juan", ¿se guardó "Juan" o algo distinto?
- ¿Hay campos con valores incorrectos, vacíos o contradictorios?
- **CRÍTICO - DATOS HARDCODEADOS**: ¿Se guardaron datos que NUNCA fueron mencionados en la conversación?
  * Ej: Si se guardó un email pero el usuario NUNCA lo mencionó → discrepancia crítica
  * Ej: Si se guardó un teléfono pero el usuario NUNCA lo dio → discrepancia crítica
  * Ej: Si se guardó un nombre específico pero el bot nunca lo preguntó → discrepancia crítica
  * Estos son datos HARDCODEADOS en el flujo que NO provienen de la conversación real
  * SIEMPRE es un error grave: el bot debe recolectar datos, no inventarlos

## 4. ESTADOS Y BLOQUEOS
- ¿El bot mencionó bloquear/desbloquear al usuario?
- ¿El campo "is_blocked" o similar cambió correctamente?
- ¿El estado final es coherente con la conversación?

## 5. ACCIONES FALTANTES
- ¿El bot prometió hacer algo que NO se refleja en los cambios de BD?
- ¿Hay promesas no cumplidas?

Devuelve un JSON con el siguiente formato:
{
  "discrepancies": [
    {
      "type": "price_mismatch" | "email_wrong_recipient" | "email_not_sent" | "data_inconsistent" | "status_incorrect" | "missing_action" | "email_wrong_content" | "hardcoded_data",
      "severity": "critical" | "high" | "medium" | "low",
      "title": "Título corto y descriptivo",
      "description": "Descripción detallada de la discrepancia",
      "expected": "Valor o acción esperada según la conversación",
      "actual": "Valor o acción que realmente ocurrió",
      "context": "Contexto específico de la conversación que muestra la discrepancia",
      "evidence": ["Lista", "de", "evidencias", "específicas"],
      "turnNumber": 5
    }
  ],
  "overallScore": 7.5,
  "summary": "Resumen ejecutivo de 2-3 líneas sobre el desempeño del bot",
  "detailedReport": "Reporte detallado en formato markdown con todas las observaciones"
}

IMPORTANTE:
- Si NO encuentras discrepancias, devuelve array vacío en "discrepancies"
- Sé ESPECÍFICO: no digas "error en datos", di "guardó nombre 'Pedro' cuando usuario dijo 'Juan'"
- **USA type="hardcoded_data"** cuando encuentres datos en BD que NUNCA fueron mencionados en la conversación
- Incluye números, valores exactos, y citas textuales
- Severity: "critical" = falla que rompe funcionalidad (incluye hardcoded_data), "high" = error grave pero no crítico, "medium" = problema menor, "low" = sugerencia
- overallScore: 10 = perfecto, 8-9 = muy bien con detalles menores, 6-7 = bien pero con errores, 4-5 = regular con problemas, 0-3 = mal desempeño

${language === 'es' ? 'RESPONDE EN ESPAÑOL' : 'RESPOND IN ENGLISH'}
`;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });
    
    const responseText = response.text;
    const analysis = JSON.parse(responseText);
    
    console.log(`   ✅ Análisis completado`);
    console.log(`   Discrepancias encontradas: ${analysis.discrepancies.length}`);
    console.log(`   Score general: ${analysis.overallScore}/10`);
    
    return {
      conversationId,
      discrepancies: analysis.discrepancies,
      overallScore: analysis.overallScore,
      summary: analysis.summary,
      detailedReport: analysis.detailedReport
    };
    
  } catch (error) {
    console.error(`   ❌ Error en análisis inteligente:`, error);
    return {
      conversationId,
      discrepancies: [],
      overallScore: 0,
      summary: `Error al analizar: ${error}`,
      detailedReport: `Error al realizar verificación inteligente: ${error}`
    };
  }
}

/**
 * Extrae el mensaje del usuario del step
 */
function extractUserMessage(input: any): string {
  if (typeof input === 'string') return input;
  if (input?.text) return input.text;
  if (input?.input) return input.input;
  if (input?.message) return input.message;
  return JSON.stringify(input);
}

/**
 * Extrae el mensaje del bot del step
 */
function extractBotMessage(output: any): string {
  if (typeof output === 'string') return output;
  if (output?.text) return output.text;
  if (output?.output) return output.output;
  if (output?.message) return output.message;
  if (output?.response) return output.response;
  if (output?.respuesta?.parte1 || output?.respuesta?.parte2 || output?.respuesta?.parte3) {
    return `${output.respuesta.parte1 || ''} ${output.respuesta.parte2 || ''} ${output.respuesta.parte3 || ''}`.trim();
  }
  return JSON.stringify(output);
}

/**
 * Genera un reporte HTML con las discrepancias
 */
export function generateDiscrepanciesReport(verification: IntelligentVerificationResult, language: string): string {
  const lang = language === 'es' ? {
    title: 'Verificación Inteligente',
    score: 'Puntuación',
    summary: 'Resumen',
    discrepancies: 'Discrepancias Detectadas',
    noDiscrepancies: '✅ No se detectaron discrepancias. El bot funcionó correctamente.',
    type: 'Tipo',
    severity: 'Severidad',
    turn: 'Turno',
    expected: 'Esperado',
    actual: 'Real',
    evidence: 'Evidencia',
    context: 'Contexto'
  } : {
    title: 'Intelligent Verification',
    score: 'Score',
    summary: 'Summary',
    discrepancies: 'Detected Discrepancies',
    noDiscrepancies: '✅ No discrepancies detected. Bot worked correctly.',
    type: 'Type',
    severity: 'Severity',
    turn: 'Turn',
    expected: 'Expected',
    actual: 'Actual',
    evidence: 'Evidence',
    context: 'Context'
  };
  
  let html = `
<div style="background: #1e293b; color: #e2e8f0; padding: 20px; border-radius: 8px; margin: 20px 0;">
  <h3 style="color: #60a5fa; margin-top: 0;">🧠 ${lang.title}</h3>
  
  <div style="background: #0f172a; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
    <div style="font-size: 18px; font-weight: bold; color: ${verification.overallScore >= 8 ? '#10b981' : verification.overallScore >= 6 ? '#f59e0b' : '#ef4444'};">
      ${lang.score}: ${verification.overallScore.toFixed(1)}/10
    </div>
    <div style="margin-top: 10px; color: #cbd5e1;">${verification.summary}</div>
  </div>
`;

  if (verification.discrepancies.length === 0) {
    html += `<div style="background: #064e3b; color: #6ee7b7; padding: 15px; border-radius: 6px; border-left: 4px solid #10b981;">
      ${lang.noDiscrepancies}
    </div>`;
  } else {
    html += `<h4 style="color: #f87171; margin-bottom: 15px;">⚠️ ${lang.discrepancies} (${verification.discrepancies.length})</h4>`;
    
    verification.discrepancies.forEach((disc, idx) => {
      const severityColor = {
        critical: '#dc2626',
        high: '#ea580c',
        medium: '#f59e0b',
        low: '#84cc16'
      }[disc.severity];
      
      const typeEmoji = {
        price_mismatch: '💰',
        email_wrong_recipient: '📧',
        email_not_sent: '❌',
        data_inconsistent: '🔄',
        status_incorrect: '🚫',
        missing_action: '⚠️',
        email_wrong_content: '📝',
        hardcoded_data: '🔧'
      }[disc.type] || '⚠️';
      
      html += `
<div style="background: #0f172a; padding: 15px; border-radius: 6px; margin-bottom: 15px; border-left: 4px solid ${severityColor};">
  <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
    <div>
      <span style="font-size: 20px;">${typeEmoji}</span>
      <strong style="color: ${severityColor}; margin-left: 8px;">${disc.title}</strong>
    </div>
    <div style="display: flex; gap: 10px; font-size: 12px;">
      <span style="background: ${severityColor}; color: white; padding: 2px 8px; border-radius: 4px;">${disc.severity.toUpperCase()}</span>
      <span style="background: #1e293b; color: #94a3b8; padding: 2px 8px; border-radius: 4px;">${lang.turn} ${disc.turnNumber}</span>
    </div>
  </div>
  
  <div style="color: #cbd5e1; margin-bottom: 12px;">${disc.description}</div>
  
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
    <div style="background: #1e293b; padding: 10px; border-radius: 4px;">
      <div style="color: #94a3b8; font-size: 12px; margin-bottom: 4px;">${lang.expected}:</div>
      <code style="color: #10b981; font-size: 13px;">${typeof disc.expected === 'string' ? disc.expected : JSON.stringify(disc.expected)}</code>
    </div>
    <div style="background: #1e293b; padding: 10px; border-radius: 4px;">
      <div style="color: #94a3b8; font-size: 12px; margin-bottom: 4px;">${lang.actual}:</div>
      <code style="color: #ef4444; font-size: 13px;">${typeof disc.actual === 'string' ? disc.actual : JSON.stringify(disc.actual)}</code>
    </div>
  </div>
  
  ${disc.context ? `
  <div style="background: #1e293b; padding: 10px; border-radius: 4px; margin-bottom: 10px;">
    <div style="color: #94a3b8; font-size: 12px; margin-bottom: 4px;">${lang.context}:</div>
    <div style="color: #e2e8f0; font-size: 13px; font-style: italic;">"${disc.context}"</div>
  </div>
  ` : ''}
  
  ${disc.evidence.length > 0 ? `
  <div style="background: #1e293b; padding: 10px; border-radius: 4px;">
    <div style="color: #94a3b8; font-size: 12px; margin-bottom: 6px;">${lang.evidence}:</div>
    <ul style="margin: 0; padding-left: 20px; color: #cbd5e1; font-size: 13px;">
      ${disc.evidence.map(e => `<li>${e}</li>`).join('')}
    </ul>
  </div>
  ` : ''}
</div>`;
    });
  }
  
  html += `
  <div style="background: #0f172a; padding: 15px; border-radius: 6px; margin-top: 20px;">
    <h4 style="color: #60a5fa; margin-top: 0; margin-bottom: 10px;">📋 Reporte Detallado</h4>
    <div style="color: #cbd5e1; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${verification.detailedReport}</div>
  </div>
</div>`;
  
  return html;
}
