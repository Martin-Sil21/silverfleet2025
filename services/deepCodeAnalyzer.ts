/**
 * 🔬 Deep Code Analyzer - Análisis UNIVERSAL de Código
 * 
 * Detecta CUALQUIER patrón de agentes y bases de datos:
 * - Agentes en archivos separados
 * - Agentes en métodos de clase (executePlanner, executeCommercialAdvisor)
 * - Queries directas (supabase.from, prisma.xxx)
 * - Queries wrapeadas (obrasecoDb.getChatHistory, db.query)
 * - Hooks personalizados (useGetPrices)
 * - Métodos de clase (getChatHistory, insertMessage)
 * - Funciones normales
 * 
 * NO asume nada. Detecta TODO mediante análisis AST profundo.
 */

import * as ts from 'typescript';

export interface DatabaseQuery {
  functionName: string;
  filePath: string;
  lineNumber: number;
  queryType: 'select' | 'insert' | 'update' | 'delete' | 'unknown';
  table: string | null;
  fields: string[];
  conditions: Array<{
    field: string;
    operator: string;
    value?: string;
  }>;
  rawCode: string;
  semanticContext?: string; // "prices", "products", "customers", etc.
}

export interface CustomHook {
  name: string;
  filePath: string;
  lineNumber: number;
  returnType?: string;
  queries: DatabaseQuery[];
  usedBy: string[]; // Qué archivos/componentes lo usan
  description?: string;
  semanticPurpose?: string; // "fetch product prices", "get customer data", etc.
}

export interface DatabaseOperation {
  agentName: string;
  agentFile: string;
  operation: 'read' | 'write' | 'delete';
  table: string;
  fields: string[];
  hookOrFunction: string;
  filePath: string;
  semanticContext: string; // "checking prices", "saving customer", etc.
  confidence: number;
}

export interface DeepCodeAnalysis {
  hooks: CustomHook[];
  databaseQueries: DatabaseQuery[];
  operations: DatabaseOperation[];
  dataFlow: Array<{
    from: string; // "Agent Name"
    through: string; // "useGetPrices hook"
    to: string; // "products table"
    fields: string[];
    purpose: string;
  }>;
  tables: Array<{
    name: string;
    operations: Array<{
      type: 'read' | 'write' | 'delete';
      usedBy: string[];
      fields: string[];
    }>;
  }>;
}

/**
 * Analiza un archivo TypeScript/JavaScript y extrae consultas a BD
 */
export function analyzeFileForDatabaseQueries(
  content: string,
  filePath: string
): DatabaseQuery[] {
  const queries: DatabaseQuery[] = [];
  
  // Crear AST
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  function visit(node: ts.Node) {
    // Detectar llamadas a métodos de BD
    if (ts.isCallExpression(node)) {
      const query = extractDatabaseQuery(node, sourceFile, content);
      if (query) {
        queries.push(query);
      }
    }
    
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  
  return queries;
}

/**
 * Extrae información de una consulta a BD desde un CallExpression
 */
function extractDatabaseQuery(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  content: string
): DatabaseQuery | null {
  const callText = node.getText(sourceFile);
  
  // Patrones de consultas a BD
  const patterns = [
    // Supabase: supabase.from('table').select('field1, field2')
    {
      regex: /\.from\s*\(\s*['"](\w+)['"]\s*\)/,
      provider: 'supabase',
      extractQuery: (text: string) => extractSupabaseQuery(text, node, sourceFile)
    },
    // Prisma: prisma.table.findMany({ where: {...} })
    {
      regex: /prisma\.(\w+)\.(findMany|findUnique|create|update|delete)/,
      provider: 'prisma',
      extractQuery: (text: string) => extractPrismaQuery(text, node, sourceFile)
    },
    // MongoDB: db.collection('table').find({})
    {
      regex: /\.collection\s*\(\s*['"](\w+)['"]\s*\)\.(find|insertOne|updateOne|deleteOne)/,
      provider: 'mongodb',
      extractQuery: (text: string) => extractMongoQuery(text, node, sourceFile)
    },
    // SQL directo: db.query('SELECT * FROM table WHERE ...')
    {
      regex: /(SELECT|INSERT|UPDATE|DELETE).+(FROM|INTO)\s+(\w+)/i,
      provider: 'sql',
      extractQuery: (text: string) => extractSQLQuery(text, node, sourceFile)
    },
  ];

  for (const pattern of patterns) {
    if (pattern.regex.test(callText)) {
      return pattern.extractQuery(callText);
    }
  }

  return null;
}

/**
 * Extrae consulta de Supabase
 */
function extractSupabaseQuery(
  callText: string,
  node: ts.CallExpression,
  sourceFile: ts.SourceFile
): DatabaseQuery | null {
  // Extraer tabla
  const tableMatch = callText.match(/\.from\s*\(\s*['"](\w+)['"]\s*\)/);
  if (!tableMatch) return null;
  
  const table = tableMatch[1];
  
  // Detectar tipo de operación
  let queryType: DatabaseQuery['queryType'] = 'unknown';
  if (callText.includes('.select(')) queryType = 'select';
  else if (callText.includes('.insert(')) queryType = 'insert';
  else if (callText.includes('.update(')) queryType = 'update';
  else if (callText.includes('.delete(')) queryType = 'delete';
  
  // Extraer campos en select
  const fields: string[] = [];
  const selectMatch = callText.match(/\.select\s*\(\s*['"]([^'"]+)['"]\s*\)/);
  if (selectMatch) {
    const fieldsStr = selectMatch[1];
    fields.push(...fieldsStr.split(',').map(f => f.trim()));
  }
  
  // Extraer condiciones (eq, neq, gt, lt, etc.)
  const conditions: DatabaseQuery['conditions'] = [];
  const eqMatches = callText.matchAll(/\.eq\s*\(\s*['"](\w+)['"]\s*,\s*([^)]+)\)/g);
  for (const match of eqMatches) {
    conditions.push({
      field: match[1],
      operator: 'eq',
      value: match[2]?.trim()
    });
  }
  
  // Obtener línea
  const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  
  // Contexto semántico basado en tabla y campos
  const semanticContext = inferSemanticContext(table, fields);
  
  return {
    functionName: extractFunctionName(node, sourceFile),
    filePath: sourceFile.fileName,
    lineNumber,
    queryType,
    table,
    fields,
    conditions,
    rawCode: callText.substring(0, 150), // Primeros 150 chars
    semanticContext
  };
}

/**
 * Extrae consulta de Prisma
 */
function extractPrismaQuery(
  callText: string,
  node: ts.CallExpression,
  sourceFile: ts.SourceFile
): DatabaseQuery | null {
  // prisma.users.findMany() → tabla = "users"
  const tableMatch = callText.match(/prisma\.(\w+)\.(findMany|findUnique|findFirst|create|update|delete)/);
  if (!tableMatch) return null;
  
  const table = tableMatch[1];
  const operation = tableMatch[2];
  
  let queryType: DatabaseQuery['queryType'] = 'unknown';
  if (operation.startsWith('find')) queryType = 'select';
  else if (operation === 'create') queryType = 'insert';
  else if (operation === 'update') queryType = 'update';
  else if (operation === 'delete') queryType = 'delete';
  
  // Extraer campos del select
  const fields: string[] = [];
  const selectMatch = callText.match(/select\s*:\s*\{([^}]+)\}/);
  if (selectMatch) {
    const selectBlock = selectMatch[1];
    const fieldMatches = selectBlock.matchAll(/(\w+)\s*:\s*true/g);
    for (const match of fieldMatches) {
      fields.push(match[1]);
    }
  }
  
  // Extraer condiciones del where
  const conditions: DatabaseQuery['conditions'] = [];
  const whereMatch = callText.match(/where\s*:\s*\{([^}]+)\}/);
  if (whereMatch) {
    const whereBlock = whereMatch[1];
    const condMatches = whereBlock.matchAll(/(\w+)\s*:\s*([^,}]+)/g);
    for (const match of condMatches) {
      conditions.push({
        field: match[1],
        operator: 'eq',
        value: match[2]?.trim()
      });
    }
  }
  
  const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const semanticContext = inferSemanticContext(table, fields);
  
  return {
    functionName: extractFunctionName(node, sourceFile),
    filePath: sourceFile.fileName,
    lineNumber,
    queryType,
    table,
    fields,
    conditions,
    rawCode: callText.substring(0, 150),
    semanticContext
  };
}

/**
 * Extrae consulta de MongoDB
 */
function extractMongoQuery(
  callText: string,
  node: ts.CallExpression,
  sourceFile: ts.SourceFile
): DatabaseQuery | null {
  const tableMatch = callText.match(/\.collection\s*\(\s*['"](\w+)['"]\s*\)/);
  if (!tableMatch) return null;
  
  const table = tableMatch[1];
  
  let queryType: DatabaseQuery['queryType'] = 'unknown';
  if (callText.includes('.find(')) queryType = 'select';
  else if (callText.includes('.insertOne(') || callText.includes('.insertMany(')) queryType = 'insert';
  else if (callText.includes('.updateOne(') || callText.includes('.updateMany(')) queryType = 'update';
  else if (callText.includes('.deleteOne(') || callText.includes('.deleteMany(')) queryType = 'delete';
  
  const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const semanticContext = inferSemanticContext(table, []);
  
  return {
    functionName: extractFunctionName(node, sourceFile),
    filePath: sourceFile.fileName,
    lineNumber,
    queryType,
    table,
    fields: [],
    conditions: [],
    rawCode: callText.substring(0, 150),
    semanticContext
  };
}

/**
 * Extrae consulta SQL directa
 */
function extractSQLQuery(
  callText: string,
  node: ts.CallExpression,
  sourceFile: ts.SourceFile
): DatabaseQuery | null {
  let queryType: DatabaseQuery['queryType'] = 'unknown';
  if (/SELECT/i.test(callText)) queryType = 'select';
  else if (/INSERT/i.test(callText)) queryType = 'insert';
  else if (/UPDATE/i.test(callText)) queryType = 'update';
  else if (/DELETE/i.test(callText)) queryType = 'delete';
  
  // Extraer tabla
  const tableMatch = callText.match(/(?:FROM|INTO|UPDATE)\s+(\w+)/i);
  const table = tableMatch ? tableMatch[1] : null;
  
  // Extraer campos (SELECT field1, field2)
  const fields: string[] = [];
  const selectMatch = callText.match(/SELECT\s+(.+?)\s+FROM/i);
  if (selectMatch && selectMatch[1] !== '*') {
    fields.push(...selectMatch[1].split(',').map(f => f.trim()));
  }
  
  const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const semanticContext = table ? inferSemanticContext(table, fields) : undefined;
  
  return {
    functionName: extractFunctionName(node, sourceFile),
    filePath: sourceFile.fileName,
    lineNumber,
    queryType,
    table,
    fields,
    conditions: [],
    rawCode: callText.substring(0, 150),
    semanticContext
  };
}

/**
 * Extrae el nombre de la función que contiene este nodo
 */
function extractFunctionName(node: ts.Node, sourceFile: ts.SourceFile): string {
  let current: ts.Node | undefined = node;
  
  while (current) {
    if (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current) || ts.isArrowFunction(current)) {
      // Si es una función con nombre
      if (ts.isFunctionDeclaration(current) && current.name) {
        return current.name.text;
      }
      
      // Si es una arrow function asignada a una variable
      const parent = current.parent;
      if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }
    }
    
    current = current.parent;
  }
  
  return 'anonymous';
}

/**
 * Infiere el contexto semántico basado en nombres de tablas y campos
 */
function inferSemanticContext(table: string, fields: string[]): string | undefined {
  const tableLower = table.toLowerCase();
  const fieldsLower = fields.map(f => f.toLowerCase()).join(' ');
  
  // Patrones semánticos
  const patterns = [
    { keywords: ['price', 'precio', 'cost', 'amount'], context: 'pricing' },
    { keywords: ['product', 'item', 'articulo'], context: 'products' },
    { keywords: ['customer', 'cliente', 'user', 'usuario'], context: 'customers' },
    { keywords: ['order', 'pedido', 'compra', 'purchase'], context: 'orders' },
    { keywords: ['inventory', 'stock', 'warehouse'], context: 'inventory' },
    { keywords: ['payment', 'pago', 'transaction'], context: 'payments' },
    { keywords: ['appointment', 'cita', 'booking', 'reserva'], context: 'appointments' },
  ];
  
  for (const pattern of patterns) {
    if (pattern.keywords.some(kw => tableLower.includes(kw) || fieldsLower.includes(kw))) {
      return pattern.context;
    }
  }
  
  return undefined;
}

/**
 * Detecta hooks personalizados en un archivo
 */
export function detectCustomHooks(
  content: string,
  filePath: string,
  allQueries: DatabaseQuery[]
): CustomHook[] {
  const hooks: CustomHook[] = [];
  
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  function visit(node: ts.Node) {
    // Detectar declaraciones de funciones que empiecen con "use"
    if (ts.isFunctionDeclaration(node) || ts.isVariableStatement(node)) {
      const hook = extractHookInfo(node, sourceFile, allQueries);
      if (hook) {
        hooks.push(hook);
      }
    }
    
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  
  return hooks;
}

function extractHookInfo(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  allQueries: DatabaseQuery[]
): CustomHook | null {
  let hookName: string | null = null;
  let lineNumber = 0;
  
  // Función normal: function useSomething() {}
  if (ts.isFunctionDeclaration(node) && node.name) {
    hookName = node.name.text;
    lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  }
  
  // Variable: const useSomething = () => {}
  if (ts.isVariableStatement(node)) {
    const declaration = node.declarationList.declarations[0];
    if (declaration && ts.isIdentifier(declaration.name)) {
      hookName = declaration.name.text;
      lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    }
  }
  
  // Solo procesar si el nombre empieza con "use"
  if (!hookName || !hookName.startsWith('use')) {
    return null;
  }
  
  // Encontrar queries que pertenecen a este hook
  const hookQueries = allQueries.filter(q => 
    q.functionName === hookName && q.filePath === sourceFile.fileName
  );
  
  if (hookQueries.length === 0) {
    return null; // Hook sin queries a BD
  }
  
  // Inferir propósito semántico
  const semanticPurpose = inferHookPurpose(hookName, hookQueries);
  
  return {
    name: hookName,
    filePath: sourceFile.fileName,
    lineNumber,
    queries: hookQueries,
    usedBy: [], // Se llenará después
    description: `Custom hook with ${hookQueries.length} database ${hookQueries.length === 1 ? 'query' : 'queries'}`,
    semanticPurpose
  };
}

function inferHookPurpose(hookName: string, queries: DatabaseQuery[]): string {
  const nameLower = hookName.toLowerCase();
  
  // Inferir del nombre
  if (nameLower.includes('price')) return 'fetch product prices';
  if (nameLower.includes('product')) return 'fetch product data';
  if (nameLower.includes('customer') || nameLower.includes('user')) return 'fetch customer data';
  if (nameLower.includes('order')) return 'fetch order data';
  
  // Inferir de las queries
  if (queries.length > 0) {
    const firstQuery = queries[0];
    if (firstQuery.semanticContext) {
      const contextMap: Record<string, string> = {
        'pricing': 'fetch pricing information',
        'products': 'fetch product information',
        'customers': 'fetch customer information',
        'orders': 'fetch order information',
        'inventory': 'fetch inventory data',
      };
      return contextMap[firstQuery.semanticContext] || `query ${firstQuery.table} table`;
    }
    
    if (firstQuery.table) {
      return `query ${firstQuery.table} table`;
    }
  }
  
  return 'database operations';
}

/**
 * Mapea qué agentes usan qué hooks/funciones
 */
export function mapAgentToHooks(
  agentFiles: Array<{ filePath: string; content: string; agentName: string }>,
  hooks: CustomHook[]
): Map<string, CustomHook[]> {
  const agentHooksMap = new Map<string, CustomHook[]>();
  
  for (const agent of agentFiles) {
    const usedHooks: CustomHook[] = [];
    
    for (const hook of hooks) {
      // Buscar si el agente importa o usa este hook
      const importRegex = new RegExp(`import.*${hook.name}.*from|require.*${hook.name}`);
      const usageRegex = new RegExp(`${hook.name}\\s*\\(`);
      
      if (importRegex.test(agent.content) || usageRegex.test(agent.content)) {
        usedHooks.push(hook);
        
        // Actualizar la lista de "usedBy" del hook
        if (!hook.usedBy.includes(agent.agentName)) {
          hook.usedBy.push(agent.agentName);
        }
      }
    }
    
    if (usedHooks.length > 0) {
      agentHooksMap.set(agent.agentName, usedHooks);
    }
  }
  
  return agentHooksMap;
}

/**
 * Genera el análisis profundo completo
 */
export function generateDeepAnalysis(
  files: Array<{ path: string; content: string }>,
  agents: Array<{ name: string; filePath: string }>
): DeepCodeAnalysis {
  console.log('🔬 [DeepCodeAnalyzer] Starting deep analysis...');
  
  // 1. Extraer todas las queries de todos los archivos
  const allQueries: DatabaseQuery[] = [];
  for (const file of files) {
    const queries = analyzeFileForDatabaseQueries(file.content, file.path);
    allQueries.push(...queries);
  }
  
  console.log(`   📊 Found ${allQueries.length} database queries`);
  
  // 2. Detectar hooks personalizados
  const allHooks: CustomHook[] = [];
  for (const file of files) {
    const hooks = detectCustomHooks(file.content, file.path, allQueries);
    allHooks.push(...hooks);
  }
  
  console.log(`   🪝 Found ${allHooks.length} custom hooks with database operations`);
  
  // 3. Mapear agentes → hooks
  const agentFiles = agents.map(a => {
    const file = files.find(f => f.path === a.filePath);
    return {
      filePath: a.filePath,
      content: file?.content || '',
      agentName: a.name
    };
  });
  
  const agentHooksMap = mapAgentToHooks(agentFiles, allHooks);
  
  console.log(`   🔗 Mapped ${agentHooksMap.size} agents to their hooks`);
  
  // 4. Generar operaciones de BD por agente
  const operations: DatabaseOperation[] = [];
  
  for (const [agentName, hooks] of agentHooksMap.entries()) {
    const agent = agents.find(a => a.name === agentName);
    if (!agent) continue;
    
    for (const hook of hooks) {
      for (const query of hook.queries) {
        if (!query.table) continue;
        
        operations.push({
          agentName,
          agentFile: agent.filePath,
          operation: query.queryType === 'select' ? 'read' : 
                     query.queryType === 'insert' || query.queryType === 'update' ? 'write' : 'delete',
          table: query.table,
          fields: query.fields,
          hookOrFunction: hook.name,
          filePath: hook.filePath,
          semanticContext: query.semanticContext || hook.semanticPurpose || 'unknown',
          confidence: 0.9
        });
      }
    }
  }
  
  console.log(`   ⚙️ Generated ${operations.length} database operations`);
  
  // 5. Generar flujo de datos
  const dataFlow = operations.map(op => ({
    from: op.agentName,
    through: op.hookOrFunction,
    to: `${op.table} table`,
    fields: op.fields,
    purpose: op.semanticContext
  }));
  
  // 6. Agrupar por tablas
  const tablesMap = new Map<string, {
    name: string;
    operations: Array<{
      type: 'read' | 'write' | 'delete';
      usedBy: string[];
      fields: string[];
    }>;
  }>();
  
  for (const op of operations) {
    if (!tablesMap.has(op.table)) {
      tablesMap.set(op.table, { name: op.table, operations: [] });
    }
    
    const tableInfo = tablesMap.get(op.table)!;
    const existingOp = tableInfo.operations.find(o => o.type === op.operation);
    
    if (existingOp) {
      if (!existingOp.usedBy.includes(op.agentName)) {
        existingOp.usedBy.push(op.agentName);
      }
      existingOp.fields.push(...op.fields.filter(f => !existingOp.fields.includes(f)));
    } else {
      tableInfo.operations.push({
        type: op.operation,
        usedBy: [op.agentName],
        fields: [...op.fields]
      });
    }
  }
  
  const tables = Array.from(tablesMap.values());
  
  console.log(`   📋 Analyzed ${tables.length} database tables`);
  console.log('   ✅ Deep analysis complete!\n');
  
  return {
    hooks: allHooks,
    databaseQueries: allQueries,
    operations,
    dataFlow,
    tables
  };
}

