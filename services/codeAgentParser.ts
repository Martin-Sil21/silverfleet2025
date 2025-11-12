/**
 * 🔍 Code Agent Parser (Frontend)
 * 
 * Analiza archivos de proyectos TypeScript/Node cargados como texto/archivos.
 * El usuario carga un ZIP o archivos individuales, los procesamos en el browser.
 * 
 * Extrae:
 * - Propósito y descripción del agente
 * - Herramientas disponibles (funciones exportadas)
 * - Estructura esperada de payload
 * - Endpoints disponibles
 * 
 * Soporta:
 * - Proyectos Baileys (WhatsApp bots)
 * - Proyectos OpenAI/LangChain
 * - Proyectos customizados con TypeScript
 */

import type { ParsedAgentWorkflow, CodeAgentMetadata, WorkflowNode, AgentNode, ToolNode } from '../types';

interface DetectedFile {
  name: string;
  content: string;
  type: 'main' | 'agent' | 'tools' | 'handlers' | 'config' | 'other';
}

interface ExtractedInfo {
  agentPurpose: string;
  tools: Map<string, { name: string; description: string; parameters: any }>;
  endpoints: string[];
  payloadSchema: Record<string, any>;
  systemPrompt: string;
  detectedFramework: string;
  externalServices: ExternalService[];
  databases: DatabaseConnection[];
}

interface ExternalService {
  type: 'database' | 'email' | 'api' | 'auth' | 'storage' | 'messaging' | 'calendar' | 'crm';
  name: string;
  description: string;
  requiresCredentials: boolean;
  detectedIn: string[]; // nombres de archivos donde se detectó
}

interface DatabaseConnection {
  type: string; // 'supabase', 'postgres', 'mysql', 'mongodb', 'firebase', etc
  name: string;
  description: string;
  tables?: string[];
  detectedIn: string[];
}

/**
 * Identifica archivos relevantes por patrón de nombre y contenido
 */
const classifyFileType = (fileName: string, content: string): DetectedFile['type'] => {
  const nameLC = fileName.toLowerCase();
  
  if (nameLC === 'package.json') return 'config';
  
  const mainPatterns = ['main', 'index', 'agent', 'bot', 'app'];
  const toolPatterns = ['tool', 'handler', 'command', 'service', 'utils', 'helper'];
  
  if (mainPatterns.some(p => nameLC.includes(p))) return 'main';
  if (toolPatterns.some(p => nameLC.includes(p))) return 'tools';
  
  // Heurística de contenido
  if (content.includes('export function') || content.includes('export const')) return 'tools';
  if (content.includes('listen') || content.includes('createServer')) return 'main';
  
  return 'other';
};

/**
 * Extrae system prompt de comentarios y docstrings
 */
const extractSystemPrompt = (fileContent: string): string => {
  // Buscar comentarios multilinea
  const multilineMatch = fileContent.match(/\/\*\*[\s\S]*?\*\//);
  if (multilineMatch) {
    const cleaned = multilineMatch[0]
      .replace(/^\/\*\*/, '')
      .replace(/\*\/$/, '')
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, '').trim())
      .filter(line => line)
      .join(' ');
    
    if (cleaned.length > 10) return cleaned;
  }
  
  // Buscar comentarios de línea
  const lineMatch = fileContent.match(/^\/\/\s+(.+)/m);
  if (lineMatch) return lineMatch[1];
  
  return 'TypeScript/Node Agent';
};

/**
 * Extrae funciones exportadas como herramientas
 */
const extractTools = (fileContent: string): Map<string, { name: string; description: string; parameters: any }> => {
  const tools = new Map();
  
  // Buscar exportaciones de función
  const exportFunctionPattern = /export\s+(?:async\s+)?function\s+(\w+)\s*\((.*?)\)/g;
  let match;
  
  while ((match = exportFunctionPattern.exec(fileContent)) !== null) {
    const [, functionName, paramsStr] = match;
    
    // Extraer comentario JSDoc previo
    const jsDocPattern = new RegExp(
      `\\/\\*\\*[\\s\\S]*?\\*\\/\\s*export\\s+(?:async\\s+)?function\\s+${functionName}`,
      'g'
    );
    
    const jsDocMatch = fileContent.match(jsDocPattern);
    let description = '';
    
    if (jsDocMatch) {
      const jsDocText = jsDocMatch[0]
        .replace(/\/\*\*/, '')
        .replace(/\*\/[\s\S]*/, '');
      
      description = jsDocText
        .split('\n')
        .map(line => line.replace(/^\s*\*\s?/, '').trim())
        .filter(line => line && !line.startsWith('@'))
        .join(' ')
        .substring(0, 200);
    }
    
    // Parsear parámetros
    const params = paramsStr
      .split(',')
      .map(p => p.trim())
      .filter(p => p)
      .map(p => {
        const [name, type] = p.split(':').map(s => s.trim());
        return { name: name || 'arg', type: (type || 'any').replace(/[?;]/, '') };
      });
    
    tools.set(functionName, {
      name: functionName,
      description: description || `Function: ${functionName}`,
      parameters: params,
    });
  }
  
  return tools;
};

/**
 * Detecta endpoints HTTP
 */
const extractEndpoints = (files: DetectedFile[]): string[] => {
  const endpoints: string[] = [];
  
  for (const file of files) {
    // Buscar listen()
    const listenMatch = file.content.match(/\.listen\s*\(\s*(\d+)/);
    if (listenMatch) {
      endpoints.push(`http://localhost:${listenMatch[1]}`);
    }
    
    // Buscar app.post/get/put etc
    const routePattern = /(?:app|router)\.(?:post|get|put|delete)\s*\(\s*['"`]([^'"`]+)['"` ]/g;
    let routeMatch;
    
    while ((routeMatch = routePattern.exec(file.content)) !== null) {
      const route = routeMatch[1];
      if (!endpoints.includes(route)) {
        endpoints.push(route);
      }
    }
    
    // Buscar webhook URLs
    const webhookPattern = /['"`](\/webhook[^'"`]*)['"` ]/g;
    let webhookMatch;
    while ((webhookMatch = webhookPattern.exec(file.content)) !== null) {
      endpoints.push(webhookMatch[1]);
    }
  }
  
  return [...new Set(endpoints)]; // Remover duplicados
};

/**
 * Infiere payload schema del contenido
 */
const inferPayloadSchema = (files: DetectedFile[]): Record<string, any> => {
  const schema: Record<string, any> = {
    conversationId: 'string',
    userId: 'string',
    message: 'string',
    timestamp: 'number',
  };
  
  for (const file of files) {
    // Buscar interface/type definitions
    const interfacePattern = /(?:interface|type)\s+(\w+(?:Request|Message|Payload|Input|Body))\s*(?:=\s*)?\{([^}]+)\}/g;
    let match;
    
    while ((match = interfacePattern.exec(file.content)) !== null) {
      const fieldsStr = match[2];
      
      // Parsear campos simples
      const fieldPattern = /(\w+)\s*\??:\s*([^;,}]+)/g;
      let fieldMatch;
      
      while ((fieldMatch = fieldPattern.exec(fieldsStr)) !== null) {
        const [, fieldName, fieldType] = fieldMatch;
        const cleanType = fieldType.trim().replace(/;$/, '');
        schema[fieldName] = cleanType;
      }
    }
  }
  
  return schema;
};

/**
 * Detecta servicios externos (bases de datos, APIs, email, etc.)
 */
const detectExternalServices = (files: DetectedFile[]): ExternalService[] => {
  const services: ExternalService[] = [];
  const contentAll = files.map(f => f.content).join('\n');
  const fileNames = files.map(f => f.name);
  
  // Patrones de detección de servicios
  const servicePatterns = [
    // Bases de datos
    { pattern: /supabase|@supabase/i, type: 'database' as const, name: 'Supabase' },
    { pattern: /postgresql|postgres|pg\s*\(|pgClient/i, type: 'database' as const, name: 'PostgreSQL' },
    { pattern: /mysql|mysql2/i, type: 'database' as const, name: 'MySQL' },
    { pattern: /mongodb|mongo|MongoClient/i, type: 'database' as const, name: 'MongoDB' },
    { pattern: /firebaseApp|firebase\/app|firebase\/database/i, type: 'database' as const, name: 'Firebase' },
    { pattern: /dynamodb|AWS\.DynamoDB/i, type: 'database' as const, name: 'DynamoDB' },
    
    // Email
    { pattern: /nodemailer|@sendgrid|mailgun|ses|SES/i, type: 'email' as const, name: 'Email Service' },
    
    // Autenticación
    { pattern: /passport|jsonwebtoken|jwt|oauth|@auth0/i, type: 'auth' as const, name: 'Authentication' },
    
    // APIs externas
    { pattern: /axios\.post|fetch\(|https:\/\//i, type: 'api' as const, name: 'External API' },
    
    // Almacenamiento
    { pattern: /aws-sdk|s3|bucket|@aws-sdk/i, type: 'storage' as const, name: 'Cloud Storage' },
    
    // Mensajería
    { pattern: /twilio|sendbird|socket\.io|ws\(|WebSocket/i, type: 'messaging' as const, name: 'Messaging Service' },
    
    // Calendario
    { pattern: /google-calendar|@google-cloud\/calendar|calendar\s+api/i, type: 'calendar' as const, name: 'Calendar Service' },
    
    // CRM
    { pattern: /salesforce|pipedrive|hubspot|zoho/i, type: 'crm' as const, name: 'CRM Service' },
  ];
  
  for (const { pattern, type, name } of servicePatterns) {
    if (pattern.test(contentAll)) {
      const detectedIn = files
        .filter(f => pattern.test(f.content))
        .map(f => f.name);
      
      services.push({
        type,
        name,
        description: `${name} service detected`,
        requiresCredentials: true,
        detectedIn,
      });
    }
  }
  
  return services;
};

/**
 * Detecta conexiones a bases de datos
 */
const detectDatabases = (files: DetectedFile[]): DatabaseConnection[] => {
  const databases: DatabaseConnection[] = [];
  const contentAll = files.map(f => f.content).join('\n');
  
  // Patrones específicos para bases de datos
  const dbPatterns = [
    {
      pattern: /supabase\.from\(['"](\w+)['"]\)|\.from\s*\(\s*['"](\w+)['"]/g,
      type: 'supabase',
      name: 'Supabase',
      extractTableName: true,
    },
    {
      pattern: /postgres.*\.connect\(|new Client\(|pgPool/i,
      type: 'postgresql',
      name: 'PostgreSQL',
      extractTableName: false,
    },
    {
      pattern: /mysql\.createConnection\(|pool\.query/i,
      type: 'mysql',
      name: 'MySQL',
      extractTableName: false,
    },
    {
      pattern: /db\.collection\(['"](\w+)['"]\)|\.collection\s*\(\s*['"](\w+)['"]/g,
      type: 'mongodb',
      name: 'MongoDB',
      extractTableName: true,
    },
    {
      pattern: /firebase\.database\(\)|getDatabase\(|ref\(|firestore/i,
      type: 'firebase',
      name: 'Firebase',
      extractTableName: false,
    },
  ];
  
  for (const { pattern, type, name, extractTableName } of dbPatterns) {
    if (pattern.test ? pattern.test(contentAll) : (pattern as any).exec(contentAll)) {
      const tables: string[] = [];
      
      // Extraer nombres de tablas si es necesario
      if (extractTableName && pattern instanceof RegExp) {
        let match;
        const patternWithG = new RegExp(pattern.source, 'g');
        while ((match = patternWithG.exec(contentAll)) !== null) {
          const tableName = match[1] || match[2];
          if (tableName && !tables.includes(tableName)) {
            tables.push(tableName);
          }
        }
      }
      
      const detectedIn = files
        .filter(f => {
          if (pattern instanceof RegExp) {
            return pattern.test(f.content);
          }
          return false;
        })
        .map(f => f.name);
      
      databases.push({
        type,
        name,
        description: `${name} database connection detected`,
        tables: tables.length > 0 ? tables : undefined,
        detectedIn,
      });
    }
  }
  
  return databases;
};

/**
 * Detecta herramientas que requieren credenciales
 */
const enrichToolsWithCredentials = (
  tools: Map<string, any>,
  files: DetectedFile[]
): Map<string, any> => {
  const enriched = new Map(tools);
  const contentAll = files.map(f => f.content).join('\n');
  
  // Patrones que indican que una herramienta necesita credenciales
  const credentialPatterns = [
    /process\.env\.|process\.getenv|SUPABASE|DATABASE_URL|API_KEY|SECRET/i,
    /\.createClient\(|\.connect\(|\.authenticate\(/i,
  ];
  
  for (const [toolName, toolInfo] of enriched) {
    // Buscar la definición de la herramienta
    const toolDefPattern = new RegExp(
      `(?:export\\s+)?(?:async\\s+)?function\\s+${toolName}\\s*\\([^)]*\\)\\s*\\{[^}]*\\}`,
      's'
    );
    
    const toolMatch = contentAll.match(toolDefPattern);
    if (toolMatch) {
      const toolBody = toolMatch[0];
      const needsCredentials = credentialPatterns.some(p => p.test(toolBody));
      
      if (needsCredentials) {
        enriched.set(toolName, {
          ...toolInfo,
          requiresCredentials: true,
          description: toolInfo.description + ' [Requires Credentials]',
        });
      }
    }
  }
  
  return enriched;
};

/**
 * Detecta el framework usado
 */
const detectFrameworkFromContent = (files: DetectedFile[]): string => {
  let content = files.map(f => f.content).join('\n');
  
  if (content.includes('@adiwajshing/baileys')) return 'baileys';
  if (content.includes('openai') && content.includes('ChatCompletion')) return 'openai';
  if (content.includes('langchain')) return 'langchain';
  if (content.includes('@microsoft/botbuilder')) return 'botbuilder';
  if (content.includes('ws') && content.includes('WebSocket')) return 'websocket-custom';
  if (content.includes('express')) return 'express';
  
  return 'custom-typescript';
};

/**
 * Procesa archivos detectados y extrae información
 */
const processDetectedFiles = (files: DetectedFile[]): ExtractedInfo => {
  let agentPurpose = 'TypeScript/Node Agent';
  const tools = new Map();
  let systemPrompt = '';
  
  // Procesar archivos por tipo
  const mainFile = files.find(f => f.type === 'main');
  const toolFiles = files.filter(f => f.type === 'tools' || f.type === 'handlers');
  
  if (mainFile) {
    agentPurpose = extractSystemPrompt(mainFile.content);
    systemPrompt = agentPurpose;
  }
  
  // Extraer herramientas de todos los archivos relevantes
  for (const toolFile of [...toolFiles, ...(mainFile ? [mainFile] : [])]) {
    const fileTools = extractTools(toolFile.content);
    fileTools.forEach((tool, name) => {
      if (!tools.has(name)) {
        tools.set(name, tool);
      }
    });
  }
  
  const endpoints = extractEndpoints(files);
  const payloadSchema = inferPayloadSchema(files);
  const detectedFramework = detectFrameworkFromContent(files);
  const externalServices = detectExternalServices(files);
  const databases = detectDatabases(files);
  
  // Enriquecer herramientas con información de credenciales
  const enrichedTools = enrichToolsWithCredentials(tools, files);
  
  return {
    agentPurpose,
    tools: enrichedTools,
    endpoints,
    payloadSchema,
    systemPrompt,
    detectedFramework,
    externalServices,
    databases,
  };
};

/**
 * Convierte herramientas a nodos de workflow
 */
const toolsToNodes = (tools: Map<string, any>): ToolNode[] => {
  const nodes: ToolNode[] = [];
  let nodeIndex = 1;
  
  for (const [toolName, toolInfo] of tools) {
    nodes.push({
      type: 'tool',
      id: `tool_${nodeIndex++}`,
      name: toolName,
      nodeType: 'code-function',
      parameters: {
        functionName: toolName,
        description: toolInfo.description,
        parameters: toolInfo.parameters,
      },
    });
  }
  
  return nodes;
};

/**
 * API Pública: Parsear un agente TypeScript/Node desde archivos cargados
 */
export const parseCodeAgent = async (files: File[]): Promise<ParsedAgentWorkflow> => {
  console.log(`🔍 Parsing code agent from ${files.length} files`);
  
  const detectedFiles: DetectedFile[] = [];
  let packageJson: any = null;
  
  // Procesar archivos
  for (const file of files) {
    try {
      const content = await file.text();
      const fileName = file.name;
      
      if (fileName === 'package.json') {
        try {
          packageJson = JSON.parse(content);
        } catch (e) {
          console.warn('⚠️ Could not parse package.json');
        }
      }
      
      const type = classifyFileType(fileName, content);
      detectedFiles.push({ name: fileName, content, type });
    } catch (e) {
      console.warn(`⚠️ Could not read ${file.name}`);
    }
  }
  
  console.log(`📄 Processed ${detectedFiles.length} files`);
  
  // Extraer información
  const info = processDetectedFiles(detectedFiles);
  
  // Convertir herramientas a nodos
  const toolNodes = toolsToNodes(info.tools);
  
  // Crear nodo agente principal
  const agentNode: AgentNode = {
    type: 'agent',
    id: 'main_agent',
    name: 'Code Agent',
    systemPrompt: info.systemPrompt || 'Agent implemented in TypeScript/Node',
    parameters: {
      framework: info.detectedFramework,
      language: 'TypeScript',
      toolCount: info.tools.size,
    },
  };
  
  // Construir workflow
  const nodes: WorkflowNode[] = [agentNode, ...toolNodes];
  
  // Crear conexiones simples (agente -> tools)
  const connections = toolNodes.map((tool, index) => ({
    sourceNodeId: agentNode.id,
    targetNodeId: tool.id,
    sourceHandle: `output_${index}`,
  }));
  
  // Metadatos
  const metadata: CodeAgentMetadata = {
    sourceType: 'typescript-node',
    sourceLanguage: 'TypeScript',
    frameworkOrTechnology: info.detectedFramework,
    detectedFramework: info.detectedFramework as any,
  };
  
  console.log(`✅ Parsed workflow with ${nodes.length} nodes (1 agent + ${toolNodes.length} tools)`);
  
  return {
    sourceType: 'typescript-node',
    nodes,
    connections,
    metadata,
    detectedEndpoints: info.endpoints,
  };
};

/**
 * Obtener propósito del agente en formato para Gemini
 */
export const getAgentPurpose = (workflow: ParsedAgentWorkflow): string => {
  const agentNode = workflow.nodes.find(n => n.type === 'agent') as AgentNode | undefined;
  return agentNode?.systemPrompt || 'TypeScript/Node Agent';
};

/**
 * Exportar información del agente para debugging
 */
export const exportAgentInfo = (workflow: ParsedAgentWorkflow): Record<string, any> => {
  const tools = workflow.nodes.filter(n => n.type === 'tool');
  
  return {
    framework: workflow.metadata.frameworkOrTechnology,
    toolCount: tools.length,
    tools: tools.map(t => ({ id: t.id, name: t.name })),
    endpoints: workflow.detectedEndpoints || [],
    purpose: getAgentPurpose(workflow),
  };
};
