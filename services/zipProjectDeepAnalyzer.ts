/**
 * 🧠 ZIP Project Deep Analyzer
 * 
 * Usa Gemini para analizar profundamente un proyecto ZIP y crear descriptores
 * detallados de cada agente, sus intenciones, herramientas, DBs, etc.
 */

import { GoogleGenAI } from "@google/genai";
import type { ParsedCodeProject, CodeAgentComponent } from '../types';
import { costTracker } from './costTracker';

const getLanguageInstruction = (language: string): string => {
    const langName = language === 'es' ? 'Spanish' : 'English';
    return `\n\nCRITICAL: You must provide your entire response, including all text and justifications, exclusively in ${langName}. Do not use any other language.`;
}

export interface DeepAgentAnalysis {
  name: string;
  intention: string;
  capabilities: string[];
  databases: string[];
  tools: string[];
  inputs: string[];
  outputs: string[];
  exampleInteractions: string[];
  businessValue: string;
}

export interface DeepProjectAnalysis {
  projectSummary: string;
  agents: DeepAgentAnalysis[];
  dataFlows: string[];
  integrationPoints: string[];
  suggestions: string[];
}

/**
 * Analiza profundamente el proyecto ZIP para entender realmente qué hace
 */
export const analyzeZipProjectDeeply = async (
  codeProject: ParsedCodeProject,
  language: string
): Promise<DeepProjectAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Preparar información del proyecto - INCLUYENDO IMPLICIT AGENTS
  const agentsList = codeProject.agents
    .map((agent, idx) => {
      const framework = (agent as any).framework || 'Custom';
      const tools = (agent as any).tools || [];
      const intention = (agent as any).intention || agent.systemPrompt?.substring(0, 100);
      const responsibilities = (agent as any).responsibilities || [];
      
      // 🔥 CRITICAL: Para agentes implícitos, incluir TODOS los handlers detectados
      const implicitAnalysis = (agent as any).implicitAnalysis;
      const behaviors = implicitAnalysis?.behaviors || [];
      const handlers = implicitAnalysis?.mainHandlers || [];
      
      let agentInfo = `
Agent ${idx + 1}: ${agent.name}
  Framework: ${framework}
  Type: ${(agent as any).detectionType || 'explicit'}
  System Prompt: ${agent.systemPrompt?.substring(0, 300) || 'N/A'}...
  Tools: ${tools.join(', ') || 'None'}
  File: ${agent.filePath}
`;

      // Si es implícito, agregar información DETALLADA de handlers
      if (handlers.length > 0) {
        agentInfo += `\n\n  � CRITICAL: THIS IS AN IMPLICIT AGENT WITH ${handlers.length} SEPARATE HANDLERS`;
        agentInfo += `\n  YOU MUST CREATE ${handlers.length} SEPARATE AGENT ENTRIES IN YOUR RESPONSE`;
        agentInfo += `\n  DO NOT GROUP THEM INTO ONE AGENT`;
        agentInfo += `\n\n  📍 DETECTED HANDLERS (analyze each as separate agent):`;
        handlers.forEach((h, hidx) => {
          agentInfo += `\n\n    🎯 Handler ${hidx + 1}: ${h.name}`;
          agentInfo += `\n       File: ${h.filePath}`;
          agentInfo += `\n       ⚠️  Create a separate agent entry for this handler`;
        });
      }
      
      if (behaviors.length > 0) {
        agentInfo += `\n\n  🎭 DETECTED BEHAVIORS (map to corresponding handlers):`;
        behaviors.forEach((b, bidx) => {
          agentInfo += `\n    Behavior ${bidx + 1}: ${b.name} - Type: ${b.type}`;
          if (b.tools.length > 0) agentInfo += ` | Tools: ${b.tools.join(', ')}`;
          if (b.databases.length > 0) agentInfo += ` | DBs: ${b.databases.join(', ')}`;
          agentInfo += ` | Confidence: ${(b.confidence * 100).toFixed(0)}%`;
        });
      }
      
      return agentInfo;
    })
    .join('\n');

  const toolsList = codeProject.tools
    .map(t => `- ${t.name} (${t.type})`)
    .join('\n');

  const databasesList = codeProject.databases
    .map(db => `- ${db.provider}`)
    .join('\n');

  const prompt = `You are an AI expert in software architecture and business logic analysis. 

Analyze this Node.js/TypeScript project with AI agents and provide a DEEP analysis:

PROJECT FRAMEWORK: ${codeProject.framework?.name || 'Unknown'}
LANGUAGE: ${codeProject.language}

AGENTS DETECTED:
${agentsList}

EXTERNAL TOOLS:
${toolsList || 'None'}

DATABASES:
${databasesList || 'None'}

CRITICAL INSTRUCTIONS FOR IMPLICIT AGENTS:
🔥 IF YOU SEE "DETECTED HANDLERS" WITH MULTIPLE HANDLERS (e.g., 10 handlers):
   - YOU MUST CREATE EXACTLY THAT MANY AGENT ENTRIES (10 agents in response)
   - EACH handler.name becomes a SEPARATE agent.name in your JSON response
   - DO NOT merge them into 1 agent
   - DO NOT group similar handlers together
   
EXAMPLE:
If you see:
  Handler 1: botApiService (src/services/botApi.ts)
  Handler 2: calc_durlock_new (src/tools/calc_durlock_new.ts)
  Handler 3: mediaProcessing (src/utils/mediaProcessing.ts)

YOU MUST RETURN 3 AGENTS:
{
  "agents": [
    { "name": "Bot API Manager", "intention": "Manages WhatsApp bot API endpoints" ... },
    { "name": "Durlock Calculator", "intention": "Calculates construction materials" ... },
    { "name": "Media Processor", "intention": "Processes images and videos" ... }
  ]
}

WRONG RESPONSE (DO NOT DO THIS):
{
  "agents": [
    { "name": "Multi-functional Bot Agent", "intention": "Handles all bot operations" }
  ]
}

- Analyze EACH handler's purpose independently by looking at its file path and behaviors
- Match behaviors to handlers (e.g., if behavior uses calc_durlock tools, assign to Durlock agent)
- Create specific names based on handler names and file paths

Your task:
1. For EACH agent/handler with a distinct business purpose, provide:
   - Clear business intention (what it does for the business)
   - List of capabilities (not tools, but what it CAN DO)
   - Which databases it uses (from DETECTED BEHAVIORS)
   - Which tools it uses (from DETECTED BEHAVIORS)
   - What inputs it expects
   - What outputs it produces
   - Example interactions (realistic conversations or API calls)
   - Business value it provides

2. Provide:
   - Overall project summary
   - Data flows between components
   - Integration points with external systems
   - Suggestions for testing

IMPORTANT: Your "agents" array length MUST match the number of handlers detected. If 10 handlers → 10 agents in JSON.

Return ONLY valid JSON with this exact structure:
{
  "projectSummary": "string",
  "agents": [
    {
      "name": "string (specific name like 'Durlock Calculator Agent' not 'Implicit Agent')",
      "intention": "string (specific business purpose)",
      "capabilities": ["string", "string"],
      "databases": ["string"],
      "tools": ["string"],
      "inputs": ["field1: description", "field2: description"],
      "outputs": ["field1: description"],
      "exampleInteractions": ["user query example", "system response example"],
      "businessValue": "string"
    }
  ],
  "dataFlows": ["description of flow"],
  "integrationPoints": ["description"],
  "suggestions": ["suggestion1"]
}

${getLanguageInstruction(language)}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
  });

  // 💰 Track usage
  if (response.usageMetadata) {
    costTracker.recordUsage({
      promptTokens: response.usageMetadata.promptTokenCount || 0,
      responseTokens: response.usageMetadata.candidatesTokenCount || 0,
      totalTokens: response.usageMetadata.totalTokenCount || 0,
      model: 'gemini-2.0-flash',
      operation: 'analyze_zip_project_deeply'
    });
  }

  try {
    // Limpiar respuesta: Gemini envuelve JSON en ```json ... ```
    let jsonText = response.text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }
    
    const analysis = JSON.parse(jsonText);
    console.log('✅ Deep project analysis completed');
    console.log(`   Agents analyzed: ${analysis.agents?.length || 0}`);
    console.log(`   Data flows: ${analysis.dataFlows?.length || 0}`);
    return analysis;
  } catch (e) {
    console.error("❌ Failed to parse deep analysis JSON:", response.text);
    // Fallback
    return {
      projectSummary: `${codeProject.framework?.name || 'Node.js'} project with ${codeProject.agents.length} AI agent(s)`,
      agents: codeProject.agents.map(a => ({
        name: a.name,
        intention: (a as any).intention || 'AI Agent',
        capabilities: [],
        databases: (a as any).databases || [],
        tools: (a as any).tools || [],
        inputs: [],
        outputs: [],
        exampleInteractions: [],
        businessValue: '',
      })),
      dataFlows: [],
      integrationPoints: [],
      suggestions: [],
    };
  }
};

/**
 * Usa el análisis profundo para crear descriptores de agentes para test case generation
 */
export const createAgentDescriptorsFromAnalysis = (analysis: DeepProjectAnalysis): string => {
  const agentDescriptions = analysis.agents
    .map((agent, idx) => `
Agent ${idx + 1}: ${agent.name}
  Business Purpose: ${agent.intention}
  Can Do: ${agent.capabilities.join(', ') || 'Interact with users'}
  Databases: ${agent.databases.join(', ') || 'N/A'}
  External Tools: ${agent.tools.join(', ') || 'N/A'}
  Expects Input: ${agent.inputs.map(i => `• ${i}`).join('\n  ') || '• User message'}
  Produces Output: ${agent.outputs.map(o => `• ${o}`).join('\n  ') || '• Response message'}
  Example: ${agent.exampleInteractions[0] || 'Normal conversation'}
  Business Value: ${agent.businessValue}
`)
    .join('\n');

  return `PROJECT AGENTS ANALYSIS:
${agentDescriptions}

DATA FLOWS:
${analysis.dataFlows.map(d => `• ${d}`).join('\n')}

INTEGRATION POINTS:
${analysis.integrationPoints.map(i => `• ${i}`).join('\n')}`;
};
