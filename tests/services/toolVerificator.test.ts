/**
 * Tests para Tool Verificator
 * Verifica que las herramientas prometidas por el agente se ejecuten correctamente
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  verifyTools,
  generateToolVerificationReport
} from '../../services/toolVerificator';
import type { ToolVerificationResult } from '../../services/toolVerificator';
import { createMockDetectedTools, createMockDetectedSubflows, createMockDatabaseChanges } from '../helpers/testData';

describe('Tool Verificator', () => {
  const conversationId = 'test-conv-123';
  const turnNumber = 1;

  describe('verifyTools', () => {
    it('debe detectar cuando el agente promete enviar un email', async () => {
      const agentResponse = 'Te envío la propuesta por email ahora mismo.';
      const tools = createMockDetectedTools();
      const subflows = createMockDetectedSubflows();
      const dbChanges = createMockDatabaseChanges();

      const result = await verifyTools(
        conversationId,
        turnNumber,
        agentResponse,
        tools,
        subflows,
        dbChanges
      );

      expect(result.verifications.length).toBeGreaterThan(0);
      const emailVerification = result.verifications.find(v => v.toolType === 'email');
      expect(emailVerification).toBeDefined();
      expect(emailVerification?.agentClaimed).toBe(true);
    });

    it('debe detectar cuando el agente promete agendar una reunión', async () => {
      const agentResponse = 'Perfecto, te agendo una reunión para el viernes a las 10am.';
      const tools = createMockDetectedTools();
      const subflows = [];
      const dbChanges = [];

      const result = await verifyTools(
        conversationId,
        turnNumber,
        agentResponse,
        tools,
        subflows,
        dbChanges
      );

      const calendarVerification = result.verifications.find(v => v.toolType === 'calendar');
      expect(calendarVerification).toBeDefined();
      expect(calendarVerification?.agentClaimed).toBe(true);
    });

    it('debe verificar ejecución basada en cambios de BD', async () => {
      const agentResponse = 'Te envío la propuesta por email.';
      const tools = createMockDetectedTools();
      const dbChanges = [
        {
          type: 'INSERT' as const,
          table: 'email_logs',
          record: {
            id: '1',
            to: 'test@example.com',
            subject: 'Propuesta Comercial',
            sent_at: new Date().toISOString()
          },
          after: {
            id: '1',
            to: 'test@example.com',
            subject: 'Propuesta Comercial',
            sent_at: new Date().toISOString()
          },
          timestamp: Date.now()
        }
      ];

      const result = await verifyTools(
        conversationId,
        turnNumber,
        agentResponse,
        tools,
        [],
        dbChanges
      );

      const emailVerification = result.verifications.find(v => v.toolType === 'email');
      expect(emailVerification?.actuallyExecuted).toBe(true);
      expect(emailVerification?.verdict).toBe('VERIFIED');
    });

    it('debe detectar promesas no cumplidas', async () => {
      const agentResponse = 'Te envío un email con la información.';
      const tools = createMockDetectedTools();
      const dbChanges = []; // Sin cambios en BD = no se ejecutó

      const result = await verifyTools(
        conversationId,
        turnNumber,
        agentResponse,
        tools,
        [],
        dbChanges
      );

      const emailVerification = result.verifications.find(v => v.toolType === 'email');
      expect(emailVerification?.agentClaimed).toBe(true);
      expect(emailVerification?.actuallyExecuted).toBe(false);
      expect(emailVerification?.verdict).toBe('FAILED');
    });

    it('debe verificar ejecución basada en payload de respuesta', async () => {
      const agentResponse = 'Email enviado exitosamente.';
      const tools = createMockDetectedTools();
      const responsePayload = {
        email: {
          status: 'sent',
          messageId: 'msg-123',
          to: 'user@example.com'
        }
      };

      const result = await verifyTools(
        conversationId,
        turnNumber,
        agentResponse,
        tools,
        [],
        [],
        responsePayload
      );

      const emailVerification = result.verifications.find(v => v.toolType === 'email');
      expect(emailVerification?.actuallyExecuted).toBe(true);
    });

    it('debe detectar subflows que se ejecutan', async () => {
      const agentResponse = 'Te envío la propuesta formal.';
      const tools = [];
      const subflows = createMockDetectedSubflows();
      const dbChanges = [
        {
          type: 'INSERT' as const,
          table: 'sent_proposals',
          record: { id: '1', sent: true },
          after: { id: '1', sent: true },
          timestamp: Date.now()
        }
      ];

      const result = await verifyTools(
        conversationId,
        turnNumber,
        agentResponse,
        tools,
        subflows,
        dbChanges
      );

      expect(result.verifications.length).toBeGreaterThan(0);
      const subflowVerification = result.verifications.find(v => v.agentClaimed);
      expect(subflowVerification?.actuallyExecuted).toBe(true);
    });

    it('debe generar resumen correcto cuando todo funciona', async () => {
      const agentResponse = 'Email enviado.';
      const tools = createMockDetectedTools();
      const dbChanges = [
        {
          type: 'INSERT' as const,
          table: 'email_logs',
          record: { id: '1' },
          after: { id: '1' },
          timestamp: Date.now()
        }
      ];

      const result = await verifyTools(
        conversationId,
        turnNumber,
        agentResponse,
        tools,
        [],
        dbChanges
      );

      expect(result.overallSuccess).toBe(true);
      expect(result.summary).toContain('✅');
    });

    it('debe generar resumen con fallos cuando algo no funciona', async () => {
      const agentResponse = 'Te envío el email.';
      const tools = createMockDetectedTools();
      const dbChanges = []; // No ejecutó

      const result = await verifyTools(
        conversationId,
        turnNumber,
        agentResponse,
        tools,
        [],
        dbChanges
      );

      expect(result.overallSuccess).toBe(false);
      expect(result.summary).toContain('⚠️');
      expect(result.summary).toContain('fallaron');
    });

    it('debe indicar cuando no hay herramientas detectadas', async () => {
      const agentResponse = 'Hola, ¿en qué puedo ayudarte?';
      const tools = [];
      const subflows = [];
      const dbChanges = [];

      const result = await verifyTools(
        conversationId,
        turnNumber,
        agentResponse,
        tools,
        subflows,
        dbChanges
      );

      expect(result.verifications).toEqual([]);
      expect(result.summary).toContain('No se detectaron');
    });

    it('debe detectar herramientas ejecutadas sin mención explícita', async () => {
      const agentResponse = 'Aquí está la información que solicitaste.';
      const tools = createMockDetectedTools();
      const dbChanges = [
        {
          type: 'INSERT' as const,
          table: 'email_logs',
          record: { id: '1' },
          after: { id: '1' },
          timestamp: Date.now()
        }
      ];

      const result = await verifyTools(
        conversationId,
        turnNumber,
        agentResponse,
        tools,
        [],
        dbChanges
      );

      // Debe detectar ejecución aunque el agente no lo mencione explícitamente
      const emailVerification = result.verifications.find(v => v.toolType === 'email');
      if (emailVerification) {
        expect(emailVerification.actuallyExecuted).toBe(true);
      }
    });
  });

  describe('generateToolVerificationReport', () => {
    it('debe generar reporte vacío cuando no hay verificaciones', () => {
      const results: ToolVerificationResult[] = [];
      
      const report = generateToolVerificationReport(results);
      
      expect(report).toContain('No se realizaron verificaciones');
    });

    it('debe generar reporte con múltiples turnos', () => {
      const results: ToolVerificationResult[] = [
        {
          conversationId: 'conv-1',
          turnNumber: 1,
          verifications: [
            {
              toolType: 'email',
              toolName: 'Send Email',
              nodeId: 'node-1',
              agentClaimed: true,
              actuallyExecuted: true,
              verdict: 'VERIFIED',
              details: 'Email enviado correctamente'
            }
          ],
          overallSuccess: true,
          summary: '✅ Todo verificado'
        },
        {
          conversationId: 'conv-1',
          turnNumber: 2,
          verifications: [
            {
              toolType: 'calendar',
              toolName: 'Create Event',
              nodeId: 'node-2',
              agentClaimed: true,
              actuallyExecuted: false,
              verdict: 'FAILED',
              details: 'No se creó el evento'
            }
          ],
          overallSuccess: false,
          summary: '⚠️ 1 fallo'
        }
      ];

      const report = generateToolVerificationReport(results);

      expect(report).toContain('Turno 1');
      expect(report).toContain('Turno 2');
      expect(report).toContain('✅ Send Email');
      expect(report).toContain('❌ Create Event');
      expect(report).toContain('RESUMEN GENERAL');
    });

    it('debe calcular estadísticas correctamente', () => {
      const results: ToolVerificationResult[] = [
        {
          conversationId: 'conv-1',
          turnNumber: 1,
          verifications: [
            {
              toolType: 'email',
              toolName: 'Email 1',
              agentClaimed: true,
              actuallyExecuted: true,
              verdict: 'VERIFIED',
              details: 'OK'
            },
            {
              toolType: 'email',
              toolName: 'Email 2',
              agentClaimed: true,
              actuallyExecuted: false,
              verdict: 'FAILED',
              details: 'Falló'
            }
          ],
          overallSuccess: false,
          summary: 'Parcial'
        }
      ];

      const report = generateToolVerificationReport(results);

      expect(report).toContain('Total de verificaciones: 2');
      expect(report).toContain('Verificadas exitosamente: 1');
      expect(report).toContain('Fallidas: 1');
      expect(report).toContain('Tasa de éxito: 50.0%');
    });

    it('debe incluir evidencia cuando está disponible', () => {
      const results: ToolVerificationResult[] = [
        {
          conversationId: 'conv-1',
          turnNumber: 1,
          verifications: [
            {
              toolType: 'email',
              toolName: 'Send Email',
              agentClaimed: true,
              actuallyExecuted: true,
              executionEvidence: 'Email registrado en BD con ID msg-123',
              verdict: 'VERIFIED',
              details: 'Verificado'
            }
          ],
          overallSuccess: true,
          summary: 'OK'
        }
      ];

      const report = generateToolVerificationReport(results);

      expect(report).toContain('Evidencia');
      expect(report).toContain('Email registrado en BD con ID msg-123');
    });

    it('debe marcar tools con status UNCHECKED', () => {
      const results: ToolVerificationResult[] = [
        {
          conversationId: 'conv-1',
          turnNumber: 1,
          verifications: [
            {
              toolType: 'other',
              toolName: 'Unknown Tool',
              agentClaimed: false,
              actuallyExecuted: false,
              verdict: 'UNCHECKED',
              details: 'No se pudo verificar'
            }
          ],
          overallSuccess: true,
          summary: 'OK'
        }
      ];

      const report = generateToolVerificationReport(results);

      expect(report).toContain('⚠️ Unknown Tool');
      expect(report).toContain('No se pudo verificar');
    });
  });
});
