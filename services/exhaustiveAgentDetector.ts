/**
 * 🔬 Exhaustive Agent Detector
 * 
 * Analiza TODOS los archivos del proyecto línea por línea
 * Detecta CUALQUIER cosa que parezca un agente IA
 */

import type { CodeAgentComponent, AgentDetectionType } from '../types';

interface ProjectFile {
  path: string;
  name: string;
  content: string;
  isCode: boolean;
}

interface DetectedAgent {
  name: string;
  filePath: string;
  lineNumber: number;
  systemPrompt: string;
  confidence: number;
  detectionReason: string;
  codeSnippet: string;
}

/**
 * Analiza EXHAUSTIVAMENTE todos los archivos buscando agentes
 */
export function detectAllAgentsExhaustive(files: ProjectFile[]): DetectedAgent[] {
  console.log('🔬 [EXHAUSTIVE] Starting exhaustive agent detection...');
  console.log(`   📂 Analyzing ${files.length} files`);
  
  const allAgents: DetectedAgent[] = [];
  
  for (const file of files) {
    if (!file.isCode) continue;
    
    const agents = analyzeFileForAgents(file);
    if (agents.length > 0) {
      console.log(`   ✅ Found ${agents.length} agent(s) in ${file.name}`);
      allAgents.push(...agents);
    }
  }
  
  console.log(`🔬 [EXHAUSTIVE] Total agents found: ${allAgents.length}`);
  
  return allAgents;
}

/**
 * Analiza un archivo línea por línea buscando agentes
 */
function analyzeFileForAgents(file: ProjectFile): DetectedAgent[] {
  const agents: DetectedAgent[] = [];
  const content = file.content;
  
  // ESTRATEGIA 1: Buscar template strings largos (posibles system prompts)
  const templateStrings = extractAllTemplateStrings(content);
  
  for (const template of templateStrings) {
    if (isSystemPrompt(template.content)) {
      const agent = createAgentFromPrompt(template, file);
      if (agent) {
        agents.push(agent);
      }
    }
  }
  
  return agents;
}

/**
 * Extrae TODOS los template strings del archivo
 */
function extractAllTemplateStrings(content: string): Array<{
  content: string;
  startLine: number;
  context: string;
}> {
  const results: Array<{ content: string; startLine: number; context: string }> = [];
  
  // Buscar template strings con ` ... `
  let inTemplate = false;
  let currentTemplate = '';
  let startLine = 1;
  let depth = 0;
  let currentLine = 1;
  
  // Extraer contexto (nombre de función/método donde está el template)
  const lines = content.split('\n');
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : '';
    
    if (char === '\n') {
      currentLine++;
    }
    
    // Detectar inicio de template string
    if (char === '`' && prevChar !== '\\') {
      if (!inTemplate) {
        inTemplate = true;
        startLine = currentLine;
        currentTemplate = '';
        depth = 0;
      } else {
        // Fin de template string
        inTemplate = false;
        
        // Si es suficientemente largo, guardarlo
        if (currentTemplate.trim().length > 100) {
          // Encontrar contexto (función/método)
          const context = findContextForLine(lines, startLine);
          
          results.push({
            content: currentTemplate,
            startLine,
            context
          });
        }
      }
      continue;
    }
    
    if (inTemplate) {
      currentTemplate += char;
      
      // Contar llaves anidadas
      if (char === '{' && prevChar === '$') {
        depth++;
      } else if (char === '}' && depth > 0) {
        depth--;
      }
    }
  }
  
  console.log(`   📝 Found ${results.length} template strings in file`);
  
  return results;
}

/**
 * Encuentra el contexto (función/método/clase) donde está una línea
 */
function findContextForLine(lines: string[], lineNumber: number): string {
  // Buscar hacia atrás desde la línea
  for (let i = lineNumber - 1; i >= Math.max(0, lineNumber - 30); i--) {
    const line = lines[i];
    
    // Buscar declaraciones de función
    const funcMatch = line.match(/(?:async\s+)?(?:function\s+)?(\w+)\s*\([^)]*\)\s*(?:=>|{)/);
    if (funcMatch) {
      return funcMatch[1];
    }
    
    // Buscar métodos de clase
    const methodMatch = line.match(/(?:private|public|protected)?\s*(?:async\s+)?(\w+)\s*\(/);
    if (methodMatch) {
      return methodMatch[1];
    }
    
    // Buscar variables con funciones
    const varMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=/);
    if (varMatch) {
      return varMatch[1];
    }
  }
  
  return 'unknown';
}

/**
 * Verifica si un template string es un system prompt de agente IA
 */
function isSystemPrompt(text: string): boolean {
  const lower = text.toLowerCase();
  
  // Palabras clave que indican system prompt
  const keywords = [
    'sos el agente',
    'you are an agent',
    'you are an assistant',
    'eres un agente',
    'eres un asistente',
    'tu rol es',
    'your role is',
    'tu tarea es',
    'your task is',
    'debes',
    'you must',
    'como agente',
    'as an agent',
    'planificador',
    'planner',
    'asesor',
    'advisor',
    'validador',
    'validator',
    'analizador',
    'analyzer'
  ];
  
  return keywords.some(keyword => lower.includes(keyword));
}

/**
 * Verifica si el contexto es una variable, log o template (NO un agente)
 */
function isVariableOrLog(contextName: string, prompt: string): boolean {
  const lowerContext = contextName.toLowerCase();
  const lowerPrompt = prompt.toLowerCase();
  
  // 1️⃣ LOGS: Si el prompt empieza con emojis (logs típicos)
  if (/^[🔒✅🚀🏗️🌐]/.test(prompt)) {
    return true;
  }
  
  // 2️⃣ VARIABLES DE INTERPOLACIÓN: Templates que solo tienen ${...} sin texto real de agente
  if (prompt.includes('${') && !lowerPrompt.includes('sos el agente') && 
      !lowerPrompt.includes('you are') && !lowerPrompt.includes('identidad y estilo')) {
    // Solo rechazar si es MAYORMENTE variables
    const textWithoutVars = prompt.replace(/\$\{[^}]+\}/g, '').trim();
    if (textWithoutVars.length < 100) {
      return true;
    }
  }
  
  // 3️⃣ NOMBRES SOSPECHOSOS: log, console, etc - pero solo si NO contiene un system prompt real
  const badNames = ['log', 'console'];
  if (badNames.some(v => lowerContext === v)) {
    return true;
  }
  
  // ✅ Si tiene "Sos el Agente" o "IDENTIDAD Y ESTILO", definitivamente es un agente
  if (lowerPrompt.includes('sos el agente') || lowerPrompt.includes('identidad y estilo') ||
      lowerPrompt.includes('sos martin') || lowerPrompt.includes('tu responsabilidad')) {
    return false;
  }
  
  return false;
}

/**
 * Crea un agente desde un system prompt detectado
 */
function createAgentFromPrompt(
  template: { content: string; startLine: number; context: string },
  file: ProjectFile
): DetectedAgent | null {
  const prompt = template.content.trim();
  
  // 🚫 FILTRO 1: Rechazar variables/logs comunes (MEJORADO)
  if (isVariableOrLog(template.context, prompt)) {
    console.log(`   ⏭️  Skipping ${template.context} - variable/log/template`);
    return null;
  }
  
  // 🚫 FILTRO 2: Rechazar si es un servicio de utilidad
  if (isUtilityService(prompt, template.context)) {
    console.log(`   ⏭️  Skipping ${template.context} - utility service`);
    return null;
  }
  
  // Extraer nombre del agente desde el prompt
  const agentName = extractAgentNameFromPrompt(prompt, template.context);
  
  if (!agentName) {
    console.log(`   ⏭️  Skipping ${template.context} - couldn't extract agent name`);
    return null;
  }
  
  console.log(`   ✅ Creating agent: ${agentName}`);
  
  return {
    name: agentName,
    filePath: file.path,
    lineNumber: template.startLine,
    systemPrompt: prompt,
    confidence: 0.9,
    detectionReason: `System prompt found in ${template.context}()`,
    codeSnippet: prompt.substring(0, 200) + '...'
  };
}

/**
 * Extrae el nombre del agente desde el system prompt
 */
function extractAgentNameFromPrompt(prompt: string, context: string): string | null {
  // PATRÓN 1: "Sos el Agente X - Descripción"
  let match = prompt.match(/(?:Sos|Eres)\s+el\s+Agente\s+(\d+)\s*[-:]\s*([^\n.]{5,100})/i);
  if (match) {
    return `Agent ${match[1]}: ${match[2].trim()}`;
  }
  
  // PATRÓN 2: "You are Agent X - Description"
  match = prompt.match(/You\s+are\s+(?:an?\s+)?Agent\s+(\d+)\s*[-:]\s*([^\n.]{5,100})/i);
  if (match) {
    return `Agent ${match[1]}: ${match[2].trim()}`;
  }
  
  // PATRÓN 3: "Agente X: Descripción"
  match = prompt.match(/Agent[eo]?\s+(\d+)\s*[:-]\s*([^\n.]{5,100})/i);
  if (match) {
    return `Agent ${match[1]}: ${match[2].trim()}`;
  }
  
  // PATRÓN 4: "IDENTIDAD Y ESTILO" o "Sos Martín" (Agent 2 style)
  const lowerPrompt = prompt.toLowerCase();
  if (lowerPrompt.includes('identidad y estilo') || 
      lowerPrompt.includes('sos martin') || 
      lowerPrompt.includes('asesor técnico-comercial')) {
    return 'Agent 2: Commercial Advisor';
  }
  
  // Si llegamos aquí, no pudimos extraer un nombre válido
  return null;
}

/**
 * Verifica si es un servicio de utilidad, no un agente conversacional
 */
function isUtilityService(prompt: string, context: string): boolean {
  const lower = prompt.toLowerCase();
  const contextLower = context.toLowerCase();
  
  // Palabras clave de servicios de utilidad
  const utilityKeywords = [
    'analiza esta imagen',
    'analyze this image',
    'describe la imagen',
    'describe the image',
    'procesa el documento',
    'process the document',
    'extrae el texto',
    'extract text',
    'analiza el archivo',
    'analyze the file'
  ];
  
  if (utilityKeywords.some(k => lower.includes(k))) {
    return true;
  }
  
  // Nombres de contexto que indican utilidades
  if (/process.*image|analyze.*image|process.*document|media.*process/i.test(contextLower)) {
    return true;
  }
  
  return false;
}

/**
 * Convierte agentes detectados a CodeAgentComponent
 */
export function convertToCodeAgents(detected: DetectedAgent[]): CodeAgentComponent[] {
  return detected.map(agent => ({
    type: 'agent' as const,
    name: agent.name,
    filePath: agent.filePath,
    systemPrompt: agent.systemPrompt,
    description: agent.detectionReason,
    imports: [],
    framework: 'Detected via exhaustive analysis',
    confidence: agent.confidence,
    agentDetectionType: 'explicit' as AgentDetectionType,
    tools: []
  }));
}

