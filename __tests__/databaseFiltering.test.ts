import { describe, it, expect } from 'vitest';
import { extractConversationIdentifiers } from '../services/auditContextAnalyzer';
import type { AuditResult } from '../types';

describe('Database Filtering - auditContextAnalyzer', () => {
  it('debe extraer IDs de AuditResult', () => {
    const auditResult: Partial<AuditResult> = {
      id: 'audit-123',
      testCase: {
        id: 'test-1',
        title: 'Test Case',
        persona: 'Test User',
        conversationGoal: 'Test goal',
        initialPayload: {
          conversationId: 'conv-abc-123',
        },
      },
      executionTrace: [],
    };

    const identifiers = extractConversationIdentifiers(auditResult as AuditResult);

    // Debe incluir audit.id, testCase.id y conversationId del payload
    expect(identifiers.length).toBeGreaterThan(0);
    expect(identifiers).toContain('audit-123');
    expect(identifiers).toContain('test-1');
    expect(identifiers).toContain('conv-abc-123');
  });

  it('debe extraer múltiples identificadores únicos', () => {
    const auditResult: Partial<AuditResult> = {
      id: 'audit-456',
      testCase: {
        id: 'test-2',
        title: 'Test',
        persona: 'User',
        conversationGoal: 'Goal',
        initialPayload: {
          conversationId: 'conv-1',
          sessionId: 'session-xyz-789',
          phone: '555-1234',
        },
      },
      executionTrace: [],
    };

    const identifiers = extractConversationIdentifiers(auditResult as AuditResult);

    expect(identifiers).toContain('conv-1');
    expect(identifiers).toContain('session-xyz-789');
    expect(identifiers).toContain('555-1234');
    expect(identifiers.length).toBeGreaterThan(3);
  });

  it('debe filtrar cambios de base de datos correctamente', () => {
    const allChanges = [
      { table: 'conversaciones', operation: 'INSERT', data: { id: 1, conversationId: 'conv-A' } },
      { table: 'conversaciones', operation: 'INSERT', data: { id: 2, conversationId: 'conv-B' } },
      { table: 'usuarios', operation: 'UPDATE', data: { sessionId: 'session-A' } },
      { table: 'usuarios', operation: 'UPDATE', data: { sessionId: 'session-B' } },
    ];

    const conversationIds = ['conv-A', 'session-A'];

    // Filtrar cambios que contienen alguno de los identificadores
    const filtered = allChanges.filter((change) => {
      const dataStr = JSON.stringify(change.data).toLowerCase();
      return conversationIds.some((id) => dataStr.includes(id.toLowerCase()));
    });

    expect(filtered).toHaveLength(2);
    expect(filtered[0].data.conversationId).toBe('conv-A');
    expect(filtered[1].data.sessionId).toBe('session-A');
  });
});
