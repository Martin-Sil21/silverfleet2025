/**
 * 🧪 ZIP Analysis Tester - Ejecutable desde el navegador
 * 
 * Analiza un ZIP y compara con expectativas para detectar problemas
 */

import { deepAnalyzeProject } from './deepProjectAnalyzer';
import type { ParsedCodeProject } from '../types';

interface TestExpectations {
  agents: {
    count: number;
    shouldContain: string[];  // Nombres que DEBEN estar
    shouldNotContain: string[]; // Nombres que NO deben estar (falsos positivos)
  };
  wrappers: {
    minCount: number;
    shouldContain: string[]; // getChatHistory, insertChatMessage, etc.
  };
  dataFlows: {
    minCount: number;
  };
  tables: {
    shouldContain: string[];
  };
}

interface TestReport {
  timestamp: Date;
  overallScore: number;
  passed: boolean;
  sections: {
    agents: SectionResult;
    wrappers: SectionResult;
    dataFlows: SectionResult;
    tables: SectionResult;
  };
  recommendations: string[];
}

interface SectionResult {
  score: number;
  passed: boolean;
  expected: any;
  actual: any;
  issues: string[];
  successes: string[];
}

/**
 * Expectativas por defecto para BuilderBot ObraSeco
 */
export const BUILDERBOT_EXPECTATIONS: TestExpectations = {
  agents: {
    count: 2,
    shouldContain: ['Agent 1', 'Planificador', 'Agent 2', 'Asesor'],
    shouldNotContain: ['media Processing', 'analyzeImage', 'processDocument', 'callGemini']
  },
  wrappers: {
    minCount: 5,
    shouldContain: [
      'getChatHistory',
      'insertChatMessage',
      'getMemoriaTemporal',
      'getResumen',
      'updateResumen'
    ]
  },
  dataFlows: {
    minCount: 3
  },
  tables: {
    shouldContain: [
      'memoria_temporal',
      'resumen_conversaciones',
      'chat_histories',
      'estado_temporal'
    ]
  }
};

/**
 * Ejecuta test del análisis YA EXISTENTE (sin volver a analizar)
 */
export function testExistingAnalysis(
  result: ParsedCodeProject,
  expectations: TestExpectations = BUILDERBOT_EXPECTATIONS
): TestReport {
  console.log('🧪 [TEST] Testing existing analysis results...');
  console.log('📋 [TEST] Expectations:', expectations);
  
  const report: TestReport = {
    timestamp: new Date(),
    overallScore: 0,
    passed: false,
    sections: {
      agents: { score: 0, passed: false, expected: null, actual: null, issues: [], successes: [] },
      wrappers: { score: 0, passed: false, expected: null, actual: null, issues: [], successes: [] },
      dataFlows: { score: 0, passed: false, expected: null, actual: null, issues: [], successes: [] },
      tables: { score: 0, passed: false, expected: null, actual: null, issues: [], successes: [] }
    },
    recommendations: []
  };
  
  try {
    // Usar resultados existentes (NO volver a analizar)
    
    console.log('📊 [TEST] Analysis complete. Testing results...');
    
    // Test 1: Agentes
    report.sections.agents = testAgents(result, expectations.agents);
    
    // Test 2: Wrappers
    report.sections.wrappers = testWrappers(result, expectations.wrappers);
    
    // Test 3: Data Flows
    report.sections.dataFlows = testDataFlows(result, expectations.dataFlows);
    
    // Test 4: Tables
    report.sections.tables = testTables(result, expectations.tables);
    
    // Calcular score general
    report.overallScore = Math.round(
      (report.sections.agents.score + 
       report.sections.wrappers.score + 
       report.sections.dataFlows.score + 
       report.sections.tables.score) / 4
    );
    
    report.passed = report.overallScore >= 75;
    
    // Generar recomendaciones
    report.recommendations = generateRecommendations(report);
    
    // Log resumen
    console.log('\n📊 [TEST] RESULTS:');
    console.log(`   Overall Score: ${report.overallScore}/100 ${report.passed ? '✅' : '❌'}`);
    console.log(`   Agents: ${report.sections.agents.score}/100 ${report.sections.agents.passed ? '✅' : '❌'}`);
    console.log(`   Wrappers: ${report.sections.wrappers.score}/100 ${report.sections.wrappers.passed ? '✅' : '❌'}`);
    console.log(`   Data Flows: ${report.sections.dataFlows.score}/100 ${report.sections.dataFlows.passed ? '✅' : '❌'}`);
    console.log(`   Tables: ${report.sections.tables.score}/100 ${report.sections.tables.passed ? '✅' : '❌'}`);
    
    if (report.recommendations.length > 0) {
      console.log('\n💡 [TEST] RECOMMENDATIONS:');
      report.recommendations.forEach(r => console.log(`   - ${r}`));
    }
    
  } catch (error) {
    console.error('❌ [TEST] Error during testing:', error);
    report.recommendations.push('Critical error during testing - check console for details');
  }
  
  return report;
}

/**
 * @deprecated Usa testExistingAnalysis() en su lugar
 * Esta función vuelve a analizar todo el ZIP (lento e innecesario)
 */
export async function testZipAnalysis(
  zipBuffer: ArrayBuffer,
  expectations: TestExpectations = BUILDERBOT_EXPECTATIONS
): Promise<TestReport> {
  console.warn('⚠️  testZipAnalysis está deprecated. Usa testExistingAnalysis() en su lugar.');
  
  const result = await deepAnalyzeProject(zipBuffer, 'es');
  return testExistingAnalysis(result, expectations);
}

function testAgents(result: ParsedCodeProject, expected: TestExpectations['agents']): SectionResult {
  const section: SectionResult = {
    score: 0,
    passed: false,
    expected: expected.count,
    actual: result.agents.length,
    issues: [],
    successes: []
  };
  
  console.log('\n🤖 [TEST] Testing Agents...');
  console.log(`   Expected: ${expected.count}, Actual: ${result.agents.length}`);
  
  const agentNames = result.agents.map(a => a.name);
  
  // Verificar cantidad
  if (result.agents.length === expected.count) {
    section.score += 30;
    section.successes.push(`Correct agent count: ${result.agents.length}`);
  } else {
    section.issues.push(`Agent count mismatch: expected ${expected.count}, got ${result.agents.length}`);
  }
  
  // Verificar que contiene agentes esperados
  let foundExpected = 0;
  for (const shouldHave of expected.shouldContain) {
    const found = agentNames.some(name => 
      name.toLowerCase().includes(shouldHave.toLowerCase())
    );
    
    if (found) {
      foundExpected++;
      section.successes.push(`Found expected agent: "${shouldHave}"`);
      console.log(`   ✅ Found: "${shouldHave}"`);
    } else {
      section.issues.push(`Missing expected agent: "${shouldHave}"`);
      console.log(`   ❌ Missing: "${shouldHave}"`);
    }
  }
  
  section.score += (foundExpected / expected.shouldContain.length) * 40;
  
  // Verificar que NO contiene falsos positivos
  let falsePositivesFound = 0;
  for (const shouldNotHave of expected.shouldNotContain) {
    const found = agentNames.some(name => 
      name.toLowerCase().includes(shouldNotHave.toLowerCase())
    );
    
    if (found) {
      falsePositivesFound++;
      section.issues.push(`False positive detected: "${shouldNotHave}"`);
      console.log(`   ❌ FALSE POSITIVE: "${shouldNotHave}"`);
    } else {
      section.successes.push(`Correctly filtered: "${shouldNotHave}"`);
      console.log(`   ✅ Filtered: "${shouldNotHave}"`);
    }
  }
  
  if (falsePositivesFound === 0) {
    section.score += 30;
  } else {
    section.score += Math.max(0, 30 - (falsePositivesFound * 10));
  }
  
  section.passed = section.score >= 70;
  
  return section;
}

function testWrappers(result: ParsedCodeProject, expected: TestExpectations['wrappers']): SectionResult {
  const section: SectionResult = {
    score: 0,
    passed: false,
    expected: expected.minCount,
    actual: result.deepAnalysis?.hooks.length || 0,
    issues: [],
    successes: []
  };
  
  console.log('\n🗄️  [TEST] Testing Database Wrappers...');
  console.log(`   Expected min: ${expected.minCount}, Actual: ${section.actual}`);
  
  const wrappers = result.deepAnalysis?.hooks || [];
  const wrapperNames = wrappers.map(w => w.name.toLowerCase());
  
  // Verificar cantidad mínima
  if (section.actual >= expected.minCount) {
    section.score += 40;
    section.successes.push(`Found ${section.actual} wrappers (min ${expected.minCount})`);
  } else {
    section.issues.push(`Only found ${section.actual} wrappers (expected min ${expected.minCount})`);
    section.score += (section.actual / expected.minCount) * 40;
  }
  
  // Verificar wrappers específicos
  let foundExpected = 0;
  for (const shouldHave of expected.shouldContain) {
    const found = wrapperNames.some(name => 
      name.includes(shouldHave.toLowerCase())
    );
    
    if (found) {
      foundExpected++;
      section.successes.push(`Found wrapper: "${shouldHave}"`);
      console.log(`   ✅ Found: "${shouldHave}"`);
    } else {
      section.issues.push(`Missing wrapper: "${shouldHave}"`);
      console.log(`   ❌ Missing: "${shouldHave}"`);
    }
  }
  
  section.score += (foundExpected / expected.shouldContain.length) * 60;
  section.passed = section.score >= 70;
  
  return section;
}

function testDataFlows(result: ParsedCodeProject, expected: TestExpectations['dataFlows']): SectionResult {
  const section: SectionResult = {
    score: 0,
    passed: false,
    expected: expected.minCount,
    actual: result.deepAnalysis?.dataFlow.length || 0,
    issues: [],
    successes: []
  };
  
  console.log('\n🔗 [TEST] Testing Data Flows...');
  console.log(`   Expected min: ${expected.minCount}, Actual: ${section.actual}`);
  
  if (section.actual >= expected.minCount) {
    section.score = 100;
    section.passed = true;
    section.successes.push(`Found ${section.actual} data flows (min ${expected.minCount})`);
  } else if (section.actual > 0) {
    section.score = (section.actual / expected.minCount) * 100;
    section.issues.push(`Only found ${section.actual} data flows (expected min ${expected.minCount})`);
  } else {
    section.score = 0;
    section.issues.push('No data flows detected');
  }
  
  return section;
}

function testTables(result: ParsedCodeProject, expected: TestExpectations['tables']): SectionResult {
  const section: SectionResult = {
    score: 0,
    passed: false,
    expected: expected.shouldContain.length,
    actual: result.deepAnalysis?.tables.length || 0,
    issues: [],
    successes: []
  };
  
  console.log('\n📊 [TEST] Testing Tables...');
  console.log(`   Expected tables: ${expected.shouldContain.length}, Detected: ${section.actual}`);
  
  const tables = result.deepAnalysis?.tables || [];
  const tableNames = tables.map(t => t.name.toLowerCase());
  
  let foundExpected = 0;
  for (const shouldHave of expected.shouldContain) {
    const found = tableNames.some(name => 
      name.includes(shouldHave.toLowerCase())
    );
    
    if (found) {
      foundExpected++;
      section.successes.push(`Found table: "${shouldHave}"`);
      console.log(`   ✅ Found: "${shouldHave}"`);
    } else {
      section.issues.push(`Missing table: "${shouldHave}"`);
      console.log(`   ❌ Missing: "${shouldHave}"`);
    }
  }
  
  section.score = (foundExpected / expected.shouldContain.length) * 100;
  section.passed = section.score >= 70;
  
  return section;
}

function generateRecommendations(report: TestReport): string[] {
  const recommendations: string[] = [];
  
  if (report.sections.agents.score < 70) {
    if (report.sections.agents.issues.some(i => i.includes('count mismatch'))) {
      recommendations.push('Review agent detection: incorrect number of agents found');
    }
    if (report.sections.agents.issues.some(i => i.includes('False positive'))) {
      recommendations.push('Improve agent filtering: false positives detected (media Processing, etc.)');
    }
    if (report.sections.agents.issues.some(i => i.includes('Missing expected'))) {
      recommendations.push('Fix agent extraction: missing expected agents (check system prompt detection)');
    }
  }
  
  if (report.sections.wrappers.score < 70) {
    recommendations.push('Database wrapper detection needs improvement: check isDatabaseWrapper() logic');
  }
  
  if (report.sections.dataFlows.score < 70) {
    recommendations.push('Data flow mapping incomplete: verify agent→wrapper→table connections');
  }
  
  if (report.sections.tables.score < 70) {
    recommendations.push('Table detection incomplete: check inferTableFromMethodName() logic');
  }
  
  if (recommendations.length === 0 && report.overallScore < 90) {
    recommendations.push('All sections passing but room for improvement in accuracy');
  }
  
  return recommendations;
}

/**
 * Exporta reporte en formato Markdown
 */
export function exportReportAsMarkdown(report: TestReport): string {
  let md = `# 🧪 ZIP Analysis Test Report\n\n`;
  md += `**Date:** ${report.timestamp.toLocaleString()}\n`;
  md += `**Overall Score:** ${report.overallScore}/100 ${report.passed ? '✅ PASSED' : '❌ FAILED'}\n\n`;
  
  md += `## Detailed Results\n\n`;
  
  for (const [sectionName, section] of Object.entries(report.sections)) {
    md += `### ${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)}\n`;
    md += `**Score:** ${section.score}/100 ${section.passed ? '✅' : '❌'}\n`;
    md += `**Expected:** ${section.expected} | **Actual:** ${section.actual}\n\n`;
    
    if (section.successes.length > 0) {
      md += `**Successes:**\n`;
      section.successes.forEach(s => md += `- ✅ ${s}\n`);
      md += `\n`;
    }
    
    if (section.issues.length > 0) {
      md += `**Issues:**\n`;
      section.issues.forEach(i => md += `- ❌ ${i}\n`);
      md += `\n`;
    }
  }
  
  if (report.recommendations.length > 0) {
    md += `## 💡 Recommendations\n\n`;
    report.recommendations.forEach(r => md += `- ${r}\n`);
  }
  
  return md;
}

