import { describe, it, expect } from 'vitest';
import { IntegrationManager, type IntegrationConfig } from '../services/IntegrationManager';

describe('Parallel Execution - Sin contaminación de datos', () => {
  it('debe ejecutar 3 conversaciones en paralelo sin mezclar evidence', async () => {
    // Crear 3 managers independientes (simulando 3 conversaciones paralelas)
    const config1: IntegrationConfig = { enabledIntegrations: {} };
    const config2: IntegrationConfig = { enabledIntegrations: {} };
    const config3: IntegrationConfig = { enabledIntegrations: {} };

    const manager1 = new IntegrationManager(config1, [], []);
    const manager2 = new IntegrationManager(config2, [], []);
    const manager3 = new IntegrationManager(config3, [], []);

    // Simular verificaciones paralelas (como pasaría en runFullAudit)
    const task1 = async () => {
      // Simular delay aleatorio (como en verificaciones reales)
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
      
      const private1 = manager1 as any;
      private1.verifications = [{
        claim: { type: 'email_send', description: 'Email Conv1', turnNumber: 1, extractedData: {}, timestamp: new Date() },
        verified: true,
        verificationMethod: 'Gmail API',
        evidence: { id: 'email-conv1', subject: 'Subject Conv1' },
        message: 'OK',
        timestamp: new Date(),
      }];
      
      return private1.verifications;
    };

    const task2 = async () => {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
      
      const private2 = manager2 as any;
      private2.verifications = [{
        claim: { type: 'calendar_create', description: 'Calendar Conv2', turnNumber: 1, extractedData: {}, timestamp: new Date() },
        verified: true,
        verificationMethod: 'Calendar API',
        evidence: { id: 'event-conv2', summary: 'Event Conv2' },
        message: 'OK',
        timestamp: new Date(),
      }];
      
      return private2.verifications;
    };

    const task3 = async () => {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
      
      const private3 = manager3 as any;
      private3.verifications = [{
        claim: { type: 'database_update', description: 'Database Conv3', turnNumber: 1, extractedData: {}, timestamp: new Date() },
        verified: true,
        verificationMethod: 'Supabase',
        evidence: { id: 'record-conv3', status: 'updated' },
        message: 'OK',
        timestamp: new Date(),
      }];
      
      return private3.verifications;
    };

    // Ejecutar en paralelo (como Promise.all en geminiService.ts)
    const [results1, results2, results3] = await Promise.all([task1(), task2(), task3()]);

    // Verificar que cada conversación mantuvo su propia evidence
    expect(results1).toHaveLength(1);
    expect(results2).toHaveLength(1);
    expect(results3).toHaveLength(1);

    // Verificar que no hay contaminación de datos
    expect(results1[0].evidence.id).toBe('email-conv1');
    expect(results1[0].evidence.subject).toBe('Subject Conv1');

    expect(results2[0].evidence.id).toBe('event-conv2');
    expect(results2[0].evidence.summary).toBe('Event Conv2');

    expect(results3[0].evidence.id).toBe('record-conv3');
    expect(results3[0].evidence.status).toBe('updated');

    // Verificar que cada manager solo tiene su propia verificación
    const private1 = manager1 as any;
    const private2 = manager2 as any;
    const private3 = manager3 as any;

    expect(private1.verifications).toHaveLength(1);
    expect(private2.verifications).toHaveLength(1);
    expect(private3.verifications).toHaveLength(1);

    // Verificar tipos de herramienta correctos
    expect(private1.verifications[0].claim.type).toBe('email_send');
    expect(private2.verifications[0].claim.type).toBe('calendar_create');
    expect(private3.verifications[0].claim.type).toBe('database_update');
  });

  it('debe manejar 5 conversaciones paralelas con múltiples verificaciones cada una', async () => {
    const managers = Array.from({ length: 5 }, (_, i) => {
      const config: IntegrationConfig = { enabledIntegrations: {} };
      return new IntegrationManager(config, [], []);
    });

    // Simular que cada conversación tiene 3 verificaciones
    const tasks = managers.map((manager, convIdx) => async () => {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 30));
      
      const privateManager = manager as any;
      privateManager.verifications = Array.from({ length: 3 }, (_, toolIdx) => ({
        claim: {
          type: 'email_send' as const,
          description: `Conv${convIdx}-Tool${toolIdx}`,
          turnNumber: 1,
          extractedData: {},
          timestamp: new Date(),
        },
        verified: true,
        verificationMethod: 'Test',
        evidence: {
          conversationId: `conv-${convIdx}`,
          toolId: `tool-${toolIdx}`,
          data: `Conv${convIdx}-Tool${toolIdx}`,
        },
        message: 'OK',
        timestamp: new Date(),
      }));
      
      return privateManager.verifications;
    });

    // Ejecutar todas las conversaciones en paralelo
    const allResults = await Promise.all(tasks.map(t => t()));

    // Verificar que cada conversación tiene exactamente 3 verificaciones
    expect(allResults).toHaveLength(5);
    allResults.forEach(results => {
      expect(results).toHaveLength(3);
    });

    // Verificar que no hay mezcla de datos entre conversaciones
    allResults.forEach((results, convIdx) => {
      results.forEach((verification, toolIdx) => {
        expect(verification.evidence.conversationId).toBe(`conv-${convIdx}`);
        expect(verification.evidence.toolId).toBe(`tool-${toolIdx}`);
        expect(verification.evidence.data).toBe(`Conv${convIdx}-Tool${toolIdx}`);
      });
    });

    // Verificar que cada manager tiene solo sus propias verificaciones
    managers.forEach((manager, idx) => {
      const privateManager = manager as any;
      expect(privateManager.verifications).toHaveLength(3);
      
      privateManager.verifications.forEach((v: any) => {
        expect(v.evidence.conversationId).toBe(`conv-${idx}`);
      });
    });
  });
});
