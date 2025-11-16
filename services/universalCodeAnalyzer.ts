/**
 * 🌐 Universal Code Analyzer
 * 
 * Analiza CUALQUIER patrón de código sin asumir estructura:
 * - BuilderBot, Next.js, Express, Python, lo que sea
 * - Clases, funciones, métodos, lo que sea
 * - Queries directas o wrapeadas, lo que sea
 * 
 * Estrategia: Buscar patrones SEMÁNTICOS, no sintácticos específicos
 */

import * as ts from 'typescript';

export interface UniversalAgent {
  name: string;
  filePath: string;
  lineNumber: number;
  detectionMethod: 'class_method' | 'function' | 'file' | 'variable';
  systemPrompt?: string;
  description?: string;
  relatedMethods?: string[];
  confidence: number;
}

export interface UniversalDatabaseAccess {
  functionName: string;
  className?: string;
  filePath: string;
  lineNumber: number;
  accessType: 'direct_query' | 'wrapper_method' | 'orm_call';
  table?: string;
  operation: 'select' | 'insert' | 'update' | 'delete' | 'unknown';
  fields: string[];
  rawCode: string;
  confidence: number;
}

export interface UniversalDataFlow {
  agent: string;
  viaFunction: string;
  toDatabase: string;
  table?: string;
  operation: string;
  confidence: number;
}

export interface UniversalAnalysis {
  agents: UniversalAgent[];
  databaseAccesses: UniversalDatabaseAccess[];
  dataFlows: UniversalDataFlow[];
  tables: Map<string, {
    operations: string[];
    usedBy: string[];
    fields: string[];
  }>;
}

/**
 * Analiza un archivo y busca CUALQUIER patrón de agente IA
 */
export function detectAgentsUniversal(content: string, filePath: string): UniversalAgent[] {
  const agents: UniversalAgent[] = [];
  
  // Crear AST
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  
  // ESTRATEGIA 1: Buscar métodos de clase con nombres que sugieran agentes
  findAgentMethods(sourceFile, content, filePath, agents);
  
  // ESTRATEGIA 2: Buscar funciones con system prompts largos
  findAgentFunctions(sourceFile, content, filePath, agents);
  
  // ESTRATEGIA 3: Buscar archivos completos que sean agentes
  if (isAgentFile(content, filePath)) {
    agents.push(createAgentFromFile(content, filePath));
  }
  
  return agents;
}

/**
 * Busca métodos de clase que parezcan agentes
 * Ejemplos: executePlanner(), executeAgent(), processWithAI()
 */
function findAgentMethods(
  sourceFile: ts.SourceFile,
  content: string,
  filePath: string,
  agents: UniversalAgent[]
): void {
  function visit(node: ts.Node) {
    // Buscar métodos de clase
    if (ts.isMethodDeclaration(node) && node.name) {
      const methodName = node.name.getText(sourceFile);
      const methodText = node.getText(sourceFile);
      
      // Detectar si el método ejecuta un agente IA
      const isAgentMethod = (
        // Nombres que sugieren agentes
        /execute|process|run|generate|chat|conversation|planner|advisor|assistant/i.test(methodName) &&
        // Y contiene llamadas a IA o prompts
        (methodText.includes('generateContent') ||
         methodText.includes('chat.completions') ||
         methodText.includes('messages.create') ||
         methodText.includes('Agent') ||
         hasLongTemplateString(methodText))
      );
      
      if (isAgentMethod) {
        const systemPrompt = extractSystemPromptFromMethod(methodText);
        const className = findParentClassName(node, sourceFile);
        
        agents.push({
          name: className ? `${className}.${methodName}` : methodName,
          filePath,
          lineNumber: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          detectionMethod: 'class_method',
          systemPrompt,
          description: `Method that executes AI agent logic`,
          confidence: systemPrompt ? 0.95 : 0.75
        });
        
        console.log(`✅ [Universal] Detected agent METHOD: ${className}.${methodName}()`);
      }
    }
    
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
}

/**
 * Busca funciones que parezcan agentes
 */
function findAgentFunctions(
  sourceFile: ts.SourceFile,
  content: string,
  filePath: string,
  agents: UniversalAgent[]
): void {
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const funcName = node.name.text;
      const funcText = node.getText(sourceFile);
      
      const isAgentFunction = (
        /agent|ai|assistant|chat|process/i.test(funcName) &&
        hasLongTemplateString(funcText)
      );
      
      if (isAgentFunction) {
        const systemPrompt = extractSystemPromptFromMethod(funcText);
        
        agents.push({
          name: funcName,
          filePath,
          lineNumber: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          detectionMethod: 'function',
          systemPrompt,
          confidence: 0.85
        });
        
        console.log(`✅ [Universal] Detected agent FUNCTION: ${funcName}()`);
      }
    }
    
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
}

/**
 * Detecta si todo el archivo es un agente
 */
function isAgentFile(content: string, filePath: string): boolean {
  const fileName = filePath.split('/').pop()?.toLowerCase() || '';
  
  return (
    /agent|assistant|chat|ai/i.test(fileName) &&
    hasLongTemplateString(content) &&
    (content.includes('generateContent') || 
     content.includes('chat.completions') ||
     content.includes('messages.create'))
  );
}

function createAgentFromFile(content: string, filePath: string): UniversalAgent {
  return {
    name: filePath.split('/').pop()?.replace(/\.(ts|js)$/, '') || 'Unknown Agent',
    filePath,
    lineNumber: 1,
    detectionMethod: 'file',
    systemPrompt: extractSystemPromptFromMethod(content),
    confidence: 0.70
  };
}

/**
 * Detecta si un texto tiene template strings largos (posible system prompt)
 */
function hasLongTemplateString(text: string): boolean {
  const templateStrings = text.match(/`[^`]{100,}`/g);
  return templateStrings !== null && templateStrings.length > 0;
}

/**
 * Extrae system prompt de un método/función
 */
function extractSystemPromptFromMethod(text: string): string | undefined {
  // Buscar template strings largos
  const matches = text.match(/`([^`]{100,})`/);
  if (matches && matches[1]) {
    const prompt = matches[1].trim();
    // Verificar que parezca un system prompt
    if (/you are|eres|tu tarea|your task|instructions|role/i.test(prompt)) {
      return prompt.substring(0, 500); // Primeros 500 chars
    }
  }
  
  // Buscar strings multilínea
  const multilineMatch = text.match(/["']([^"']{100,})["']/s);
  if (multilineMatch && multilineMatch[1]) {
    return multilineMatch[1].trim().substring(0, 500);
  }
  
  return undefined;
}

/**
 * Encuentra el nombre de la clase padre de un nodo
 */
function findParentClassName(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  let current: ts.Node | undefined = node.parent;
  
  while (current) {
    if (ts.isClassDeclaration(current) && current.name) {
      return current.name.text;
    }
    current = current.parent;
  }
  
  return undefined;
}

/**
 * Analiza archivo buscando CUALQUIER acceso a base de datos
 */
export function detectDatabaseAccessUniversal(content: string, filePath: string): UniversalDatabaseAccess[] {
  const accesses: UniversalDatabaseAccess[] = [];
  
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const access = analyzeDatabaseCall(node, sourceFile, content);
      if (access) {
        accesses.push(access);
      }
    }
    
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
  
  return accesses;
}

/**
 * Analiza una llamada para ver si es acceso a BD
 */
function analyzeDatabaseCall(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  content: string
): UniversalDatabaseAccess | null {
  const callText = node.getText(sourceFile);
  const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  
  // PATRÓN 1: Queries directas
  const directPatterns = [
    { regex: /\.from\s*\(\s*['"](\w+)['"]\)/, type: 'direct_query', provider: 'supabase' },
    { regex: /prisma\.(\w+)\./, type: 'direct_query', provider: 'prisma' },
    { regex: /\.collection\s*\(\s*['"](\w+)['"]\)/, type: 'direct_query', provider: 'mongodb' },
    { regex: /SELECT\s+.+FROM\s+(\w+)/i, type: 'direct_query', provider: 'sql' }
  ];
  
  for (const pattern of directPatterns) {
    const match = callText.match(pattern.regex);
    if (match) {
      return createDatabaseAccess(
        node,
        sourceFile,
        callText,
        lineNumber,
        pattern.type as any,
        match[1] || undefined,
        0.95
      );
    }
  }
  
  // PATRÓN 2: Métodos wrapper
  const wrapperPatterns = [
    /getChatHistory|getHistory|fetchHistory/i,
    /insertChatMessage|insertMessage|saveMessage/i,
    /updateResumen|updateSummary|updateConversation/i,
    /getResumen|getSummary|getConversation/i,
    /deleteMessage|removeMessage/i,
    /searchProductos|searchProducts/i
  ];
  
  for (const pattern of wrapperPatterns) {
    if (pattern.test(callText)) {
      // Inferir tabla desde el nombre del método
      const table = inferTableFromMethodName(callText);
      
      return createDatabaseAccess(
        node,
        sourceFile,
        callText,
        lineNumber,
        'wrapper_method',
        table,
        0.85
      );
    }
  }
  
  return null;
}

function createDatabaseAccess(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  callText: string,
  lineNumber: number,
  accessType: UniversalDatabaseAccess['accessType'],
  table: string | undefined,
  confidence: number
): UniversalDatabaseAccess {
  // Determinar operación
  let operation: UniversalDatabaseAccess['operation'] = 'unknown';
  if (/select|get|fetch|find/i.test(callText)) operation = 'select';
  else if (/insert|create|add|save/i.test(callText)) operation = 'insert';
  else if (/update|modify/i.test(callText)) operation = 'update';
  else if (/delete|remove/i.test(callText)) operation = 'delete';
  
  // Extraer nombre de función
  const functionName = extractFunctionNameFromNode(node, sourceFile);
  const className = findParentClassName(node, sourceFile);
  
  // Extraer campos (simplificado)
  const fields = extractFieldsFromCall(callText);
  
  return {
    functionName,
    className,
    filePath: sourceFile.fileName,
    lineNumber,
    accessType,
    table,
    operation,
    fields,
    rawCode: callText.substring(0, 150),
    confidence
  };
}

function extractFunctionNameFromNode(node: ts.Node, sourceFile: ts.SourceFile): string {
  let current: ts.Node | undefined = node;
  
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      return current.name.text;
    }
    if (ts.isMethodDeclaration(current) && current.name) {
      return current.name.getText(sourceFile);
    }
    if (ts.isArrowFunction(current)) {
      const parent = current.parent;
      if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }
    }
    current = current.parent;
  }
  
  return 'anonymous';
}

function extractFieldsFromCall(callText: string): string[] {
  const fields: string[] = [];
  
  // SELECT fields
  const selectMatch = callText.match(/select\s*\(\s*['"]([^'"]+)['"]\s*\)/i);
  if (selectMatch) {
    fields.push(...selectMatch[1].split(',').map(f => f.trim()));
  }
  
  // .eq(), .filter() etc
  const filterMatches = callText.matchAll(/\.(?:eq|neq|gt|lt|gte|lte)\s*\(\s*['"](\w+)['"]/g);
  for (const match of filterMatches) {
    if (!fields.includes(match[1])) {
      fields.push(match[1]);
    }
  }
  
  return fields;
}

function inferTableFromMethodName(methodName: string): string | undefined {
  const lower = methodName.toLowerCase();
  
  if (/chat|history|message/.test(lower)) return 'chat_histories';
  if (/resumen|summary|conversation/.test(lower)) return 'resumen_conversaciones';
  if (/memory|memoria|temporal/.test(lower)) return 'memoria_temporal';
  if (/product|producto/.test(lower)) return 'products';
  if (/user|usuario|customer|cliente/.test(lower)) return 'users';
  
  return undefined;
}

/**
 * FUNCIÓN PRINCIPAL: Análisis completo universal
 */
export function analyzeUniversal(
  files: Array<{ path: string; content: string }>,
  agents?: Array<{ name: string; filePath: string }>
): UniversalAnalysis {
  console.log('🌐 [Universal Analyzer] Starting universal analysis...');
  
  const detectedAgents: UniversalAgent[] = [];
  const databaseAccesses: UniversalDatabaseAccess[] = [];
  
  // Analizar cada archivo
  for (const file of files) {
    // Detectar agentes
    const fileAgents = detectAgentsUniversal(file.content, file.path);
    detectedAgents.push(...fileAgents);
    
    // Detectar accesos a BD
    const fileAccesses = detectDatabaseAccessUniversal(file.content, file.path);
    databaseAccesses.push(...fileAccesses);
  }
  
  console.log(`   🤖 Detected ${detectedAgents.length} agents`);
  console.log(`   🗄️  Detected ${databaseAccesses.length} database accesses`);
  
  // Mapear flujo de datos
  const dataFlows = mapDataFlows(detectedAgents, databaseAccesses, files);
  
  // Agrupar por tablas
  const tables = groupByTables(databaseAccesses);
  
  console.log(`   🔗 Mapped ${dataFlows.length} data flows`);
  console.log(`   📋 Found ${tables.size} database tables`);
  
  return {
    agents: detectedAgents,
    databaseAccesses,
    dataFlows,
    tables
  };
}

function mapDataFlows(
  agents: UniversalAgent[],
  accesses: UniversalDatabaseAccess[],
  files: Array<{ path: string; content: string }>
): UniversalDataFlow[] {
  const flows: UniversalDataFlow[] = [];
  
  for (const agent of agents) {
    // Encontrar el archivo del agente
    const agentFile = files.find(f => f.path === agent.filePath);
    if (!agentFile) continue;
    
    // Buscar qué accesos a BD se hacen desde el código del agente
    for (const access of accesses) {
      // Si el acceso está en el mismo archivo
      if (access.filePath === agent.filePath) {
        flows.push({
          agent: agent.name,
          viaFunction: access.functionName,
          toDatabase: access.table || 'unknown_table',
          table: access.table,
          operation: access.operation,
          confidence: Math.min(agent.confidence, access.confidence)
        });
      }
      
      // Si el agente llama a una función que tiene el acceso
      const accessFuncName = access.className 
        ? `${access.className}.${access.functionName}`
        : access.functionName;
      
      if (agentFile.content.includes(accessFuncName)) {
        flows.push({
          agent: agent.name,
          viaFunction: accessFuncName,
          toDatabase: access.table || 'unknown_table',
          table: access.table,
          operation: access.operation,
          confidence: Math.min(agent.confidence, access.confidence) * 0.9
        });
      }
    }
  }
  
  return flows;
}

function groupByTables(accesses: UniversalDatabaseAccess[]): Map<string, {
  operations: string[];
  usedBy: string[];
  fields: string[];
}> {
  const tables = new Map<string, { operations: string[]; usedBy: string[]; fields: string[] }>();
  
  for (const access of accesses) {
    if (!access.table) continue;
    
    if (!tables.has(access.table)) {
      tables.set(access.table, {
        operations: [],
        usedBy: [],
        fields: []
      });
    }
    
    const table = tables.get(access.table)!;
    
    if (!table.operations.includes(access.operation)) {
      table.operations.push(access.operation);
    }
    
    const usedByName = access.className 
      ? `${access.className}.${access.functionName}`
      : access.functionName;
    
    if (!table.usedBy.includes(usedByName)) {
      table.usedBy.push(usedByName);
    }
    
    for (const field of access.fields) {
      if (!table.fields.includes(field)) {
        table.fields.push(field);
      }
    }
  }
  
  return tables;
}

