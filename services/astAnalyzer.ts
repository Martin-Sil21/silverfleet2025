/**
 * 🌳 AST Analyzer - TypeScript/JavaScript Code Analysis
 * 
 * Usa Babel parser (browser-compatible) para analizar estructura REAL del código
 * en lugar de regex. Extrae exports, imports, funciones, clases, etc.
 */

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import type * as t from '@babel/types';

export interface ASTFunction {
  name: string;
  type: 'function' | 'arrow' | 'method';
  params: string[];
  returnType?: string;
  isAsync: boolean;
  isExported: boolean;
  decorators: string[];
  jsDoc?: string;
  lineStart: number;
  lineEnd: number;
}

export interface ASTClass {
  name: string;
  isExported: boolean;
  methods: ASTFunction[];
  properties: string[];
  decorators: string[];
  jsDoc?: string;
  lineStart: number;
  lineEnd: number;
}

export interface ASTImport {
  from: string;
  imports: string[];
  isDefault: boolean;
  isDynamic: boolean;
}

export interface ASTExport {
  name: string;
  type: 'function' | 'class' | 'variable' | 'type';
  isDefault: boolean;
}

export interface ASTEntryPoint {
  type: 'http_route' | 'event_handler' | 'websocket' | 'cron' | 'message_handler';
  path?: string;
  method?: string;
  handler: string;
  filePath: string;
  lineNumber: number;
}

export interface ParsedFile {
  filePath: string;
  imports: ASTImport[];
  exports: ASTExport[];
  functions: ASTFunction[];
  classes: ASTClass[];
  entryPoints: ASTEntryPoint[];
  jsDoc?: string;
}

/**
 * Parsea un archivo TypeScript/JavaScript con AST
 */
export function parseFileWithAST(filePath: string, content: string): ParsedFile {
  const result: ParsedFile = {
    filePath,
    imports: [],
    exports: [],
    functions: [],
    classes: [],
    entryPoints: [],
  };

  try {
    const ast = parse(content, {
      sourceType: 'module',
      plugins: [
        'typescript',
        'jsx',
        'decorators-legacy',
        'classProperties',
        'dynamicImport',
      ],
    });

    // Recorrer el AST con Babel traverse
    traverse(ast, {
      // Imports
      ImportDeclaration(path) {
        extractImportBabel(path.node, result);
      },
      
      // Exports
      ExportNamedDeclaration(path) {
        extractExportBabel(path.node, result, 'named');
      },
      ExportDefaultDeclaration(path) {
        extractExportBabel(path.node, result, 'default');
      },
      
      // Funciones
      FunctionDeclaration(path) {
        extractFunctionBabel(path.node, result, true);
      },
      
      // Arrow functions en variables
      VariableDeclaration(path) {
        extractVariableDeclarationBabel(path.node, result);
      },
      
      // Clases
      ClassDeclaration(path) {
        extractClassBabel(path.node, result);
      },
      
      // HTTP Routes (Express, Fastify)
      CallExpression(path) {
        extractRouteHandlerBabel(path.node, result);
        extractEventHandlerBabel(path.node, result);
      },
    });

  } catch (error) {
    console.warn(`⚠️  Failed to parse ${filePath}:`, (error as Error).message);
  }

  return result;
}

/**
 * Extrae imports (Babel)
 */
function extractImportBabel(node: t.ImportDeclaration, result: ParsedFile) {
  const importObj: ASTImport = {
    from: node.source.value,
    imports: [],
    isDefault: false,
    isDynamic: false,
  };

  for (const spec of node.specifiers) {
    if (spec.type === 'ImportDefaultSpecifier') {
      importObj.isDefault = true;
      importObj.imports.push(spec.local.name);
    } else if (spec.type === 'ImportSpecifier') {
      importObj.imports.push((spec.imported as any).name || spec.local.name);
    } else if (spec.type === 'ImportNamespaceSpecifier') {
      importObj.imports.push(`* as ${spec.local.name}`);
    }
  }

  result.imports.push(importObj);
}

/**
 * Extrae exports (Babel)
 */
function extractExportBabel(node: any, result: ParsedFile, type: 'named' | 'default') {
  const isDefault = type === 'default';

  if (node.declaration) {
    const decl = node.declaration;
    
    if (decl.type === 'FunctionDeclaration') {
      result.exports.push({
        name: decl.id?.name || 'default',
        type: 'function',
        isDefault,
      });
      extractFunctionBabel(decl, result, true);
    } else if (decl.type === 'ClassDeclaration') {
      result.exports.push({
        name: decl.id?.name || 'default',
        type: 'class',
        isDefault,
      });
      extractClassBabel(decl, result);
    } else if (decl.type === 'VariableDeclaration') {
      for (const varDecl of decl.declarations) {
        result.exports.push({
          name: (varDecl.id as any).name || 'default',
          type: 'variable',
          isDefault,
        });
      }
    }
  }

  if (node.specifiers) {
    for (const spec of node.specifiers) {
      result.exports.push({
        name: (spec.exported as any).name || '',
        type: 'variable',
        isDefault: false,
      });
    }
  }
}

/**
 * Extrae funciones (Babel)
 */
function extractFunctionBabel(node: any, result: ParsedFile, isExported: boolean) {
  const func: ASTFunction = {
    name: node.id?.name || 'anonymous',
    type: 'function',
    params: node.params?.map((p: any) => p.name || p.type) || [],
    isAsync: node.async || false,
    isExported,
    decorators: node.decorators?.map((d: any) => (d.expression as any).name || '') || [],
    jsDoc: undefined, // Babel no parsea JSDoc directamente
    lineStart: node.loc?.start.line || 0,
    lineEnd: node.loc?.end.line || 0,
  };

  result.functions.push(func);
}

/**
 * Extrae variable declarations con arrow functions (Babel)
 */
function extractVariableDeclarationBabel(node: any, result: ParsedFile) {
  for (const decl of node.declarations) {
    if (decl.init?.type === 'ArrowFunctionExpression') {
      const func: ASTFunction = {
        name: (decl.id as any).name || 'anonymous',
        type: 'arrow',
        params: decl.init.params?.map((p: any) => p.name || p.type) || [],
        isAsync: decl.init.async || false,
        isExported: false,
        decorators: [],
        jsDoc: undefined,
        lineStart: node.loc?.start.line || 0,
        lineEnd: node.loc?.end.line || 0,
      };
      result.functions.push(func);
    }
  }
}

/**
 * Extrae clases (Babel)
 */
function extractClassBabel(node: any, result: ParsedFile) {
  const classObj: ASTClass = {
    name: node.id?.name || 'Anonymous',
    isExported: false,
    methods: [],
    properties: [],
    decorators: node.decorators?.map((d: any) => (d.expression as any).name || '') || [],
    jsDoc: undefined,
    lineStart: node.loc?.start.line || 0,
    lineEnd: node.loc?.end.line || 0,
  };

  // Extraer métodos y propiedades
  for (const member of node.body.body) {
    if (member.type === 'ClassMethod') {
      const method: ASTFunction = {
        name: (member.key as any).name || '',
        type: 'method',
        params: member.params?.map((p: any) => p.name || p.type) || [],
        isAsync: member.async || false,
        isExported: false,
        decorators: member.decorators?.map((d: any) => (d.expression as any).name || '') || [],
        jsDoc: undefined,
        lineStart: member.loc?.start.line || 0,
        lineEnd: member.loc?.end.line || 0,
      };
      classObj.methods.push(method);
    } else if (member.type === 'ClassProperty') {
      classObj.properties.push((member.key as any).name || '');
    }
  }

  result.classes.push(classObj);
}

/**
 * Detecta rutas HTTP (Express, Fastify, etc.) - Babel
 */
function extractRouteHandlerBabel(node: any, result: ParsedFile) {
  if (node.type !== 'CallExpression') return;

  const callee = node.callee;
  if (callee?.type !== 'MemberExpression') return;

  const obj = (callee.object as any).name;
  const method = (callee.property as any).name;

  // router.get(), app.post(), etc.
  if (['router', 'app', 'server'].includes(obj) && 
      ['get', 'post', 'put', 'delete', 'patch', 'all'].includes(method)) {
    
    const path = node.arguments?.[0]?.value || '';
    const handler = (node.arguments?.[1] as any)?.name || 'anonymous';

    result.entryPoints.push({
      type: 'http_route',
      path,
      method: method.toUpperCase(),
      handler,
      filePath: result.filePath,
      lineNumber: node.loc?.start.line || 0,
    });
  }
}

/**
 * Detecta event handlers (bot.on, client.on, etc.) - Babel
 */
function extractEventHandlerBabel(node: any, result: ParsedFile) {
  if (node.type !== 'CallExpression') return;

  const callee = node.callee;
  if (callee?.type !== 'MemberExpression') return;

  const method = (callee.property as any).name;

  // bot.on(), client.on(), emitter.on(), etc.
  if (method === 'on' || method === 'once' || method === 'addListener') {
    const eventName = node.arguments?.[0]?.value || '';
    const handler = (node.arguments?.[1] as any)?.name || 'anonymous';

    result.entryPoints.push({
      type: 'event_handler',
      path: eventName,
      handler,
      filePath: result.filePath,
      lineNumber: node.loc?.start.line || 0,
    });
  }
}

/**
 * Analiza múltiples archivos en paralelo
 */
export async function analyzeProjectWithAST(files: { name: string; path: string; content: string }[]): Promise<ParsedFile[]> {
  console.log(`🌳 Analyzing ${files.length} files with AST...`);
  
  const results: ParsedFile[] = [];
  
  for (const file of files) {
    // Solo analizar TypeScript/JavaScript
    if (!file.name.match(/\.(ts|tsx|js|jsx)$/)) continue;
    
    const parsed = parseFileWithAST(file.path, file.content);
    results.push(parsed);
  }
  
  console.log(`   ✅ Parsed ${results.length} code files`);
  console.log(`   📍 Found ${results.reduce((sum, r) => sum + r.entryPoints.length, 0)} entry points`);
  console.log(`   🔧 Found ${results.reduce((sum, r) => sum + r.functions.length, 0)} functions`);
  console.log(`   📦 Found ${results.reduce((sum, r) => sum + r.classes.length, 0)} classes`);
  
  return results;
}
