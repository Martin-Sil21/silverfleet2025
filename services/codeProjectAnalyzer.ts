/**
 * 🔍 Code Project Analyzer
 * 
 * Analiza proyectos Node.js/TypeScript descargados como ZIP
 * Detecta:
 * - Framework (Express, NestJS, etc.)
 * - Agentes IA (classes, system prompts)
 * - Herramientas externas (Email, Calendar, APIs)
 * - Bases de datos (PostgreSQL, MongoDB, etc.)
 * - Dependencias y scripts
 * 
 * 🌳 NUEVO: Usa AST parsing real en lugar de regex
 */

import JSZip from 'jszip';
import {
  ParsedCodeProject,
  DetectedFramework,
  DetectedDatabase,
  DetectedTool,
  DetectedAPI,
  CodeAgentComponent,
  AgentDetectionType,
  AgentBehavior,
  ImplicitAgentAnalysis,
} from '../types';
import { GoogleGenAI } from '@google/genai';
import { costTracker } from './costTracker';
import { analyzeProjectWithAST, type ParsedFile } from './astAnalyzer';
import { 
  buildDependencyGraph, 
  groupFilesByModule, 
  findMainModules,
  type CodeModule 
} from './dependencyAnalyzer';

interface ExtractedFile {
  path: string;
  name: string;
  content: string;
}

/**
 * Analiza un archivo ZIP con proyecto Node/TypeScript
 */
export async function analyzeCodeProject(zipBuffer: ArrayBuffer): Promise<ParsedCodeProject> {
  const startTime = performance.now();
  
  // 1. Extraer archivos del ZIP
  const files = await extractProjectFiles(zipBuffer);
  
  // 2. Parsear package.json
  const { dependencies, scripts } = parsePackageJson(files);
  
  // 3. Detectar framework
  const framework = detectFramework(files, dependencies);
  
  // 🆕 4. ANÁLISIS AST - Parsear estructura REAL del código
  console.log(`🌳 Running AST analysis...`);
  const parsedFiles = await analyzeProjectWithAST(files);
  const dependencyGraph = buildDependencyGraph(parsedFiles);
  const codeModules = groupFilesByModule(parsedFiles, dependencyGraph);
  const mainModules = findMainModules(codeModules);
  
  console.log(`   📦 Detected ${codeModules.length} code modules`);
  console.log(`   🎯 ${mainModules.length} main modules with entry points`);
  
  // 5. Crear agentes basados en módulos detectados
  let agents: CodeAgentComponent[] = [];
  
  for (const module of mainModules) {
    const moduleFiles = parsedFiles.filter(f => module.files.includes(f.filePath));
    const agent = createAgentFromModule(module, moduleFiles, framework);
    if (agent) agents.push(agent);
  }
  
  console.log(`   🤖 Created ${agents.length} agents from code modules`);
  
  // 6. Detectar herramientas externas
  const tools = detectTools(files, dependencies);
  
  // 7. Detectar bases de datos
  const databases = detectDatabases(files, dependencies);
  
  // 8. Detectar APIs externas
  const apis = detectAPIs(files, dependencies);
  
  // 9. Detectar endpoints HTTP
  const apiEndpoints = detectEndpoints(files);
  
  // 10. Detectar variables de entorno
  const environmentVariables = detectEnvironmentVariables(files);
  
  const result: ParsedCodeProject = {
    projectType: 'nodejs',
    framework,
    language: 'TypeScript/JavaScript',
    confidence: calculateConfidence({ framework, agents, tools, databases, apis }),
    agents,
    tools,
    databases,
    apis,
    dependencies,
    scripts,
    fileCount: files.length,
    totalLines: calculateTotalLines(files),
    summary: generateSummary({ agents, tools, databases, apis, framework }),
    apiEndpoints,
    environmentVariables,
    agentDetectionType: AgentDetectionType.IMPLICIT,  // TODO: detectar dinámicamente
    implicitAgentAnalysis: undefined,  // TODO: agregar análisis si necesario
  };
  
  console.log(`✅ Project analysis completed in ${(performance.now() - startTime).toFixed(2)}ms`);
  return result;
}

/**
 * Crea un agente a partir de un módulo de código detectado
 */
function createAgentFromModule(
  module: CodeModule, 
  moduleFiles: ParsedFile[], 
  framework: DetectedFramework | null
): CodeAgentComponent | null {
  if (moduleFiles.length === 0) return null;
  
  // Extraer información del módulo
  const allFunctions = moduleFiles.flatMap(f => f.functions);
  const allClasses = moduleFiles.flatMap(f => f.classes);
  const allEntryPoints = moduleFiles.flatMap(f => f.entryPoints);
  
  // Buscar JSDoc como system prompt
  const systemPrompt = findSystemPrompt(moduleFiles) || module.description;
  
  // Nombre del agente basado en módulo
  const agentName = module.name
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') + ' Agent';
  
  const agent: CodeAgentComponent = {
    type: 'agent',
    name: agentName,
    filePath: module.files[0] || 'unknown',
    systemPrompt,
    description: module.description,
    imports: [],
    framework: framework?.name || 'Custom',
    confidence: module.confidence,
    agentDetectionType: AgentDetectionType.IMPLICIT,
    behaviors: [],  // TODO: mapear desde functions
    handlers: allEntryPoints.map(ep => ({
      name: ep.handler,
      filePath: ep.filePath,
    })),
    estimatedIntention: module.description,
  };
  
  return agent;
}

/**
 * Busca JSDoc que pueda servir como system prompt
 */
function findSystemPrompt(files: ParsedFile[]): string | undefined {
  for (const file of files) {
    // Buscar en clases
    for (const cls of file.classes) {
      if (cls.jsDoc && cls.jsDoc.length > 50) {
        return cleanJSDoc(cls.jsDoc);
      }
    }
    // Buscar en funciones principales
    for (const func of file.functions) {
      if (func.isExported && func.jsDoc && func.jsDoc.length > 50) {
        return cleanJSDoc(func.jsDoc);
      }
    }
  }
  return undefined;
}

/**
 * Limpia JSDoc para usar como system prompt
 */
function cleanJSDoc(jsDoc: string): string {
  return jsDoc
    .replace(/\/\*\*|\*\/|\*/g, '')  // Quitar /** */ y *
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('@'))  // Quitar @tags
    .join(' ')
    .trim();
}

/**
 * Extrae archivos del ZIP, filtrando carpetas innecesarias
 */
async function extractProjectFiles(zipBuffer: ArrayBuffer): Promise<ExtractedFile[]> {
  const extractStart = performance.now();
  const files: ExtractedFile[] = [];
  
  const zip = new JSZip();
  await zip.loadAsync(zipBuffer);
  
  const blacklistPatterns = [
    'node_modules/', '.git/', 'dist/', 'build/', '.vscode/',
    '__pycache__/', '.pytest_cache/', '.env', '.zip', '.exe', '.dll',
  ];
  
  const isBlacklisted = (path: string) =>
    blacklistPatterns.some(pattern => path.toLowerCase().includes(pattern));
  
  const isSourceFile = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    return ['ts', 'tsx', 'js', 'jsx', 'json', 'yml', 'yaml'].includes(ext || '');
  };
  
  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir || isBlacklisted(path) || !isSourceFile(path)) continue;
    
    try {
      const content = await file.async('text');
      files.push({ path, name: path.split('/').pop() || path, content });
    } catch (e) {
      // Ignorar archivos que no se pueden leer
    }
  }
  
  console.log(`📦 Extracted ${files.length} files in ${(performance.now() - extractStart).toFixed(2)}ms`);
  return files;
}

/**
 * Parsea package.json
 */
function parsePackageJson(files: ExtractedFile[]): {
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
} {
  const packageFile = files.find(f => f.name === 'package.json');
  if (!packageFile) {
    return { dependencies: {}, scripts: {} };
  }
  
  try {
    const pkg = JSON.parse(packageFile.content);
    return {
      dependencies: { ...pkg.dependencies, ...pkg.devDependencies },
      scripts: pkg.scripts || {},
    };
  } catch {
    return { dependencies: {}, scripts: {} };
  }
}

/**
 * Detecta el framework usado (Express, NestJS, etc.)
 */
function detectFramework(
  files: ExtractedFile[],
  dependencies: Record<string, string>
): DetectedFramework | undefined {
  const evidence: string[] = [];
  let name = '';
  let confidence = 0;
  
  // Detectar por dependencias
  if (dependencies['express']) {
    name = 'Express';
    evidence.push('express in package.json');
    confidence = 0.9;
  } else if (dependencies['@nestjs/core']) {
    name = 'NestJS';
    evidence.push('@nestjs/core in package.json');
    confidence = 0.95;
  } else if (dependencies['fastify']) {
    name = 'Fastify';
    evidence.push('fastify in package.json');
    confidence = 0.9;
  } else if (dependencies['hapi']) {
    name = 'Hapi';
    evidence.push('hapi in package.json');
    confidence = 0.9;
  }
  
  // Detectar por código
  const tsFiles = files.filter(f => f.path.endsWith('.ts'));
  const expressMatch = tsFiles.some(f => 
    /import.*express|from\s+['"]express['"]/.test(f.content)
  );
  const nestMatch = tsFiles.some(f =>
    /import.*@nestjs|from\s+['"]@nestjs/.test(f.content)
  );
  
  if (expressMatch && !name) {
    name = 'Express';
    evidence.push('express imports found');
    confidence = 0.7;
  }
  if (nestMatch && !name) {
    name = 'NestJS';
    evidence.push('@nestjs imports found');
    confidence = 0.8;
  }
  
  return name ? { name, confidence, evidence } : undefined;
}

/**
 * Extrae prompts completos de un archivo (maneja multilineales)
 */
function extractCompletePrompt(content: string): string | undefined {
  // 1. Template literals multilineales
  const templateMatch = content.match(
    /(?:system_prompt|systemPrompt|systemMessage|instructions?|backstory|role_description)\s*[:=]\s*`([^`]+)`/si
  );
  if (templateMatch) {
    return templateMatch[1].trim();
  }

  // 2. Strings regulares multilineales
  const stringMatch = content.match(
    /(?:system_prompt|systemPrompt|systemMessage)\s*[:=]\s*["']([^"']+)["']/si
  );
  if (stringMatch) {
    return stringMatch[1].trim();
  }

  // 3. Prompts en objetos/configuración
  const objectMatch = content.match(
    /systemMessage\s*[:=]\s*[`'"]?([\s\S]*?)(?=[,}]|$)/i
  );
  if (objectMatch) {
    const prompt = objectMatch[1]
      .replace(/^[`'"\s]+/, '')
      .replace(/[`'"\s]+$/, '')
      .trim();
    if (prompt.length > 20) return prompt;
  }

  return undefined;
}

/**
 * Identifica el framework que usa el agente
 */
function identifyAgentFramework(file: ExtractedFile, content: string): string | undefined {
  // LangChain
  if (content.includes('initializeAgentExecutor') || 
      content.includes('AgentExecutor') ||
      content.includes('from langchain') ||
      content.includes('@langchain/')) {
    return 'LangChain';
  }

  // CrewAI
  if (content.includes('from crewai import') ||
      content.includes('from crewai.agent import') ||
      content.match(/Agent\(\s*role\s*=/)) {
    return 'CrewAI';
  }

  // Microsoft AutoGen
  if (content.includes('UserProxyAgent') ||
      content.includes('AssistantAgent') ||
      content.includes('from autogen')) {
    return 'Microsoft AutoGen';
  }

  // Anthropic Prompt Caching
  if (content.includes('Anthropic()') &&
      content.includes('system_prompt')) {
    return 'Anthropic';
  }

  // OpenAI Functions / Assistants
  if ((content.includes('openai.ChatCompletion') ||
       content.includes('from openai import')) &&
      content.includes('system')) {
    return 'OpenAI';
  }

  // Custom agent pattern (class-based)
  if (file.content.match(/class\s+\w*Agent.*{[\s\S]*?systemPrompt|systemMessage/)) {
    return 'Custom Agent Pattern';
  }

  return undefined;
}

/**
 * Extrae tools/acciones del agente
 */
function extractAgentTools(content: string): string[] {
  const tools: Set<string> = new Set();

  // Patrón 1: Array de tools
  const toolsArrayMatch = content.match(/tools\s*[:=]\s*\[([\s\S]*?)\]/);
  if (toolsArrayMatch) {
    const toolNames = toolsArrayMatch[1].match(/name\s*[:=]\s*['"`]([^'"`]+)['"`]/g);
    if (toolNames) {
      toolNames.forEach(name => {
        const extracted = name.match(/['"`]([^'"`]+)['"`]/)?.[1];
        if (extracted) tools.add(extracted);
      });
    }
  }

  // Patrón 2: Funciones individuales
  const funcMatches = content.match(/(?:const|let|var)\s+(\w+Tool|\w+_tool)\s*=/g);
  if (funcMatches) {
    funcMatches.forEach(match => {
      const name = match.match(/(\w+)/)?.[1];
      if (name) tools.add(name);
    });
  }

  // Patrón 3: Métodos de herramientas
  const methodMatches = content.match(/\.(?:addTool|registerTool|addAction)\s*\(\s*['"`]?(\w+)['"`]?/g);
  if (methodMatches) {
    methodMatches.forEach(match => {
      const name = match.match(/['"`]?(\w+)['"`]?$/)?.[1];
      if (name) tools.add(name);
    });
  }

  return Array.from(tools);
}

/**
 * Extrae la intención/propósito del agente del código
 */
function extractAgentIntention(content: string, agentName: string): string | undefined {
  // Buscar comentarios que describan al agente
  const commentPatterns = [
    // JSDoc
    /\/\*\*[\s\S]*?@(?:description|desc|purpose|role|goal)(.*?)\*\//i,
    // Comentarios inline
    new RegExp(`\/\/\\s*(?:${agentName}.*?(?:es|is|:)?|Purpose|Goal|Role)(.*?)$`, 'im'),
    // Strings de descripción
    /(?:description|purpose|role|goal|intention)\s*[:=]\s*["'`]([^"'`]+)["'`]/i,
  ];

  for (const pattern of commentPatterns) {
    const match = content.match(pattern);
    if (match) {
      const intention = match[1]?.trim().substring(0, 200);
      if (intention && intention.length > 10) return intention;
    }
  }

  // Si tiene system prompt, extraer de ahí
  const systemPrompt = extractCompletePrompt(content);
  if (systemPrompt && systemPrompt.length > 20) {
    return systemPrompt.substring(0, 200);
  }

  return undefined;
}

/**
 * Extrae las acciones/responsabilidades del agente
 */
function extractAgentResponsibilities(content: string): string[] {
  const responsibilities: string[] = [];

  // Patrones de responsabilidades
  const patterns = [
    // "debe hacer", "can do", "will", "responsible for"
    /(?:debe|can|should|will|responsible for|handles?|manages?|processes?|creates?|updates?|deletes?|sends?)\s+([a-z_\w\s,]+)/gi,
    // Métodos que sugieren acciones
    /(?:function|const|method)\s+(\w+(?:Email|Sms|Order|Payment|User|Product|Customer|Sale)[a-zA-Z]*)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const action = match[1]?.trim();
      if (action && action.length < 100 && !action.includes('{')) {
        responsibilities.push(action);
      }
    }
  }

  return [...new Set(responsibilities)].slice(0, 10); // Máximo 10, sin duplicados
}

/**
 * Detecta qué bases de datos utiliza específicamente el agente
 */
function detectAgentDatabases(content: string): string[] {
  const databases: Set<string> = new Set();

  const patterns = [
    /(?:postgresql|postgres|pg)/i,
    /(?:mongodb|mongo)/i,
    /(?:mysql|maria)/i,
    /(?:supabase)/i,
    /(?:firebase)/i,
    /(?:dynamodb)/i,
    /(?:redis)/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(content)) {
      databases.add(pattern.source.replace(/\|/g, ', ').replace(/[()^$]/g, ''));
    }
  }

  return Array.from(databases);
}

/**
 * Valida que sea realmente un agente
 */
function isValidAgent(content: string, hasSystemMessage: boolean): boolean {
  // Necesita al menos sistema message/instrucciones
  if (!hasSystemMessage) return false;

  // Y al menos uno de:
  // - Mecanismo para ejecutar herramientas
  // - Framework conocido
  // - Memoria/contexto
  const hasExecutionMechanism = content.match(/execute|run|handle|process|invoke/i) !== null;
  const hasMemory = content.match(/memory|context|history|state/i) !== null;
  const hasKnownFramework = content.match(/langchain|crewai|autogen|anthropic|openai|gemini/i) !== null;

  return hasExecutionMechanism || hasMemory || hasKnownFramework;
}

/**
 * Detecta casos de uso del agente (qué entrada espera, qué salida produce)
 */
function extractAgentUseCases(content: string): { input?: string; output?: string; examples?: string[] } {
  const useCases: { input?: string; output?: string; examples?: string[] } = {};

  // Buscar parámetros de entrada esperados
  const inputPatterns = [
    /(?:expects?|input|receives?|takes?)\s*[:\(]*([^:\)\.]+?)(?:\.|,|\))/i,
    /function\s+\w+\s*\(\s*([^)]+)\s*\)/,
  ];

  for (const pattern of inputPatterns) {
    const match = content.match(pattern);
    if (match) {
      useCases.input = match[1]?.trim().substring(0, 100);
      break;
    }
  }

  // Buscar salidas esperadas
  const outputPatterns = [
    /(?:returns?|outputs?|produces?|responds? with)\s*[:\(]*([^:\)\.]+?)(?:\.|,|\))/i,
    /return\s+(?:await\s+)?(\w+)/i,
  ];

  for (const pattern of outputPatterns) {
    const match = content.match(pattern);
    if (match) {
      useCases.output = match[1]?.trim().substring(0, 100);
      break;
    }
  }

  // Buscar ejemplos de uso
  const examplePattern = /(?:example|test|case)[:\s]*["'`]?([^"'`\.]+)["'`]?/gi;
  const examples: string[] = [];
  let exMatch;
  while ((exMatch = examplePattern.exec(content)) !== null) {
    if (exMatch[1].length > 10) examples.push(exMatch[1].substring(0, 100));
  }
  if (examples.length > 0) useCases.examples = examples.slice(0, 3);

  return useCases;
}

/**
 * Detecta agentes IA en el código (VERSIÓN MEJORADA)
 */
function detectAgents(files: ExtractedFile[]): CodeAgentComponent[] {
  const agents: CodeAgentComponent[] = [];
  const processedNames = new Set<string>();

  for (const file of files) {
    if (!file.path.endsWith('.ts') && !file.path.endsWith('.js')) continue;

    const content = file.content;
    const lowerContent = content.toLowerCase();

    // Buscar cualquier indicación de agente IA
    const hasAgentKeyword = /(?:agent|bot|assistant|executor)\b/i.test(content);
    const hasAILibrary = /(?:langchain|openai|anthropic|crewai|autogen|@google\/generative-ai|gemini)/i.test(content);
    const hasSystemMessage = /(?:system_prompt|systemPrompt|systemMessage|instructions?|backstory)\b/i.test(content);

    if (!hasAgentKeyword && !hasAILibrary && !hasSystemMessage) {
      continue;
    }

    // Extraer nombre del agente
    let agentName = 'Agent';

    // Intentar múltiples patrones para nombre
    const namePatterns = [
      /export\s+(?:const|let|var)\s+(\w+Agent|\w+Bot|\w+Assistant|\w+Executor)\s*[:=]/i,
      /(?:export\s+)?class\s+(\w+?)(?:Agent|Bot|Assistant|Handler|Executor)\b/i,
      /(?:const|let|var)\s+(\w+Agent|\w+Bot|\w+Assistant)\s*=/i,
      /new\s+(\w+Agent|\w+Bot|\w+Assistant)\s*\(/i,
    ];

    for (const pattern of namePatterns) {
      const match = content.match(pattern);
      if (match) {
        agentName = match[1];
        break;
      }
    }

    // Evitar duplicados
    if (processedNames.has(agentName)) {
      continue;
    }

    // Extraer información detallada del agente
    const systemPrompt = extractCompletePrompt(content);
    const framework = identifyAgentFramework(file, content);
    const tools = extractAgentTools(content);
    const intention = extractAgentIntention(content, agentName);
    const responsibilities = extractAgentResponsibilities(content);
    const agentDatabases = detectAgentDatabases(content);
    const useCases = extractAgentUseCases(content);

    // Validar que es realmente un agente
    const isValid = isValidAgent(content, !!systemPrompt);

    if (!isValid) {
      continue; // No es un agente válido
    }

    // Construir descripción detallada
    let description = `AI Agent (${framework || 'Custom'})`;
    if (intention) {
      description += ` - ${intention}`;
    }
    if (tools.length > 0) {
      description += ` | Tools: ${tools.join(', ')}`;
    }
    if (agentDatabases.length > 0) {
      description += ` | DB: ${agentDatabases.join(', ')}`;
    }

    const agent: CodeAgentComponent = {
      type: 'agent',
      name: agentName,
      filePath: file.path,
      systemPrompt: systemPrompt || `You are ${agentName}.`,
      description: description.substring(0, 500),
      imports: extractImports(content),
    };

    // Agregar campos extra (metadata)
    (agent as any).framework = framework;
    (agent as any).tools = tools;
    (agent as any).intention = intention;
    (agent as any).responsibilities = responsibilities;
    (agent as any).databases = agentDatabases;
    (agent as any).useCases = useCases;
    (agent as any).fullContent = content; // Para análisis posterior

    agents.push(agent);
    processedNames.add(agentName);

    console.log(`✅ Agent detectado: ${agentName}`);
    console.log(`   Framework: ${framework}`);
    console.log(`   Intention: ${intention?.substring(0, 100)}...`);
    console.log(`   Tools: ${tools.join(', ') || 'None'}`);
    console.log(`   Databases: ${agentDatabases.join(', ') || 'None'}`);
    console.log(`   Responsibilities: ${responsibilities.slice(0, 3).join(', ')}`);
  }

  return agents;
}

/**
 * Detecta herramientas externas (Email, Calendar, etc.)
 */
function detectTools(
  files: ExtractedFile[],
  dependencies: Record<string, string>
): DetectedTool[] {
  const tools: Map<string, DetectedTool> = new Map();
  
  const toolPatterns = {
    email: {
      keywords: ['nodemailer', 'sendgrid', 'mailgun', 'gmail', 'smtp', 'aws-ses', 'postmark', 'resend'],
      codePatterns: ['nodemailer', 'transporter', 'sendEmail', 'mailgun', 'sendgrid', 'ses\\.'],
      type: 'email' as const,
    },
    calendar: {
      keywords: ['google-calendar', '@google-cloud/calendar', 'icalendar', 'outlook', 'caldav'],
      codePatterns: ['calendar\\.', 'gcal', 'createEvent', 'getEvent'],
      type: 'calendar' as const,
    },
    messaging: {
      keywords: ['slack', '@slack/bolt', 'telegram', 'discord.js', 'whatsapp', 'twilio', '@twilio'],
      codePatterns: ['slack\\.', 'telegram\\.', 'discord\\.', 'whatsapp', 'twilio\\.'],
      type: 'messaging' as const,
    },
    crm: {
      keywords: ['salesforce', 'hubspot', 'pipedrive', 'zoho', '@zoho'],
      codePatterns: ['salesforce', 'hubspot', 'pipedrive', 'zoho', 'crm\\.'],
      type: 'crm' as const,
    },
    storage: {
      keywords: ['aws-sdk', '@aws-sdk', 's3', 'firebase', 'supabase', 'blob-storage', 'gcs'],
      codePatterns: ['s3\\.', 'storage\\.bucket', 'aws\\.', 'firebase', 'supabase'],
      type: 'storage' as const,
    },
    payment: {
      keywords: ['stripe', '@stripe', 'paypal', 'square', 'mercadopago'],
      codePatterns: ['stripe\\.', 'payment', 'charge', 'paypal', 'mercado'],
      type: 'storage' as const,
    },
    http: {
      keywords: ['axios', 'node-fetch', 'got', 'node-http', 'request'],
      codePatterns: ['axios\\.', 'fetch', 'got\\.', 'http\\.request'],
      type: 'storage' as const,
    },
  };
  
  // Detectar por dependencias
  for (const [dep, version] of Object.entries(dependencies)) {
    for (const [toolName, pattern] of Object.entries(toolPatterns)) {
      if (pattern.keywords.some(k => dep.toLowerCase().includes(k))) {
        if (!tools.has(toolName)) {
          tools.set(toolName, {
            name: dep,
            type: pattern.type,
            confidence: 0.95,
            evidence: [`Dependency: ${dep}@${version}`],
          });
        } else {
          const existing = tools.get(toolName)!;
          existing.evidence.push(`Also found as dependency: ${dep}@${version}`);
          existing.confidence = Math.min(1, existing.confidence + 0.05);
        }
      }
    }
  }
  
  // Detectar por patrones en código
  for (const file of files) {
    if (!file.path.endsWith('.ts') && !file.path.endsWith('.js')) continue;
    
    for (const [toolName, pattern] of Object.entries(toolPatterns)) {
      // Buscar por código patterns
      const hasCodePattern = pattern.codePatterns.some(p =>
        new RegExp(p, 'i').test(file.content)
      );

      // Buscar por keywords
      const hasKeyword = pattern.keywords.some(k =>
        file.content.toLowerCase().includes(k.toLowerCase())
      );

      if (hasCodePattern || hasKeyword) {
        const existing = tools.get(toolName);
        if (existing) {
          existing.evidence.push(`Code/import found in ${file.path}`);
          existing.confidence = Math.min(1, existing.confidence + 0.05);
        } else if (!existing) {
          tools.set(toolName, {
            name: toolName.charAt(0).toUpperCase() + toolName.slice(1),
            type: pattern.type,
            confidence: hasCodePattern ? 0.75 : 0.6,
            evidence: [hasCodePattern ? `Code pattern found in ${file.path}` : `Import found in ${file.path}`],
          });
        }
      }
    }
  }

  // Detectar herramientas adicionales por imports generales
  for (const file of files) {
    if (!file.path.endsWith('.ts') && !file.path.endsWith('.js')) continue;
    
    // Buscar imports genéricos que puedan indicar herramientas
    const importMatches = file.content.match(/import\s+.*?from\s+['"]([^'"]+)['"]/g) || [];
    for (const importMatch of importMatches) {
      const libName = importMatch.match(/from\s+['"]([^'"]+)['"]/)?.[1];
      if (libName && !tools.has(libName)) {
        // Detectar APIs/servicios
        if (libName.includes('openai') || libName.includes('anthropic') || libName.includes('google')) {
          if (!tools.has('ai-api')) {
            tools.set('ai-api', {
              name: libName,
              type: 'storage',
              confidence: 0.7,
              evidence: [`AI API import: ${libName}`],
            });
          }
        }
      }
    }
  }
  
  return Array.from(tools.values());
}

/**
 * Detecta bases de datos
 */
function detectDatabases(
  files: ExtractedFile[],
  dependencies: Record<string, string>
): DetectedDatabase[] {
  const databases: Map<string, DetectedDatabase> = new Map();
  
  const dbPatterns = {
    postgresql: {
      keywords: ['pg', 'postgres', 'typeorm', 'sequelize', 'knex', 'prisma', 'postgresql', 'psql'],
      envPatterns: ['POSTGRES_', 'DATABASE_URL', 'DB_HOST', 'DB_PORT.*5432'],
      codePatterns: ['createConnection.*postgres', 'new Client.*postgres', 'DATABASE_URL.*postgres'],
    },
    mongodb: {
      keywords: ['mongoose', 'mongodb', 'mongo', '@mongodb/client'],
      envPatterns: ['MONGODB_', 'MONGO_', 'ATLAS_', 'DATABASE_URL.*mongo'],
      codePatterns: ['mongoose\\.connect', 'MongoClient', 'new Db', 'MONGODB'],
    },
    mysql: {
      keywords: ['mysql2', 'mysql', 'sequelize', 'typeorm'],
      envPatterns: ['MYSQL_', 'DATABASE_URL.*mysql', 'DB_'],
      codePatterns: ['mysql\\.createConnection', 'new Connection', 'MYSQL'],
    },
    supabase: {
      keywords: ['@supabase/supabase-js', 'supabase'],
      envPatterns: ['SUPABASE_URL', 'SUPABASE_KEY'],
      codePatterns: ['createClient.*supabase', 'supabase\\.from'],
    },
    firebase: {
      keywords: ['firebase', 'firebase-admin', 'firestore'],
      envPatterns: ['FIREBASE_', 'GCP_PROJECT'],
      codePatterns: ['firebase\\.initializeApp', 'getFirestore', 'admin\\.firestore'],
    },
    redis: {
      keywords: ['redis', 'ioredis', '@redis/client'],
      envPatterns: ['REDIS_', 'REDIS_URL'],
      codePatterns: ['createClient.*redis', 'new Redis', 'redis\\.'],
    },
    dynamodb: {
      keywords: ['dynamodb', 'aws-sdk', '@aws-sdk/client-dynamodb'],
      envPatterns: ['DYNAMODB_', 'AWS_REGION'],
      codePatterns: ['new DynamoDB', 'dynamodb\\.'],
    },
  };
  
  // Detectar por dependencias
  for (const [dbName, pattern] of Object.entries(dbPatterns)) {
    for (const keyword of pattern.keywords) {
      if (dependencies[keyword]) {
        databases.set(dbName, {
          provider: dbName.charAt(0).toUpperCase() + dbName.slice(1),
          confidence: 0.95,
          evidence: [`Package '${keyword}' found in dependencies`],
          credentials: detectDatabaseCredentials(files, dbName),
        });
      }
    }
  }
  
  // Detectar por imports y código
  for (const file of files) {
    for (const [dbName, pattern] of Object.entries(dbPatterns)) {
      const hasCodePattern = pattern.codePatterns.some(p => 
        new RegExp(p, 'i').test(file.content)
      );
      
      if (hasCodePattern) {
        if (!databases.has(dbName)) {
          databases.set(dbName, {
            provider: dbName.charAt(0).toUpperCase() + dbName.slice(1),
            confidence: 0.85,
            evidence: [`Code pattern found in ${file.path}`],
            credentials: detectDatabaseCredentials(files, dbName),
          });
        }
      }

      // También buscar imports
      for (const keyword of pattern.keywords) {
        if (file.content.toLowerCase().includes(`import.*${keyword}`) || 
            file.content.toLowerCase().includes(`require.*${keyword}`)) {
          if (!databases.has(dbName)) {
            databases.set(dbName, {
              provider: dbName.charAt(0).toUpperCase() + dbName.slice(1),
              confidence: 0.8,
              evidence: [`Import/require of '${keyword}' found in ${file.path}`],
              credentials: detectDatabaseCredentials(files, dbName),
            });
          }
        }
      }
    }
  }
  
  // Detectar por variables de entorno
  const envFile = files.find(f => 
    f.name === '.env' || f.name === '.env.example' || f.name === '.env.local'
  );
  
  if (envFile) {
    for (const [dbName, pattern] of Object.entries(dbPatterns)) {
      const hasEnvPattern = pattern.envPatterns.some(p =>
        new RegExp(p, 'i').test(envFile.content)
      );
      
      if (hasEnvPattern && !databases.has(dbName)) {
        databases.set(dbName, {
          provider: dbName.charAt(0).toUpperCase() + dbName.slice(1),
          confidence: 0.7,
          evidence: [`Environment variables found in .env`],
          credentials: detectDatabaseCredentials(files, dbName),
        });
      }
    }
  }

  return Array.from(databases.values());
}

/**
 * Detecta credenciales de bases de datos en variables de entorno
 */
function detectDatabaseCredentials(files: ExtractedFile[], dbName: string): string[] {
  const envFile = files.find(f => f.name === '.env' || f.name === '.env.example');
  if (!envFile) return [];
  
  const credentials: string[] = [];
  const patterns = {
    postgresql: ['DATABASE_URL', 'POSTGRES_', 'DB_'],
    mongodb: ['MONGODB_', 'MONGO_'],
    mysql: ['MYSQL_', 'DB_'],
    supabase: ['SUPABASE_'],
    firebase: ['FIREBASE_'],
    redis: ['REDIS_'],
  };
  
  const keywords = patterns[dbName as keyof typeof patterns] || [];
  for (const line of envFile.content.split('\n')) {
    for (const keyword of keywords) {
      if (line.includes(keyword)) {
        credentials.push(line.split('=')[0].trim());
      }
    }
  }
  
  return credentials;
}

/**
 * Detecta APIs externas (OpenAI, Gemini, etc.)
 */
function detectAPIs(
  files: ExtractedFile[],
  dependencies: Record<string, string>
): DetectedAPI[] {
  const apis: Map<string, DetectedAPI> = new Map();
  
  const apiPatterns = {
    openai: ['openai'],
    gemini: ['@google/generative-ai', 'google-generative-ai'],
    anthropic: ['@anthropic-ai/sdk', 'anthropic'],
    huggingface: ['huggingface', '@huggingface'],
  };
  
  for (const [serviceName, keywords] of Object.entries(apiPatterns)) {
    for (const keyword of keywords) {
      if (dependencies[keyword]) {
        apis.set(serviceName, {
          service: serviceName.charAt(0).toUpperCase() + serviceName.slice(1),
          type: 'ai',
          confidence: 0.95,
          evidence: [`Dependency: ${keyword}`],
        });
      }
    }
  }
  
  return Array.from(apis.values());
}

/**
 * Detecta endpoints HTTP
 */
function detectEndpoints(files: ExtractedFile[]): string[] {
  const endpoints: Set<string> = new Set();
  
  // Patrones para detectar rutas
  const patterns = [
    /app\.(?:get|post|put|delete|patch)\s*\(\s*['"](\/[^'"]*)['"]/g,
    /router\.(?:get|post|put|delete|patch)\s*\(\s*['"](\/[^'"]*)['"]/g,
    /@(?:Get|Post|Put|Delete|Patch)\s*\(\s*['"](\/[^'"]*)['"]/g,
  ];
  
  for (const file of files) {
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(file.content)) !== null) {
        endpoints.add(match[1]);
      }
    }
  }
  
  return Array.from(endpoints).slice(0, 10); // Limitar a 10 endpoints
}

/**
 * Detecta variables de entorno usadas
 */
function detectEnvironmentVariables(files: ExtractedFile[]): string[] {
  const envVars: Set<string> = new Set();
  const pattern = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
  
  for (const file of files) {
    let match;
    while ((match = pattern.exec(file.content)) !== null) {
      envVars.add(match[1]);
    }
  }
  
  return Array.from(envVars);
}

/**
 * Extrae imports de un archivo
 */
function extractImports(content: string): string[] {
  const imports: Set<string> = new Set();
  const pattern = /from\s+['"]([^'"]+)['"]/g;
  
  let match;
  while ((match = pattern.exec(content)) !== null) {
    imports.add(match[1]);
  }
  
  return Array.from(imports);
}

/**
 * Calcula confianza general
 */
function calculateConfidence(data: {
  framework?: DetectedFramework;
  agents: CodeAgentComponent[];
  tools: DetectedTool[];
  databases: DetectedDatabase[];
  apis: DetectedAPI[];
}): number {
  let score = 0.5; // Base score
  
  if (data.framework) score += 0.15;
  if (data.agents.length > 0) score += 0.2;
  if (data.tools.length > 0) score += 0.1;
  if (data.databases.length > 0) score += 0.1;
  if (data.apis.length > 0) score += 0.05;
  
  return Math.min(1, score);
}

/**
 * Calcula total de líneas de código
 */
function calculateTotalLines(files: ExtractedFile[]): number {
  return files.reduce((sum, f) => sum + f.content.split('\n').length, 0);
}

/**
 * Genera resumen del proyecto
 */
function generateSummary(data: {
  framework?: DetectedFramework;
  agents: CodeAgentComponent[];
  tools: DetectedTool[];
  databases: DetectedDatabase[];
  apis: DetectedAPI[];
}): string {
  const parts: string[] = [];
  
  if (data.framework) {
    parts.push(`${data.framework.name} backend`);
  }
  
  if (data.agents.length > 0) {
    parts.push(`${data.agents.length} AI agent(s)`);
  }
  
  if (data.databases.length > 0) {
    const dbNames = data.databases.map(d => d.provider).join(', ');
    parts.push(`uses ${dbNames}`);
  }
  
  if (data.tools.length > 0) {
    parts.push(`${data.tools.length} external tool(s)`);
  }
  
  return parts.join(', ');
}

// ====== NUEVAS FUNCIONES PARA DETECCIÓN ADAPTATIVA ======

/**
 * Detecta si el proyecto tiene agentes EXPLÍCITOS o IMPLÍCITOS
 */
function detectAgentType(files: ExtractedFile[], dependencies: Record<string, string>): AgentDetectionType {
  // Buscar imports de frameworks conocidos
  const hasLangChain = files.some(f => 
    f.content.includes('from "langchain') || 
    f.content.includes("from 'langchain") ||
    dependencies['langchain'] !== undefined
  );
  
  const hasCrewAI = files.some(f => 
    f.content.includes('from "crewai') || 
    f.content.includes("from 'crewai") ||
    dependencies['crewai'] !== undefined
  );
  
  const hasOpenAI = files.some(f => 
    f.content.includes('from "openai') || 
    f.content.includes("from 'openai") ||
    dependencies['openai'] !== undefined
  );
  
  // Si tiene frameworks, es explícito
  if (hasLangChain || hasCrewAI || hasOpenAI) {
    console.log('   ✅ Agente EXPLÍCITO detectado (LangChain/CrewAI/OpenAI)');
    return AgentDetectionType.EXPLICIT;
  }
  
  // Buscar patterns de event-driven o state machine
  const hasEventDriven = files.some(f => 
    (f.content.includes('.on(') ||
    f.content.includes('EventEmitter') ||
    f.content.includes('subscribe(') ||
    ((f.name.includes('handler') || f.name.includes('controller')) &&
    f.content.includes('if (') && 
    f.content.includes('await')))
  );
  
  const hasStateMachine = files.some(f =>
    f.content.includes('state ===') ||
    f.content.includes('currentState') ||
    f.content.includes('switch (state)') ||
    f.content.includes('FSM') ||
    f.content.includes('StateMachine')
  );
  
  if (hasEventDriven || hasStateMachine) {
    console.log('   ✅ Agente IMPLÍCITO detectado (event-driven/state machine)');
    return AgentDetectionType.IMPLICIT;
  }
  
  // Comprobar si hay ambos
  if ((hasLangChain || hasCrewAI) && (hasEventDriven || hasStateMachine)) {
    return AgentDetectionType.HYBRID;
  }
  
  console.log('   ⚠️ No se detectó tipo de agente claro');
  return AgentDetectionType.UNKNOWN;
}

/**
 * Analiza agentes IMPLÍCITOS (event-driven, state machines)
 */
async function analyzeImplicitAgents(
  files: ExtractedFile[],
  framework: string,
  language: string
): Promise<ImplicitAgentAnalysis> {
  console.log('🔍 Analizando agentes implícitos...');
  
  // 1. Encontrar handlers principales
  const mainHandlers = findMainHandlers(files, framework);
  console.log(`   📍 Handlers encontrados: ${mainHandlers.length}`);
  
  // 2. Extraer comportamiento de cada handler
  const behaviors: AgentBehavior[] = [];
  for (const handler of mainHandlers) {
    const behavior = extractBehavior(handler, files);
    if (behavior) behaviors.push(behavior);
  }
  
  console.log(`   🔍 Comportamientos identificados: ${behaviors.length}`);
  
  // 3. Usar Gemini para inferir sistema prompt (ahora con content en handlers)
  const inferredPrompt = await inferSystemPrompt(behaviors, mainHandlers.map(h => ({
    name: h.name,
    filePath: h.filePath,
    content: h.content
  })), language);
  
  // 4. Identificar intención general del agente
  const intention = identifyIntention(behaviors, mainHandlers);
  
  return {
    detectionType: AgentDetectionType.IMPLICIT,
    inferredSystemPrompt: inferredPrompt,
    behaviors,
    mainHandlers: mainHandlers.map(h => ({ name: h.name, filePath: h.filePath })),
    estimatedIntention: intention
  };
}

/**
 * Encuentra los handlers principales que actúan como "agente"
 */
function findMainHandlers(files: ExtractedFile[], framework: string): { name: string; filePath: string; content: string }[] {
  const handlers: { name: string; filePath: string; content: string }[] = [];
  
  console.log(`   🔎 Buscando handlers en framework: ${framework}`);
  console.log(`   📂 Total archivos disponibles: ${files.length}`);
  
  // 1. Buscar archivos con nombres relevantes
  const candidateFiles = files.filter(f => {
    const lowerName = f.name.toLowerCase();
    const lowerPath = f.path.toLowerCase();
    
    return (
      lowerName.includes('handler') ||
      lowerName.includes('controller') ||
      lowerName.includes('service') ||
      lowerName.includes('message') ||
      lowerName.includes('process') ||
      lowerName.includes('route') ||
      lowerName.includes('agent') ||
      lowerName.includes('bot') ||
      lowerPath.includes('/handlers/') ||
      lowerPath.includes('/controllers/') ||
      lowerPath.includes('/services/') ||
      lowerPath.includes('/src/') && (lowerName.includes('.ts') || lowerName.includes('.js'))
    );
  });
  
  console.log(`   📋 Archivos candidatos: ${candidateFiles.length}`);
  
  // 2. Para cada candidato, buscar funciones exportadas
  for (const file of candidateFiles) {
    // Buscar funciones exportadas (async o no)
    const functionMatches = file.content.match(/export\s+(async\s+)?function\s+(\w+)\s*\([^)]*\)/g);
    
    if (functionMatches && functionMatches.length > 0) {
      console.log(`   ✅ Encontradas ${functionMatches.length} funciones en ${file.name}`);
      
      functionMatches.forEach(match => {
        const nameMatch = match.match(/function\s+(\w+)/);
        if (nameMatch) {
          handlers.push({
            name: nameMatch[1],
            filePath: file.path,
            content: file.content
          });
        }
      });
    }
    
    // Buscar arrow functions exportadas
    const arrowMatches = file.content.match(/export\s+const\s+(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*=>/g);
    
    if (arrowMatches && arrowMatches.length > 0) {
      console.log(`   ✅ Encontradas ${arrowMatches.length} arrow functions en ${file.name}`);
      
      arrowMatches.forEach(match => {
        const nameMatch = match.match(/const\s+(\w+)/);
        if (nameMatch) {
          handlers.push({
            name: nameMatch[1],
            filePath: file.path,
            content: file.content
          });
        }
      });
    }
    
    // Buscar métodos de clase
    const classMethodMatches = file.content.match(/(async\s+)?(\w+)\s*\([^)]*\)\s*{/g);
    
    if (classMethodMatches && classMethodMatches.length > 2) { // Al menos 2 métodos (sin constructor)
      console.log(`   ✅ Encontrados ${classMethodMatches.length} métodos en ${file.name}`);
      
      // Agregar el archivo completo como handler (clase)
      handlers.push({
        name: file.name.replace(/\.(ts|js|tsx|jsx)$/, ''),
        filePath: file.path,
        content: file.content
      });
    }
    
    // Buscar rutas Express
    if (file.content.includes('router.') || file.content.includes('app.')) {
      const routeMatches = file.content.match(/(router|app)\.(post|get|put|delete|patch)\s*\(/g);
      
      if (routeMatches && routeMatches.length > 0) {
        console.log(`   ✅ Encontradas ${routeMatches.length} rutas Express en ${file.name}`);
        
        handlers.push({
          name: `${file.name} (Express Routes)`,
          filePath: file.path,
          content: file.content
        });
      }
    }
    
    // Buscar decoradores NestJS
    if (file.content.includes('@Controller') || file.content.includes('@Post') || file.content.includes('@Get')) {
      console.log(`   ✅ Encontrado NestJS controller en ${file.name}`);
      
      handlers.push({
        name: `${file.name} (NestJS Controller)`,
        filePath: file.path,
        content: file.content
      });
    }
  }
  
  console.log(`   🎯 Total handlers detectados: ${handlers.length}`);
  
  // 3. Si aún no hay handlers, buscar en TODOS los archivos TypeScript/JavaScript
  if (handlers.length === 0) {
    console.log(`   ⚠️ No se encontraron handlers, buscando en todos los archivos TS/JS...`);
    
    const allCodeFiles = files.filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ext === 'ts' || ext === 'js' || ext === 'tsx' || ext === 'jsx';
    });
    
    for (const file of allCodeFiles.slice(0, 20)) { // Limitar a 20 archivos
      if (file.content.includes('function') || file.content.includes('=>')) {
        handlers.push({
          name: file.name,
          filePath: file.path,
          content: file.content
        });
      }
    }
    
    console.log(`   🔄 Fallback: agregados ${handlers.length} archivos con código`);
  }
  
  // 4. Deduplicar por nombre de archivo (evitar duplicados)
  const uniqueHandlers = Array.from(
    new Map(handlers.map(h => [h.filePath, h])).values()
  );
  
  console.log(`   ✨ Handlers únicos: ${uniqueHandlers.length}`);
  
  return uniqueHandlers.slice(0, 10); // Limitar a 10 handlers principales
}

/**
 * Extrae el comportamiento de un handler
 */
function extractBehavior(handler: { name: string; filePath: string; content: string }, allFiles: ExtractedFile[]): AgentBehavior | null {
  const { name, content } = handler;
  
  // Buscar conditions if/switch
  const conditionMatches = content.match(/if\s*\([^)]+\)|switch\s*\([^)]+\)/g) || [];
  const conditionChecks = conditionMatches.map(c => c.trim()).slice(0, 3);
  
  // Buscar tools (database, HTTP, etc.)
  const toolsUsed = findToolsInContent(content, allFiles);
  
  // Buscar databases
  const databasesUsed = findDatabasesInContent(content, allFiles);
  
  // Clasificar tipo de handler
  let type: AgentBehavior['type'] = 'unknown';
  if (name.toLowerCase().includes('greet') || name.toLowerCase().includes('hello') || name.toLowerCase().includes('welcome')) {
    type = 'greeting';
  } else if (name.toLowerCase().includes('valid') || name.toLowerCase().includes('check') || name.toLowerCase().includes('verify')) {
    type = 'validation';
  } else if (name.toLowerCase().includes('get') || name.toLowerCase().includes('fetch') || name.toLowerCase().includes('query')) {
    type = 'retrieval';
  } else if (name.toLowerCase().includes('create') || name.toLowerCase().includes('process') || name.toLowerCase().includes('order')) {
    type = 'processing';
  }
  
  // Calcular confidence score
  const confidence = Math.min(
    1,
    (toolsUsed.length > 0 ? 0.3 : 0) +
    (databasesUsed.length > 0 ? 0.3 : 0) +
    (conditionChecks.length > 0 ? 0.2 : 0) +
    0.2 // Base confidence
  );
  
  // 🔧 Reducir umbral a 0.15 para ser más permisivo
  if (confidence < 0.15) return null;
  
  return {
    name,
    type,
    description: `Handler for ${type} operations`,
    inputTypes: ['message', 'request'],
    outputTypes: ['response'],
    toolsUsed,
    databasesUsed,
    conditionChecks,
    confidenceScore: confidence
  };
}

/**
 * Encuentra tools usadas en el contenido
 */
function findToolsInContent(content: string, allFiles: ExtractedFile[]): string[] {
  const tools = new Set<string>();
  
  // Buscar llamadas a funciones de tools
  if (content.includes('.sendEmail') || content.includes('send_email') || content.includes('nodemailer')) {
    tools.add('Email Service');
  }
  if (content.includes('.sendMessage') || content.includes('send_message') || content.includes('baileys')) {
    tools.add('Messaging Service');
  }
  if (content.includes('.createEvent') || content.includes('schedule') || content.includes('calendar')) {
    tools.add('Calendar Service');
  }
  if (content.includes('.uploadFile') || content.includes('storage.upload') || content.includes('s3')) {
    tools.add('Storage Service');
  }
  if (content.includes('stripe') || content.includes('payment') || content.includes('processPayment')) {
    tools.add('Payment Service');
  }
  if (content.includes('axios') || content.includes('fetch(')) {
    tools.add('HTTP Client');
  }
  
  return Array.from(tools);
}

/**
 * Encuentra databases usadas
 */
function findDatabasesInContent(content: string, allFiles: ExtractedFile[]): string[] {
  const databases = new Set<string>();
  
  // Buscar imports y conexiones
  if (content.includes('prisma') || content.includes('PrismaClient')) {
    databases.add('Prisma/PostgreSQL');
  }
  if (content.includes('supabase') || content.includes('createClient')) {
    databases.add('Supabase');
  }
  if (content.includes('mongoose') || content.includes('connect')) {
    databases.add('MongoDB');
  }
  if (content.includes('typeorm')) {
    databases.add('TypeORM/SQL');
  }
  if (content.includes('Pool') && content.includes('pg')) {
    databases.add('PostgreSQL (Direct)');
  }
  
  // Buscar queries
  if (content.match(/\.query\(|\.select\(|\.insert\(|\.update\(|\.delete\(/)) {
    databases.add('Database (Generic)');
  }
  
  if (content.includes('from(') && content.includes('select()')) {
    databases.add('SQL Query Builder');
  }
  
  return Array.from(databases);
}

/**
 * Usa Gemini para inferir el sistema prompt
 */
async function inferSystemPrompt(
  behaviors: AgentBehavior[],
  handlers: { name: string; filePath: string; content: string }[],
  language: string
): Promise<string> {
  // 🔧 Si no hay comportamientos, analizar handlers directamente
  if (behaviors.length === 0 && handlers.length > 0) {
    console.log('   🤖 No hay comportamientos, analizando handlers directamente con Gemini...');
    
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Tomar muestra del código de los primeros 3 handlers
    const handlersSample = handlers.slice(0, 3).map((h, i) => {
      const codeSnippet = h.content.substring(0, 1000); // Primeros 1000 caracteres
      return `Handler ${i + 1}: ${h.name} (${h.filePath})\n\`\`\`\n${codeSnippet}\n...\n\`\`\``;
    }).join('\n\n');
    
    const prompt = `Eres un experto en analizar código de agentes IA implícitos.

Te muestro el CÓDIGO REAL de un proyecto Node.js/TypeScript. No tiene agentes explícitos (LangChain, CrewAI), pero tiene comportamiento de agente IMPLÍCITO en el código.

CÓDIGO DE LOS HANDLERS PRINCIPALES:
${handlersSample}

Basándote en este código, escribe el "sistema prompt" implícito que describe:
1. El rol del agente (¿qué hace este sistema?)
2. Sus responsabilidades principales
3. Cómo procesa información
4. Qué tipo de interacciones maneja

Responde SOLO con el sistema prompt en formato natural y claro.

${language === 'es' ? 'RESPONDE EN ESPAÑOL' : 'RESPOND IN ENGLISH'}
`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: prompt
      });
      
      if (response.usageMetadata) {
        costTracker.recordUsage({
          promptTokens: response.usageMetadata.promptTokenCount || 0,
          responseTokens: response.usageMetadata.candidatesTokenCount || 0,
          totalTokens: (response.usageMetadata.promptTokenCount || 0) + (response.usageMetadata.candidatesTokenCount || 0),
          model: 'gemini-2.0-flash-exp',
          operation: 'infer_system_prompt'
        });
      }
      
      return response.text;
    } catch (error) {
      console.error('❌ Error inferring system prompt from handlers:', error);
      return `Implicit agent with ${handlers.length} handlers: ${handlers.map(h => h.name).join(', ')}`;
    }
  }
  
  if (behaviors.length === 0) {
    return 'Implicit agent with event-driven architecture';
  }
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const behaviorSummary = behaviors
    .map((b, i) => `${i + 1}. ${b.name}: ${b.description || 'sin descripción'}\n   Tipo: ${b.type}\n   Tools: ${b.toolsUsed.join(', ') || 'ninguno'}\n   Bases de datos: ${b.databasesUsed.join(', ') || 'ninguna'}`)
    .join('\n\n');
  
  const prompt = `Eres un experto en analizar código de bots y agentes implícitos.

Te muestro los COMPORTAMIENTOS PRINCIPALES de un bot/agente que está CODIFICADO (no tiene system prompt explícito):

${behaviorSummary}

Basándote en esto, escribe el "sistema prompt" implícito que describe:
1. El rol del agente (¿qué es?)
2. Sus responsabilidades principales
3. Cómo debe comportarse
4. Cómo gestiona conversaciones

Responde SOLO con el sistema prompt, en formato natural y claro.

${language === 'es' ? 'RESPONDE EN ESPAÑOL' : 'RESPOND IN ENGLISH'}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: prompt
    });
    
    if (response.usageMetadata) {
      costTracker.recordUsage({
        promptTokens: response.usageMetadata.promptTokenCount || 0,
        responseTokens: response.usageMetadata.candidatesTokenCount || 0,
        totalTokens: (response.usageMetadata.promptTokenCount || 0) + (response.usageMetadata.candidatesTokenCount || 0),
        model: 'gemini-2.0-flash-exp',
        operation: 'infer_system_prompt'
      });
    }
    
    return response.text;
  } catch (error) {
    console.error('❌ Error inferring system prompt:', error);
    return `Implicit agent with behaviors: ${behaviors.map(b => b.name).join(', ')}`;
  }
}

/**
 * Identifica la intención general del agente
 */
function identifyIntention(behaviors: AgentBehavior[], handlers: { name: string; filePath: string }[]): string {
  // Contar tipos de comportamiento
  const typeCount = behaviors.reduce((acc, b) => {
    acc[b.type] = (acc[b.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Identificar patrón dominante
  let intention = 'General Assistant';
  
  if (typeCount.processing && typeCount.processing > 0) intention = 'Transaction/Order Processing Agent';
  else if (typeCount.validation && typeCount.validation > 0) intention = 'Validation and Compliance Agent';
  else if (typeCount.retrieval && typeCount.retrieval > 0) intention = 'Information Retrieval Agent';
  else if (typeCount.greeting && typeCount.greeting > 0) intention = 'Customer Service Agent';
  
  // Agregar contexto de tools
  const allTools = behaviors.flatMap(b => b.toolsUsed);
  if (allTools.includes('Email Service')) intention += ' (with Email)';
  if (allTools.includes('Payment Service')) intention += ' (with Payments)';
  if (allTools.includes('Messaging Service')) intention += ' (with Messaging)';
  
  return intention;
}
