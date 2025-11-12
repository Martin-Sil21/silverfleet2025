/**
 * 🔍 Detector Inteligente de Patrones de Reutilización de Datos
 * 
 * Detecta problemas comunes donde el bot:
 * - Usa SIEMPRE los mismos datos para todos los clientes (hardcoded globals)
 * - Envía MÚLTIPLES EMAILS AL MISMO DESTINATARIO sin filtro
 * - Reutiliza datos entre conversaciones diferentes
 * - Repite la misma acción en múltiples turnos sin validación
 */

import { GoogleGenAI } from "@google/genai";
import type { ExecutionStep, DatabaseChange } from '../types';

const API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';

export interface PatternDiscrepancy {
  type: 'data_reuse_across_conversations' | 'duplicate_email_same_recipient' | 'repeated_action_no_filter' | 'hardcoded_global_data' | 'inconsistent_personalization';
  severity: 'critical' | 'high' | 'medium';
  title: string;
  description: string;
  pattern: string; // Descripción del patrón detectado
  evidence: string[]; // Ejemplos específicos del patrón
  affectedConversations?: number; // Cuántas conversaciones afectadas
  frequency: number; // Cuántas veces se repitió el patrón
  recommendation: string;
}

export interface PatternAnalysisResult {
  totalConversations: number;
  patterns: PatternDiscrepancy[];
  dataReuseScore: number; // 0-10: qué tan reutilizados están los datos (10 = muy reutilizados, malo)
  personalizationScore: number; // 0-10: nivel de personalización (10 = bien, 0 = nada personalizado)
  summary: string;
  detailedAnalysis: string;
}

/**
 * Analiza múltiples conversaciones para detectar patrones de reutilización de datos
 * y falta de personalización
 */
export async function detectDataReusePatterns(
  conversations: Array<{
    id: string;
    testCase: { title: string; persona: string; conversationGoal: string };
    executionTrace: ExecutionStep[];
    databaseActivity?: { changes?: DatabaseChange[] };
  }>,
  language: string
): Promise<PatternAnalysisResult> {
  
  console.log(`\n🔍 [Pattern Detector] Analizando ${conversations.length} conversaciones`);
  
  // 1. Extraer datos clave de cada conversación
  const conversationDataMap = conversations.map((conv, idx) => {
    const emails: string[] = [];
    const savedData: Record<string, any> = {};
    const userInputs: string[] = [];
    const botOutputs: string[] = [];
    
    // Extraer emails enviados
    if (conv.databaseActivity?.changes) {
      conv.databaseActivity.changes.forEach(change => {
        if (change.table?.toLowerCase().includes('email')) {
          const record = change.record || change.after || {};
          emails.push(record.email || record.recipient || record.to || '');
        }
      });
    }
    
    // Extraer datos guardados en BD
    if (conv.databaseActivity?.changes) {
      conv.databaseActivity.changes.forEach(change => {
        savedData[change.table] = change.record || change.after;
      });
    }
    
    // Extraer inputs/outputs
    conv.executionTrace.forEach(step => {
      const input = extractTextFromStep(step.input);
      const output = extractTextFromStep(step.output);
      if (input) userInputs.push(input);
      if (output) botOutputs.push(output);
    });
    
    return {
      conversationId: conv.id,
      persona: conv.testCase.persona,
      goal: conv.testCase.conversationGoal,
      emails: [...new Set(emails)], // Únicos
      savedData,
      userInputs,
      botOutputs,
      allEmails: emails // Con duplicados
    };
  });
  
  // 2. Analizar patrones manualmente ANTES de llamar a Gemini
  const patterns: PatternDiscrepancy[] = [];
  
  // 🔍 Patrón 1: EMAILS DUPLICADOS AL MISMO DESTINATARIO EN UNA CONVERSACIÓN
  conversationDataMap.forEach(convData => {
    const emailCounts = countOccurrences(convData.allEmails);
    for (const [email, count] of Object.entries(emailCounts)) {
      if (count > 1 && email) {
        patterns.push({
          type: 'duplicate_email_same_recipient',
          severity: 'critical',
          title: `⚠️ Email enviado ${count} veces al mismo destinatario`,
          description: `En la conversación de "${convData.persona}", el email se envió ${count} veces a "${email}" sin filtro o condición que lo evite`,
          pattern: `Múltiples envíos a ${email}`,
          evidence: [
            `Conversación: ${convData.conversationId}`,
            `Destinatario: ${email}`,
            `Frecuencia: ${count} veces`,
            `Persona: ${convData.persona}`
          ],
          frequency: count,
          recommendation: 'Implementar lógica de verificación: "si ya se envió email en este turno, no enviar de nuevo" o usar un flag de control por conversación'
        });
      }
    }
  });
  
  // 🔍 Patrón 2: REUTILIZACIÓN DE DATOS ENTRE CONVERSACIONES
  const dataReuseAnalysis = analyzeDataReuseBetweenConversations(conversationDataMap);
  patterns.push(...dataReuseAnalysis.patterns);
  
  // 🔍 Patrón 3: FALTA DE PERSONALIZACIÓN
  const personalizationAnalysis = analyzePersonalizationDifferences(conversationDataMap);
  patterns.push(...personalizationAnalysis.patterns);
  
  // 3. Enviar a Gemini para análisis en profundidad
  const geminiAnalysis = await performGeminiPatternAnalysis(
    conversationDataMap,
    patterns,
    language
  );
  
  // 4. Combinar resultados
  const allPatterns = [...patterns, ...geminiAnalysis.patterns];
  
  // Calcular scores
  const dataReuseScore = calculateDataReuseScore(allPatterns);
  const personalizationScore = 10 - dataReuseScore;
  
  console.log(`   ✅ Análisis completado`);
  console.log(`   Patrones encontrados: ${allPatterns.length}`);
  console.log(`   Score de reutilización: ${dataReuseScore}/10`);
  
  return {
    totalConversations: conversations.length,
    patterns: allPatterns,
    dataReuseScore,
    personalizationScore,
    summary: geminiAnalysis.summary,
    detailedAnalysis: geminiAnalysis.detailedAnalysis
  };
}

/**
 * Analiza reutilización de datos entre conversaciones
 */
function analyzeDataReuseBetweenConversations(conversationDataMap: any[]): { patterns: PatternDiscrepancy[] } {
  const patterns: PatternDiscrepancy[] = [];
  
  if (conversationDataMap.length < 2) {
    return { patterns };
  }
  
  // Buscar si todos usan los MISMOS emails
  const allEmails = conversationDataMap.flatMap(c => c.emails);
  const uniqueEmails = [...new Set(allEmails)];
  
  // Si hay X conversaciones pero solo 1-2 emails únicos → PROBLEMA
  if (uniqueEmails.length === 1 && conversationDataMap.length > 1) {
    const email = uniqueEmails[0];
    if (email) {
      patterns.push({
        type: 'data_reuse_across_conversations',
        severity: 'critical',
        title: `🔴 CRÍTICO: El bot envía siempre al MISMO EMAIL`,
        description: `En ${conversationDataMap.length} conversaciones diferentes, TODAS usan el email "${email}". El bot está hardcodeando el mismo destinatario.`,
        pattern: `Reutilización global del email ${email}`,
        evidence: conversationDataMap.map(c => 
          `${c.persona} (${c.conversationId}): recibió email en ${c.emails.length} ocasiones a ${email}`
        ),
        affectedConversations: conversationDataMap.length,
        frequency: conversationDataMap.length,
        recommendation: 'Extraer el email del usuario EN CADA CONVERSACIÓN (no hardcodearlo). Usar: {{ $json.userEmail }} o similar desde el payload.'
      });
    }
  }
  
  // Buscar datos idénticos en BD entre conversaciones
  const savedDataPatterns = analyzeSavedDataAcrossConversations(conversationDataMap);
  patterns.push(...savedDataPatterns);
  
  return { patterns };
}

/**
 * Analiza si los datos guardados en BD son idénticos entre conversaciones (hardcoded)
 */
function analyzeSavedDataAcrossConversations(conversationDataMap: any[]): PatternDiscrepancy[] {
  const patterns: PatternDiscrepancy[] = [];
  
  if (conversationDataMap.length < 2) return patterns;
  
  // Comparar savedData entre conversaciones
  const firstSavedData = conversationDataMap[0]?.savedData;
  if (!firstSavedData) return patterns;
  
  let identicalCount = 0;
  const identicalConversations: string[] = [];
  
  for (let i = 1; i < conversationDataMap.length; i++) {
    const currentSavedData = conversationDataMap[i]?.savedData;
    if (JSON.stringify(firstSavedData) === JSON.stringify(currentSavedData)) {
      identicalCount++;
      identicalConversations.push(conversationDataMap[i].conversationId);
    }
  }
  
  if (identicalCount > 0 && identicalConversations.length > 0) {
    patterns.push({
      type: 'hardcoded_global_data',
      severity: 'critical',
      title: `🔴 CRÍTICO: Datos idénticos guardados en todas las conversaciones`,
      description: `Los datos guardados en la BD son EXACTAMENTE IGUALES en ${identicalCount + 1} conversaciones. El bot no está personalizando los datos.`,
      pattern: `Reutilización de datos entre conversaciones`,
      evidence: [
        `Conversaciones afectadas: ${[conversationDataMap[0].conversationId, ...identicalConversations].join(', ')}`,
        `Datos guardados (idénticos): ${JSON.stringify(firstSavedData).substring(0, 100)}...`
      ],
      affectedConversations: identicalCount + 1,
      frequency: identicalCount,
      recommendation: 'Verificar que el bot extraiga datos PERSONALIZADOS de cada usuario, no use valores hardcodeados o genéricos.'
    });
  }
  
  return patterns;
}

/**
 * Analiza diferencias (o falta de ellas) en personalización entre conversaciones
 */
function analyzePersonalizationDifferences(conversationDataMap: any[]): { patterns: PatternDiscrepancy[] } {
  const patterns: PatternDiscrepancy[] = [];
  
  if (conversationDataMap.length < 2) {
    return { patterns };
  }
  
  // Comparar outputs del bot entre conversaciones
  const botOutputsByPersona = new Map<string, string[]>();
  conversationDataMap.forEach(conv => {
    botOutputsByPersona.set(conv.conversationId, conv.botOutputs);
  });
  
  // Buscar respuestas IDÉNTICAS
  const firstOutputs = conversationDataMap[0]?.botOutputs || [];
  if (firstOutputs.length === 0) {
    return { patterns };
  }
  
  let identicalResponseCount = 0;
  const affectedPersonas: string[] = [];
  
  for (let i = 1; i < conversationDataMap.length; i++) {
    const currentOutputs = conversationDataMap[i]?.botOutputs || [];
    
    // Comparar longitud y contenido básico
    if (currentOutputs.length === firstOutputs.length) {
      let allIdentical = true;
      for (let j = 0; j < firstOutputs.length; j++) {
        const normalized1 = normalizeText(firstOutputs[j]);
        const normalized2 = normalizeText(currentOutputs[j]);
        if (normalized1 !== normalized2) {
          allIdentical = false;
          break;
        }
      }
      
      if (allIdentical && firstOutputs.some(o => o.length > 20)) {
        identicalResponseCount++;
        affectedPersonas.push(conversationDataMap[i].persona);
      }
    }
  }
  
  if (identicalResponseCount > 0) {
    patterns.push({
      type: 'inconsistent_personalization',
      severity: 'high',
      title: `⚠️ El bot da respuestas IDÉNTICAS a diferentes personas`,
      description: `El bot proporcionó las mismas respuestas (palabra por palabra) a ${identicalResponseCount + 1} usuarios diferentes, sin personalización.`,
      pattern: `Respuestas genéricas no personalizadas`,
      evidence: [
        `Personas afectadas: ${[conversationDataMap[0].persona, ...affectedPersonas].join(', ')}`,
        `Ejemplo de respuesta genérica: "${firstOutputs[0]?.substring(0, 80)}..."`
      ],
      affectedConversations: identicalResponseCount + 1,
      frequency: identicalResponseCount,
      recommendation: 'Asegurar que el agente AI personalice respuestas basadas en el contexto y datos de cada usuario.'
    });
  }
  
  return { patterns };
}

/**
 * Llama a Gemini para análisis más profundo
 */
async function performGeminiPatternAnalysis(
  conversationDataMap: any[],
  preliminaryPatterns: PatternDiscrepancy[],
  language: string
): Promise<{ patterns: PatternDiscrepancy[]; summary: string; detailedAnalysis: string }> {
  
  const conversationSummary = conversationDataMap.map(conv => `
Conversación: ${conv.conversationId}
Persona: ${conv.persona}
Objetivo: ${conv.goal}
Emails enviados: ${conv.emails.join(', ') || 'ninguno'}
Emails totales (con duplicados): ${conv.allEmails.length}
Datos guardados: ${JSON.stringify(conv.savedData).substring(0, 200)}...
  `).join('\n---\n');
  
  const prompt = `
Eres un experto en auditoría de sistemas conversacionales. Analiza los siguientes datos de ${conversationDataMap.length} conversaciones para detectar patrones de REUTILIZACIÓN DE DATOS y falta de PERSONALIZACIÓN.

## CONVERSACIONES ANALIZADAS:
${conversationSummary}

## PATRONES PRELIMINARES DETECTADOS:
${preliminaryPatterns.map((p, i) => `${i + 1}. ${p.title}\n   - Tipo: ${p.type}\n   - Severidad: ${p.severity}\n   - Frecuencia: ${p.frequency}\n`).join('\n')}

## TU ANÁLISIS:
Proporciona:
1. **CONFIRMACIÓN**: ¿Son válidos los patrones preliminares?
2. **PATRONES ADICIONALES**: ¿Hay otros patrones de reutilización que hayan pasado desapercibidos?
3. **RAÍZ CAUSA**: ¿Cuál es probablemente el problema en el código del bot?
4. **IMPACTO**: ¿Cuál es el impacto en la experiencia del usuario?
5. **SOLUCIÓN**: ¿Cuál es la solución técnica recomendada?

FORMATO DE RESPUESTA JSON:
{
  "patterns": [
    {
      "type": "data_reuse_across_conversations|duplicate_email_same_recipient|repeated_action_no_filter|hardcoded_global_data|inconsistent_personalization",
      "severity": "critical|high|medium",
      "title": "...",
      "description": "...",
      "pattern": "...",
      "evidence": ["...", "..."],
      "affectedConversations": 3,
      "frequency": 5,
      "recommendation": "..."
    }
  ],
  "summary": "Resumen ejecutivo en 2-3 líneas",
  "detailedAnalysis": "Análisis detallado en markdown"
}

${language === 'es' ? 'RESPONDE EN ESPAÑOL' : 'RESPOND IN ENGLISH'}
`;

  try {
    const genAI = new GoogleGenAI({ apiKey: API_KEY });
    const response = await genAI.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });
    
    const analysis = JSON.parse(response.text);
    return {
      patterns: analysis.patterns || [],
      summary: analysis.summary || '',
      detailedAnalysis: analysis.detailedAnalysis || ''
    };
  } catch (error) {
    console.error('Error en análisis Gemini:', error);
    return {
      patterns: [],
      summary: `Error al analizar: ${error}`,
      detailedAnalysis: `Error: ${error}`
    };
  }
}

/**
 * Calcula el score de reutilización de datos (0-10)
 * 10 = muy reutilizado (malo), 0 = muy personalizado (bueno)
 */
function calculateDataReuseScore(patterns: PatternDiscrepancy[]): number {
  let score = 0;
  
  patterns.forEach(p => {
    if (p.type === 'data_reuse_across_conversations' || p.type === 'hardcoded_global_data') {
      score += p.severity === 'critical' ? 8 : 4;
    } else if (p.type === 'duplicate_email_same_recipient') {
      score += p.severity === 'critical' ? 6 : 3;
    } else if (p.type === 'inconsistent_personalization' || p.type === 'repeated_action_no_filter') {
      score += p.severity === 'critical' ? 5 : 2;
    }
  });
  
  return Math.min(score, 10); // Máximo 10
}

// ==================== HELPERS ====================

function extractTextFromStep(data: any): string {
  if (typeof data === 'string') return data;
  if (data?.text) return data.text;
  if (data?.message) return data.message;
  if (data?.content) return data.content;
  if (data?.response) return data.response;
  return '';
}

function countOccurrences(arr: string[]): Record<string, number> {
  return arr.reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100); // Primeros 100 chars
}
