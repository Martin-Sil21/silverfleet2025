/**
 * 🗄️ Database Wrapper Detector
 * 
 * Detecta métodos/funciones/clases que encapsulan accesos a bases de datos:
 * - ObrasecoDatabase.getChatHistory()
 * - db.query()
 * - useGetPrices()
 * - fetchUserData()
 */

export interface DatabaseWrapper {
  name: string;
  className?: string;
  filePath: string;
  lineNumber: number;
  type: 'class_method' | 'function' | 'hook';
  operation: 'select' | 'insert' | 'update' | 'delete' | 'multiple' | 'unknown';
  inferredTable?: string;
  fields: string[];
  usedByAgents: string[];
  confidence: number;
  codeSnippet: string;
}

export interface DataFlow {
  agent: string;
  wrapper: string;
  table: string;
  operation: string;
  confidence: number;
}

/**
 * Detecta wrappers de BD en archivos del proyecto
 */
export function detectDatabaseWrappers(
  files: Array<{ path: string; content: string; name: string }>,
  agents: Array<{ name: string; filePath: string }>
): { wrappers: DatabaseWrapper[]; dataFlows: DataFlow[] } {
  const wrappers: DatabaseWrapper[] = [];
  
  for (const file of files) {
    // Buscar archivos de database/db/data
    const isDatabaseFile = /database|db|data|repository|dao/i.test(file.path);
    
    if (isDatabaseFile || file.content.includes('supabase') || file.content.includes('prisma')) {
      const fileWrappers = extractWrappersFromFile(file);
      wrappers.push(...fileWrappers);
    }
  }
  
  console.log(`🗄️  Detected ${wrappers.length} database wrappers`);
  
  // Mapear flujos de datos: Agent → Wrapper → Table
  const dataFlows = mapDataFlows(wrappers, agents, files);
  
  console.log(`🔗 Mapped ${dataFlows.length} data flows`);
  
  return { wrappers, dataFlows };
}

/**
 * Extrae wrappers de un archivo
 */
function extractWrappersFromFile(file: { path: string; content: string; name: string }): DatabaseWrapper[] {
  const wrappers: DatabaseWrapper[] = [];
  const lines = file.content.split('\n');
  
  // PATRÓN 1: Métodos de clase
  const classMethodPattern = /(?:async\s+)?(\w+)\s*\(([^)]*)\)[^{]*{/g;
  let match;
  
  while ((match = classMethodPattern.exec(file.content)) !== null) {
    const methodName = match[1];
    const params = match[2];
    const startIndex = match.index;
    const lineNumber = file.content.substring(0, startIndex).split('\n').length;
    
    // Extraer el cuerpo del método
    const methodBody = extractMethodBody(file.content, startIndex);
    
    // Verificar si es un wrapper de BD
    if (isDatabaseWrapper(methodBody, methodName)) {
      const wrapper = analyzeWrapper(methodName, methodBody, file, lineNumber, 'class_method');
      if (wrapper) {
        wrappers.push(wrapper);
      }
    }
  }
  
  console.log(`   📝 Found ${wrappers.length} wrappers in ${file.name}`);
  
  return wrappers;
}

/**
 * Extrae el cuerpo completo de un método (con llaves balanceadas)
 */
function extractMethodBody(content: string, startIndex: number): string {
  let braceCount = 0;
  let inMethod = false;
  let body = '';
  let foundStart = false;
  
  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];
    
    if (char === '{') {
      braceCount++;
      inMethod = true;
      foundStart = true;
    }
    
    if (foundStart) {
      body += char;
    }
    
    if (char === '}') {
      braceCount--;
      if (braceCount === 0 && inMethod) {
        break;
      }
    }
  }
  
  return body;
}

/**
 * Verifica si un método es un wrapper de base de datos
 */
function isDatabaseWrapper(body: string, name: string): boolean {
  // Verificar nombre sugiere BD
  const nameIndicatesDB = /get|fetch|insert|update|delete|save|load|query|search|find/i.test(name);
  
  // Verificar cuerpo tiene llamadas a BD
  const bodyHasDBCall = 
    body.includes('.from(') ||
    body.includes('.select(') ||
    body.includes('.insert(') ||
    body.includes('.update(') ||
    body.includes('.delete(') ||
    body.includes('.eq(') ||
    body.includes('prisma.') ||
    body.includes('query(') ||
    body.includes('execute(') ||
    body.includes('supabase') ||
    body.includes('this.supabase') ||
    body.includes('this.client');
  
  const isWrapper = nameIndicatesDB && bodyHasDBCall;
  
  if (isWrapper) {
    console.log(`   ✅ ${name}() is a DB wrapper`);
  }
  
  return isWrapper;
}

/**
 * 🔥 NUEVO: Extrae nombre de tabla directamente del código .from('tabla')
 */
function extractTableFromCode(body: string): string | undefined {
  // Buscar .from('table_name') o .from("table_name") o .from(`table_name`)
  const fromPatterns = [
    /\.from\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/,
    /this\.supabase\.from\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/,
  ];
  
  for (const pattern of fromPatterns) {
    const match = body.match(pattern);
    if (match && match[1]) {
      console.log(`      🎯 Tabla extraída del código: "${match[1]}"`);
      return match[1];
    }
  }
  
  return undefined;
}

/**
 * Analiza un wrapper y extrae su información
 */
function analyzeWrapper(
  name: string,
  body: string,
  file: { path: string; content: string; name: string },
  lineNumber: number,
  type: DatabaseWrapper['type']
): DatabaseWrapper | null {
  // Determinar operación
  let operation: DatabaseWrapper['operation'] = 'unknown';
  let operationCount = 0;
  
  if (/select|get|fetch|find|query/i.test(name) || body.includes('.select(')) {
    operation = 'select';
    operationCount++;
  }
  if (/insert|add|create|save/i.test(name) || body.includes('.insert(')) {
    operation = operation === 'select' ? 'multiple' : 'insert';
    operationCount++;
  }
  if (/update|modify|edit/i.test(name) || body.includes('.update(')) {
    operation = operation !== 'unknown' ? 'multiple' : 'update';
    operationCount++;
  }
  if (/delete|remove/i.test(name) || body.includes('.delete(')) {
    operation = operation !== 'unknown' ? 'multiple' : 'delete';
    operationCount++;
  }
  
  // 🔥 PRIORIDAD 1: Extraer tabla directamente del código
  let detectedTable = extractTableFromCode(body);
  
  // 🔥 PRIORIDAD 2: Inferir desde el nombre del método
  if (!detectedTable) {
    detectedTable = inferTableFromMethodName(name);
  }
  
  // Extraer campos mencionados
  const fields = extractFieldsFromBody(body);
  
  // Extraer nombre de clase si existe
  const className = extractClassName(file.content, lineNumber);
  
  // Snippet de código (primeras 3 líneas del método)
  const snippet = body.split('\n').slice(0, 3).join('\n').trim();
  
  console.log(`      📦 ${className}.${name} → tabla: ${detectedTable || 'unknown'} (${operation})`);
  
  return {
    name: className ? `${className}.${name}` : name,
    className,
    filePath: file.path,
    lineNumber,
    type,
    operation,
    inferredTable: detectedTable,
    fields,
    usedByAgents: [], // Se llenará después
    confidence: detectedTable ? 0.95 : 0.50,
    codeSnippet: snippet
  };
}

/**
 * Infiere el nombre de tabla desde el nombre del método
 */
function inferTableFromMethodName(methodName: string): string | undefined {
  const lower = methodName.toLowerCase();
  
  // Patrones comunes
  if (/chat|history|message/.test(lower)) return 'chat_histories';
  if (/memoria|memory|temporal/.test(lower)) return 'memoria_temporal';
  if (/resumen|summary|conversation/.test(lower)) return 'resumen_conversaciones';
  if (/product|producto/.test(lower)) return 'products';
  if (/user|usuario|customer|cliente/.test(lower)) return 'users';
  if (/estado|state|status/.test(lower)) return 'sistema_estado';
  
  // Intentar extraer desde el nombre
  const tableMatch = methodName.match(/(?:get|insert|update|delete|fetch|save)(\w+)/i);
  if (tableMatch && tableMatch[1]) {
    return tableMatch[1].toLowerCase();
  }
  
  return undefined;
}

/**
 * Extrae campos mencionados en el cuerpo del método
 */
function extractFieldsFromBody(body: string): string[] {
  const fields: string[] = [];
  
  // Buscar en .select('field1, field2')
  const selectMatch = body.match(/\.select\s*\(\s*['"]([^'"]+)['"]\s*\)/);
  if (selectMatch) {
    const selectedFields = selectMatch[1].split(',').map(f => f.trim());
    fields.push(...selectedFields);
  }
  
  // Buscar en .eq('field', value)
  const eqMatches = body.matchAll(/\.eq\s*\(\s*['"](\w+)['"]/g);
  for (const match of eqMatches) {
    if (!fields.includes(match[1])) {
      fields.push(match[1]);
    }
  }
  
  // Buscar en object literals { field: value }
  const objectFields = body.matchAll(/{\s*(\w+):/g);
  for (const match of objectFields) {
    if (!fields.includes(match[1]) && match[1] !== 'data') {
      fields.push(match[1]);
    }
  }
  
  return fields;
}

/**
 * Extrae el nombre de la clase que contiene el método
 */
function extractClassName(content: string, methodLine: number): string | undefined {
  const lines = content.split('\n');
  
  // Buscar hacia atrás desde el método
  for (let i = methodLine - 1; i >= 0; i--) {
    const line = lines[i];
    const classMatch = line.match(/class\s+(\w+)/);
    if (classMatch) {
      return classMatch[1];
    }
  }
  
  return undefined;
}

/**
 * Mapea flujos de datos: Agent → Wrapper → Table
 */
function mapDataFlows(
  wrappers: DatabaseWrapper[],
  agents: Array<{ name: string; filePath: string }>,
  files: Array<{ path: string; content: string }>
): DataFlow[] {
  const flows: DataFlow[] = [];
  
  for (const agent of agents) {
    const agentFile = files.find(f => f.path === agent.filePath);
    if (!agentFile) continue;
    
    // Buscar qué wrappers usa este agente
    for (const wrapper of wrappers) {
      const wrapperCallPattern = new RegExp(
        `\\b${wrapper.name.split('.').pop()}\\s*\\(|` +
        `\\b${wrapper.name}\\s*\\(`,
        'g'
      );
      
      if (wrapperCallPattern.test(agentFile.content)) {
        // El agente usa este wrapper
        wrapper.usedByAgents.push(agent.name);
        
        flows.push({
          agent: agent.name,
          wrapper: wrapper.name,
          table: wrapper.inferredTable || 'unknown_table',
          operation: wrapper.operation,
          confidence: wrapper.confidence
        });
        
        console.log(`   🔗 Flow: ${agent.name} → ${wrapper.name} → ${wrapper.inferredTable}`);
      }
    }
  }
  
  return flows;
}

