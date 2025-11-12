/**
 * Tests de Integración End-to-End
 * Simula flujos completos de auditoría con todas las herramientas integradas
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  RealDatabaseAuditor,
  initializeRealDatabaseAuditor,
  cleanupRealDatabaseAuditor 
} from '../../services/realDatabaseAuditor';
import type { DatabaseConfig } from '../../services/realDatabaseAuditor';
import { verifyTools } from '../../services/toolVerificator';
import { saveCredential, getCredentialById } from '../../services/credentialsManager';
import {
  createMockSupabaseClient,
  createMockGmailAPI,
  createMockGoogleCalendarAPI,
  createMockGeminiAPI
} from '../mocks/apiMocks';
import {
  createMockAuditConfig,
  createMockTestCase,
  createMockWebhookPayload,
  createMockSupabaseCredential,
  createMockGoogleServiceAccountCredential,
  createMockDetectedTools,
  createMockDetectedSubflows,
  createMockN8nWorkflow
} from '../helpers/testData';

describe('Integration Tests - Full Audit Flow', () => {
  let mockSupabase: any;
  let mockGmail: any;
  let mockCalendar: any;
  let mockGemini: any;

  beforeEach(() => {
    // Limpiar localStorage y mocks
    localStorage.clear();
    
    // Crear instancias de mocks
    mockSupabase = createMockSupabaseClient({
      conversaciones: [],
      productos: [
        { id: '1', nombre: 'Cielorraso Durlock', precio: 5000, categoria: 'construccion' },
        { id: '2', nombre: 'Tabique Durlock', precio: 3500, categoria: 'construccion' }
      ],
      usuarios: [
        { id: 'user-1', telefono: '+1234567890', nombre: 'Test User', bloqueado: false }
      ]
    });
    
    mockGmail = createMockGmailAPI();
    mockCalendar = createMockGoogleCalendarAPI();
    mockGemini = createMockGeminiAPI();
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Auditoría Visual Completa', () => {
    it('debe ejecutar una auditoría visual básica', async () => {
      const config = createMockAuditConfig({
        auditType: 'visual',
        testCaseCount: 1
      });

      const testCase = createMockTestCase();

      // Configurar respuesta de Gemini para análisis
      mockGemini.setDefaultResponse({
        overallScore: 0.9,
        summary: 'El agente respondió correctamente',
        criteriaBreakdown: [
          {
            criterion: 'Respuesta profesional',
            score: 1.0,
            justification: 'El agente fue cortés',
            impact: 'high'
          }
        ]
      });

      // La auditoría visual no requiere conexión a BD real
      expect(config).toBeDefined();
      expect(testCase).toBeDefined();
    });
  });

  describe('Auditoría Real con Base de Datos', () => {
    let auditor: RealDatabaseAuditor;
    const conversationId = 'test-conv-real-123';

    beforeEach(() => {
      const dbConfig: DatabaseConfig = {
        type: 'supabase',
        credentials: {
          url: 'https://test.supabase.co',
          key: 'test-key'
        },
        tables: ['conversaciones', 'productos', 'usuarios']
      };

      const payload = createMockWebhookPayload({
        sessionId: 'session-real-123',
        conversationId,
        telefono: '+1234567890'
      });

      const workflowNodes = createMockN8nWorkflow().nodes;
      const tools = createMockDetectedTools();
      const subflows = createMockDetectedSubflows();

      // Mock de createClient
      vi.mock('@supabase/supabase-js', () => ({
        createClient: vi.fn(() => mockSupabase)
      }));

      auditor = initializeRealDatabaseAuditor(
        conversationId,
        dbConfig,
        payload,
        workflowNodes,
        tools,
        subflows
      );
    });

    afterEach(() => {
      if (auditor) {
        cleanupRealDatabaseAuditor(conversationId);
      }
    });

    it('debe ejecutar auditoría completa con tracking de BD', async () => {
      // Turno 1: Usuario saluda
      const snapshot1 = await auditor.takeSnapshot();
      expect(snapshot1.data).toBeDefined();

      // Simular INSERT en BD (agente guarda conversación)
      mockSupabase.setMockData('conversaciones', [
        {
          id: '1',
          session_id: 'session-real-123',
          message: 'Hola',
          response: 'Hola, ¿en qué puedo ayudarte?',
          created_at: new Date().toISOString()
        }
      ]);

      const snapshot2 = await auditor.takeSnapshot();
      auditor.compareSnapshots(snapshot1, snapshot2);

      // Verificar que se detectó el INSERT
      const inserts = auditor.changes.filter(c => c.type === 'INSERT');
      expect(inserts.length).toBeGreaterThan(0);
      expect(inserts.some(i => i.table === 'conversaciones')).toBe(true);

      // Turno 2: Usuario pregunta por productos
      mockSupabase.setMockData('conversaciones', [
        {
          id: '1',
          session_id: 'session-real-123',
          message: 'Hola',
          response: 'Hola, ¿en qué puedo ayudarte?',
          created_at: new Date(Date.now() - 1000).toISOString()
        },
        {
          id: '2',
          session_id: 'session-real-123',
          message: 'Necesito información sobre cielorrasos',
          response: 'Tenemos cielorrasos Durlock a $5000',
          created_at: new Date().toISOString()
        }
      ]);

      const snapshot3 = await auditor.takeSnapshot();
      auditor.compareSnapshots(snapshot2, snapshot3);

      // Verificar summary
      const summary = auditor.getSummary();
      expect(summary.totalOperations).toBeGreaterThan(0);
      expect(summary.writes).toBeGreaterThan(0);
      expect(summary.changes!.length).toBeGreaterThan(0);
    });

    it('debe detectar y verificar envío de email', async () => {
      const agentResponse = 'Te envío la propuesta por email con todos los detalles.';

      // Simular que se registró el email en BD
      const dbChanges = [
        {
          type: 'INSERT' as const,
          table: 'email_logs',
          record: {
            id: 'email-1',
            to: 'user@example.com',
            subject: 'Propuesta Comercial',
            sent_at: new Date().toISOString()
          },
          after: {
            id: 'email-1',
            to: 'user@example.com',
            subject: 'Propuesta Comercial',
            sent_at: new Date().toISOString()
          },
          timestamp: Date.now()
        }
      ];

      const verification = await verifyTools(
        conversationId,
        2,
        agentResponse,
        auditor.detectedTools,
        auditor.detectedSubflows,
        dbChanges
      );

      expect(verification.verifications.length).toBeGreaterThan(0);
      const emailVerif = verification.verifications.find(v => v.toolType === 'email');
      expect(emailVerif).toBeDefined();
      expect(emailVerif?.agentClaimed).toBe(true);
      expect(emailVerif?.actuallyExecuted).toBe(true);
      expect(emailVerif?.verdict).toBe('VERIFIED');
    });
  });

  describe('Auditoría con Credenciales', () => {
    it('debe cargar credenciales guardadas', () => {
      const supabaseCred = createMockSupabaseCredential();
      const googleCred = createMockGoogleServiceAccountCredential();

      saveCredential(supabaseCred);
      saveCredential(googleCred);

      const loadedSupabase = getCredentialById(supabaseCred.id);
      const loadedGoogle = getCredentialById(googleCred.id);

      expect(loadedSupabase).toEqual(supabaseCred);
      expect(loadedGoogle).toEqual(googleCred);
    });

    it('debe validar credenciales antes de usarlas en auditoría', () => {
      const credential = createMockSupabaseCredential();
      saveCredential(credential);

      const loaded = getCredentialById(credential.id);
      expect(loaded).toBeDefined();
      expect(loaded?.type).toBe('supabase');
      
      // Las credenciales son válidas para uso
      if (loaded && loaded.type === 'supabase') {
        expect(loaded.data.url).toBeTruthy();
        expect(loaded.data.key).toBeTruthy();
      }
    });
  });

  describe('Flujo Completo: Usuario solicita propuesta por email', () => {
    let auditor: RealDatabaseAuditor;
    const conversationId = 'conv-full-flow-123';

    beforeEach(() => {
      const dbConfig: DatabaseConfig = {
        type: 'supabase',
        credentials: {
          url: 'https://test.supabase.co',
          key: 'test-key'
        },
        tables: ['conversaciones', 'email_logs', 'usuarios']
      };

      const payload = createMockWebhookPayload({
        sessionId: 'session-flow-123',
        conversationId,
        telefono: '+1234567890',
        email: 'user@example.com'
      });

      vi.mock('@supabase/supabase-js', () => ({
        createClient: vi.fn(() => mockSupabase)
      }));

      auditor = initializeRealDatabaseAuditor(
        conversationId,
        dbConfig,
        payload,
        createMockN8nWorkflow().nodes,
        createMockDetectedTools(),
        createMockDetectedSubflows()
      );
    });

    afterEach(() => {
      if (auditor) {
        cleanupRealDatabaseAuditor(conversationId);
      }
    });

    it('debe rastrear conversación completa desde saludo hasta envío de email', async () => {
      // === TURNO 1: Usuario saluda ===
      const snap1 = await auditor.takeSnapshot();

      mockSupabase.setMockData('conversaciones', [
        {
          id: '1',
          session_id: 'session-flow-123',
          telefono: '+1234567890',
          message: 'Hola',
          response: 'Hola, ¿en qué puedo ayudarte?',
          created_at: new Date().toISOString()
        }
      ]);

      const snap2 = await auditor.takeSnapshot();
      auditor.compareSnapshots(snap1, snap2);

      // === TURNO 2: Usuario pregunta por productos ===
      mockSupabase.setMockData('conversaciones', [
        {
          id: '1',
          session_id: 'session-flow-123',
          telefono: '+1234567890',
          message: 'Hola',
          response: 'Hola, ¿en qué puedo ayudarte?',
          created_at: new Date(Date.now() - 2000).toISOString()
        },
        {
          id: '2',
          session_id: 'session-flow-123',
          telefono: '+1234567890',
          message: 'Necesito información sobre cielorrasos',
          response: 'Tenemos cielorrasos Durlock a $5000. ¿Te envío una propuesta formal por email?',
          created_at: new Date(Date.now() - 1000).toISOString()
        }
      ]);

      const snap3 = await auditor.takeSnapshot();
      auditor.compareSnapshots(snap2, snap3);

      // === TURNO 3: Usuario acepta recibir email ===
      const agentResponseTurn3 = 'Perfecto, te envío la propuesta por email ahora mismo.';
      
      mockSupabase.setMockData('conversaciones', [
        {
          id: '1',
          session_id: 'session-flow-123',
          telefono: '+1234567890',
          message: 'Hola',
          response: 'Hola, ¿en qué puedo ayudarte?',
          created_at: new Date(Date.now() - 3000).toISOString()
        },
        {
          id: '2',
          session_id: 'session-flow-123',
          telefono: '+1234567890',
          message: 'Necesito información sobre cielorrasos',
          response: 'Tenemos cielorrasos Durlock a $5000. ¿Te envío una propuesta formal por email?',
          created_at: new Date(Date.now() - 2000).toISOString()
        },
        {
          id: '3',
          session_id: 'session-flow-123',
          telefono: '+1234567890',
          message: 'Sí, por favor',
          response: agentResponseTurn3,
          created_at: new Date(Date.now() - 1000).toISOString()
        }
      ]);

      // Email fue enviado
      mockSupabase.setMockData('email_logs', [
        {
          id: 'email-1',
          session_id: 'session-flow-123',
          to: 'user@example.com',
          subject: 'Propuesta Comercial - Cielorrasos Durlock',
          sent_at: new Date().toISOString(),
          status: 'sent'
        }
      ]);

      const snap4 = await auditor.takeSnapshot();
      auditor.compareSnapshots(snap3, snap4);

      // Verificar herramientas
      const dbChangesTurn3 = auditor.changes.slice(-2); // Últimos cambios
      
      const verification = await verifyTools(
        conversationId,
        3,
        agentResponseTurn3,
        auditor.detectedTools,
        auditor.detectedSubflows,
        dbChangesTurn3
      );

      // Aserciones finales
      expect(auditor.changes.length).toBeGreaterThan(0);
      
      const conversacionInserts = auditor.changes.filter(
        c => c.type === 'INSERT' && c.table === 'conversaciones'
      );
      expect(conversacionInserts.length).toBeGreaterThanOrEqual(2);

      const emailInserts = auditor.changes.filter(
        c => c.type === 'INSERT' && c.table === 'email_logs'
      );
      expect(emailInserts.length).toBeGreaterThanOrEqual(1);

      const emailVerification = verification.verifications.find(v => v.toolType === 'email');
      expect(emailVerification).toBeDefined();
      expect(emailVerification?.agentClaimed).toBe(true);
      expect(emailVerification?.actuallyExecuted).toBe(true);
      expect(emailVerification?.verdict).toBe('VERIFIED');

      // Summary final
      const summary = auditor.getSummary();
      expect(summary.writes).toBeGreaterThan(0);
      expect(summary.totalOperations).toBeGreaterThan(0);
      expect(summary.tablesUsed).toContain('conversaciones');
      expect(summary.tablesUsed).toContain('email_logs');
    });
  });

  describe('Manejo de Errores', () => {
    it('debe manejar errores de conexión a BD', async () => {
      const dbConfig: DatabaseConfig = {
        type: 'supabase',
        credentials: {
          url: 'https://test.supabase.co',
          key: 'test-key'
        },
        tables: ['conversaciones']
      };

      // Configurar error en mock
      mockSupabase.setMockError('conversaciones', new Error('Connection timeout'));

      vi.mock('@supabase/supabase-js', () => ({
        createClient: vi.fn(() => mockSupabase)
      }));

      const auditor = initializeRealDatabaseAuditor(
        'conv-error-123',
        dbConfig,
        createMockWebhookPayload()
      );

      // Debe manejar el error sin tirar excepción
      const snapshot = await auditor.takeSnapshot();
      expect(snapshot).toBeDefined();
      expect(snapshot.data['conversaciones']).toEqual([]);

      cleanupRealDatabaseAuditor('conv-error-123');
    });

    it('debe continuar auditoría si una herramienta falla', async () => {
      const agentResponse = 'Te envío el email y te agendo una reunión.';
      const tools = createMockDetectedTools();
      
      // Solo email se ejecutó, calendar falló
      const dbChanges = [
        {
          type: 'INSERT' as const,
          table: 'email_logs',
          record: { id: 'email-1' },
          after: { id: 'email-1' },
          timestamp: Date.now()
        }
      ];

      const verification = await verifyTools(
        'conv-partial-123',
        1,
        agentResponse,
        tools,
        [],
        dbChanges
      );

      // Debe haber verificado ambas herramientas
      expect(verification.verifications.length).toBeGreaterThanOrEqual(2);
      
      const emailVerif = verification.verifications.find(v => v.toolType === 'email');
      const calendarVerif = verification.verifications.find(v => v.toolType === 'calendar');
      
      expect(emailVerif?.verdict).toBe('VERIFIED');
      expect(calendarVerif?.verdict).toBe('FAILED');
      
      // Overall success debe ser false (una falló)
      expect(verification.overallSuccess).toBe(false);
    });
  });
});
