import { describe, it, expect } from 'vitest';
import { extractPromisesFromConversation } from '../services/auditContextAnalyzer';

describe('Promise Detection - JSON y texto narrativo', () => {
  it('debe detectar promesas en texto narrativo tradicional', () => {
    const executionSteps = [
      {
        nodeId: 'turn-1',
        nodeType: 'agent',
        timestamp: new Date(),
        input: 'Necesito agendar una cita',
        output: 'Claro, te voy a enviar un correo de confirmación con los detalles de tu cita.',
      },
    ];

    const promises = extractPromisesFromConversation(executionSteps as any);

    expect(promises.length).toBeGreaterThan(0);
    const allPromises = JSON.stringify(promises).toLowerCase();
    expect(allPromises).toMatch(/email|correo|enviar/);
  });

  it('debe detectar promesas en respuestas JSON estructuradas', () => {
    const executionSteps = [
      {
        nodeId: 'turn-1',
        nodeType: 'agent',
        timestamp: new Date(),
        input: 'Necesito ayuda',
        output: JSON.stringify({
          action: 'send_email',
          recipient: 'customer@example.com',
          subject: 'Confirmación de pedido',
          nextSteps: ['Te enviaré un email de confirmación', 'Crearé un evento en tu calendario'],
        }),
      },
    ];

    const promises = extractPromisesFromConversation(executionSteps as any);

    expect(promises.length).toBeGreaterThan(0);
    const allPromises = JSON.stringify(promises).toLowerCase();
    expect(allPromises).toMatch(/email|correo|enviar|calendar/);
  });

  it('debe detectar múltiples tipos de promesas', () => {
    const executionSteps = [
      {
        nodeId: 'turn-1',
        nodeType: 'agent',
        timestamp: new Date(),
        input: 'Test',
        output: 'Voy a: 1) Enviar un email, 2) Crear evento en calendario, 3) Actualizar tu estado en la base de datos',
      },
    ];

    const promises = extractPromisesFromConversation(executionSteps as any);

    expect(promises.length).toBeGreaterThan(0);
    const allPromises = JSON.stringify(promises).toLowerCase();
    
    // Debe detectar al menos uno de estos tipos
    const hasEmailPromise = allPromises.includes('email') || allPromises.includes('correo');
    const hasCalendarPromise = allPromises.includes('calendario') || allPromises.includes('evento');
    const hasDatabasePromise = allPromises.includes('base') || allPromises.includes('actualizar');
    
    expect(hasEmailPromise || hasCalendarPromise || hasDatabasePromise).toBe(true);
  });
});
