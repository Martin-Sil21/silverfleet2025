import { describe, it, expect } from 'vitest';
import { convertToolActionVerificationsToResult } from '../services/independentConversationRunner';
import type { ToolActionVerification, ToolActionClaim } from '../services/IntegrationManager';

describe('Evidence Flow - EmailIntegration → UI', () => {
  it('debe preservar datos completos de EmailDetails en evidence', () => {
    const mockEmailEvidence = {
      id: 'msg_12345',
      threadId: 'thread_67890',
      from: 'bot@example.com',
      to: ['customer@example.com'],
      subject: 'Confirmación de cita',
      snippet: 'Su cita ha sido confirmada para el día...',
      body: 'Estimado cliente, su cita ha sido confirmada...',
      date: new Date('2025-11-05T10:30:00Z'),
      labels: ['SENT'],
    };

    const claim: ToolActionClaim = {
      type: 'email_send',
      description: 'Enviar confirmación por email',
      extractedData: { to: 'customer@example.com' },
      turnNumber: 1,
      timestamp: new Date(),
    };

    const toolActionVerification: ToolActionVerification = {
      claim,
      verified: true,
      verificationMethod: 'Gmail API',
      evidence: mockEmailEvidence,
      message: 'Email verificado',
      timestamp: new Date(),
    };

    const result = convertToolActionVerificationsToResult(
      [toolActionVerification],
      'test-conversation',
      1
    );

    expect(result.verifications).toHaveLength(1);
    expect(result.verifications[0].verdict).toBe('VERIFIED');
    expect(result.verifications[0].evidence).toBeDefined();
    
    // Verificar que TODOS los campos se preservan
    const evidence = result.verifications[0].evidence as typeof mockEmailEvidence;
    expect(evidence.id).toBe('msg_12345');
    expect(evidence.from).toBe('bot@example.com');
    expect(evidence.to).toEqual(['customer@example.com']);
    expect(evidence.subject).toBe('Confirmación de cita');
    expect(evidence.snippet).toBe('Su cita ha sido confirmada para el día...');
    expect(evidence.body).toContain('Estimado cliente');
    expect(evidence.date).toBeInstanceOf(Date);
  });

  it('debe preservar datos de CalendarEvent en evidence', () => {
    const mockCalendarEvidence = {
      id: 'event_abc123',
      summary: 'Cita con el doctor',
      start: { dateTime: '2025-11-10T14:00:00Z', timeZone: 'America/Mexico_City' },
      end: { dateTime: '2025-11-10T15:00:00Z', timeZone: 'America/Mexico_City' },
      attendees: [
        { email: 'patient@example.com', responseStatus: 'accepted' },
      ],
      location: 'Consultorio 3',
      description: 'Cita de seguimiento',
    };

    const claim: ToolActionClaim = {
      type: 'calendar_create',
      description: 'Crear cita en calendario',
      extractedData: { summary: 'Cita con el doctor' },
      turnNumber: 2,
      timestamp: new Date(),
    };

    const toolActionVerification: ToolActionVerification = {
      claim,
      verified: true,
      verificationMethod: 'Google Calendar API',
      evidence: mockCalendarEvidence,
      message: 'Evento creado',
      timestamp: new Date(),
    };

    const result = convertToolActionVerificationsToResult(
      [toolActionVerification],
      'test-conversation',
      2
    );

    const evidence = result.verifications[0].evidence as typeof mockCalendarEvidence;
    expect(evidence.id).toBe('event_abc123');
    expect(evidence.summary).toBe('Cita con el doctor');
    expect(evidence.start.dateTime).toBe('2025-11-10T14:00:00Z');
    expect(evidence.attendees).toHaveLength(1);
    expect(evidence.attendees[0].email).toBe('patient@example.com');
  });

  it('debe manejar múltiples verificaciones con different evidence types', () => {
    const createClaim = (type: 'email_send' | 'calendar_create' | 'database_update', turn: number): ToolActionClaim => ({
      type,
      description: `Action ${type}`,
      extractedData: {},
      turnNumber: turn,
      timestamp: new Date(),
    });

    const verifications: ToolActionVerification[] = [
      {
        claim: createClaim('email_send', 3),
        verified: true,
        verificationMethod: 'Gmail API',
        evidence: { id: 'email-1', subject: 'Test Email' },
        message: 'OK',
        timestamp: new Date(),
      },
      {
        claim: createClaim('calendar_create', 3),
        verified: true,
        verificationMethod: 'Calendar API',
        evidence: { id: 'event-1', summary: 'Test Event' },
        message: 'OK',
        timestamp: new Date(),
      },
      {
        claim: createClaim('database_update', 3),
        verified: true,
        verificationMethod: 'Supabase',
        evidence: { id: 123, status: 'completed' },
        message: 'OK',
        timestamp: new Date(),
      },
    ];

    const result = convertToolActionVerificationsToResult(
      verifications,
      'multi-tool-conversation',
      3
    );

    expect(result.verifications).toHaveLength(3);
    
    // Email evidence
    expect(result.verifications[0].evidence).toHaveProperty('subject', 'Test Email');
    
    // Calendar evidence
    expect(result.verifications[1].evidence).toHaveProperty('summary', 'Test Event');
    
    // Database evidence
    expect(result.verifications[2].evidence).toHaveProperty('status', 'completed');
  });

  it('debe incluir turnNumber en cada verificación', () => {
    const claim: ToolActionClaim = {
      type: 'email_send',
      description: 'Test',
      extractedData: {},
      turnNumber: 5,
      timestamp: new Date(),
    };

    const verification: ToolActionVerification = {
      claim,
      verified: true,
      verificationMethod: 'Test',
      evidence: { id: 'test' },
      message: 'OK',
      timestamp: new Date(),
    };

    const result = convertToolActionVerificationsToResult([verification], 'conv-1', 5);

    expect(result.verifications[0].turnNumber).toBe(5);
  });

  it('debe preservar evidence incluso cuando status es "not_verified"', () => {
    const claim: ToolActionClaim = {
      type: 'email_send',
      description: 'Test',
      extractedData: {},
      turnNumber: 1,
      timestamp: new Date(),
    };

    const verification: ToolActionVerification = {
      claim,
      verified: false,
      verificationMethod: 'Gmail API Search',
      evidence: { searchedCriteria: { to: 'test@example.com' } },
      message: 'No se encontró el email',
      timestamp: new Date(),
    };

    const result = convertToolActionVerificationsToResult([verification], 'conv-1', 1);

    expect(result.verifications[0].verdict).toBe('FAILED');
    expect(result.verifications[0].evidence).toBeDefined();
    expect(result.verifications[0].evidence).toHaveProperty('searchedCriteria');
  });
});
