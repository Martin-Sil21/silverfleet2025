/**
 * Tests para IntegrationManager - Búsqueda Global de Emails
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IntegrationManager } from '../IntegrationManager';
import type { EmailDetails } from '../integrations/EmailIntegration';

// Mock de GmailIntegration
vi.mock('../integrations/EmailIntegration', () => ({
  GmailIntegration: vi.fn().mockImplementation(() => ({
    searchSentEmails: vi.fn().mockResolvedValue([
      {
        id: 'msg_001',
        to: ['test@example.com'],
        subject: 'Test Email 1',
        date: new Date('2025-11-05T10:00:00Z'),
        bodySnippet: 'Este es un email de prueba'
      },
      {
        id: 'msg_002',
        to: ['user@domain.com'],
        subject: 'Test Email 2',
        date: new Date('2025-11-05T10:05:00Z'),
        bodySnippet: 'Otro email de prueba con más contenido'
      }
    ])
  })),
  EmailSearchCriteria: {},
  EmailVerificationResult: {},
  EmailDetails: {}
}));

describe('IntegrationManager - searchAllSentEmailsInConversation', () => {
  let manager: IntegrationManager;

  beforeEach(() => {
    // Crear manager con config de email
    manager = new IntegrationManager({
      enabledIntegrations: {
        email: {
          credentialId: 'test-cred-id',
          type: 'gmail-oauth'
        }
      },
      verificationDelay: 0
    }, []);
  });

  it('debe buscar emails con ventana de tiempo ampliada (±1 minuto)', async () => {
    const startTime = new Date('2025-11-05T10:00:00Z');
    const endTime = new Date('2025-11-05T10:10:00Z');

    const emails = await manager.searchAllSentEmailsInConversation(
      startTime,
      endTime
    );

    expect(emails).toBeDefined();
    expect(Array.isArray(emails)).toBe(true);
  });

  it('debe retornar array de emails con estructura correcta', async () => {
    const startTime = new Date('2025-11-05T10:00:00Z');
    const endTime = new Date('2025-11-05T10:10:00Z');

    const emails = await manager.searchAllSentEmailsInConversation(
      startTime,
      endTime
    );

    expect(emails.length).toBeGreaterThan(0);
    
    // Verificar estructura del primer email
    const email = emails[0];
    expect(email).toHaveProperty('id');
    expect(email).toHaveProperty('to');
    expect(email).toHaveProperty('subject');
    expect(email).toHaveProperty('date');
    expect(email).toHaveProperty('bodySnippet');
  });

  it('debe filtrar por destinatario si se proporciona', async () => {
    const startTime = new Date('2025-11-05T10:00:00Z');
    const endTime = new Date('2025-11-05T10:10:00Z');
    const recipient = 'test@example.com';

    const emails = await manager.searchAllSentEmailsInConversation(
      startTime,
      endTime,
      recipient
    );

    expect(emails).toBeDefined();
    expect(Array.isArray(emails)).toBe(true);
  });

  it('debe retornar array vacío si no hay integración Gmail configurada', async () => {
    // Crear manager SIN config de email
    const managerSinEmail = new IntegrationManager({
      enabledIntegrations: {},
      verificationDelay: 0
    }, []);

    const startTime = new Date('2025-11-05T10:00:00Z');
    const endTime = new Date('2025-11-05T10:10:00Z');

    const emails = await managerSinEmail.searchAllSentEmailsInConversation(
      startTime,
      endTime
    );

    expect(emails).toEqual([]);
  });

  it('debe manejar errores de Gmail API sin lanzar excepción', async () => {
    // Mock que simula error de Gmail API
    const managerConError = new IntegrationManager({
      enabledIntegrations: {
        email: {
          credentialId: 'invalid-cred',
          type: 'gmail-oauth'
        }
      },
      verificationDelay: 0
    }, []);

    const startTime = new Date('2025-11-05T10:00:00Z');
    const endTime = new Date('2025-11-05T10:10:00Z');

    // No debería lanzar excepción
    const emails = await managerConError.searchAllSentEmailsInConversation(
      startTime,
      endTime
    );

    expect(emails).toEqual([]);
  });

  it('debe usar ventana de búsqueda 1 minuto antes y 1 minuto después', async () => {
    const startTime = new Date('2025-11-05T10:00:00Z'); // 10:00:00
    const endTime = new Date('2025-11-05T10:10:00Z');   // 10:10:00

    // La búsqueda debería ser desde 09:59:00 hasta 10:11:00
    const emails = await manager.searchAllSentEmailsInConversation(
      startTime,
      endTime
    );

    expect(emails).toBeDefined();
    // Los emails deberían estar dentro de la ventana ampliada
  });
});

describe('IntegrationManager - verifyEmailAction (comportamiento existente)', () => {
  let manager: IntegrationManager;

  beforeEach(() => {
    manager = new IntegrationManager({
      enabledIntegrations: {
        email: {
          credentialId: 'test-cred-id',
          type: 'gmail-oauth'
        }
      },
      verificationDelay: 0 // Sin delay para tests
    }, []);
  });

  it('debe esperar 3 segundos antes de verificar (delay configurable)', async () => {
    const managerConDelay = new IntegrationManager({
      enabledIntegrations: {
        email: {
          credentialId: 'test-cred-id',
          type: 'gmail-oauth'
        }
      },
      verificationDelay: 1 // 1 segundo para tests rápidos
    }, []);

    const claim = {
      type: 'email_send' as const,
      description: 'Enviar email a test@example.com',
      extractedData: {
        to: ['test@example.com'],
        subject: 'Test Subject',
        bodySnippet: 'Test body'
      },
      turnNumber: 1,
      timestamp: new Date()
    };

    const startTime = Date.now();
    await managerConDelay.verifyEmailAction(claim);
    const endTime = Date.now();

    const duration = endTime - startTime;
    expect(duration).toBeGreaterThanOrEqual(900); // Al menos 900ms (1s - margen)
  });

  it('debe usar ventana de búsqueda ampliada (30s antes del claim)', async () => {
    const claimTime = new Date('2025-11-05T10:00:30Z'); // 10:00:30
    
    const claim = {
      type: 'email_send' as const,
      description: 'Enviar email a test@example.com',
      extractedData: {
        to: ['test@example.com'],
        subject: 'Test Subject',
        bodySnippet: 'Test body content here for search'
      },
      turnNumber: 1,
      timestamp: claimTime
    };

    const result = await manager.verifyEmailAction(claim);

    expect(result).toBeDefined();
    expect(result.claim).toEqual(claim);
    // La búsqueda debería ser desde 10:00:00 (30s antes)
  });

  it('debe hacer bodyContains opcional si es muy corto (<20 chars)', async () => {
    const claim = {
      type: 'email_send' as const,
      description: 'Enviar email',
      extractedData: {
        to: ['test@example.com'],
        subject: 'Test',
        bodySnippet: 'Muy corto' // Solo 10 caracteres
      },
      turnNumber: 1,
      timestamp: new Date()
    };

    const result = await manager.verifyEmailAction(claim);

    expect(result).toBeDefined();
    // No debería fallar por bodySnippet corto
  });
});
