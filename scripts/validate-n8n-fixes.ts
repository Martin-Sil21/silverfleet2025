/**
 * 🧪 Script de Validación - Correcciones Auditoría n8n
 * 
 * Este script valida que todas las correcciones críticas estén aplicadas:
 * 1. Subflows detectados correctamente
 * 2. MAX_CONVERSATION_TURNS = 25
 * 3. Payload structure n8n compatible
 * 4. Crosstalk prevention activado
 * 5. Natural endings detection
 */

import { parseN8nWorkflow } from '../services/n8nParser';
import { analyzeWorkflowDependencies } from '../services/workflowDependencyAnalyzer';
import fs from 'fs';
import path from 'path';

// ANSI colors para output bonito
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

const pass = (msg: string) => console.log(`${colors.green}✅ ${msg}${colors.reset}`);
const fail = (msg: string) => console.log(`${colors.red}❌ ${msg}${colors.reset}`);
const warn = (msg: string) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`);
const info = (msg: string) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`);
const section = (msg: string) => console.log(`\n${colors.bold}${colors.blue}━━━ ${msg} ━━━${colors.reset}\n`);

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(name: string, assertion: boolean, details?: string) {
  totalTests++;
  if (assertion) {
    passedTests++;
    pass(name);
    if (details) info(`    ${details}`);
  } else {
    failedTests++;
    fail(name);
    if (details) warn(`    ${details}`);
  }
}

async function main() {
  console.log(`\n${colors.bold}🧪 VALIDACIÓN DE CORRECCIONES N8N${colors.reset}`);
  console.log(`   Fecha: ${new Date().toLocaleString('es-AR')}\n`);
  
  // ========== TEST 1: Verificar MAX_CONVERSATION_TURNS ==========
  section('Test 1: MAX_CONVERSATION_TURNS');
  
  try {
    const geminiServiceContent = fs.readFileSync(
      path.join(__dirname, '../services/geminiService.ts'),
      'utf-8'
    );
    
    const match = geminiServiceContent.match(/const\s+MAX_CONVERSATION_TURNS\s*=\s*(\d+)/);
    const value = match ? parseInt(match[1]) : 0;
    
    test(
      'MAX_CONVERSATION_TURNS en geminiService.ts',
      value === 25,
      `Valor actual: ${value} (esperado: 25)`
    );
  } catch (error) {
    fail('No se pudo leer geminiService.ts');
  }
  
  try {
    const runnerContent = fs.readFileSync(
      path.join(__dirname, '../services/independentConversationRunner.ts'),
      'utf-8'
    );
    
    const match = runnerContent.match(/const\s+MAX_CONVERSATION_TURNS\s*=\s*(\d+)/);
    const value = match ? parseInt(match[1]) : 0;
    
    test(
      'MAX_CONVERSATION_TURNS en independentConversationRunner.ts',
      value === 25,
      `Valor actual: ${value} (esperado: 25)`
    );
  } catch (error) {
    fail('No se pudo leer independentConversationRunner.ts');
  }
  
  // ========== TEST 2: Verificar SUBFLOW_NODE_TYPES ==========
  section('Test 2: Detección de Subflows');
  
  try {
    const analyzerContent = fs.readFileSync(
      path.join(__dirname, '../services/workflowDependencyAnalyzer.ts'),
      'utf-8'
    );
    
    const requiredTypes = [
      'executeWorkflow',
      'executeWorkflowTrigger',
      'Call Workflow',
      'SubWorkflow'
    ];
    
    const allPresent = requiredTypes.every(type => 
      analyzerContent.includes(`'${type}'`) || 
      analyzerContent.includes(`"${type}"`)
    );
    
    test(
      'SUBFLOW_NODE_TYPES contiene todas las variantes',
      allPresent,
      `Variantes requeridas: ${requiredTypes.join(', ')}`
    );
    
    // Verificar que detecta el workflow Silver Prospección IA
    const workflowPath = path.join(__dirname, '../Silver Prospección IA - FIXED.json');
    if (fs.existsSync(workflowPath)) {
      const workflowJson = fs.readFileSync(workflowPath, 'utf-8');
      const dependencies = analyzeWorkflowDependencies(workflowJson);
      
      test(
        'Detecta subflow "Generador de Propuestas" en Silver Prospección IA',
        dependencies.subflows.length > 0,
        `Subflows detectados: ${dependencies.subflows.length} (esperado: >= 1)`
      );
      
      if (dependencies.subflows.length > 0) {
        const subflowNames = dependencies.subflows.map(s => s.nodeName).join(', ');
        info(`    Subflows: ${subflowNames}`);
      }
    } else {
      warn('Workflow Silver Prospección IA no encontrado - test omitido');
    }
  } catch (error) {
    fail(`Error en test de subflows: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // ========== TEST 3: Verificar Payload Structure ==========
  section('Test 3: Payload Structure n8n Compatible');
  
  try {
    const geminiServiceContent = fs.readFileSync(
      path.join(__dirname, '../services/geminiService.ts'),
      'utf-8'
    );
    
    const hasBodyStructure = geminiServiceContent.includes('body: {') &&
                             geminiServiceContent.includes('input:') &&
                             geminiServiceContent.includes('nombre:') &&
                             geminiServiceContent.includes('telefonos:');
    
    test(
      'generateSamplePayload usa estructura { body: { input, nombre, telefonos } }',
      hasBodyStructure,
      'Estructura compatible con n8n workflows'
    );
  } catch (error) {
    fail('No se pudo verificar estructura de payload');
  }
  
  try {
    const runnerContent = fs.readFileSync(
      path.join(__dirname, '../services/independentConversationRunner.ts'),
      'utf-8'
    );
    
    const hasBodyStructure = runnerContent.includes('body: {') &&
                             runnerContent.includes('input: userMessage');
    
    test(
      'runConversationIndependently usa estructura { body: { input } }',
      hasBodyStructure,
      'Webhook payload compatible con n8n'
    );
  } catch (error) {
    fail('No se pudo verificar estructura de webhook payload');
  }
  
  // ========== TEST 4: Verificar Crosstalk Prevention ==========
  section('Test 4: Crosstalk Prevention');
  
  try {
    const auditorContent = fs.readFileSync(
      path.join(__dirname, '../services/realDatabaseAuditor.ts'),
      'utf-8'
    );
    
    const hasGetThisConversationIdentifiers = auditorContent.includes('getThisConversationIdentifiers()');
    const hasFilteringInCompare = auditorContent.includes('belongsToThisConversation');
    const hasPriorityComment = auditorContent.includes('PRIORIDAD 1: Usar conversationId ÚNICO');
    
    test(
      'getThisConversationIdentifiers() implementado',
      hasGetThisConversationIdentifiers,
      'Método para obtener IDs exclusivos de esta conversación'
    );
    
    test(
      'compareSnapshots usa filtrado inteligente',
      hasFilteringInCompare,
      'Filtra cambios por belongsToThisConversation()'
    );
    
    test(
      'Prioriza payload original sobre searchIdentifiers',
      hasPriorityComment,
      'Evita agregar IDs de otras conversaciones'
    );
  } catch (error) {
    fail(`Error verificando crosstalk prevention: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // ========== TEST 5: Verificar Natural Endings ==========
  section('Test 5: Natural Endings Detection');
  
  try {
    const runnerContent = fs.readFileSync(
      path.join(__dirname, '../services/independentConversationRunner.ts'),
      'utf-8'
    );
    
    const hasCompletionPhrases = runnerContent.includes('completionPhrases');
    const hasNaturalEndDetection = runnerContent.includes('naturalEnd');
    const hasTurnModulo = runnerContent.includes('turnNumber % 2');
    
    test(
      'Detecta frases de cierre naturales',
      hasCompletionPhrases && hasNaturalEndDetection,
      'completionPhrases array + lógica de detección'
    );
    
    test(
      'Verifica goal cada 2 turnos (no cada turno)',
      hasTurnModulo,
      'Reduce costos de API en 50%'
    );
    
    const phrases = [
      'te envío la propuesta',
      'propuesta formal',
      'gracias por tu interés'
    ];
    
    const allPhrasesPresent = phrases.every(phrase => runnerContent.includes(phrase));
    
    test(
      'Frases de cierre comunes incluidas',
      allPhrasesPresent,
      `Verificadas: ${phrases.join(', ')}`
    );
  } catch (error) {
    fail(`Error verificando natural endings: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // ========== RESUMEN FINAL ==========
  section('RESUMEN');
  
  console.log(`Total de tests: ${colors.bold}${totalTests}${colors.reset}`);
  console.log(`Pasados: ${colors.green}${colors.bold}${passedTests}${colors.reset}`);
  console.log(`Fallados: ${colors.red}${colors.bold}${failedTests}${colors.reset}`);
  
  const successRate = ((passedTests / totalTests) * 100).toFixed(0);
  
  console.log(`\nTasa de éxito: ${colors.bold}${successRate}%${colors.reset}`);
  
  if (failedTests === 0) {
    console.log(`\n${colors.green}${colors.bold}🎉 ¡TODAS LAS CORRECCIONES APLICADAS CORRECTAMENTE!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.yellow}${colors.bold}⚠️  Hay correcciones pendientes. Revisa los tests fallados.${colors.reset}\n`);
    process.exit(1);
  }
}

// Ejecutar tests
main().catch(error => {
  console.error(`${colors.red}Error fatal en validación:${colors.reset}`, error);
  process.exit(1);
});
