/**
 * 🔬 Deep Project Analyzer
 * 
 * Sistema de análisis EXHAUSTIVO para proyectos ZIP complejos.
 * 
 * Capacidades:
 * 1. 📂 Análisis de estructura de archivos y módulos
 * 2. 🤖 Detección inteligente de agentes IA (explícitos e implícitos)
 * 3. 💾 Mapeo completo de bases de datos (schemas, tablas, relaciones)
 * 4. 🔌 Identificación de todas las integraciones externas
 * 5. 🧠 Comprensión semántica del flujo de negocio
 * 6. 🎯 Extracción de prompts y configuraciones IA
 * 
 * Diferencia con codeProjectAnalyzer:
 * - Usa AST parsing + análisis semántico con IA
 * - Detecta dependencias entre módulos
 * - Identifica patrones arquitectónicos complejos
 * - Mapea schemas de DB automáticamente
 */

import JSZip from 'jszip';
import { GoogleGenAI } from '@google/genai';
import { costTracker } from './costTracker';
import { analyzeDatabaseSchemas as parseSchemas } from './advancedSchemaParser';
import { detectIntegrations } from './integrationMapper';
import { detectAllAgentsExhaustive, convertToCodeAgents } from './exhaustiveAgentDetector';
import {
  ParsedCodeProject,
  CodeAgentComponent,
  DetectedFramework,
  DetectedDatabase,
  DetectedTool,
  DetectedAPI,
  AgentDetectionType,
  AgentBehavior,
  ImplicitAgentAnalysis,
} from '../types';

// =====================================
// 1. TIPOS INTERNOS PARA ANÁLISIS
// =====================================

interface ProjectFile {
  path: string;
  name: string;
  extension: string;
  content: string;
  size: number;
  isCode: boolean;
  isConfig: boolean;
  isSchema: boolean;
}

interface ProjectStructure {
  rootFiles: ProjectFile[];
  srcFiles: ProjectFile[];
  configFiles: ProjectFile[];
  schemaFiles: ProjectFile[];
  testFiles: ProjectFile[];
  allFiles: ProjectFile[];
  totalLines: number;
  fileCount: number;
}

interface DatabaseSchema {
  name: string;
  tables: TableSchema[];
  relationships: Relationship[];
  migrations?: Migration[];
}

interface TableSchema {
  name: string;
  fields: FieldSchema[];
  primaryKey?: string;
  indexes?: string[];
  constraints?: string[];
}

interface FieldSchema {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  references?: { table: string; field: string };
}

interface Relationship {
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  from: { table: string; field: string };
  to: { table: string; field: string };
}

interface Migration {
  filename: string;
  timestamp: number;
  operations: string[];
}

interface APIIntegration {
  name: string;
  type: 'rest' | 'graphql' | 'grpc' | 'websocket' | 'sdk';
  baseUrl?: string;
  endpoints?: APIEndpoint[];
  authentication?: string;
  sdkVersion?: string;
}

interface APIEndpoint {
  method: string;
  path: string;
  description?: string;
  params?: string[];
  body?: string;
}

interface BusinessFlow {
  name: string;
  description: string;
  steps: BusinessStep[];
  involvedAgents: string[];
  involvedTools: string[];
  involvedDatabases: string[];
}

interface BusinessStep {
  order: number;
  action: string;
  component: string;
  description: string;
}

interface DeepAnalysisResult {
  project: ProjectStructure;
  agents: CodeAgentComponent[];
  databases: DatabaseSchema[];
  apis: APIIntegration[];
  tools: DetectedTool[];
  businessFlows: BusinessFlow[];
  dependencies: DependencyGraph;
  architecture: ArchitecturePattern;
}

interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

interface DependencyNode {
  id: string;
  type: 'module' | 'file' | 'function' | 'class';
  name: string;
  path: string;
}

interface DependencyEdge {
  from: string;
  to: string;
  type: 'imports' | 'calls' | 'extends' | 'implements';
}

interface ArchitecturePattern {
  primary: string; // 'MVC', 'Microservices', 'Layered', 'Event-Driven', etc.
  confidence: number;
  evidence: string[];
  layers?: string[];
}

// =====================================
// 2. EXTRACCIÓN Y CLASIFICACIÓN DE ARCHIVOS
// =====================================

/**
 * Extrae y clasifica todos los archivos del ZIP
 */
async function extractAndClassifyFiles(zipBuffer: ArrayBuffer): Promise<ProjectStructure> {
  console.log('📦 Extracting ZIP contents...');
  const zip = new JSZip();
  await zip.loadAsync(zipBuffer);
  
  const allFiles: ProjectFile[] = [];
  const blacklist = [
    'node_modules/', 'dist/', 'build/', '.git/', '.vscode/',
    '__pycache__/', '.pytest_cache/', 'coverage/', '.next/',
    'venv/', 'env/', '.env.', '.DS_Store'
  ];
  
  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    if (blacklist.some(b => path.includes(b))) continue;
    
    try {
      const content = await file.async('text');
      const extension = path.substring(path.lastIndexOf('.')).toLowerCase();
      
      const projectFile: ProjectFile = {
        path,
        name: path.split('/').pop() || path,
        extension,
        content,
        size: content.length,
        isCode: isCodeFile(extension),
        isConfig: isConfigFile(path, extension),
        isSchema: isSchemaFile(path, extension),
      };
      
      allFiles.push(projectFile);
    } catch (e) {
      // Archivo binario o corrupto, ignorar
    }
  }
  
  // Clasificar archivos por tipo
  const srcFiles = allFiles.filter(f => 
    f.path.includes('/src/') || f.path.includes('/app/') || f.path.includes('/lib/')
  );
  
  const configFiles = allFiles.filter(f => f.isConfig);
  const schemaFiles = allFiles.filter(f => f.isSchema);
  const testFiles = allFiles.filter(f => 
    f.path.includes('/test/') || f.path.includes('/__tests__/') || f.name.includes('.test.') || f.name.includes('.spec.')
  );
  
  const rootFiles = allFiles.filter(f => !f.path.includes('/'));
  
  const totalLines = allFiles.reduce((sum, f) => sum + f.content.split('\n').length, 0);
  
  console.log(`✅ Extracted ${allFiles.length} files (${srcFiles.length} source, ${configFiles.length} config, ${schemaFiles.length} schema)`);
  
  return {
    allFiles,
    srcFiles,
    configFiles,
    schemaFiles,
    testFiles,
    rootFiles,
    totalLines,
    fileCount: allFiles.length,
  };
}

function isCodeFile(ext: string): boolean {
  return [
    '.ts', '.tsx', '.js', '.jsx',
    '.py', '.java', '.go', '.rs',
    '.php', '.rb', '.kt', '.swift'
  ].includes(ext);
}

function isConfigFile(path: string, ext: string): boolean {
  const configNames = [
    'package.json', 'tsconfig.json', 'jest.config',
    'webpack.config', 'vite.config', 'next.config',
    'docker-compose.yml', 'Dockerfile',
    'requirements.txt', 'Pipfile', 'poetry.lock',
    '.env', '.env.example', '.env.local'
  ];
  
  const name = path.split('/').pop() || '';
  return configNames.some(c => name.startsWith(c)) || ['.json', '.yml', '.yaml', '.toml'].includes(ext);
}

function isSchemaFile(path: string, ext: string): boolean {
  const schemaKeywords = ['schema', 'model', 'migration', 'prisma', 'drizzle', 'entity'];
  const pathLower = path.toLowerCase();
  
  return schemaKeywords.some(k => pathLower.includes(k)) || 
         ['.prisma', '.sql'].includes(ext);
}

// =====================================
// 3. ANÁLISIS PROFUNDO DE AGENTES IA
// =====================================

/**
 * Detecta agentes IA con análisis avanzado
 */
async function detectAgentsDeep(
  files: ProjectFile[],
  language: string
): Promise<CodeAgentComponent[]> {
  console.log('🤖 Deep AI agent detection...');
  
  const agents: CodeAgentComponent[] = [];
  
  // PASO 0: 🔥 ANÁLISIS EXHAUSTIVO - Analiza TODOS los archivos línea por línea
  console.log('🔬 Running exhaustive analysis on ALL files...');
  const exhaustiveAgents = detectAllAgentsExhaustive(files);
  const exhaustiveCodeAgents = convertToCodeAgents(exhaustiveAgents);
  agents.push(...exhaustiveCodeAgents);
  
  console.log(`✅ Exhaustive analysis found ${exhaustiveCodeAgents.length} agents`);
  
  // PASO 1: Detectar agentes EXPLÍCITOS (con frameworks conocidos) - DEPRECATED
  // Ya no usamos esto porque el análisis exhaustivo es más completo
  // const explicitAgents = detectExplicitAgents(files);
  // agents.push(...explicitAgents);
  
  // PASO 2: Detectar agentes IMPLÍCITOS (lógica de negocio) - SKIP para evitar falsos positivos
  // El análisis exhaustivo ya encuentra todo lo importante
  // const implicitAgents = await detectImplicitAgents(files, language);
  // agents.push(...implicitAgents);
  
  // PASO 3: Deduplicar agentes (por systemPrompt y filePath)
  const uniqueAgents = deduplicateAgents(agents);
  
  // PASO 4: Enriquecer con análisis semántico usando Gemini
  const enrichedAgents = await enrichAgentsWithAI(uniqueAgents, files, language);
  
  console.log(`✅ Detected ${enrichedAgents.length} agents (${exhaustiveCodeAgents.length} from exhaustive analysis, ${agents.length - uniqueAgents.length} duplicates removed)`);
  
  return enrichedAgents;
}

/**
 * 🔥 NUEVO: Deduplicar agentes por similaridad
 */
function deduplicateAgents(agents: CodeAgentComponent[]): CodeAgentComponent[] {
  const unique: CodeAgentComponent[] = [];
  const seen = new Map<string, CodeAgentComponent>();
  
  for (const agent of agents) {
    // Crear clave única basada en múltiples factores
    const filePath = agent.filePath;
    const promptKey = agent.systemPrompt?.substring(0, 150).trim() || '';
    const framework = agent.framework || '';
    
    // Clave compuesta: ruta + primeras 150 chars del prompt
    const primaryKey = `${filePath}:${promptKey}`;
    
    if (!seen.has(primaryKey)) {
      seen.set(primaryKey, agent);
      unique.push(agent);
    } else {
      // Si ya existe, mantener el que tenga más información
      const existing = seen.get(primaryKey)!;
      const existingScore = (existing.tools?.length || 0) + (existing.systemPrompt?.length || 0);
      const newScore = (agent.tools?.length || 0) + (agent.systemPrompt?.length || 0);
      
      if (newScore > existingScore) {
        // Reemplazar con el más completo
        const index = unique.indexOf(existing);
        unique[index] = agent;
        seen.set(primaryKey, agent);
      }
    }
  }
  
  console.log(`   🧹 Removed ${agents.length - unique.length} duplicate agents`);
  return unique;
}

/**
 * Detecta agentes explícitos (LangChain, OpenAI, Anthropic, etc.)
 */
function detectExplicitAgents(files: ProjectFile[]): CodeAgentComponent[] {
  const agents: CodeAgentComponent[] = [];
  const processedFiles = new Set<string>(); // Evitar procesar mismo archivo 2 veces
  
  for (const file of files) {
    if (!file.isCode) continue;
    
    const content = file.content;
    let agentDetected = false;
    
    // 🔥 Detectar Google Gemini agents (PRIORIDAD ALTA)
    if (content.includes('@google/genai') || content.includes('GoogleGenAI') || content.includes('gemini')) {
      // Intentar detectar múltiples agentes en el mismo archivo
      const multipleAgents = extractMultipleGeminiAgents(file);
      
      if (multipleAgents.length > 0) {
        agents.push(...multipleAgents); // Agregar TODOS los agentes encontrados
        processedFiles.add(file.path);
        agentDetected = true;
        console.log(`   ✅ Found ${multipleAgents.length} Gemini agents in ${file.name}`);
        continue; // ✅ NO hacer fallback si ya detectó agentes
      }
      
      // Fallback SOLO si no detectó ninguno con el método múltiple
      console.log(`   ⚠️  extractMultipleGeminiAgents found 0 agents in ${file.name}, trying basic detection...`);
      const agent = extractGeminiAgent(file);
      if (agent) {
        agents.push(agent);
        processedFiles.add(file.path);
        agentDetected = true;
        continue;
      }
    }
    
    // Detectar LangChain agents
    if (!agentDetected && (content.includes('from langchain') || content.includes("from 'langchain"))) {
      const agent = extractLangChainAgent(file);
      if (agent) {
        agents.push(agent);
        processedFiles.add(file.path);
        agentDetected = true;
        continue;
      }
    }
    
    // Detectar OpenAI agents
    if (!agentDetected && content.includes('openai.') && (content.includes('ChatCompletion') || content.includes('Assistant'))) {
      const agent = extractOpenAIAgent(file);
      if (agent) {
        agents.push(agent);
        processedFiles.add(file.path);
        agentDetected = true;
        continue;
      }
    }
    
    // Detectar Anthropic agents
    if (!agentDetected && content.includes('anthropic') && content.includes('messages.create')) {
      const agent = extractAnthropicAgent(file);
      if (agent) {
        agents.push(agent);
        processedFiles.add(file.path);
        agentDetected = true;
        continue;
      }
    }
    
    // 🔥 Detectar BuilderBot agents (WhatsApp framework)
    if (!agentDetected && (content.includes('@builderbot/') || content.includes('createBot') || content.includes('addAction'))) {
      const agent = extractBuilderBotAgent(file);
      if (agent) {
        agents.push(agent);
        processedFiles.add(file.path);
        agentDetected = true;
        continue;
      }
    }
    
    // 🔥 FALLBACK: Detectar custom agents solo si NO fue detectado por frameworks
    if (!agentDetected && !processedFiles.has(file.path)) {
      const systemPrompt = extractSystemPromptFromFile(content);
      if (systemPrompt && systemPrompt.length > 100) { // Aumentado umbral a 100 chars
        const agent = createAgentFromPrompt(file, systemPrompt);
        agents.push(agent);
        processedFiles.add(file.path);
      }
    }
  }
  
  return agents;
}

function extractLangChainAgent(file: ProjectFile): CodeAgentComponent | null {
  const content = file.content;
  
  // Buscar AgentExecutor, create_react_agent, etc.
  const agentPattern = /(?:AgentExecutor|create_react_agent|create_openai_functions_agent|initialize_agent)\s*\(/;
  if (!agentPattern.test(content)) return null;
  
  const systemPrompt = extractSystemPromptFromFile(content);
  const tools = extractToolsFromLangChain(content);
  
  return {
    type: 'agent',
    name: file.name.replace(/\.(ts|js|py)$/, '') + ' Agent',
    filePath: file.path,
    systemPrompt: systemPrompt || 'LangChain agent',
    description: `LangChain agent with ${tools.length} tools`,
    imports: extractImports(content),
    framework: 'LangChain',
    tools,
    confidence: 0.95,
    agentDetectionType: AgentDetectionType.EXPLICIT,
  };
}

function extractOpenAIAgent(file: ProjectFile): CodeAgentComponent | null {
  const content = file.content;
  const systemPrompt = extractSystemPromptFromFile(content);
  
  if (!systemPrompt) return null;
  
  const tools = extractToolsFromOpenAI(content);
  
  return {
    type: 'agent',
    name: file.name.replace(/\.(ts|js|py)$/, '') + ' Agent',
    filePath: file.path,
    systemPrompt,
    description: `OpenAI agent with ${tools.length} tools`,
    imports: extractImports(content),
    framework: 'OpenAI',
    tools,
    confidence: 0.9,
    agentDetectionType: AgentDetectionType.EXPLICIT,
  };
}

function extractAnthropicAgent(file: ProjectFile): CodeAgentComponent | null {
  const content = file.content;
  const systemPrompt = extractSystemPromptFromFile(content);
  
  if (!systemPrompt) return null;
  
  return {
    type: 'agent',
    name: file.name.replace(/\.(ts|js|py)$/, '') + ' Agent',
    filePath: file.path,
    systemPrompt,
    description: 'Anthropic Claude agent',
    imports: extractImports(content),
    framework: 'Anthropic',
    confidence: 0.9,
    agentDetectionType: AgentDetectionType.EXPLICIT,
  };
}

// 🔥 NUEVO: Detectar Google Gemini agents
function extractGeminiAgent(file: ProjectFile): CodeAgentComponent | null {
  const content = file.content;
  
  // Buscar llamadas a Gemini
  const hasGeminiCall = content.includes('generateContent') || 
                        content.includes('GoogleGenAI') ||
                        content.includes('gemini-');
  
  if (!hasGeminiCall) return null;
  
  // 🔥 NUEVO: Detectar si hay MÚLTIPLES agentes en el mismo archivo (métodos de clase)
  const multipleAgents = extractMultipleGeminiAgents(file);
  if (multipleAgents.length > 1) {
    // Devolver el primero y marcar que hay más
    // (la función principal detectExplicitAgents debería llamar a extractMultipleGeminiAgents directamente)
    return multipleAgents[0];
  }
  
  // Detección original para archivos con un solo agente
  const systemPrompt = extractSystemPromptFromFile(content);
  const tools = extractToolsFromGeneric(content);
  
  // 🔥 FILTRO: Si no hay prompt útil (>50 chars) ni tools, NO es un agente
  if ((!systemPrompt || systemPrompt.length < 50) && tools.length === 0) {
    return null; // Es solo una config de Gemini, no un agente
  }
  
  // 🔥 Mejorar detección de nombre desde comentarios
  let agentName = '';
  
  // Buscar "Agent 1", "Agent 2", "AGENTE 1", etc. con descripción
  const agentMatch = content.match(/(?:Agent|AGENTE)\s*([12])[:\s-]+([^\n]{1,80})/i);
  if (agentMatch) {
    const number = agentMatch[1];
    const desc = agentMatch[2].trim().replace(/[=:]/g, '').trim();
    agentName = `Agent ${number}: ${desc}`;
  } 
  // Buscar export const/function con nombre descriptivo
  else if (content.includes('export')) {
    const exportMatch = content.match(/export\s+(?:async\s+)?function\s+(\w+)|export\s+const\s+(\w+)/);
    if (exportMatch) {
      const funcName = exportMatch[1] || exportMatch[2];
      if (funcName && !['index', 'default', 'handler'].includes(funcName.toLowerCase())) {
        agentName = funcName.replace(/([A-Z])/g, ' $1').trim(); // camelCase → Title Case
      }
    }
  }
  
  // Fallback: usar filename pero sanitizado
  if (!agentName) {
    agentName = sanitizeAgentName(file.name.replace(/\.(ts|js|py)$/, ''));
  }
  
  // Evitar nombres genéricos como "index" o "agent"
  if (['index', 'agent', 'handler'].includes(agentName.toLowerCase())) {
    const folder = file.path.split('/').slice(-2, -1)[0] || 'root';
    agentName = `Gemini Agent (${folder})`;
  }
  
  return {
    type: 'agent',
    name: agentName,
    filePath: file.path,
    systemPrompt: systemPrompt || 'Google Gemini agent',
    description: `Google Gemini agent with ${tools.length} tools`,
    imports: extractImports(content),
    framework: 'Google Gemini',
    tools,
    confidence: 0.9,
    agentDetectionType: AgentDetectionType.EXPLICIT,
  };
}

/**
 * 🔥 NUEVO: Detectar MÚLTIPLES agentes Gemini en un mismo archivo
 * (Caso: Métodos de clase como executePlanner, executeCommercialAdvisor)
 */
function extractMultipleGeminiAgents(file: ProjectFile): CodeAgentComponent[] {
  const agents: CodeAgentComponent[] = [];
  const content = file.content;
  
  // Buscar cada método que use generateContent
  const methods: Array<{name: string; startLine: number; content: string}> = [];
  
  // Buscar métodos: private/public/protected async METHOD_NAME o async METHOD_NAME
  const methodPattern = /(?:private|public|protected)?\s*async\s+(\w+)\s*\(/g;
  let methodMatch;
  
  console.log(`   🔎 Searching for async methods in ${file.name}...`);
  
  while ((methodMatch = methodPattern.exec(content)) !== null) {
    const methodName = methodMatch[1];
    const startIndex = methodMatch.index;
    
    console.log(`   📌 Found async method: ${methodName}()`);
    
    // Buscar el bloque completo del método
    let braceCount = 0;
    let inMethod = false;
    let methodContent = '';
    let foundStart = false;
    
    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];
      
      if (char === '{') {
        braceCount++;
        inMethod = true;
        foundStart = true;
      }
      
      if (foundStart) {
        methodContent += char;
      }
      
      if (char === '}') {
        braceCount--;
        if (braceCount === 0 && inMethod) {
          break;
        }
      }
    }
    
    // Solo si el método usa generateContent
    if (methodContent.includes('generateContent')) {
      console.log(`   ✅ ${methodName}() uses generateContent`);
      methods.push({
        name: methodName,
        startLine: content.substring(0, startIndex).split('\n').length,
        content: methodContent
      });
    } else {
      console.log(`   ⏭️  ${methodName}() doesn't use generateContent`);
    }
  }
  
  console.log(`   🔍 Found ${methods.length} methods with generateContent in ${file.name}`);
  
  // Crear un agente por cada método
  for (const method of methods) {
    // Extraer system prompt del método (multiline) - buscar el template string más largo
    const allPrompts = method.content.matchAll(/`([\s\S]{50,}?)`/g);
    let longestPrompt = '';
    
    for (const match of allPrompts) {
      if (match[1].length > longestPrompt.length) {
        longestPrompt = match[1];
      }
    }
    
    const systemPrompt = longestPrompt.trim();
    
    console.log(`   📝 Method ${method.name}: prompt length = ${systemPrompt.length}`);
    
    if (!systemPrompt || systemPrompt.length < 100) {
      console.log(`   ⏭️  Skipping ${method.name} - prompt too short (${systemPrompt.length} chars)`);
      continue;
    }
    
    // 🔥 FILTRO: Verificar que sea un agente conversacional, no servicio de utilidad
    // Buscar palabras clave de agente conversacional EN EL PROMPT
    const isConversationalAgent = 
      /agent[eo]?\s*\d+|sos el agente|you are (an? )?(agent|assistant)|planificador|asesor|validator|commercial|advisor/i.test(systemPrompt);
    
    // Excluir explícitamente servicios de utilidad
    const isUtilityService = 
      /analiza.*imagen|describe.*image|process.*document|extract.*text|media.*processing/i.test(systemPrompt) ||
      /image|document|file|media/.test(method.name) && !/agent/i.test(systemPrompt);
    
    if (isUtilityService) {
      console.log(`   ⏭️  Skipping ${method.name} - utility service detected`);
      continue;
    }
    
    if (!isConversationalAgent) {
      console.log(`   ⏭️  Skipping ${method.name} - not a conversational agent (no agent keywords found)`);
      continue;
    }
    
    // Buscar descripción del agente en el prompt o comentarios
    let agentName = method.name.replace(/execute|run|process/i, '').trim();
    
    // Buscar "Agent 1", "Agente 2", etc. en el prompt
    const agentMatch = systemPrompt.match(/(?:Agent|AGENTE|Sos el Agente)\s*([12])[:\s-]+([^\n.]{1,100})/i);
    if (agentMatch) {
      const number = agentMatch[1];
      const desc = agentMatch[2].trim().replace(/[=:=]/g, '').trim();
      agentName = `Agent ${number}: ${desc}`;
    } else {
      // Usar nombre del método
      agentName = method.name.replace(/([A-Z])/g, ' $1').trim();
    }
    
    console.log(`   ✅ Detected agent: ${agentName}`);
    
    // Extraer tools del método
    const tools = extractToolsFromGeneric(method.content);
    
    agents.push({
      type: 'agent',
      name: agentName,
      filePath: file.path,
      systemPrompt: systemPrompt.substring(0, 500), // Primeros 500 chars
      description: `Gemini agent (${method.name} method)`,
      imports: extractImports(content),
      framework: 'Google Gemini',
      tools,
      confidence: 0.95,
      agentDetectionType: AgentDetectionType.EXPLICIT,
    });
  }
  
  return agents;
}

// 🔥 Helper para sanitizar nombres de agentes
function sanitizeAgentName(name: string): string {
  return name
    .replace(/[,._-]+/g, ' ') // Remover caracteres raros
    .replace(/\s+/g, ' ')       // Normalizar espacios
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// 🔥 NUEVO: Detectar BuilderBot agents (WhatsApp)
function extractBuilderBotAgent(file: ProjectFile): CodeAgentComponent | null {
  const content = file.content;
  const systemPrompt = extractSystemPromptFromFile(content);
  
  // Detectar flows de BuilderBot
  const hasFlows = content.includes('addAction') || 
                   content.includes('createBot') ||
                   content.includes('addKeyword');
  
  if (!hasFlows) return null;
  
  // Extraer keywords del flow
  const keywords: string[] = [];
  const keywordPattern = /addKeyword\s*\(\s*\[([^\]]+)\]/g;
  let match;
  while ((match = keywordPattern.exec(content)) !== null) {
    const kws = match[1].split(',').map(k => k.trim().replace(/['"]/g, ''));
    keywords.push(...kws);
  }
  
  // 🔥 Si NO tiene keywords NI system prompt, no es un agente útil
  if (keywords.length === 0 && !systemPrompt) {
    return null;
  }
  
  // Generar nombre descriptivo
  let agentName = file.name.replace(/\.(ts|js|py)$/, '');
  
  if (keywords.length > 0) {
    const firstKeywords = keywords.slice(0, 3).join(', ');
    agentName = `${agentName} Flow (${firstKeywords})`;
  } else {
    agentName = `${agentName} Flow`;
  }
  
  const prompt = systemPrompt || 
                 (keywords.length > 0 
                   ? `BuilderBot flow triggered by: ${keywords.join(', ')}` 
                   : 'BuilderBot flow');
  
  return {
    type: 'agent',
    name: agentName,
    filePath: file.path,
    systemPrompt: prompt,
    description: `WhatsApp bot flow with ${keywords.length} keywords`,
    imports: extractImports(content),
    framework: 'BuilderBot',
    tools: keywords,
    confidence: keywords.length > 0 ? 0.85 : 0.6,
    agentDetectionType: AgentDetectionType.EXPLICIT,
  };
}

function createAgentFromPrompt(file: ProjectFile, systemPrompt: string): CodeAgentComponent {
  return {
    type: 'agent',
    name: file.name.replace(/\.(ts|js|py)$/, '') + ' Agent',
    filePath: file.path,
    systemPrompt,
    description: 'Custom agent with explicit system prompt',
    imports: extractImports(file.content),
    framework: 'Custom',
    confidence: 0.75,
    agentDetectionType: AgentDetectionType.EXPLICIT,
  };
}

/**
 * Extrae system prompt de un archivo (soporta multilinea y templates)
 */
function extractSystemPromptFromFile(content: string): string | undefined {
  // Template literals largos (multilineales con más de 3 líneas)
  const longTemplateMatch = content.match(
    /(?:system_prompt|systemPrompt|systemMessage|system|instructions?|backstory|role_description|prompt)\s*[:=]\s*`([^`]{100,})`/si
  );
  if (longTemplateMatch) return cleanPrompt(longTemplateMatch[1]);
  
  // Template literals estándar
  const templateMatch = content.match(
    /(?:system_prompt|systemPrompt|systemMessage|system|instructions?|backstory|role_description)\s*[:=]\s*`([^`]+)`/si
  );
  if (templateMatch) return cleanPrompt(templateMatch[1]);
  
  // Strings largos (>50 chars) - típico de prompts
  const longStringMatch = content.match(
    /(?:system_prompt|systemPrompt|systemMessage|system|instructions?)\s*[:=]\s*["']([^"']{100,})["']/si
  );
  if (longStringMatch) return cleanPrompt(longStringMatch[1]);
  
  // Strings
  const stringMatch = content.match(
    /(?:system_prompt|systemPrompt|systemMessage|instructions?)\s*[:=]\s*["']([^"']{50,})["']/si
  );
  if (stringMatch) return cleanPrompt(stringMatch[1]);
  
  // Objetos de configuración (contents, messages)
  const contentsMatch = content.match(
    /contents\s*:\s*[`'"]([^`'"]{100,})[`'"]/si
  );
  if (contentsMatch) return cleanPrompt(contentsMatch[1]);
  
  // Objetos de configuración estándar
  const objectMatch = content.match(
    /system[:=]\s*[`'"]([^`'"]{50,})[`'"]/si
  );
  if (objectMatch) return cleanPrompt(objectMatch[1]);
  
  // 🔥 NUEVO: Detectar comentarios largos que parecen prompts (descripciones de agentes)
  const commentPromptMatch = content.match(
    /\/\*\*[\s\S]*?@description\s+([^\n]{100,}?)[\s\S]*?\*\//i
  );
  if (commentPromptMatch) return cleanPrompt(commentPromptMatch[1]);
  
  // 🔥 NUEVO: Detectar constantes con "PROMPT" en el nombre
  const constantPromptMatch = content.match(
    /const\s+\w*(?:PROMPT|SYSTEM)\w*\s*=\s*[`'"]([^`'"]{100,})[`'"]/si
  );
  if (constantPromptMatch) return cleanPrompt(constantPromptMatch[1]);
  
  return undefined;
}

function cleanPrompt(prompt: string): string {
  return prompt
    .replace(/\\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractToolsFromLangChain(content: string): string[] {
  const tools: string[] = [];
  
  // Buscar tool definitions
  const toolPattern = /Tool\s*\(\s*name\s*=\s*["']([^"']+)["']/g;
  let match;
  while ((match = toolPattern.exec(content)) !== null) {
    tools.push(match[1]);
  }
  
  // Buscar funciones decoradas con @tool
  const decoratorPattern = /@tool\s+(?:async\s+)?def\s+(\w+)/g;
  while ((match = decoratorPattern.exec(content)) !== null) {
    tools.push(match[1]);
  }
  
  return tools;
}

function extractToolsFromOpenAI(content: string): string[] {
  const tools: string[] = [];
  
  // Buscar function calling definitions
  const functionPattern = /functions\s*:\s*\[[\s\S]*?name\s*:\s*["']([^"']+)["']/g;
  let match;
  while ((match = functionPattern.exec(content)) !== null) {
    tools.push(match[1]);
  }
  
  return tools;
}

// 🔥 NUEVO: Extraer tools de forma genérica
function extractToolsFromGeneric(content: string): string[] {
  const tools: string[] = [];
  
  // Buscar funciones exportadas que parecen tools
  const exportPattern = /export\s+(?:async\s+)?function\s+(\w+)/g;
  let match;
  while ((match = exportPattern.exec(content)) !== null) {
    const funcName = match[1];
    // Solo incluir si parece una tool (calc, search, update, etc.)
    if (/calc|search|buscar|actualizar|update|get|fetch|create|send/i.test(funcName)) {
      tools.push(funcName);
    }
  }
  
  // Buscar tools declaradas explícitamente
  const toolDeclarationPattern = /(?:tool|Tool)[\s\S]*?name\s*[:=]\s*["']([^"']+)["']/g;
  while ((match = toolDeclarationPattern.exec(content)) !== null) {
    tools.push(match[1]);
  }
  
  return tools;
}

function extractImports(content: string): string[] {
  const imports: string[] = [];
  
  // TypeScript/JavaScript imports
  const tsPattern = /import\s+.*?from\s+["']([^"']+)["']/g;
  let match;
  while ((match = tsPattern.exec(content)) !== null) {
    imports.push(match[1]);
  }
  
  // Python imports
  const pyPattern = /(?:from\s+([^\s]+)\s+import|import\s+([^\s]+))/g;
  while ((match = pyPattern.exec(content)) !== null) {
    imports.push(match[1] || match[2]);
  }
  
  return [...new Set(imports)];
}

/**
 * Detecta agentes implícitos (event-driven, handlers, etc.)
 */
async function detectImplicitAgents(
  files: ProjectFile[],
  language: string
): Promise<CodeAgentComponent[]> {
  console.log('🔍 Detecting implicit agents...');
  
  const agents: CodeAgentComponent[] = [];
  
  // Buscar archivos con patrones de handlers/controllers
  const handlerFiles = files.filter(f => {
    const nameLower = f.name.toLowerCase();
    return f.isCode && (
      nameLower.includes('handler') ||
      nameLower.includes('controller') ||
      nameLower.includes('service') ||
      nameLower.includes('processor') ||
      nameLower.includes('manager')
    );
  });
  
  console.log(`   Found ${handlerFiles.length} potential handler files`);
  
  for (const file of handlerFiles) {
    const content = file.content;
    
    // 🔥 FILTRO: NO detectar como agente implícito si ya tiene agentes explícitos detectados
    // (ej: si el archivo ya tiene agentes Gemini, no crear agentes implícitos adicionales)
    const hasExplicitAI = content.includes('generateContent') || 
                         content.includes('chat.completions') ||
                         content.includes('messages.create') ||
                         content.includes('@google/genai') ||
                         content.includes('langchain');
    
    if (hasExplicitAI) {
      console.log(`   ⏭️  Skipping ${file.name} - already has explicit AI agents`);
      continue; // Ya se detectó como agente explícito
    }
    
    // 🔥 FILTRO 2: NO detectar servicios de utilidad como "media processing"
    const isUtilityService = /media|image|file|upload|storage|cache|logger|config/i.test(file.name);
    if (isUtilityService) {
      console.log(`   ⏭️  Skipping ${file.name} - utility service, not an agent`);
      continue;
    }
    
    const behaviors = extractBehaviors(file);
    
    if (behaviors.length > 0) {
      const systemPrompt = await inferSystemPromptFromBehaviors(behaviors, file, language);
      
      const agent: CodeAgentComponent = {
        type: 'agent',
        name: file.name.replace(/\.(ts|js|py)$/, ''),
        filePath: file.path,
        systemPrompt: systemPrompt || `Implicit agent: ${file.name}`,
        description: `Implicit agent with ${behaviors.length} behaviors`,
        imports: extractImports(file.content),
        framework: 'Implicit/Event-Driven',
        confidence: 0.7,
        agentDetectionType: AgentDetectionType.IMPLICIT,
        behaviors,
        handlers: [{ name: file.name, filePath: file.path }],
      };
      
      agents.push(agent);
    }
  }
  
  return agents;
}

function extractBehaviors(file: ProjectFile): AgentBehavior[] {
  const behaviors: AgentBehavior[] = [];
  const content = file.content;
  
  // Buscar funciones exportadas
  const functionPattern = /export\s+(?:async\s+)?function\s+(\w+)\s*\(/g;
  let match;
  
  while ((match = functionPattern.exec(content)) !== null) {
    const functionName = match[1];
    const functionBody = extractFunctionBody(content, match.index);
    
    if (!functionBody) continue;
    
    const behavior: AgentBehavior = {
      name: functionName,
      type: classifyBehaviorType(functionName, functionBody),
      description: `Handler function: ${functionName}`,
      inputTypes: extractInputTypes(functionBody),
      outputTypes: extractOutputTypes(functionBody),
      toolsUsed: extractToolCalls(functionBody),
      databasesUsed: extractDatabaseCalls(functionBody),
      conditionChecks: extractConditions(functionBody),
      confidenceScore: 0.8,
    };
    
    behaviors.push(behavior);
  }
  
  return behaviors;
}

function extractFunctionBody(content: string, startIndex: number): string | null {
  let braceCount = 0;
  let started = false;
  let body = '';
  
  for (let i = startIndex; i < content.length && i < startIndex + 2000; i++) {
    const char = content[i];
    
    if (char === '{') {
      braceCount++;
      started = true;
    }
    
    if (started) {
      body += char;
      
      if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return body;
        }
      }
    }
  }
  
  return null;
}

function classifyBehaviorType(name: string, body: string): AgentBehavior['type'] {
  const nameLower = name.toLowerCase();
  
  if (nameLower.includes('valid') || nameLower.includes('check')) return 'validation';
  if (nameLower.includes('get') || nameLower.includes('fetch') || nameLower.includes('query')) return 'retrieval';
  if (nameLower.includes('process') || nameLower.includes('handle')) return 'processing';
  if (nameLower.includes('greet') || nameLower.includes('welcome')) return 'greeting';
  
  return 'unknown';
}

function extractInputTypes(body: string): string[] {
  const types: string[] = [];
  
  // Buscar parámetros tipados
  const paramPattern = /\(\s*(\w+)\s*:\s*(\w+)/g;
  let match;
  while ((match = paramPattern.exec(body)) !== null) {
    types.push(match[2]);
  }
  
  return types.length > 0 ? types : ['any'];
}

function extractOutputTypes(body: string): string[] {
  // Buscar return statements
  const returnPattern = /return\s+([^;]+)/g;
  const match = returnPattern.exec(body);
  
  return match ? ['Response'] : ['void'];
}

function extractToolCalls(body: string): string[] {
  const tools: string[] = [];
  
  if (body.includes('sendEmail') || body.includes('nodemailer')) tools.push('Email');
  if (body.includes('sendMessage') || body.includes('twilio')) tools.push('SMS');
  if (body.includes('calendar') || body.includes('createEvent')) tools.push('Calendar');
  if (body.includes('fetch(') || body.includes('axios')) tools.push('HTTP');
  if (body.includes('stripe') || body.includes('payment')) tools.push('Payment');
  
  return tools;
}

function extractDatabaseCalls(body: string): string[] {
  const dbs: string[] = [];
  
  if (body.includes('prisma.') || body.includes('.findMany')) dbs.push('Prisma');
  if (body.includes('supabase.') || body.includes('.from(')) dbs.push('Supabase');
  if (body.includes('db.collection') || body.includes('mongoose')) dbs.push('MongoDB');
  if (body.includes('.query(') || body.includes('SELECT')) dbs.push('SQL');
  
  return dbs;
}

function extractConditions(body: string): string[] {
  const conditions: string[] = [];
  
  const ifPattern = /if\s*\(([^)]{10,100})\)/g;
  let match;
  
  while ((match = ifPattern.exec(body)) !== null) {
    conditions.push(match[1].trim());
  }
  
  return conditions.slice(0, 5); // Máximo 5
}

/**
 * Usa Gemini para inferir system prompt desde comportamientos
 */
async function inferSystemPromptFromBehaviors(
  behaviors: AgentBehavior[],
  file: ProjectFile,
  language: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const codeSnippet = file.content.substring(0, 2000);
  const behaviorSummary = behaviors
    .map(b => `- ${b.name}: ${b.type}, tools=${b.toolsUsed.join(',')}, db=${b.databasesUsed.join(',')}`)
    .join('\n');
  
  const prompt = `You are an expert at analyzing implicit AI agents in code.

Here's a handler/service file with multiple behaviors:

FILE: ${file.name}

CODE SNIPPET:
\`\`\`
${codeSnippet}
\`\`\`

DETECTED BEHAVIORS:
${behaviorSummary}

Based on this, write the IMPLICIT system prompt that describes:
1. What this agent does (its role)
2. How it processes information
3. What tools/databases it uses
4. Expected behavior patterns

Write ONLY the system prompt in natural language.
${language === 'es' ? 'RESPOND IN SPANISH' : 'RESPOND IN ENGLISH'}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: prompt,
    });
    
    if (response.usageMetadata) {
      costTracker.recordUsage({
        promptTokens: response.usageMetadata.promptTokenCount || 0,
        responseTokens: response.usageMetadata.candidatesTokenCount || 0,
        totalTokens: (response.usageMetadata.promptTokenCount || 0) + (response.usageMetadata.candidatesTokenCount || 0),
        model: 'gemini-2.0-flash-exp',
        operation: 'infer_system_prompt_deep',
      });
    }
    
    return response.text.trim();
  } catch (error) {
    console.error('Error inferring system prompt:', error);
    return `Implicit agent from ${file.name}`;
  }
}

/**
 * Enriquece agentes detectados con análisis IA
 */
async function enrichAgentsWithAI(
  agents: CodeAgentComponent[],
  files: ProjectFile[],
  language: string
): Promise<CodeAgentComponent[]> {
  console.log('🧠 Enriching agents with AI analysis...');
  
  // Por ahora retornar sin cambios (puede extenderse)
  return agents;
}

// =====================================
// 4. ANÁLISIS DE BASES DE DATOS
// =====================================

/**
 * Mapea schemas de bases de datos completos usando el parser avanzado
 */
async function analyzeDatabaseSchemas(files: ProjectFile[]): Promise<any[]> {
  console.log('💾 Analyzing database schemas with advanced parser...');
  
  // 🔥 CRÍTICO: Pasar archivos relevantes, no solo isSchema
  // El parser tiene filtros internos más inteligentes para detectar:
  // - Drizzle (.ts con pgTable/mysqlTable)
  // - TypeORM (.ts con @Entity/@Column)
  // - Mongoose (.ts con new Schema)
  // - Sequelize (.ts con sequelize.define)
  // - Prisma (.prisma)
  // - SQL (.sql)
  // - Raw SQL queries (INSERT INTO, UPDATE, SELECT FROM en .ts/.js)
  // Filtrar archivos relevantes para análisis de schemas
  const relevantFiles = files.filter(f => 
    f.isSchema || // Archivos ya marcados (.prisma, .sql)
    f.isCode ||   // Archivos de código que pueden contener schemas o queries
    f.path.toLowerCase().includes('schema') ||
    f.path.toLowerCase().includes('model') ||
    f.path.toLowerCase().includes('entity') ||
    f.path.toLowerCase().includes('migration') ||
    f.path.toLowerCase().includes('database') ||
    f.path.toLowerCase().includes('db')
  );
  
  // 🔍 DEBUG: Contar archivos con SQL queries
  const withSQL = relevantFiles.filter(f => 
    f.content && (
      f.content.includes('INSERT INTO') ||
      f.content.includes('UPDATE') ||
      f.content.includes('SELECT') ||
      f.content.includes('DELETE FROM') ||
      f.content.includes('CREATE TABLE')
    )
  ).length;
  
  console.log(`   📋 Analyzing ${relevantFiles.length}/${files.length} files for database schemas (${withSQL} with SQL queries)`);
  
  // Convertir ProjectFile[] a formato esperado
  const fileContents = relevantFiles.map(f => ({
    path: f.path,
    name: f.name,
    content: f.content,
    extension: f.extension,
  }));
  
  const schemas = await parseSchemas(fileContents);
  
  console.log(`✅ Found ${schemas.length} database schemas`);
  
  return schemas;
}

// =====================================
// 5. FUNCIÓN PRINCIPAL
// =====================================

/**
 * Análisis profundo de un proyecto ZIP
 */
export async function deepAnalyzeProject(
  zipBuffer: ArrayBuffer,
  language: string = 'en'
): Promise<ParsedCodeProject> {
  console.log('🔬 Starting DEEP project analysis...');
  const startTime = performance.now();
  
  // FASE 1: Extracción y clasificación
  const project = await extractAndClassifyFiles(zipBuffer);
  
  // FASE 2: Análisis de dependencias
  const packageJson = project.configFiles.find(f => f.name === 'package.json');
  const dependencies = packageJson ? JSON.parse(packageJson.content).dependencies || {} : {};
  
  // FASE 3: Detectar framework
  const framework = detectFramework(project.allFiles, dependencies);
  
  // Preparar fileContents para análisis
  const fileContents = project.allFiles.map(f => ({
    path: f.path,
    name: f.name,
    content: f.content,
  }));
  
  // FASE 4: Análisis profundo de agentes
  const agents = await detectAgentsDeep(project.allFiles, language);
  
  // FASE 4.5: 🔥 NUEVO - Detectar wrappers de BD y flujo de datos
  const { detectDatabaseWrappers } = await import('./databaseWrapperDetector');
  const { wrappers, dataFlows } = detectDatabaseWrappers(
    fileContents,
    agents.map(a => ({ name: a.name, filePath: a.filePath }))
  );
  
  // FASE 5: Análisis de bases de datos
  const databaseSchemas = await analyzeDatabaseSchemas(project.allFiles);
  const databases = summarizeDatabases(databaseSchemas);
  
  // FASE 6: Detectar herramientas y APIs usando integrationMapper
  
  const integrations = await detectIntegrations(fileContents);
  const tools = integrations
    .filter(i => ['messaging', 'email', 'calendar', 'crm', 'payment', 'storage', 'auth'].includes(i.category))
    .map(i => ({
      name: i.name,
      type: i.category as any,
      confidence: i.confidence,
      evidence: i.detectedIn,
    }));
  
  const apis = integrations
    .filter(i => ['ai_api', 'custom_api'].includes(i.category))
    .map(i => ({
      service: i.name,
      type: (i.category === 'ai_api' ? 'ai' : 'external') as 'ai' | 'external' | 'internal',
      confidence: i.confidence,
      evidence: i.detectedIn,
    }));
  
  const result: ParsedCodeProject = {
    projectType: 'nodejs',
    framework,
    language: detectLanguage(project.allFiles),
    confidence: calculateConfidence(agents, databases, tools),
    agents,
    tools,
    databases,
    apis,
    dependencies,
    scripts: packageJson ? JSON.parse(packageJson.content).scripts || {} : {},
    fileCount: project.fileCount,
    totalLines: project.totalLines,
    summary: generateSummary(agents, databases, tools, framework),
    apiEndpoints: detectEndpoints(project.allFiles),
    environmentVariables: detectEnvVars(project.allFiles),
    // 🔥 NUEVO: Análisis profundo con wrappers y flujo de datos
    deepAnalysis: {
      hooks: wrappers.map(w => ({
        name: w.name,
        filePath: w.filePath,
        queries: [{
          table: w.inferredTable || null,
          queryType: w.operation === 'multiple' ? 'unknown' : w.operation,
          fields: w.fields
        }],
        usedBy: w.usedByAgents,
        semanticPurpose: inferSemanticPurpose(w.name, w.inferredTable || '')
      })),
      databaseQueries: wrappers.map(w => ({
        functionName: w.name,
        filePath: w.filePath,
        table: w.inferredTable || null,
        queryType: w.operation === 'multiple' ? 'unknown' : w.operation,
        fields: w.fields,
        semanticContext: inferSemanticPurpose(w.name, w.inferredTable || '')
      })),
      operations: dataFlows.map(df => ({
        agentName: df.agent,
        operation: df.operation as any,
        table: df.table,
        fields: [],
        hookOrFunction: df.wrapper,
        semanticContext: df.operation
      })),
      dataFlow: dataFlows.map(df => ({
        from: df.agent,
        through: df.wrapper,
        to: df.table,
        fields: [],
        purpose: df.operation
      })),
      tables: summarizeTablesFromWrappers(wrappers)
    }
  };
  
  const duration = (performance.now() - startTime).toFixed(2);
  console.log(`✅ DEEP analysis completed in ${duration}ms`);
  console.log(`   Agents: ${agents.length}, Databases: ${databases.length}, Tools: ${tools.length}, APIs: ${apis.length}`);
  console.log(`   🔥 DB Wrappers: ${wrappers.length}, Data Flows: ${dataFlows.length}`);
  
  return result;
}

// =====================================
// 6. FUNCIONES AUXILIARES
// =====================================

function detectFramework(files: ProjectFile[], deps: Record<string, string>): DetectedFramework | undefined {
  if (deps['express']) return { name: 'Express', confidence: 0.9, evidence: ['package.json'] };
  if (deps['@nestjs/core']) return { name: 'NestJS', confidence: 0.95, evidence: ['package.json'] };
  if (deps['next']) return { name: 'Next.js', confidence: 0.95, evidence: ['package.json'] };
  if (deps['fastify']) return { name: 'Fastify', confidence: 0.9, evidence: ['package.json'] };
  
  return undefined;
}

function detectLanguage(files: ProjectFile[]): string {
  const codeFiles = files.filter(f => f.isCode);
  const tsFiles = codeFiles.filter(f => ['.ts', '.tsx'].includes(f.extension));
  const jsFiles = codeFiles.filter(f => ['.js', '.jsx'].includes(f.extension));
  const pyFiles = codeFiles.filter(f => f.extension === '.py');
  
  if (tsFiles.length > jsFiles.length / 2) return 'TypeScript';
  if (pyFiles.length > 0) return 'Python';
  return 'JavaScript';
}

function summarizeDatabases(schemas: any[]): DetectedDatabase[] {
  const dbMap = new Map<string, DetectedDatabase>();
  
  for (const schema of schemas) {
    const type = schema.provider || 'Unknown';
    
    if (!dbMap.has(type)) {
      dbMap.set(type, {
        provider: type,
        confidence: schema.confidence || 0.8,
        evidence: schema.detectedFrom || [],
        // 🔥 NUEVO: Incluir tablas y metadata del schema
        ...(schema.tables && { tables: schema.tables }),
        ...(schema.type && { type: schema.type }),
        ...(schema.relationships && { relationships: schema.relationships }),
      } as any);
    }
  }
  
  return Array.from(dbMap.values());
}

function detectEndpoints(files: ProjectFile[]): string[] {
  const endpoints: string[] = [];
  
  for (const file of files) {
    const routePattern = /(?:router|app)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = routePattern.exec(file.content)) !== null) {
      endpoints.push(`${match[1].toUpperCase()} ${match[2]}`);
    }
  }
  
  return endpoints;
}

function detectEnvVars(files: ProjectFile[]): string[] {
  const envVars = new Set<string>();
  
  for (const file of files) {
    const pattern = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
    let match;
    
    while ((match = pattern.exec(file.content)) !== null) {
      envVars.add(match[1]);
    }
  }
  
  return Array.from(envVars);
}

function calculateConfidence(
  agents: CodeAgentComponent[],
  databases: DetectedDatabase[],
  tools: DetectedTool[]
): number {
  let score = 0.5;
  
  if (agents.length > 0) score += 0.3;
  if (databases.length > 0) score += 0.1;
  if (tools.length > 0) score += 0.1;
  
  return Math.min(1, score);
}

/**
 * 🔥 NUEVO: Infiere el propósito semántico de un wrapper
 */
function inferSemanticPurpose(wrapperName: string, tableName: string): string {
  const combined = `${wrapperName} ${tableName}`.toLowerCase();
  
  if (/chat|history|message|conversation/.test(combined)) return 'conversations';
  if (/price|precio|cost|costo|product|producto/.test(combined)) return 'pricing';
  if (/user|usuario|customer|cliente/.test(combined)) return 'users';
  if (/memoria|memory|temporal|state/.test(combined)) return 'state_management';
  if (/resumen|summary/.test(combined)) return 'summaries';
  if (/order|pedido|venta|sale/.test(combined)) return 'orders';
  
  return 'general';
}

/**
 * 🔥 NUEVO: Resume tablas desde wrappers detectados
 */
function summarizeTablesFromWrappers(wrappers: any[]): Array<{
  name: string;
  operations: Array<{
    type: 'read' | 'write' | 'delete';
    usedBy: string[];
    fields: string[];
  }>;
}> {
  const tablesMap = new Map<string, {
    name: string;
    operations: Map<string, { type: 'read' | 'write' | 'delete'; usedBy: Set<string>; fields: Set<string> }>;
  }>();
  
  for (const wrapper of wrappers) {
    if (!wrapper.inferredTable) continue;
    
    if (!tablesMap.has(wrapper.inferredTable)) {
      tablesMap.set(wrapper.inferredTable, {
        name: wrapper.inferredTable,
        operations: new Map()
      });
    }
    
    const table = tablesMap.get(wrapper.inferredTable)!;
    
    // Determinar tipo de operación
    let opType: 'read' | 'write' | 'delete' = 'read';
    if (['insert', 'update'].includes(wrapper.operation)) opType = 'write';
    if (wrapper.operation === 'delete') opType = 'delete';
    
    const opKey = opType;
    
    if (!table.operations.has(opKey)) {
      table.operations.set(opKey, {
        type: opType,
        usedBy: new Set(),
        fields: new Set()
      });
    }
    
    const op = table.operations.get(opKey)!;
    
    // Agregar wrapper a usedBy
    op.usedBy.add(wrapper.name);
    
    // Agregar agentes que usan este wrapper
    for (const agent of wrapper.usedByAgents) {
      op.usedBy.add(agent);
    }
    
    // Agregar fields
    for (const field of wrapper.fields) {
      op.fields.add(field);
    }
  }
  
  // Convertir a formato final
  return Array.from(tablesMap.values()).map(table => ({
    name: table.name,
    operations: Array.from(table.operations.values()).map(op => ({
      type: op.type,
      usedBy: Array.from(op.usedBy),
      fields: Array.from(op.fields)
    }))
  }));
}

function generateSummary(
  agents: CodeAgentComponent[],
  databases: DetectedDatabase[],
  tools: DetectedTool[],
  framework?: DetectedFramework
): string {
  const parts: string[] = [];
  
  if (framework) parts.push(framework.name);
  if (agents.length > 0) parts.push(`${agents.length} AI agent(s)`);
  if (databases.length > 0) parts.push(`${databases.length} database(s)`);
  if (tools.length > 0) parts.push(`${tools.length} tool(s)`);
  
  return parts.join(', ') || 'Unknown project';
}
