/**
 * 🧪 Test Suite Exhaustivo para Pipeline de ZIP
 * Ejecutar con: ts-node tests/zipDatabasePipeline.test.ts
 */

import { analyzeZipDatabases, buildWorkflowInfoFromDeepAnalysis } from '../services/zipDatabaseAnalyzer';

// ============================================================================
// Test Framework Minimalista
// ============================================================================
const results = { passed: 0, failed: 0, tests: [] as any[] };

function describe(name: string, fn: () => void) {
  console.log(`\n📦 ${name}`);
  fn();
}

function it(name: string, fn: () => void) {
  try {
    fn();
    results.passed++;
    results.tests.push({ name, status: '✅' });
    console.log(`  ✅ ${name}`);
  } catch (error: any) {
    results.failed++;
    results.tests.push({ name, status: '❌', error: error.message });
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
  }
}

function expect(value: any) {
  const check = (condition: boolean, message: string) => {
    if (!condition) throw new Error(message);
  };
  
  return {
    toBeDefined: () => check(value !== undefined && value !== null, `Expected value to be defined, got ${value}`),
    toBe: (expected: any) => check(value === expected, `Expected ${value} to be ${expected}`),
    toEqual: (expected: any) => check(JSON.stringify(value) === JSON.stringify(expected), `Expected ${JSON.stringify(value)} to equal ${JSON.stringify(expected)}`),
    toBeGreaterThan: (expected: number) => check(value > expected, `Expected ${value} to be > ${expected}`),
    toContain: (expected: any) => check(Array.isArray(value) && value.includes(expected), `Expected array to contain ${expected}`),
    toHaveProperty: (prop: string) => check(prop in value, `Expected object to have property ${prop}`)
  };
}

// Helper para crear mocks rápidos
const createMockProject = (databases: any[]): any => ({
  databases,
  agents: [],
  tools: [],
  apis: [],
  framework: { name: 'BuilderBot', confidence: 0.9, evidence: [] },
  language: 'TypeScript',
  fileCount: 50,
  totalLines: 5000,
  apiEndpoints: []
});

// ============================================================================
// TESTS
// ============================================================================

console.log('\n🧪 INICIANDO TESTS EXHAUSTIVOS DEL PIPELINE ZIP → DATABASE\n');
console.log('═'.repeat(70));

describe('1️⃣ Estructura de databases en CodeProject', () => {
  it('debe tener databases array', () => {
    const mockProject = createMockProject([{ provider: 'Supabase', confidence: 0.9, evidence: [] }]);
    expect(mockProject.databases).toBeDefined();
    expect(Array.isArray(mockProject.databases)).toBe(true);
  });

  it('debe incluir tables[] con fields[] cuando existen', () => {
    const mockProject = createMockProject([
      {
        provider: 'Supabase',
        tables: [
          { name: 'conversaciones', fields: [{ name: 'session_id' }, { name: 'from' }] },
          { name: 'usuarios', fields: [{ name: 'phone' }] }
        ]
      }
    ]);
    
    const db = mockProject.databases[0];
    expect(db.tables).toBeDefined();
    expect(db.tables.length).toBe(2);
    expect(db.tables[0].name).toBe('conversaciones');
    expect(db.tables[0].fields).toBeDefined();
  });
  
  it('debe manejar tables como string array (legacy)', () => {
    const mockProject = createMockProject([
      {
        provider: 'Supabase',
        tables: ['conversaciones', 'usuarios'] // Sin fields
      }
    ]);
    
    expect(mockProject.databases[0].tables).toBeDefined();
    expect(Array.isArray(mockProject.databases[0].tables)).toBe(true);
  });
});

describe('2️⃣ analyzeZipDatabases() - Extracción de Tablas', () => {
  it('debe extraer nombres de tablas cuando son objetos con fields', () => {
    const mockProject = createMockProject([
      {
        provider: 'Supabase',
        tables: [
          { name: 'conversaciones', fields: [] },
          { name: 'usuarios', fields: [] }
        ]
      }
    ]);
    
    const result = analyzeZipDatabases(mockProject);
    
    expect(result.tables).toContain('conversaciones');
    expect(result.tables).toContain('usuarios');
    expect(result.tables.length).toBe(2);
  });

  it('debe extraer nombres cuando tables son strings simples', () => {
    const mockProject = createMockProject([
      {
        provider: 'Supabase',
        tables: ['conversaciones', 'usuarios']
      }
    ]);
    
    const result = analyzeZipDatabases(mockProject);
    
    expect(result.tables).toContain('conversaciones');
    expect(result.tables).toContain('usuarios');
  });

  it('debe manejar databases vacío sin error', () => {
    const mockProject = createMockProject([]);
    const result = analyzeZipDatabases(mockProject);
    
    expect(result.tables).toEqual([]);
    expect(result.mappings).toEqual([]);
  });
});

describe('3️⃣ Creación de Mappings Inteligentes', () => {
  it('debe crear mappings cuando hay schema completo con fields', () => {
    const mockProject = createMockProject([
      {
        provider: 'Supabase',
        tables: [
          {
            name: 'conversaciones',
            fields: [
              { name: 'id' },
              { name: 'session_id' },
              { name: 'from' },
              { name: 'body' }
            ]
          }
        ]
      }
    ]);
    
    const result = analyzeZipDatabases(mockProject);
    
    expect(result.mappings.length).toBeGreaterThan(0);
    
    const mapping = result.mappings.find(m => m.table === 'conversaciones');
    expect(mapping).toBeDefined();
    expect(mapping!.filterField).toBe('session_id'); // Campo existe en schema
    expect(mapping!.sourceField).toBe('session_id');
  });

  it('debe usar heurísticas cuando NO hay fields', () => {
    const mockProject = createMockProject([
      {
        provider: 'Supabase',
        tables: ['conversaciones', 'usuarios'] // Sin schema
      }
    ]);
    
    const result = analyzeZipDatabases(mockProject);
    
    console.log('     🔍 Mappings generados por heurística:', JSON.stringify(result.mappings, null, 2));
    
    expect(result.mappings.length).toBeGreaterThan(0);
    
    const convMapping = result.mappings.find(m => m.table === 'conversaciones');
    expect(convMapping).toBeDefined();
    expect(convMapping!.filterField).toBe('session_id'); // Por heurística de nombre
  });

  it('debe manejar fields como strings simples (no objetos)', () => {
    const mockProject = createMockProject([
      {
        provider: 'Supabase',
        tables: [
          {
            name: 'conversaciones',
            fields: ['id', 'session_id', 'from', 'body'] // Strings directos
          }
        ]
      }
    ]);
    
    const result = analyzeZipDatabases(mockProject);
    
    const mapping = result.mappings.find(m => m.table === 'conversaciones');
    expect(mapping).toBeDefined();
    expect(mapping!.filterField).toBe('session_id');
  });
});

describe('4️⃣ Prioridad de Campos para Filtrado', () => {
  it('debe priorizar session_id sobre todos los demás', () => {
    const mockProject = createMockProject([
      {
        provider: 'Supabase',
        tables: [
          {
            name: 'test_table',
            fields: ['id', 'session_id', 'from', 'phone', 'email']
          }
        ]
      }
    ]);
    
    const result = analyzeZipDatabases(mockProject);
    const mapping = result.mappings[0];
    
    expect(mapping.filterField).toBe('session_id'); // Máxima prioridad
  });

  it('debe usar "from" cuando session_id no existe', () => {
    const mockProject = createMockProject([
      {
        provider: 'Supabase',
        tables: [
          {
            name: 'test_table',
            fields: ['id', 'from', 'body']
          }
        ]
      }
    ]);
    
    const result = analyzeZipDatabases(mockProject);
    const mapping = result.mappings[0];
    
    expect(mapping.filterField).toBe('from');
  });

  it('debe detectar remoteJid (Baileys) y mapearlo a "from"', () => {
    const mockProject = createMockProject([
      {
        provider: 'Supabase',
        tables: [
          {
            name: 'baileys_table',
            fields: ['id', 'remoteJid', 'messageId']
          }
        ]
      }
    ]);
    
    const result = analyzeZipDatabases(mockProject);
    const mapping = result.mappings[0];
    
    expect(mapping.filterField).toBe('remoteJid');
    expect(mapping.sourceField).toBe('from'); // Mapea payload.from → DB.remoteJid
  });

  it('debe usar phone como fallback', () => {
    const mockProject = createMockProject([
      {
        provider: 'Supabase',
        tables: [
          {
            name: 'usuarios',
            fields: ['id', 'phone', 'name']
          }
        ]
      }
    ]);
    
    const result = analyzeZipDatabases(mockProject);
    const mapping = result.mappings[0];
    
    expect(mapping.filterField).toBe('phone');
  });
});

describe('5️⃣ buildWorkflowInfoFromDeepAnalysis()', () => {
  it('debe retornar WorkflowDatabaseInfo con formato correcto', () => {
    const mockProject = createMockProject([
      {
        provider: 'Supabase',
        tables: [{ name: 'conversaciones', fields: ['session_id'] }]
      }
    ]);
    
    const result = buildWorkflowInfoFromDeepAnalysis(mockProject);
    
    expect(result).toHaveProperty('tables');
    expect(result).toHaveProperty('mappings');
    expect(Array.isArray(result.tables)).toBe(true);
    expect(Array.isArray(result.mappings)).toBe(true);
  });

  it('debe enriquecer con deepAnalysis si se proporciona', () => {
    const mockProject = createMockProject([
      { provider: 'Supabase', tables: ['conversaciones'] }
    ]);
    
    const deepAnalysis = {
      agents: [
        {
          name: 'Agent1',
          databases: ['extra_table']
        }
      ]
    };
    
    const result = buildWorkflowInfoFromDeepAnalysis(mockProject, deepAnalysis);
    
    expect(result.tables).toContain('extra_table');
  });
});

describe('6️⃣ Compatibilidad con realDatabaseAuditor', () => {
  it('mappings deben tener propiedades requeridas por findMappingForTable', () => {
    const mockProject = createMockProject([
      {
        provider: 'Supabase',
        tables: [{ name: 'conversaciones', fields: ['session_id'] }]
      }
    ]);
    
    const workflowInfo = buildWorkflowInfoFromDeepAnalysis(mockProject);
    const mapping = workflowInfo.mappings[0];
    
    expect(mapping).toHaveProperty('table');
    expect(mapping).toHaveProperty('filterField');
    expect(mapping).toHaveProperty('sourceField');
    expect(mapping).toHaveProperty('operator');
  });

  it('debe funcionar con payload típico de WhatsApp/Baileys', () => {
    const mockProject = createMockProject([
      {
        provider: 'Supabase',
        tables: [{ name: 'conversaciones', fields: ['session_id', 'from', 'body'] }]
      }
    ]);
    
    const workflowInfo = buildWorkflowInfoFromDeepAnalysis(mockProject);
    const mapping = workflowInfo.mappings[0];
    
    const payload = {
      session_id: '5491234567890',
      from: '5491234567890@s.whatsapp.net',
      body: 'Hola'
    };
    
    const filterValue = payload[mapping.sourceField as keyof typeof payload];
    expect(filterValue).toBeDefined();
  });
});

describe('7️⃣ Casos Edge y Resilencia', () => {
  it('debe manejar database sin propiedad tables', () => {
    const mockProject = createMockProject([
      { provider: 'Supabase', confidence: 0.9, evidence: [] }
      // Sin 'tables'
    ]);
    
    const result = analyzeZipDatabases(mockProject);
    
    expect(result.tables).toEqual([]);
    expect(result.mappings).toEqual([]);
  });

  it('debe manejar tablas con nombres no estándar', () => {
    const mockProject = createMockProject([
      {
        provider: 'Supabase',
        tables: [
          {
            name: 'custom_weird_table',
            fields: ['customId', 'weirdField', 'randomData']
          }
        ]
      }
    ]);
    
    const result = analyzeZipDatabases(mockProject);
    
    // Debe crear mapping incluso sin campos conocidos
    expect(result.mappings.length).toBe(1);
    expect(result.mappings[0].table).toBe('custom_weird_table');
    expect(result.mappings[0].filterField).toBeDefined();
  });

  it('debe manejar múltiples databases providers', () => {
    const mockProject = createMockProject([
      { provider: 'Supabase', tables: ['table1'] },
      { provider: 'Postgres', tables: ['table2'] },
      { provider: 'MongoDB', tables: ['table3'] }
    ]);
    
    const result = analyzeZipDatabases(mockProject);
    
    expect(result.tables).toContain('table1');
    expect(result.tables).toContain('table2');
    expect(result.tables).toContain('table3');
  });
});

// ============================================================================
// REPORTE FINAL
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('\n📊 RESUMEN DE TESTS\n');
console.log(`   ✅ Pasados: ${results.passed}`);
console.log(`   ❌ Fallados: ${results.failed}`);
console.log(`   📈 Total: ${results.passed + results.failed}`);

if (results.failed > 0) {
  console.log('\n⚠️  Tests fallados:');
  results.tests.filter(t => t.status === '❌').forEach(t => {
    console.log(`   - ${t.name}`);
    console.log(`     Error: ${t.error}`);
  });
  process.exit(1);
} else {
  console.log('\n🎉 TODOS LOS TESTS PASARON EXITOSAMENTE\n');
  process.exit(0);
}
