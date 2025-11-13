/**
 * 📊 Dependency Analyzer
 * 
 * Usa madge para analizar grafo de dependencias y agrupar código
 * por dominios/módulos
 */

import type { ParsedFile } from './astAnalyzer';

export interface DependencyGraph {
  [filePath: string]: string[];  // filePath → [dependencies]
}

export interface CodeModule {
  name: string;
  description: string;
  files: string[];
  entryPoints: string[];
  exports: string[];
  isCore: boolean;  // true si es importado por muchos otros
  confidence: number;
}

/**
 * Construye grafo de dependencias desde archivos parseados
 */
export function buildDependencyGraph(parsedFiles: ParsedFile[]): DependencyGraph {
  const graph: DependencyGraph = {};
  
  for (const file of parsedFiles) {
    const deps: string[] = [];
    
    for (const imp of file.imports) {
      // Solo dependencias internas (no node_modules)
      if (imp.from.startsWith('.') || imp.from.startsWith('/')) {
        // Resolver path relativo
        const resolvedPath = resolvePath(file.filePath, imp.from);
        deps.push(resolvedPath);
      }
    }
    
    graph[file.filePath] = deps;
  }
  
  return graph;
}

/**
 * Resuelve path relativo
 */
function resolvePath(fromPath: string, toPath: string): string {
  // Simplificado - en producción usar path.resolve
  const fromParts = fromPath.split('/').slice(0, -1);
  const toParts = toPath.split('/');
  
  for (const part of toParts) {
    if (part === '..') fromParts.pop();
    else if (part !== '.') fromParts.push(part);
  }
  
  return fromParts.join('/');
}

/**
 * Agrupa archivos por módulo/dominio basado en estructura de carpetas
 */
export function groupFilesByModule(parsedFiles: ParsedFile[], graph: DependencyGraph): CodeModule[] {
  const modules: Map<string, CodeModule> = new Map();
  
  // 1. Agrupar por carpeta principal (src/bot, src/api, src/tools, etc.)
  for (const file of parsedFiles) {
    const moduleName = extractModuleName(file.filePath);
    
    if (!modules.has(moduleName)) {
      modules.set(moduleName, {
        name: moduleName,
        description: '',
        files: [],
        entryPoints: [],
        exports: [],
        isCore: false,
        confidence: 0,
      });
    }
    
    const module = modules.get(moduleName)!;
    module.files.push(file.filePath);
    
    // Agregar entry points
    if (file.entryPoints.length > 0) {
      module.entryPoints.push(...file.entryPoints.map(ep => 
        `${ep.type}: ${ep.path || ep.handler}`
      ));
    }
    
    // Agregar exports principales
    module.exports.push(...file.exports.map(ex => ex.name));
  }
  
  // 2. Calcular "core-ness" (cuántos archivos dependen de este módulo)
  const moduleDependencies = new Map<string, number>();
  
  for (const [filePath, deps] of Object.entries(graph)) {
    const sourceModule = extractModuleName(filePath);
    
    for (const dep of deps) {
      const targetModule = extractModuleName(dep);
      if (targetModule !== sourceModule) {
        moduleDependencies.set(targetModule, (moduleDependencies.get(targetModule) || 0) + 1);
      }
    }
  }
  
  // 3. Marcar módulos "core" (importados por 3+ otros módulos)
  for (const [moduleName, module] of modules.entries()) {
    const depCount = moduleDependencies.get(moduleName) || 0;
    module.isCore = depCount >= 3;
    module.confidence = Math.min(1, depCount / 10);
  }
  
  // 4. Generar descripciones basadas en entry points y exports
  for (const module of modules.values()) {
    module.description = inferModuleDescription(module);
  }
  
  return Array.from(modules.values())
    .sort((a, b) => {
      // Core modules primero
      if (a.isCore !== b.isCore) return a.isCore ? -1 : 1;
      // Luego por número de archivos
      return b.files.length - a.files.length;
    });
}

/**
 * Extrae nombre de módulo desde file path
 */
function extractModuleName(filePath: string): string {
  // Ejemplos:
  // "src/bot/handlers/message.ts" → "bot"
  // "src/api/controllers/user.ts" → "api"
  // "src/tools/calculator.ts" → "tools"
  // "services/supabase.ts" → "services"
  
  const parts = filePath.split('/');
  
  // Buscar carpeta relevante (después de src/, services/, etc.)
  const relevantIndex = parts.findIndex(p => 
    ['src', 'lib', 'app', 'server', 'services'].includes(p)
  );
  
  if (relevantIndex >= 0 && relevantIndex + 1 < parts.length) {
    return parts[relevantIndex + 1];
  }
  
  // Fallback: segunda carpeta o nombre del archivo
  if (parts.length >= 2) return parts[1];
  return parts[0] || 'root';
}

/**
 * Infiere descripción del módulo basándose en contenido
 */
function inferModuleDescription(module: CodeModule): string {
  // Patrones de entry points
  if (module.entryPoints.some(ep => ep.includes('message') || ep.includes('chat'))) {
    return 'Message handling and chat interactions';
  }
  if (module.entryPoints.some(ep => ep.includes('http_route'))) {
    return 'HTTP API endpoints';
  }
  if (module.entryPoints.some(ep => ep.includes('event_handler'))) {
    return 'Event-driven handlers';
  }
  
  // Patrones de exports
  const exportNames = module.exports.join(' ').toLowerCase();
  if (exportNames.includes('database') || exportNames.includes('supabase') || exportNames.includes('query')) {
    return 'Database operations and persistence';
  }
  if (exportNames.includes('auth') || exportNames.includes('login') || exportNames.includes('token')) {
    return 'Authentication and authorization';
  }
  if (exportNames.includes('calc') || exportNames.includes('compute') || exportNames.includes('process')) {
    return 'Business logic and calculations';
  }
  if (exportNames.includes('util') || exportNames.includes('helper')) {
    return 'Utility functions and helpers';
  }
  if (exportNames.includes('bot') || exportNames.includes('client')) {
    return 'Bot client and connection management';
  }
  if (exportNames.includes('media') || exportNames.includes('file') || exportNames.includes('upload')) {
    return 'Media processing and file handling';
  }
  
  // Fallback basado en nombre
  const name = module.name.toLowerCase();
  if (name.includes('api')) return 'API layer';
  if (name.includes('service')) return 'Service layer';
  if (name.includes('controller')) return 'Controller layer';
  if (name.includes('model')) return 'Data models';
  if (name.includes('middleware')) return 'Middleware functions';
  if (name.includes('config')) return 'Configuration management';
  
  return `${module.name} module`;
}

/**
 * Encuentra módulos principales (entry points de la aplicación)
 */
export function findMainModules(modules: CodeModule[]): CodeModule[] {
  return modules.filter(m => 
    m.entryPoints.length > 0 ||  // Tiene entry points
    m.isCore ||                   // Es un módulo central
    m.files.length >= 5           // Tiene bastante código
  );
}

/**
 * Genera resumen del grafo de dependencias
 */
export function summarizeDependencies(modules: CodeModule[]): string {
  const coreModules = modules.filter(m => m.isCore);
  const entryModules = modules.filter(m => m.entryPoints.length > 0);
  
  let summary = `📊 Dependency Analysis:\n\n`;
  summary += `Total Modules: ${modules.length}\n`;
  summary += `Core Modules: ${coreModules.length}\n`;
  summary += `Entry Point Modules: ${entryModules.length}\n\n`;
  
  summary += `🎯 Main Modules:\n`;
  for (const module of modules.slice(0, 5)) {
    summary += `- ${module.name}: ${module.description}\n`;
    summary += `  Files: ${module.files.length} | Entry points: ${module.entryPoints.length}\n`;
  }
  
  return summary;
}
