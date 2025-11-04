/**
 * 🔍 Workflow Dependency Analyzer
 * Detecta todas las dependencias de un workflow n8n:
 * - Subflujos (nodos executeWorkflow)
 * - Herramientas externas (Email, Calendar, CRM, etc.)
 * - Bases de datos (Supabase, Airtable, Postgres, etc.)
 */

export interface DetectedSubflow {
  nodeId: string;
  nodeName: string;
  workflowId?: string;
  workflowName?: string;
  isRequired: boolean;
}

export interface DetectedTool {
  nodeId: string;
  nodeName: string;
  toolType: 'email' | 'calendar' | 'database' | 'crm' | 'messaging' | 'payment' | 'storage' | 'other';
  specificType: string; // 'gmail', 'outlook', 'google-calendar', 'supabase', etc.
  requiresCredentials: boolean;
  credentialType?: string;
  parameters?: Record<string, any>;
}

export interface DetectedDatabase {
  nodeId: string;
  nodeName: string;
  databaseType: 'supabase' | 'airtable' | 'postgres' | 'mysql' | 'mongodb' | 'google-sheets' | 'other';
  tables?: string[];
  operations?: string[]; // 'read', 'write', 'update', 'delete'
  requiresCredentials: boolean;
}

export interface WorkflowDependencies {
  subflows: DetectedSubflow[];
  tools: DetectedTool[];
  databases: DetectedDatabase[];
  hasExternalDependencies: boolean;
}

// Node types that execute other workflows
const SUBFLOW_NODE_TYPES = [
  'n8n-nodes-base.executeWorkflow',
  'executeWorkflow',
  'n8n-nodes-base.workflowTrigger'
];

// Email service node types
const EMAIL_NODE_TYPES = [
  'n8n-nodes-base.emailSend',
  'n8n-nodes-base.gmail',
  'n8n-nodes-base.microsoftOutlook',
  'n8n-nodes-base.sendGrid',
  'n8n-nodes-base.mailgun',
  'n8n-nodes-base.awsSes'
];

// Calendar service node types
const CALENDAR_NODE_TYPES = [
  'n8n-nodes-base.googleCalendar',
  'n8n-nodes-base.microsoftCalendar',
  'n8n-nodes-base.caldav'
];

// Database node types
const DATABASE_NODE_TYPES = [
  'n8n-nodes-base.supabase',
  'n8n-nodes-base.airtable',
  'n8n-nodes-base.postgres',
  'n8n-nodes-base.mysql',
  'n8n-nodes-base.mongodb',
  'n8n-nodes-base.microsoftSql',
  'n8n-nodes-base.redis',
  'n8n-nodes-base.googleSheets',
  'n8n-nodes-base.firebase'
];

// CRM node types
const CRM_NODE_TYPES = [
  'n8n-nodes-base.hubspot',
  'n8n-nodes-base.salesforce',
  'n8n-nodes-base.pipedrive',
  'n8n-nodes-base.zoho'
];

// Messaging node types
const MESSAGING_NODE_TYPES = [
  'n8n-nodes-base.telegram',
  'n8n-nodes-base.whatsapp',
  'n8n-nodes-base.slack',
  'n8n-nodes-base.discord',
  'n8n-nodes-base.twilio'
];

// Payment node types
const PAYMENT_NODE_TYPES = [
  'n8n-nodes-base.stripe',
  'n8n-nodes-base.paypal',
  'n8n-nodes-base.square'
];

// Storage node types
const STORAGE_NODE_TYPES = [
  'n8n-nodes-base.awsS3',
  'n8n-nodes-base.googleDrive',
  'n8n-nodes-base.dropbox',
  'n8n-nodes-base.box'
];

/**
 * Detecta subflujos en el workflow
 */
function detectSubflows(nodes: any[]): DetectedSubflow[] {
  const subflows: DetectedSubflow[] = [];

  for (const node of nodes) {
    const nodeType = node.type?.toLowerCase() || '';
    const isSubflow = SUBFLOW_NODE_TYPES.some(type => nodeType.includes(type.toLowerCase()));

    if (isSubflow) {
      const workflowId = node.parameters?.workflowId || 
                        node.parameters?.workflow_id ||
                        node.parameters?.id;
      
      const workflowName = node.parameters?.workflowName || 
                          node.parameters?.name ||
                          'Unknown Workflow';

      subflows.push({
        nodeId: node.id,
        nodeName: node.name || 'Unnamed Subflow',
        workflowId: workflowId ? String(workflowId) : undefined,
        workflowName,
        isRequired: true
      });
    }
  }

  return subflows;
}

/**
 * Determina el tipo específico de base de datos
 */
function getDatabaseType(nodeType: string): DetectedDatabase['databaseType'] {
  const type = nodeType.toLowerCase();
  if (type.includes('supabase')) return 'supabase';
  if (type.includes('airtable')) return 'airtable';
  if (type.includes('postgres')) return 'postgres';
  if (type.includes('mysql')) return 'mysql';
  if (type.includes('mongodb') || type.includes('mongo')) return 'mongodb';
  if (type.includes('googlesheets') || type.includes('sheets')) return 'google-sheets';
  return 'other';
}

/**
 * Detecta bases de datos en el workflow
 */
function detectDatabases(nodes: any[]): DetectedDatabase[] {
  const databases: DetectedDatabase[] = [];

  for (const node of nodes) {
    const nodeType = node.type?.toLowerCase() || '';
    const isDatabase = DATABASE_NODE_TYPES.some(type => nodeType.includes(type.toLowerCase()));

    if (isDatabase) {
      const operations: string[] = [];
      const params = node.parameters || {};

      // Detectar operaciones según el nodo
      if (params.operation) {
        const op = String(params.operation).toLowerCase();
        if (op.includes('get') || op.includes('read') || op.includes('select')) {
          operations.push('read');
        }
        if (op.includes('insert') || op.includes('create')) {
          operations.push('write');
        }
        if (op.includes('update') || op.includes('modify')) {
          operations.push('update');
        }
        if (op.includes('delete') || op.includes('remove')) {
          operations.push('delete');
        }
      }

      // Detectar tablas
      const tables: string[] = [];
      if (params.table) tables.push(String(params.table));
      if (params.tableName) tables.push(String(params.tableName));
      if (params.collection) tables.push(String(params.collection));

      databases.push({
        nodeId: node.id,
        nodeName: node.name || 'Unnamed Database',
        databaseType: getDatabaseType(node.type),
        tables: tables.length > 0 ? tables : undefined,
        operations: operations.length > 0 ? operations : undefined,
        requiresCredentials: true
      });
    }
  }

  return databases;
}

/**
 * Determina el tipo de herramienta
 */
function getToolType(nodeType: string): DetectedTool['toolType'] {
  const type = nodeType.toLowerCase();
  
  if (EMAIL_NODE_TYPES.some(t => type.includes(t.toLowerCase()))) return 'email';
  if (CALENDAR_NODE_TYPES.some(t => type.includes(t.toLowerCase()))) return 'calendar';
  if (CRM_NODE_TYPES.some(t => type.includes(t.toLowerCase()))) return 'crm';
  if (MESSAGING_NODE_TYPES.some(t => type.includes(t.toLowerCase()))) return 'messaging';
  if (PAYMENT_NODE_TYPES.some(t => type.includes(t.toLowerCase()))) return 'payment';
  if (STORAGE_NODE_TYPES.some(t => type.includes(t.toLowerCase()))) return 'storage';
  
  return 'other';
}

/**
 * Determina el tipo específico de herramienta
 */
function getSpecificToolType(nodeType: string): string {
  const type = nodeType.toLowerCase();
  
  // Email
  if (type.includes('gmail')) return 'gmail';
  if (type.includes('outlook')) return 'outlook';
  if (type.includes('sendgrid')) return 'sendgrid';
  if (type.includes('mailgun')) return 'mailgun';
  
  // Calendar
  if (type.includes('googlecalendar')) return 'google-calendar';
  if (type.includes('microsoftcalendar')) return 'microsoft-calendar';
  
  // CRM
  if (type.includes('hubspot')) return 'hubspot';
  if (type.includes('salesforce')) return 'salesforce';
  
  // Messaging
  if (type.includes('telegram')) return 'telegram';
  if (type.includes('whatsapp')) return 'whatsapp';
  if (type.includes('slack')) return 'slack';
  if (type.includes('twilio')) return 'twilio';
  
  // Payment
  if (type.includes('stripe')) return 'stripe';
  if (type.includes('paypal')) return 'paypal';
  
  return type.replace('n8n-nodes-base.', '');
}

/**
 * Detecta herramientas externas (no-BD) en el workflow
 */
function detectTools(nodes: any[]): DetectedTool[] {
  const tools: DetectedTool[] = [];

  const allToolTypes = [
    ...EMAIL_NODE_TYPES,
    ...CALENDAR_NODE_TYPES,
    ...CRM_NODE_TYPES,
    ...MESSAGING_NODE_TYPES,
    ...PAYMENT_NODE_TYPES,
    ...STORAGE_NODE_TYPES
  ];

  for (const node of nodes) {
    const nodeType = node.type?.toLowerCase() || '';
    const isTool = allToolTypes.some(type => nodeType.includes(type.toLowerCase()));

    if (isTool) {
      tools.push({
        nodeId: node.id,
        nodeName: node.name || 'Unnamed Tool',
        toolType: getToolType(node.type),
        specificType: getSpecificToolType(node.type),
        requiresCredentials: true,
        credentialType: node.credentials ? Object.keys(node.credentials)[0] : undefined,
        parameters: node.parameters
      });
    }
  }

  return tools;
}

/**
 * Analiza un workflow completo y detecta todas sus dependencias
 */
export function analyzeWorkflowDependencies(workflowJson: string): WorkflowDependencies {
  try {
    const workflow = JSON.parse(workflowJson);
    const nodes = workflow.nodes || [];

    const subflows = detectSubflows(nodes);
    const databases = detectDatabases(nodes);
    const tools = detectTools(nodes);

    return {
      subflows,
      tools,
      databases,
      hasExternalDependencies: subflows.length > 0 || tools.length > 0 || databases.length > 0
    };
  } catch (error) {
    console.error('Error analyzing workflow dependencies:', error);
    return {
      subflows: [],
      tools: [],
      databases: [],
      hasExternalDependencies: false
    };
  }
}

/**
 * Valida que todas las dependencias estén satisfechas
 */
export function validateDependencies(
  dependencies: WorkflowDependencies,
  uploadedSubflows: Set<string>,
  configuredTools: Set<string>,
  configuredDatabases: Set<string>
): { isValid: boolean; missingItems: string[] } {
  const missing: string[] = [];

  // Validar subflujos
  for (const subflow of dependencies.subflows) {
    if (subflow.isRequired && !uploadedSubflows.has(subflow.nodeId)) {
      missing.push(`Subflow: ${subflow.nodeName}`);
    }
  }

  // Validar herramientas
  for (const tool of dependencies.tools) {
    if (tool.requiresCredentials && !configuredTools.has(tool.nodeId)) {
      missing.push(`Tool: ${tool.nodeName} (${tool.specificType})`);
    }
  }

  // Validar bases de datos
  for (const db of dependencies.databases) {
    if (db.requiresCredentials && !configuredDatabases.has(db.nodeId)) {
      missing.push(`Database: ${db.nodeName} (${db.databaseType})`);
    }
  }

  return {
    isValid: missing.length === 0,
    missingItems: missing
  };
}
