/**
 * Test Data Factories
 * Genera datos de prueba consistentes para tests
 */

import type { 
  AuditConfig, 
  TestCase, 
  AuditResult, 
  ExecutionStep,
  ParsedN8nWorkflow,
  WorkflowNode,
  DatabaseChange
} from '../../types';
import type { DetectedTool, DetectedSubflow } from '../../services/workflowDependencyAnalyzer';
import type { Credential } from '../../services/credentialsManager';

/**
 * Genera un workflow n8n de prueba con nodos de email, calendar y DB
 */
export function createMockN8nWorkflow(): any {
  return {
    name: 'Test Workflow',
    nodes: [
      {
        id: 'node-webhook',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        position: [250, 300],
        parameters: {
          path: 'test-webhook',
          httpMethod: 'POST'
        }
      },
      {
        id: 'node-ai-agent',
        name: 'AI Agent',
        type: 'n8n-nodes-base.agent',
        position: [450, 300],
        parameters: {
          systemMessage: 'You are a helpful assistant that helps users with product information.',
          model: 'gpt-4'
        }
      },
      {
        id: 'node-db-query',
        name: 'Query Products',
        type: 'n8n-nodes-base.supabase',
        position: [650, 300],
        parameters: {
          operation: 'select',
          table: 'productos',
          filterField: 'session_id',
          filterValue: '={{ $json.sessionId }}'
        }
      },
      {
        id: 'node-send-email',
        name: 'Send Email',
        type: 'n8n-nodes-base.gmail',
        position: [850, 300],
        parameters: {
          operation: 'send',
          to: '={{ $json.email }}',
          subject: 'Propuesta Comercial',
          message: '={{ $json.proposal }}'
        }
      },
      {
        id: 'node-calendar',
        name: 'Create Calendar Event',
        type: 'n8n-nodes-base.googleCalendar',
        position: [850, 450],
        parameters: {
          operation: 'create',
          calendar: 'primary',
          summary: 'Meeting with {{ $json.userName }}',
          start: '={{ $json.startTime }}',
          end: '={{ $json.endTime }}'
        }
      }
    ],
    connections: {
      'Webhook': {
        main: [[{ node: 'AI Agent', type: 'main', index: 0 }]]
      },
      'AI Agent': {
        main: [[
          { node: 'Query Products', type: 'main', index: 0 },
          { node: 'Send Email', type: 'main', index: 0 }
        ]]
      },
      'Query Products': {
        main: [[{ node: 'Create Calendar Event', type: 'main', index: 0 }]]
      }
    }
  };
}

/**
 * Genera un ParsedN8nWorkflow válido
 */
export function createMockParsedWorkflow(): ParsedN8nWorkflow {
  return {
    nodes: [
      {
        id: 'node-webhook',
        name: 'Webhook',
        type: 'webhook',
        nodeType: 'tool',
        position: { x: 250, y: 300 },
        parameters: {
          path: 'test-webhook'
        }
      },
      {
        id: 'node-ai-agent',
        name: 'AI Agent',
        type: 'ai-agent',
        nodeType: 'agent',
        position: { x: 450, y: 300 },
        parameters: {
          systemMessage: 'You are a helpful assistant.',
          model: 'gpt-4'
        },
        systemPrompt: 'You are a helpful assistant.'
      },
      {
        id: 'node-send-email',
        name: 'Send Email',
        type: 'tool',
        nodeType: 'tool',
        position: { x: 650, y: 300 },
        parameters: {
          operation: 'send'
        }
      }
    ],
    connections: []
  };
}

/**
 * Genera una configuración de auditoría de prueba
 */
export function createMockAuditConfig(overrides?: Partial<AuditConfig>): AuditConfig {
  const parsedWorkflow = createMockParsedWorkflow();
  
  return {
    workflow: [
      {
        type: 'agent',
        id: 'node-ai-agent',
        name: 'AI Agent',
        systemPrompt: 'You are a helpful assistant.',
        parameters: {
          model: 'gpt-4'
        }
      },
      {
        type: 'tool',
        id: 'node-send-email',
        name: 'Send Email',
        nodeType: 'n8n-nodes-base.gmail',
        parameters: {
          operation: 'send'
        }
      }
    ],
    connections: parsedWorkflow.connections,
    criteria: [
      'El agente debe responder de forma profesional',
      'El agente debe proveer información precisa',
      'El agente debe enviar emails cuando se lo soliciten'
    ],
    testCaseCount: 3,
    samplePayload: {
      sessionId: 'test-session-123',
      message: 'Hello',
      telefono: '+1234567890'
    },
    auditType: 'real',
    endpointUrl: 'https://test.n8n.cloud/webhook/test-webhook',
    enableDatabaseTracking: true,
    realDatabaseConfig: {
      type: 'supabase',
      url: 'https://test.supabase.co',
      key: 'test-key',
      tables: ['conversaciones', 'productos', 'usuarios']
    },
    rawN8nJson: JSON.stringify(createMockN8nWorkflow()),
    ...overrides
  };
}

/**
 * Genera un caso de prueba (persona sintética)
 */
export function createMockTestCase(overrides?: Partial<TestCase>): TestCase {
  return {
    id: 'TC-001',
    title: 'Consulta de precios de cielorrasos',
    persona: 'María González - Arquitecta profesional buscando materiales de construcción',
    conversationGoal: 'Obtener información sobre precios de cielorrasos y recibir propuesta por email',
    initialPayload: {
      sessionId: 'test-session-123',
      message: 'Hola, necesito información sobre cielorrasos',
      telefono: '+1234567890'
    },
    ...overrides
  };
}

/**
 * Genera un resultado de auditoría
 */
export function createMockAuditResult(overrides?: Partial<AuditResult>): AuditResult {
  return {
    id: 'result-001',
    testCase: createMockTestCase(),
    executionTrace: [],
    analysis: {
      overallScore: 0.9,
      summary: 'El agente cumplió satisfactoriamente con todos los criterios',
      criteriaBreakdown: [
        {
          criterion: 'El agente debe responder de forma profesional',
          score: 1.0,
          justification: 'El agente respondió con cortesía en todos los turnos',
          evidence: ['Turno 1: "Hola, ¿en qué puedo ayudarte?"'],
          impact: 'high'
        }
      ],
      keyFindings: [
        {
          type: 'strength',
          title: 'Respuesta profesional',
          description: 'El agente mantuvo un tono profesional',
          priority: 'high'
        }
      ],
      goalAchieved: true
    },
    finalStatus: 'SUCCESS',
    startTime: Date.now() - 60000,
    endTime: Date.now(),
    durationMs: 60000,
    ...overrides
  };
}

/**
 * Genera un execution step (turno de conversación)
 */
export function createMockExecutionStep(turnNumber: number): ExecutionStep {
  return {
    nodeId: `Turn ${turnNumber}`,
    status: 'SUCCESS',
    input: {
      message: `Mensaje de usuario ${turnNumber}`
    },
    output: {
      response: `Respuesta del agente ${turnNumber}`
    },
    log: `Turno ${turnNumber} ejecutado correctamente`,
    durationMs: 1000,
    timestamp: Date.now()
  };
}

/**
 * Genera credencial de Supabase de prueba
 */
export function createMockSupabaseCredential(): Credential {
  return {
    id: 'cred-supabase-123',
    name: 'Test Supabase',
    type: 'supabase',
    data: {
      url: 'https://test.supabase.co',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
      keyType: 'service_role'
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

/**
 * Genera credencial de Google Service Account de prueba
 */
export function createMockGoogleServiceAccountCredential(): Credential {
  return {
    id: 'cred-google-sa-123',
    name: 'Test Google SA',
    type: 'google-service-account',
    data: {
      type: 'service_account',
      project_id: 'test-project',
      private_key_id: 'test-key-id',
      private_key: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n',
      client_email: 'test@test-project.iam.gserviceaccount.com',
      client_id: '123456789',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/test%40test-project.iam.gserviceaccount.com',
      scopes: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/calendar']
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

/**
 * Genera herramientas detectadas de prueba
 */
export function createMockDetectedTools(): DetectedTool[] {
  return [
    {
      nodeId: 'node-send-email',
      nodeName: 'Send Email',
      toolType: 'email',
      specificType: 'gmail',
      requiresCredentials: true,
      credentialType: 'google-service-account'
    },
    {
      nodeId: 'node-calendar',
      nodeName: 'Create Calendar Event',
      toolType: 'calendar',
      specificType: 'google-calendar',
      requiresCredentials: true,
      credentialType: 'google-service-account'
    }
  ];
}

/**
 * Genera subflows detectados de prueba
 */
export function createMockDetectedSubflows(): DetectedSubflow[] {
  return [
    {
      nodeId: 'node-subflow-1',
      nodeName: 'Send Proposal Email',
      workflowId: 'workflow-123',
      workflowName: 'Email Proposal Subflow',
      isRequired: true
    }
  ];
}

/**
 * Genera cambios de BD de prueba
 */
export function createMockDatabaseChanges(): DatabaseChange[] {
  return [
    {
      type: 'INSERT',
      table: 'conversaciones',
      record: {
        id: '1',
        session_id: 'test-session-123',
        message: 'Hola',
        response: 'Hola, ¿en qué puedo ayudarte?',
        created_at: new Date().toISOString()
      },
      after: {
        id: '1',
        session_id: 'test-session-123',
        message: 'Hola',
        response: 'Hola, ¿en qué puedo ayudarte?',
        created_at: new Date().toISOString()
      },
      timestamp: Date.now()
    },
    {
      type: 'UPDATE',
      table: 'usuarios',
      record: {
        id: 'user-1',
        changedFields: ['last_interaction']
      },
      before: {
        id: 'user-1',
        telefono: '+1234567890',
        last_interaction: new Date(Date.now() - 3600000).toISOString()
      },
      after: {
        id: 'user-1',
        telefono: '+1234567890',
        last_interaction: new Date().toISOString()
      },
      timestamp: Date.now()
    }
  ];
}

/**
 * Genera payload de webhook de prueba
 */
export function createMockWebhookPayload(overrides?: Record<string, any>): Record<string, any> {
  return {
    sessionId: `session_${Date.now()}`,
    conversationId: `conv_${Date.now()}`,
    telefono: '+1234567890',
    message: 'Hola, necesito información',
    timestamp: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Genera respuesta de webhook de prueba
 */
export function createMockWebhookResponse(overrides?: Record<string, any>): any {
  return {
    success: true,
    response: 'Hola, ¿en qué puedo ayudarte hoy?',
    sessionId: `session_${Date.now()}`,
    conversationId: `conv_${Date.now()}`,
    metadata: {
      processed: true,
      timestamp: new Date().toISOString()
    },
    ...overrides
  };
}

/**
 * Genera registros de base de datos de prueba
 */
export function createMockDatabaseRecords(table: string, count: number = 5): any[] {
  const records = [];
  
  for (let i = 1; i <= count; i++) {
    const baseRecord = {
      id: `${i}`,
      created_at: new Date(Date.now() - i * 60000).toISOString(),
      updated_at: new Date(Date.now() - i * 30000).toISOString()
    };

    switch (table) {
      case 'conversaciones':
        records.push({
          ...baseRecord,
          session_id: 'test-session-123',
          telefono: '+1234567890',
          message: `Mensaje de usuario ${i}`,
          response: `Respuesta del agente ${i}`,
          turn_number: i
        });
        break;

      case 'productos':
        records.push({
          ...baseRecord,
          nombre: `Producto ${i}`,
          precio: 100 * i,
          categoria: 'test',
          stock: 50
        });
        break;

      case 'usuarios':
        records.push({
          ...baseRecord,
          telefono: `+123456789${i}`,
          nombre: `Usuario ${i}`,
          email: `user${i}@test.com`,
          bloqueado: false,
          estado: 'activo'
        });
        break;

      default:
        records.push(baseRecord);
    }
  }

  return records;
}
