import { describe, it, expect, beforeEach } from 'vitest';
import { IntegrationManager } from '../services/IntegrationManager';
import type { IntegrationConfig } from '../services/IntegrationManager';

describe('IntegrationManager - Aislamiento entre conversaciones', () => {
  let manager1: IntegrationManager;
  let manager2: IntegrationManager;

  beforeEach(() => {
    // Crear dos configs SEPARADOS (no compartir referencia)
    const mockConfig1: IntegrationConfig = { enabledIntegrations: {} };
    const mockConfig2: IntegrationConfig = { enabledIntegrations: {} };
    
    // Crear dos instancias separadas simulando dos conversaciones paralelas
    manager1 = new IntegrationManager(mockConfig1, [], []);
    manager2 = new IntegrationManager(mockConfig2, [], []);
  });

  it('debe crear instancias completamente independientes', () => {
    expect(manager1).not.toBe(manager2);
    expect(manager1).toBeInstanceOf(IntegrationManager);
    expect(manager2).toBeInstanceOf(IntegrationManager);
  });

  it('no debe compartir estado interno entre instancias', () => {
    // Acceder a propiedades privadas mediante casting (solo para testing)
    const private1 = manager1 as any;
    const private2 = manager2 as any;

    // Verificar que cada manager tiene su propio config
    expect(private1.config).not.toBe(private2.config);
    
    // Verificar que detectedTools es independiente
    expect(private1.detectedTools).not.toBe(private2.detectedTools);
    
    // Verificar que detectedSubflows es independiente
    expect(private1.detectedSubflows).not.toBe(private2.detectedSubflows);
  });

  it('debe mantener detectados tools separados por instancia', () => {
    const mockConfig1: IntegrationConfig = { enabledIntegrations: {} };
    const mockConfig2: IntegrationConfig = { enabledIntegrations: {} };
    
    const tools1 = [{ 
      toolType: 'email', 
      nodeId: 'node-1', 
      nodeName: 'Email Tool 1',
      specificType: 'gmail',
      requiresCredentials: true,
    }];
    const tools2 = [{ 
      toolType: 'calendar', 
      nodeId: 'node-2', 
      nodeName: 'Calendar Tool 1',
      specificType: 'google-calendar',
      requiresCredentials: true,
    }];

    const manager1 = new IntegrationManager(mockConfig1, tools1 as any, []);
    const manager2 = new IntegrationManager(mockConfig2, tools2 as any, []);

    const private1 = manager1 as any;
    const private2 = manager2 as any;

    expect(private1.detectedTools).toHaveLength(1);
    expect(private2.detectedTools).toHaveLength(1);
    expect(private1.detectedTools[0].toolType).toBe('email');
    expect(private2.detectedTools[0].toolType).toBe('calendar');
  });
});
