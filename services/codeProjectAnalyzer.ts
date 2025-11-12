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
 */

import JSZip from 'jszip';
import {
  ParsedCodeProject,
  DetectedFramework,
  DetectedDatabase,
  DetectedTool,
  DetectedAPI,
  CodeAgentComponent,
} from '../types';

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
  
  // 4. Detectar agentes IA
  const agents = detectAgents(files);
  
  // 5. Detectar herramientas externas
  const tools = detectTools(files, dependencies);
  
  // 6. Detectar bases de datos
  const databases = detectDatabases(files, dependencies);
  
  // 7. Detectar APIs externas
  const apis = detectAPIs(files, dependencies);
  
  // 8. Detectar endpoints HTTP
  const apiEndpoints = detectEndpoints(files);
  
  // 9. Detectar variables de entorno
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
  };
  
  console.log(`✅ Project analysis completed in ${(performance.now() - startTime).toFixed(2)}ms`);
  return result;
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
 * Detecta agentes IA en el código
 */
function detectAgents(files: ExtractedFile[]): CodeAgentComponent[] {
  const agents: CodeAgentComponent[] = [];
  const aiLibraries = [
    'openai', 'langchain', 'llamaindex', 'anthropic',
    '@google/generative-ai', 'ollama', 'huggingface',
  ];
  
  for (const file of files) {
    if (!file.path.endsWith('.ts') && !file.path.endsWith('.js')) continue;
    
    // Buscar clases o funciones que usen APIs de IA
    for (const lib of aiLibraries) {
      if (file.content.includes(lib)) {
        // Extraer nombre de función/clase
        const classMatch = file.content.match(/export\s+class\s+(\w+)/);
        const funcMatch = file.content.match(/export\s+(?:async\s+)?function\s+(\w+)/);
        
        if (classMatch || funcMatch) {
          const name = classMatch ? classMatch[1] : funcMatch ? funcMatch[1] : 'Agent';
          
          // Buscar system prompt
          const promptMatch = file.content.match(
            /(?:system_prompt|systemPrompt|SYSTEM_PROMPT)\s*[=:]\s*[`'"]([^`'"]+)[`'"]/i
          );
          const systemPrompt = promptMatch ? promptMatch[1] : undefined;
          
          agents.push({
            type: 'agent',
            name,
            filePath: file.path,
            systemPrompt,
            description: `AI Agent using ${lib}`,
            imports: extractImports(file.content),
          });
        }
      }
    }
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
      keywords: ['nodemailer', 'sendgrid', 'mailgun', 'gmail', 'smtp'],
      type: 'email' as const,
    },
    calendar: {
      keywords: ['google-calendar', 'icalendar', 'outlook', 'calendar'],
      type: 'calendar' as const,
    },
    messaging: {
      keywords: ['slack', 'telegram', 'discord', 'whatsapp', 'twilio'],
      type: 'messaging' as const,
    },
    crm: {
      keywords: ['salesforce', 'hubspot', 'pipedrive', 'zoho'],
      type: 'crm' as const,
    },
    storage: {
      keywords: ['aws-sdk', 's3', 'firebase', 'supabase-storage', 'blob'],
      type: 'storage' as const,
    },
  };
  
  // Detectar por dependencias
  for (const [dep, version] of Object.entries(dependencies)) {
    for (const [toolName, pattern] of Object.entries(toolPatterns)) {
      if (pattern.keywords.some(k => dep.toLowerCase().includes(k))) {
        tools.set(toolName, {
          name: dep,
          type: pattern.type,
          confidence: 0.9,
          evidence: [`Dependency: ${dep}@${version}`],
        });
      }
    }
  }
  
  // Detectar por imports en código
  for (const file of files) {
    for (const [toolName, pattern] of Object.entries(toolPatterns)) {
      for (const keyword of pattern.keywords) {
        if (file.content.toLowerCase().includes(keyword)) {
          const existing = tools.get(toolName);
          if (existing) {
            existing.evidence.push(`Import found in ${file.path}`);
            existing.confidence = Math.min(1, existing.confidence + 0.1);
          } else {
            tools.set(toolName, {
              name: toolName.charAt(0).toUpperCase() + toolName.slice(1),
              type: pattern.type,
              confidence: 0.6,
              evidence: [`Import found in ${file.path}`],
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
    postgresql: ['pg', 'postgres', 'typeorm', 'sequelize', 'knex', 'prisma'],
    mongodb: ['mongoose', 'mongodb', 'prisma'],
    mysql: ['mysql2', 'mysql', 'sequelize', 'typeorm', 'knex'],
    supabase: ['@supabase/supabase-js', 'supabase'],
    firebase: ['firebase', 'firebase-admin'],
    redis: ['redis', 'ioredis'],
  };
  
  for (const [dbName, keywords] of Object.entries(dbPatterns)) {
    for (const keyword of keywords) {
      if (dependencies[keyword]) {
        databases.set(dbName, {
          provider: dbName.charAt(0).toUpperCase() + dbName.slice(1),
          confidence: 0.9,
          evidence: [`Package ${keyword} found`],
          credentials: detectDatabaseCredentials(files, dbName),
        });
      }
    }
  }
  
  // Detectar por string de conexión o imports
  for (const file of files) {
    for (const [dbName, keywords] of Object.entries(dbPatterns)) {
      for (const keyword of keywords) {
        if (file.content.toLowerCase().includes(keyword)) {
          if (!databases.has(dbName)) {
            databases.set(dbName, {
              provider: dbName.charAt(0).toUpperCase() + dbName.slice(1),
              confidence: 0.6,
              evidence: [`Code reference in ${file.path}`],
            });
          }
        }
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
