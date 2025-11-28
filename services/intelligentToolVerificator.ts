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
 * Extrae TODOS los valores de un objeto (recursivamente) para comparación flexible
 */
function extractAllValues(obj: any, depth: number = 0): string[] {
  if (depth > 3) return []; // Limitar profundidad para evitar loops
  
  const values: string[] = [];
  
  if (obj === null || obj === undefined) return values;
  
  // Si es un valor primitivo, agregarlo
  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
    values.push(String(obj));
    return values;
  }
  
  // Si es un objeto o array, recorrer recursivamente
  if (typeof obj === 'object') {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // Agregar valores anidados
        const nestedValues = extractAllValues(obj[key], depth + 1);
        values.push(...nestedValues);
      }
    }
  }
  
  return values.filter(v => v && v.length > 0); // Filtrar vacíos
}

/**
 * Analiza la conversación completa y detecta discrepancias específicas
 */
export async function verifyConversationIntelligently(
  conversationId: string,
  conversationHistory: ExecutionStep[],
  databaseChanges: DatabaseChange[],
  databaseSnapshots: Map<number, any>,
  language: string,
  initialPayload?: Record<string, any>
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
  
  // 3. Extraer contexto del payload inicial (datos legítimos del webhook)
  const payloadValues = initialPayload ? extractAllValues(initialPayload) : [];
  
  const payloadContext = initialPayload ? `
🔥 PAYLOAD INICIAL DEL WEBHOOK - DATOS LEGÍTIMOS:

**IMPORTANTE**: Este payload se envió en TODOS los turnos de la conversación (solo cambió el campo "body"/"message").
Por lo tanto, TODOS los datos de este payload son VÁLIDOS en CUALQUIER turno.

${JSON.stringify(initialPayload, null, 2)}

📋 LISTA DE VALORES VÁLIDOS DEL PAYLOAD:
${payloadValues.map(v => `- "${v}"`).join('\n')}

⚠️ REGLA SIMPLE Y CLARA:

✅ ES VÁLIDO (NO marcar error) si:
1. El valor está en la lista de arriba (da igual el nombre del campo)
2. Es una variación del payload (teléfono con/sin prefijo, mayúsculas, espacios)
3. Usuario lo mencionó en la conversación
4. Es dato técnico: ID numérico, timestamp, booleano, null
5. Es campo de identificación: sessionId, conversationId, session_id, conversation_id, id_conversacion, from, phone, etc.

❌ ES HARDCODED (marcar error) SOLO si:
- Es nombre propio COMPLETO que NO está en payload NI conversación (ej: "Juan Pérez")
- Es email COMPLETO que NO está en payload NI conversación (ej: "juan@test.com")
- Es frase/texto inventado que NO vino del usuario

🚫 IMPORTANTE - NO TE CONFUNDAS:
- Si ves "5491112345678" en BD y está en la lista de arriba → VÁLIDO (este dato viene del payload que se envió en CADA turno)
- Si ves "abc123" en BD y está en la lista de arriba → VÁLIDO (sessionId del payload, presente en CADA turno)
- Si ves "15234" → VÁLIDO (es un ID)
- Si ves "2024-11-26" → VÁLIDO (es timestamp)
- Si ves "true" o "false" → VÁLIDO (es booleano)
- Si es sessionId, conversationId, from, phone o similar → SIEMPRE VÁLIDO (identificadores del sistema que vienen del payload)

🎯 RECORDATORIO CRÍTICO:
El payload inicial no es "solo del primer turno" - se envía EN CADA REQUEST al webhook.
La única diferencia entre turnos es el mensaje del usuario (campo "body" o "message").
Por lo tanto, si un valor está en el payload inicial, es VÁLIDO encontrarlo en BD en CUALQUIER momento.
` : '';
  
  // 4. Construir prompt para Gemini AI
  const prompt = `
Eres un auditor experto de sistemas de IA conversacional. Tu trabajo es analizar una conversación completa entre un usuario y un bot, junto con los cambios que se hicieron en la base de datos, para detectar DISCREPANCIAS ESPECÍFICAS.
${payloadContext}
# CONVERSACIÓN COMPLETA:
${conversationContext}

# CAMBIOS EN BASE DE DATOS:
${dbContext}

# TU TAREA:
Analiza minuciosamente y detecta TODAS las discrepancias específicas entre lo que el bot prometió y lo que realmente sucedió. Enfócate en:

## 1. PRECIOS DE PRODUCTOS
- ¿El bot mencionó precios de productos?
- ¿Los precios mencionados coinciden con los datos guardados en BD?
- ⚠️ IMPORTANTE: Si los precios vienen del PAYLOAD INICIAL o de herramientas de cálculo, son VÁLIDOS
- ❌ SOLO marca como problema si el precio es INCORRECTO o INCONSISTENTE entre lo que dijo el bot y lo que guardó
- ✅ Ejemplo válido: Bot dice "$500" y BD tiene "500" → OK, no es discrepancia
- ❌ Ejemplo inválido: Bot dice "$500" pero BD tiene "450" → price_mismatch

## 2. EMAILS
- ¿El bot prometió enviar un email?
- ¿A qué dirección dijo que lo enviaría?
- ¿Se registró el envío en la BD?
- ¿El destinatario en BD coincide con el prometido?
- ¿El asunto/contenido es coherente con lo prometido?

## 3. DATOS GUARDADOS EN BASE DE DATOS

🔥 REGLA DE ORO: Usa la "LISTA DE VALORES VÁLIDOS DEL PAYLOAD" de arriba.

**Proceso simple para validar cada dato en BD:**

1️⃣ ¿El valor está en la lista de "VALORES VÁLIDOS DEL PAYLOAD"? → ✅ VÁLIDO (no importa el nombre del campo)
2️⃣ ¿Es variación del payload? (teléfono +54/549, mayúsculas, espacios) → ✅ VÁLIDO
3️⃣ ¿Es dato técnico? (ID: 123, fecha: 2024-11-26, bool: true/false, null) → ✅ VÁLIDO
4️⃣ ¿Es identificador de sesión? (sessionId, conversationId, session_id, id_sesion, etc.) → ✅ SIEMPRE VÁLIDO
5️⃣ ¿Usuario lo mencionó? (Usuario: "soy Juan" → BD: "Juan") → ✅ VÁLIDO
6️⃣ Si NO cumple 1-5 Y es nombre completo/email/frase específica → ❌ HARDCODED

**Ejemplos:**
- BD: telefono: "5491112345678" | Payload tiene "5491112345678" → ✅ VÁLIDO
- BD: session_id: "abc123" | Payload tiene "abc123" → ✅ VÁLIDO  
- BD: conversationId: "xyz789" → ✅ SIEMPRE VÁLIDO (identificador de sistema)
- BD: id: 15234 → ✅ VÁLIDO (ID numérico autogenerado)
- BD: created_at: "2024-11-26" → ✅ VÁLIDO (timestamp)
- BD: nombre: "Juan" | Usuario dijo "me llamo Juan" → ✅ VÁLIDO
- BD: nombre: "Pedro González" | NO en payload, NO en conversación → ❌ HARDCODED
- BD: email: "pedro@test.com" | NO en payload, NO en conversación → ❌ HARDCODED

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

🎯 CRITERIOS DE VALIDACIÓN:

1. Si NO hay discrepancias REALES → devuelve array vacío
2. Sé ESPECÍFICO: di exactamente qué valor esperabas vs cuál ocurrió
3. Para "hardcoded_data" - SOLO marca si estás 100% seguro que:
   - NO está en "VALORES LEGÍTIMOS DEL PAYLOAD" (revisa la lista completa)
   - NO es normalización (teléfono con/sin +, mayúsculas, espacios)
   - NO es dato técnico (ID, timestamp, booleano, null)
   - NO lo mencionó el usuario
   - Y ES nombre propio completo / email completo / frase inventada

4. CUANDO DUDES → marca como VÁLIDO (mejor falso negativo que falso positivo)
5. Incluye valores exactos y citas textuales en evidencia

📊 Severity:
- "critical" = solo hardcoded_data REAL (dato completamente inventado)
- "high" = error grave (precio incorrecto, email no enviado)
- "medium" = problema menor (inconsistencia leve)
- "low" = sugerencia de mejora

overallScore: 10=perfecto, 8-9=muy bien, 6-7=bien con errores, 4-5=regular, 0-3=mal

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
