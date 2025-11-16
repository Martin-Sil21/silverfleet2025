/**
 * 🧪 Testing Exhaustivo de Análisis de ZIP
 * 
 * Prueba todas las capacidades de detección:
 * - Agentes IA (métodos de clase, funciones, archivos)
 * - Database wrappers
 * - Flujo de datos
 * - Tablas y operaciones
 * - Filtrado de falsos positivos
 */

import { deepAnalyzeProject } from '../services/deepProjectAnalyzer';
import { readFileSync } from 'fs';

interface TestCase {
  name: string;
  zipPath: string;
  expected: {
    agents: Array<{
      name: string;
      contains?: string; // El nombre debe contener este string
      type?: 'class_method' | 'function' | 'file';
    }>;
    databases: number;
    tables: string[];
    wrappers: Array<{
      name: string;
      operation: string;
      table?: string;
    }>;
    dataFlows: number;
    falsePositives: string[]; // Nombres que NO deben aparecer
  };
}

interface TestResult {
  testName: string;
  passed: boolean;
  details: {
    agents: {
      expected: number;
      actual: number;
      missing: string[];
      extra: string[];
      falsePositives: string[];
    };
    wrappers: {
      expected: number;
      actual: number;
      missing: string[];
    };
    dataFlows: {
      expected: number;
      actual: number;
    };
    tables: {
      expected: string[];
      actual: string[];
      missing: string[];
    };
  };
  score: number; // 0-100
}

const TEST_CASES: TestCase[] = [
  {
    name: 'BuilderBot ObraSeco',
    zipPath: './test-data/builderbotobraseco.zip',
    expected: {
      agents: [
        { name: 'Agent 1', contains: 'Planificador', type: 'class_method' },
        { name: 'Agent 2', contains: 'Asesor', type: 'class_method' }
      ],
      databases: 1,
      tables: [
        'memoria_temporal_obra_seco',
        'resumen_conversaciones_obra_seco',
        'n8n_chat_histories_obra_seco',
        'sistema_estado_temporal'
      ],
      wrappers: [
        { name: 'getChatHistory', operation: 'select', table: 'chat_histories' },
        { name: 'insertChatMessage', operation: 'insert', table: 'chat_histories' },
        { name: 'getMemoriaTemporal', operation: 'select', table: 'memoria_temporal' },
        { name: 'insertMemoriaTemporal', operation: 'insert', table: 'memoria_temporal' },
        { name: 'getResumen', operation: 'select', table: 'resumen_conversaciones' },
        { name: 'updateResumen', operation: 'update', table: 'resumen_conversaciones' },
        { name: 'searchProductos', operation: 'select', table: 'products' }
      ],
      dataFlows: 5,
      falsePositives: [
        'media Processing',
        'analyzeImage',
        'processDocument',
        'callGemini'
      ]
    }
  }
];

async function runTest(testCase: TestCase): Promise<TestResult> {
  console.log(`\n🧪 Testing: ${testCase.name}`);
  console.log('='.repeat(60));
  
  try {
    // Leer el ZIP
    const zipBuffer = readFileSync(testCase.zipPath).buffer as ArrayBuffer;
    
    // Analizar
    console.log('📦 Analyzing ZIP...');
    const result = await deepAnalyzeProject(zipBuffer, 'es');
    
    // Verificar resultados
    const testResult: TestResult = {
      testName: testCase.name,
      passed: false,
      details: {
        agents: {
          expected: testCase.expected.agents.length,
          actual: result.agents.length,
          missing: [],
          extra: [],
          falsePositives: []
        },
        wrappers: {
          expected: testCase.expected.wrappers.length,
          actual: result.deepAnalysis?.hooks.length || 0,
          missing: []
        },
        dataFlows: {
          expected: testCase.expected.dataFlows,
          actual: result.deepAnalysis?.dataFlow.length || 0
        },
        tables: {
          expected: testCase.expected.tables,
          actual: [],
          missing: []
        }
      },
      score: 0
    };
    
    // 1. Verificar agentes
    console.log('\n🤖 Checking Agents...');
    const actualAgentNames = result.agents.map(a => a.name);
    
    for (const expectedAgent of testCase.expected.agents) {
      const found = result.agents.find(a => 
        expectedAgent.contains 
          ? a.name.toLowerCase().includes(expectedAgent.contains.toLowerCase())
          : a.name === expectedAgent.name
      );
      
      if (found) {
        console.log(`   ✅ Found: ${found.name}`);
      } else {
        console.log(`   ❌ Missing: ${expectedAgent.name} (${expectedAgent.contains})`);
        testResult.details.agents.missing.push(expectedAgent.name);
      }
    }
    
    // Verificar falsos positivos
    for (const falsePositive of testCase.expected.falsePositives) {
      const found = result.agents.find(a => 
        a.name.toLowerCase().includes(falsePositive.toLowerCase())
      );
      
      if (found) {
        console.log(`   ❌ FALSE POSITIVE: ${found.name}`);
        testResult.details.agents.falsePositives.push(found.name);
      } else {
        console.log(`   ✅ Correctly filtered: ${falsePositive}`);
      }
    }
    
    // Agentes extra
    for (const agent of result.agents) {
      const isExpected = testCase.expected.agents.some(ea => 
        ea.contains 
          ? agent.name.toLowerCase().includes(ea.contains.toLowerCase())
          : agent.name === ea.name
      );
      
      const isFalsePositive = testCase.expected.falsePositives.some(fp =>
        agent.name.toLowerCase().includes(fp.toLowerCase())
      );
      
      if (!isExpected && !isFalsePositive) {
        console.log(`   ⚠️  Extra agent (unexpected): ${agent.name}`);
        testResult.details.agents.extra.push(agent.name);
      }
    }
    
    // 2. Verificar wrappers
    console.log('\n🗄️  Checking Database Wrappers...');
    const actualWrappers = result.deepAnalysis?.hooks || [];
    
    for (const expectedWrapper of testCase.expected.wrappers) {
      const found = actualWrappers.find(w =>
        w.name.toLowerCase().includes(expectedWrapper.name.toLowerCase())
      );
      
      if (found) {
        console.log(`   ✅ Found wrapper: ${found.name}`);
      } else {
        console.log(`   ❌ Missing wrapper: ${expectedWrapper.name}`);
        testResult.details.wrappers.missing.push(expectedWrapper.name);
      }
    }
    
    // 3. Verificar flujo de datos
    console.log('\n🔗 Checking Data Flows...');
    const actualFlows = result.deepAnalysis?.dataFlow.length || 0;
    console.log(`   Expected: ${testCase.expected.dataFlows}, Actual: ${actualFlows}`);
    
    if (actualFlows >= testCase.expected.dataFlows) {
      console.log(`   ✅ Data flows: ${actualFlows} (expected ${testCase.expected.dataFlows})`);
    } else {
      console.log(`   ❌ Data flows: ${actualFlows} (expected ${testCase.expected.dataFlows})`);
    }
    
    // 4. Verificar tablas
    console.log('\n📊 Checking Tables...');
    const actualTables = result.deepAnalysis?.tables.map(t => t.name) || [];
    testResult.details.tables.actual = actualTables;
    
    for (const expectedTable of testCase.expected.tables) {
      const found = actualTables.some(t => 
        t.toLowerCase().includes(expectedTable.toLowerCase())
      );
      
      if (found) {
        console.log(`   ✅ Found table: ${expectedTable}`);
      } else {
        console.log(`   ❌ Missing table: ${expectedTable}`);
        testResult.details.tables.missing.push(expectedTable);
      }
    }
    
    // Calcular score
    let score = 0;
    const totalChecks = 4;
    
    // Score de agentes (40%)
    const agentsPassed = 
      testResult.details.agents.missing.length === 0 &&
      testResult.details.agents.falsePositives.length === 0;
    if (agentsPassed) score += 40;
    
    // Score de wrappers (30%)
    const wrappersRatio = testResult.details.wrappers.actual / testResult.details.wrappers.expected;
    score += Math.min(30, wrappersRatio * 30);
    
    // Score de data flows (15%)
    const flowsRatio = testResult.details.dataFlows.actual / testResult.details.dataFlows.expected;
    score += Math.min(15, flowsRatio * 15);
    
    // Score de tablas (15%)
    const tablesRatio = (testCase.expected.tables.length - testResult.details.tables.missing.length) / testCase.expected.tables.length;
    score += Math.min(15, tablesRatio * 15);
    
    testResult.score = Math.round(score);
    testResult.passed = testResult.score >= 80; // 80% para pasar
    
    return testResult;
    
  } catch (error) {
    console.error(`❌ Test failed with error:`, error);
    return {
      testName: testCase.name,
      passed: false,
      details: {
        agents: { expected: 0, actual: 0, missing: [], extra: [], falsePositives: [] },
        wrappers: { expected: 0, actual: 0, missing: [] },
        dataFlows: { expected: 0, actual: 0 },
        tables: { expected: [], actual: [], missing: [] }
      },
      score: 0
    };
  }
}

function printSummary(results: TestResult[]) {
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    const scoreColor = result.score >= 80 ? '🟢' : result.score >= 50 ? '🟡' : '🔴';
    
    console.log(`\n${icon} ${result.testName}`);
    console.log(`   ${scoreColor} Score: ${result.score}/100`);
    
    if (!result.passed) {
      if (result.details.agents.missing.length > 0) {
        console.log(`   ❌ Missing agents: ${result.details.agents.missing.join(', ')}`);
      }
      if (result.details.agents.falsePositives.length > 0) {
        console.log(`   ❌ False positives: ${result.details.agents.falsePositives.join(', ')}`);
      }
      if (result.details.wrappers.missing.length > 0) {
        console.log(`   ❌ Missing wrappers: ${result.details.wrappers.missing.length}/${result.details.wrappers.expected}`);
      }
      if (result.details.dataFlows.actual < result.details.dataFlows.expected) {
        console.log(`   ❌ Data flows: ${result.details.dataFlows.actual}/${result.details.dataFlows.expected}`);
      }
      if (result.details.tables.missing.length > 0) {
        console.log(`   ❌ Missing tables: ${result.details.tables.missing.join(', ')}`);
      }
    }
  }
  
  const totalScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const passedTests = results.filter(r => r.passed).length;
  
  console.log('\n' + '='.repeat(60));
  console.log(`Total: ${passedTests}/${results.length} tests passed`);
  console.log(`Average score: ${Math.round(totalScore)}/100`);
  console.log('='.repeat(60));
}

export async function runAllTests() {
  console.log('🧪 Starting ZIP Analysis Tests...\n');
  
  const results: TestResult[] = [];
  
  for (const testCase of TEST_CASES) {
    const result = await runTest(testCase);
    results.push(result);
  }
  
  printSummary(results);
  
  return results;
}

// Si se ejecuta directamente
if (require.main === module) {
  runAllTests().then(results => {
    const allPassed = results.every(r => r.passed);
    process.exit(allPassed ? 0 : 1);
  });
}

