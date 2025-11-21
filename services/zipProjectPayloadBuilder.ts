/**
 * 🔧 ZIP Project Payload Builder
 * 
 * Genera payloads de prueba específicos para proyectos ZIP basados en:
 * - Agentes detectados
 * - Herramientas disponibles
 * - Campos de entrada esperados
 */

import { GoogleGenAI } from "@google/genai";
import type { ParsedCodeProject } from '../types';
import { costTracker } from './costTracker';

const getLanguageInstruction = (language: string): string => {
    const langName = language === 'es' ? 'Spanish' : 'English';
    return `\n\nCRITICAL: You must provide your entire response, including all text and justifications, exclusively in ${langName}. Do not use any other language.`;
}

/**
 * Analiza endpoints detectados para inferir estructura esperada
 */
function analyzeEndpoints(endpoints: string[]): Record<string, any> {
  const inferredFields: Record<string, any> = {};
  
  // Endpoints como /users/:id, /conversations, etc. sugieren cam 
  for (const endpoint of endpoints) {
    if (endpoint.includes('user')) inferredFields.userId = 'user_123';
    if (endpoint.includes('conversation') || endpoint.includes('chat')) {
      inferredFields.conversationId = `conv_${Date.now()}`;
      inferredFields.message = 'Sample message';
    }
    if (endpoint.includes('order')) inferredFields.orderId = 'order_123';
    if (endpoint.includes('product')) inferredFields.productId = 'prod_123';
  }
  
  return inferredFields;
}

/**
 * Analiza agentes y herramientas para detectar estructura de payload esperada
 */
function detectPayloadStructure(codeProject: ParsedCodeProject): { fields: string[], hints: string } {
  const fields: Set<string> = new Set();
  const hints: string[] = [];
  
  // Detectar framework y herramientas
  if (codeProject.framework?.name) {
    hints.push(`Framework detected: ${codeProject.framework.name}`);
  }
  
  // Analizar nombres de archivos y rutas para inferir estructura
  for (const agent of codeProject.agents) {
    const filePath = agent.filePath.toLowerCase();
    
    // Detectar proyectos WhatsApp/Baileys
    if (filePath.includes('baileys') || filePath.includes('whatsapp')) {
      fields.add('session_id');
      fields.add('from');
      fields.add('body');
      fields.add('pushName');
      hints.push('WhatsApp/Baileys project detected → Use session_id, from, body, pushName fields');
    }
    
    // Detectar proyectos con conversaciones
    if (filePath.includes('conversation') || filePath.includes('chat')) {
      fields.add('conversationId');
      fields.add('message');
    }
    
    // Detectar proyectos con usuarios
    if (filePath.includes('user')) {
      fields.add('userId');
    }
  }
  
  // Analizar herramientas detectadas
  for (const tool of codeProject.tools) {
    if (tool.type === 'messaging') {
      fields.add('phone');
      fields.add('message');
      hints.push('Messaging tool detected → Include phone/message fields');
    }
  }
  
  // Analizar endpoints
  for (const endpoint of codeProject.apiEndpoints || []) {
    if (endpoint.includes('webhook') || endpoint.includes('message')) {
      hints.push('Webhook endpoint detected → Include event trigger fields');
    }
  }
  
  return { 
    fields: Array.from(fields), 
    hints: hints.join('\n') 
  };
}

/**
 * Genera payload para proyecto ZIP basado en agentes detectados
 */
export const generateZipProjectPayload = async (
  codeProject: ParsedCodeProject,
  language: string
): Promise<Record<string, any>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Analizar proyecto para detectar estructura esperada
  const { fields, hints } = detectPayloadStructure(codeProject);
  
  // Inferir estructura inicial de endpoints
  const endpointHints = analyzeEndpoints(codeProject.apiEndpoints);
  
  const agentSummary = codeProject.agents
    .map(a => `- Agent: ${a.name}${a.description ? ` (${a.description})` : ''}`)
    .join('\n');
  
  const toolsSummary = codeProject.tools
    .map(t => `- ${t.name} (${t.type})`)
    .join('\n') || 'No external tools detected';
  
  const detectedFieldsInfo = fields.length > 0 
    ? `\n\nDETECTED PAYLOAD FIELDS FROM PROJECT ANALYSIS:\n${fields.map(f => `- ${f}`).join('\n')}`
    : '';
  
  const hintsInfo = hints 
    ? `\n\nPROJECT CONTEXT HINTS:\n${hints}`
    : '';
  
  const prompt = `
You are an expert in API design and testing. Analyze the following code project structure and generate a realistic sample JSON payload that would be sent to this project's API endpoint to start a conversation or interaction.

PROJECT INFORMATION:
Framework: ${codeProject.framework?.name || 'Unknown'}
Language: ${codeProject.language}
Total Files: ${codeProject.fileCount}
Total Lines: ${codeProject.totalLines}

DETECTED AI AGENTS:
${agentSummary}

EXTERNAL TOOLS AVAILABLE:
${toolsSummary}

DETECTED ENDPOINTS:
${codeProject.apiEndpoints.map(e => `- ${e}`).join('\n')}${detectedFieldsInfo}${hintsInfo}

INSTRUCTIONS:
1. Generate a single, plausible JSON object that would be sent as the initial request to this project's main endpoint.
2. **CRITICAL**: If DETECTED FIELDS include WhatsApp/messaging fields (session_id, from, body, pushName), use EXACTLY this structure:
   {
     "session_id": "5491234567890",
     "body": "Sample user message",
     "from": "5491234567890",
     "pushName": "Test User"
   }
3. If DETECTED FIELDS include conversationId/message, use that format instead.
4. Use realistic sample data appropriate for the detected context (Spanish phone numbers for Argentine projects).
5. The output MUST be ONLY the JSON object itself, with no explanations, markdown, or additional text.

${getLanguageInstruction(language)}
`;
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  // 💰 Track usage
  if (response.usageMetadata) {
    costTracker.recordUsage({
      promptTokens: response.usageMetadata.promptTokenCount || 0,
      responseTokens: response.usageMetadata.candidatesTokenCount || 0,
      totalTokens: response.usageMetadata.totalTokenCount || 0,
      model: 'gemini-2.5-flash',
      operation: 'generate_zip_payload'
    });
  }

  try {
    const jsonText = response.text.trim();
    const parsed = JSON.parse(jsonText);
    
    // Validar que tenga campos mínimos necesarios
    const hasWhatsAppFields = parsed.session_id && parsed.from && parsed.body;
    const hasGenericFields = parsed.conversationId && (parsed.message || parsed.input);
    
    if (!hasWhatsAppFields && !hasGenericFields) {
      // Si faltan campos críticos, usar detección del proyecto
      if (fields.includes('session_id')) {
        // Proyecto WhatsApp/Baileys
        return {
          session_id: "5491234567890",
          body: "Hola, quiero hacer una consulta",
          from: "5491234567890",
          pushName: "Usuario Test"
        };
      } else {
        // Proyecto genérico
        parsed.conversationId = parsed.conversationId || `conv_${Date.now()}`;
        parsed.message = parsed.message || parsed.input || "Initial query to the system";
      }
    }
    
    return parsed;
  } catch (e) {
    console.error("❌ Failed to parse ZIP payload JSON:", response.text);
    
    // Fallback inteligente basado en la detección
    if (fields.includes('session_id')) {
      // Proyecto WhatsApp/Baileys
      return {
        session_id: "5491234567890",
        body: "Hola, quiero hacer una consulta",
        from: "5491234567890",
        pushName: "Usuario Test"
      };
    } else {
      // Fallback genérico
      return {
        conversationId: `conv_${Date.now()}`,
        message: "Initial query to test the agent",
        timestamp: new Date().toISOString(),
      };
    }
  }
};
