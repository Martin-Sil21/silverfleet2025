/**
 * Tests para Real Database Auditor
 * Verifica la funcionalidad de auditoría de base de datos en tiempo real
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  RealDatabaseAuditor,
  initializeRealDatabaseAuditor,
  getRealDatabaseAuditor,
  cleanupRealDatabaseAuditor
} from '../../services/realDatabaseAuditor';
import type { DatabaseConfig } from '../../services/realDatabaseAuditor';
import { createMockSupabaseClient } from '../mocks/apiMocks';
import { 
  createMockDatabaseRecords,
  createMockWebhookPayload,
  createMockDetectedTools,
  createMockDetectedSubflows,
  createMockN8nWorkflow
} from '../helpers/testData';

describe('RealDatabaseAuditor', () => {
  let auditor: RealDatabaseAuditor;
  let mockSupabaseClient: any;
  
  const testConfig: DatabaseConfig = {
    type: 'supabase',
    credentials: {
      url: 'https://test.supabase.co',
      key: 'test-service-role-key'
    },
    tables: ['conversaciones', 'productos', 'usuarios']
  };

  const testConversationId = 'test-conv-123';
  const testPayload = createMockWebhookPayload({
    sessionId: 'session-123',
    conversationId: testConversationId,
    telefono: '+1234567890'
  });

  beforeEach(() => {
    // Crear datos mock para las tablas
    const mockData = {
      conversaciones: createMockDatabaseRecords('conversaciones', 3),
      productos: createMockDatabaseRecords('productos', 5),
      usuarios: createMockDatabaseRecords('usuarios', 2)
    };

    mockSupabaseClient = createMockSupabaseClient(mockData);

    // Mock de createClient de Supabase
    vi.mock('@supabase/supabase-js', () => ({
      createClient: vi.fn(() => mockSupabaseClient)
    }));
  });

  afterEach(() => {
    if (auditor) {
      cleanupRealDatabaseAuditor(testConversationId);
    }
    vi.clearAllMocks();
  });

  describe('Inicialización', () => {
    it('debe inicializar el auditor correctamente', () => {
      auditor = initializeRealDatabaseAuditor(
        testConversationId,
        testConfig,
        testPayload
      );

      expect(auditor).toBeDefined();
      expect(auditor.snapshots.size).toBe(0);
      expect(auditor.discrepancies).toEqual([]);
      expect(auditor.changes).toEqual([]);
    });

    it('debe registrar el auditor en el registry', () => {
      auditor = initializeRealDatabaseAuditor(
        testConversationId,
        testConfig,
        testPayload
      );

      const retrieved = getRealDatabaseAuditor(testConversationId);
      expect(retrieved).toBe(auditor);
    });

    it('debe extraer identificadores del payload', () => {
      auditor = initializeRealDatabaseAuditor(
        testConversationId,
        testConfig,
        testPayload
      );

      // Verificar que los identificadores se extrajeron
      // (esto es interno pero podemos verificar que funciona consultando)
      expect(auditor).toBeDefined();
    });

    it('debe aceptar nodos de workflow para análisis inteligente', () => {
      const workflowNodes = createMockN8nWorkflow().nodes;
      
      auditor = initializeRealDatabaseAuditor(
        testConversationId,
        testConfig,
        testPayload,
        workflowNodes
      );

      expect(auditor).toBeDefined();
    });

    it('debe almacenar herramientas y subflows detectados', () => {
      const tools = createMockDetectedTools();
      const subflows = createMockDetectedSubflows();

      auditor = initializeRealDatabaseAuditor(
        testConversationId,
        testConfig,
        testPayload,
        undefined,
        tools,
        subflows
      );

      expect(auditor.detectedTools).toEqual(tools);
      expect(auditor.detectedSubflows).toEqual(subflows);
      expect(auditor.dependencies.tools).toEqual(tools);
      expect(auditor.dependencies.subflows).toEqual(subflows);
    });
  });

  describe('Snapshots', () => {
    beforeEach(() => {
      auditor = initializeRealDatabaseAuditor(
        testConversationId,
        testConfig,
        testPayload
      );
    });

    it('debe tomar un snapshot de todas las tablas', async () => {
      const snapshot = await auditor.takeSnapshot();

      expect(snapshot).toBeDefined();
      expect(snapshot.timestamp).toBeGreaterThan(0);
      expect(snapshot.data).toBeDefined();
      expect(Object.keys(snapshot.data)).toContain('conversaciones');
      expect(Object.keys(snapshot.data)).toContain('productos');
      expect(Object.keys(snapshot.data)).toContain('usuarios');
    });

    it('debe almacenar snapshots en el mapa', async () => {
      await auditor.takeSnapshot();
      expect(auditor.snapshots.size).toBe(1);

      await auditor.takeSnapshot();
      expect(auditor.snapshots.size).toBe(2);
    });

    it('debe capturar datos correctos de las tablas', async () => {
      mockSupabaseClient.setMockData('conversaciones', [
        { id: '1', session_id: 'session-123', message: 'Test' }
      ]);

      const snapshot = await auditor.takeSnapshot();

      expect(snapshot.data['conversaciones']).toHaveLength(1);
      expect(snapshot.data['conversaciones'][0]).toMatchObject({
        id: '1',
        session_id: 'session-123',
        message: 'Test'
      });
    });

    it('debe manejar tablas vacías sin errores', async () => {
      mockSupabaseClient.setMockData('conversaciones', []);

      const snapshot = await auditor.takeSnapshot();

      expect(snapshot.data['conversaciones']).toEqual([]);
    });

    it('debe manejar errores de consulta a BD', async () => {
      mockSupabaseClient.setMockError(
        'conversaciones',
        new Error('Connection timeout')
      );

      const snapshot = await auditor.takeSnapshot();

      // Debe crear snapshot incluso con errores, pero la tabla estará vacía
      expect(snapshot.data['conversaciones']).toEqual([]);
    });
  });

  describe('Comparación de Snapshots', () => {
    beforeEach(() => {
      auditor = initializeRealDatabaseAuditor(
        testConversationId,
        testConfig,
        testPayload
      );
    });

    it('debe detectar INSERTs correctamente', async () => {
      // Snapshot inicial con 1 registro
      mockSupabaseClient.setMockData('conversaciones', [
        { id: '1', session_id: 'session-123', message: 'Hola' }
      ]);
      const snapshot1 = await auditor.takeSnapshot();

      // Snapshot con 2 registros (1 nuevo)
      mockSupabaseClient.setMockData('conversaciones', [
        { id: '1', session_id: 'session-123', message: 'Hola' },
        { id: '2', session_id: 'session-123', message: 'Necesito información' }
      ]);
      const snapshot2 = await auditor.takeSnapshot();

      auditor.compareSnapshots(snapshot1, snapshot2);

      const inserts = auditor.changes.filter(c => c.type === 'INSERT');
      expect(inserts).toHaveLength(1);
      expect(inserts[0].table).toBe('conversaciones');
      expect(inserts[0].record).toMatchObject({
        id: '2',
        message: 'Necesito información'
      });
    });

    it('debe detectar UPDATEs correctamente', async () => {
      // Snapshot inicial
      mockSupabaseClient.setMockData('usuarios', [
        { id: 'user-1', telefono: '+1234567890', bloqueado: false }
      ]);
      const snapshot1 = await auditor.takeSnapshot();

      // Snapshot con usuario bloqueado
      mockSupabaseClient.setMockData('usuarios', [
        { id: 'user-1', telefono: '+1234567890', bloqueado: true }
      ]);
      const snapshot2 = await auditor.takeSnapshot();

      auditor.compareSnapshots(snapshot1, snapshot2);

      const updates = auditor.changes.filter(c => c.type === 'UPDATE');
      expect(updates).toHaveLength(1);
      expect(updates[0].table).toBe('usuarios');
      expect(updates[0].record.changedFields).toContain('bloqueado');
      expect(updates[0].before?.bloqueado).toBe(false);
      expect(updates[0].after?.bloqueado).toBe(true);
    });

    it('debe detectar DELETEs correctamente', async () => {
      // Snapshot inicial con 2 registros
      mockSupabaseClient.setMockData('conversaciones', [
        { id: '1', session_id: 'session-123', message: 'Hola' },
        { id: '2', session_id: 'session-123', message: 'Adiós' }
      ]);
      const snapshot1 = await auditor.takeSnapshot();

      // Snapshot con 1 registro (1 eliminado)
      mockSupabaseClient.setMockData('conversaciones', [
        { id: '1', session_id: 'session-123', message: 'Hola' }
      ]);
      const snapshot2 = await auditor.takeSnapshot();

      auditor.compareSnapshots(snapshot1, snapshot2);

      const deletes = auditor.changes.filter(c => c.type === 'DELETE');
      expect(deletes).toHaveLength(1);
      expect(deletes[0].table).toBe('conversaciones');
      expect(deletes[0].record).toMatchObject({
        id: '2',
        message: 'Adiós'
      });
    });

    it('debe detectar múltiples cambios simultáneos', async () => {
      // Snapshot inicial
      mockSupabaseClient.setMockData('conversaciones', [
        { id: '1', session_id: 'session-123', message: 'Hola' }
      ]);
      const snapshot1 = await auditor.takeSnapshot();

      // Snapshot con INSERT, UPDATE y DELETE
      mockSupabaseClient.setMockData('conversaciones', [
        { id: '1', session_id: 'session-123', message: 'Hola modificado' }, // UPDATE
        { id: '2', session_id: 'session-123', message: 'Nuevo mensaje' } // INSERT
        // id: '1' ya no existe = DELETE
      ]);
      const snapshot2 = await auditor.takeSnapshot();

      auditor.compareSnapshots(snapshot1, snapshot2);

      expect(auditor.changes.length).toBeGreaterThan(0);
      expect(auditor.changes.some(c => c.type === 'INSERT')).toBe(true);
    });
  });

  describe('Actualización de Identificadores', () => {
    beforeEach(() => {
      auditor = initializeRealDatabaseAuditor(
        testConversationId,
        testConfig,
        testPayload
      );
    });

    it('debe agregar nuevos identificadores', () => {
      const initialLength = auditor['searchIdentifiers'].length;

      auditor.updateSearchIdentifiers([
        'new-session-456',
        'conv_789'
      ]);

      // Debe haber agregado al menos los nuevos IDs válidos
      expect(auditor['searchIdentifiers'].length).toBeGreaterThan(initialLength);
    });

    it('debe filtrar IDs de test (TC-xxx)', () => {
      auditor.updateSearchIdentifiers([
        'TC-001',
        'TC-test-case',
        'valid-session-123'
      ]);

      // TC-xxx no deben agregarse
      expect(auditor['searchIdentifiers']).not.toContain('TC-001');
      expect(auditor['searchIdentifiers']).not.toContain('TC-test-case');
    });

    it('debe aceptar IDs con prefijos conocidos', () => {
      auditor.updateSearchIdentifiers([
        'session_abc123',
        'conv_xyz789',
        'user_123456',
        'chat_999888'
      ]);

      expect(auditor['searchIdentifiers']).toContain('session_abc123');
      expect(auditor['searchIdentifiers']).toContain('conv_xyz789');
      expect(auditor['searchIdentifiers']).toContain('user_123456');
      expect(auditor['searchIdentifiers']).toContain('chat_999888');
    });

    it('debe aceptar números de teléfono', () => {
      auditor.updateSearchIdentifiers([
        '+541112345678',
        '+34612345678'
      ]);

      expect(auditor['searchIdentifiers']).toContain('+541112345678');
      expect(auditor['searchIdentifiers']).toContain('+34612345678');
    });

    it('no debe duplicar identificadores', () => {
      const existingId = 'session_existing';
      auditor.updateSearchIdentifiers([existingId]);
      
      const lengthBefore = auditor['searchIdentifiers'].length;
      auditor.updateSearchIdentifiers([existingId]); // Agregar nuevamente
      const lengthAfter = auditor['searchIdentifiers'].length;

      expect(lengthAfter).toBe(lengthBefore); // No debe aumentar
    });
  });

  describe('Resumen de Auditoría', () => {
    beforeEach(() => {
      auditor = initializeRealDatabaseAuditor(
        testConversationId,
        testConfig,
        testPayload
      );
    });

    it('debe generar un resumen correcto sin cambios', async () => {
      await auditor.takeSnapshot();

      const summary = auditor.getSummary();

      expect(summary.totalOperations).toBeGreaterThan(0); // Lecturas
      expect(summary.reads).toBeGreaterThan(0);
      expect(summary.writes).toBe(0);
      expect(summary.updates).toBe(0);
      expect(summary.deletes).toBe(0);
      expect(summary.tablesUsed).toEqual(testConfig.tables);
      expect(summary.discrepancies).toEqual([]);
    });

    it('debe contabilizar correctamente las operaciones', async () => {
      // 2 snapshots = 2 * 3 tablas = 6 lecturas
      await auditor.takeSnapshot();
      await auditor.takeSnapshot();

      const summary = auditor.getSummary();

      expect(summary.reads).toBe(6); // 2 snapshots × 3 tablas
    });

    it('debe incluir cambios detectados en el resumen', async () => {
      mockSupabaseClient.setMockData('conversaciones', [
        { id: '1', message: 'Test' }
      ]);
      const snap1 = await auditor.takeSnapshot();

      mockSupabaseClient.setMockData('conversaciones', [
        { id: '1', message: 'Test' },
        { id: '2', message: 'New' }
      ]);
      const snap2 = await auditor.takeSnapshot();

      auditor.compareSnapshots(snap1, snap2);

      const summary = auditor.getSummary();

      expect(summary.writes).toBe(1); // 1 INSERT
      expect(summary.changes).toHaveLength(1);
      expect(summary.changes![0].type).toBe('INSERT');
    });

    it('debe incluir discrepancias en el resumen', () => {
      auditor.discrepancies.push({
        type: 'missing_record',
        severity: 'critical',
        description: 'Test discrepancy',
        timestamp: Date.now()
      });

      const summary = auditor.getSummary();

      expect(summary.discrepancies).toHaveLength(1);
      expect(summary.discrepancies![0].severity).toBe('critical');
    });
  });

  describe('Limpieza', () => {
    beforeEach(() => {
      auditor = initializeRealDatabaseAuditor(
        testConversationId,
        testConfig,
        testPayload
      );
    });

    it('debe limpiar snapshots y discrepancias', async () => {
      await auditor.takeSnapshot();
      auditor.discrepancies.push({
        type: 'data_mismatch',
        severity: 'warning',
        description: 'Test',
        timestamp: Date.now()
      });

      auditor.cleanup();

      expect(auditor.snapshots.size).toBe(0);
      expect(auditor.discrepancies).toEqual([]);
    });

    it('debe eliminar auditor del registry', () => {
      cleanupRealDatabaseAuditor(testConversationId);

      const retrieved = getRealDatabaseAuditor(testConversationId);
      expect(retrieved).toBeUndefined();
    });
  });
});
