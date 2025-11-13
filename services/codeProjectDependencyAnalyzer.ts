/**
 * 🔍 Code Project Dependency Analyzer
 * 
 * Analiza dependencias de proyectos ZIP:
 * - Bases de datos
 * - Herramientas externas (Email, Calendar, etc.)
 * - APIs externas
 * - Credenciales requeridas
 * 
 * Similar a workflowDependencyAnalyzer.ts pero para código fuente
 */

import type { ParsedCodeProject, DetectedDatabase, DetectedTool, DetectedAPI } from '../types';

export interface CodeProjectDependencies {
  databases: DetectedDatabase[];
  tools: DetectedTool[];
  apis: DetectedAPI[];
  credentials: {
    database: Array<{ provider: string; requiredFields: string[] }>;
    tools: Array<{ tool: string; requiredFields: string[] }>;
    apis: Array<{ api: string; requiredFields: string[] }>;
  };
}

/**
 * Analiza dependencias del proyecto ZIP
 */
export const analyzeCodeProjectDependencies = (codeProject: ParsedCodeProject): CodeProjectDependencies => {
  const result: CodeProjectDependencies = {
    databases: codeProject.databases,
    tools: codeProject.tools,
    apis: codeProject.apis,
    credentials: {
      database: [],
      tools: [],
      apis: [],
    },
  };

  // Mapear bases de datos a campos de credencial requeridos
  for (const db of codeProject.databases) {
    const requiredFields: string[] = [];
    
    switch (db.provider.toLowerCase()) {
      case 'postgresql':
      case 'postgres':
        requiredFields.push('host', 'port', 'username', 'password', 'database');
        break;
      case 'mongodb':
      case 'mongo':
        requiredFields.push('connection_string', 'username', 'password');
        break;
      case 'mysql':
        requiredFields.push('host', 'port', 'username', 'password', 'database');
        break;
      case 'supabase':
        requiredFields.push('url', 'key', 'service_role_key');
        break;
      case 'firebase':
        requiredFields.push('project_id', 'private_key', 'client_email');
        break;
      case 'redis':
        requiredFields.push('host', 'port', 'password');
        break;
      case 'dynamodb':
        requiredFields.push('access_key_id', 'secret_access_key', 'region');
        break;
    }
    
    if (requiredFields.length > 0) {
      result.credentials.database.push({
        provider: db.provider,
        requiredFields,
      });
    }
  }

  // Mapear herramientas a campos de credencial requeridos
  for (const tool of codeProject.tools) {
    const requiredFields: string[] = [];
    
    switch (tool.type.toLowerCase()) {
      case 'email':
        requiredFields.push('smtp_host', 'smtp_port', 'email', 'password');
        if (tool.name.toLowerCase().includes('gmail')) {
          requiredFields.push('oauth_token', 'refresh_token');
        }
        break;
      case 'calendar':
        requiredFields.push('api_key', 'calendar_id');
        if (tool.name.toLowerCase().includes('google')) {
          requiredFields.push('oauth_token');
        }
        break;
      case 'messaging':
        if (tool.name.toLowerCase().includes('slack')) {
          requiredFields.push('bot_token', 'app_token');
        } else if (tool.name.toLowerCase().includes('telegram')) {
          requiredFields.push('bot_token', 'chat_id');
        } else if (tool.name.toLowerCase().includes('discord')) {
          requiredFields.push('bot_token', 'channel_id');
        } else if (tool.name.toLowerCase().includes('twilio')) {
          requiredFields.push('account_sid', 'auth_token', 'phone_number');
        }
        break;
      case 'crm':
        if (tool.name.toLowerCase().includes('salesforce')) {
          requiredFields.push('client_id', 'client_secret', 'username', 'password');
        } else if (tool.name.toLowerCase().includes('hubspot')) {
          requiredFields.push('api_key');
        } else if (tool.name.toLowerCase().includes('pipedrive')) {
          requiredFields.push('api_token');
        }
        break;
      case 'storage':
        if (tool.name.toLowerCase().includes('s3')) {
          requiredFields.push('access_key_id', 'secret_access_key', 'bucket_name', 'region');
        } else if (tool.name.toLowerCase().includes('firebase')) {
          requiredFields.push('api_key', 'bucket_name');
        }
        break;
      case 'payment':
        if (tool.name.toLowerCase().includes('stripe')) {
          requiredFields.push('api_key', 'webhook_secret');
        } else if (tool.name.toLowerCase().includes('paypal')) {
          requiredFields.push('client_id', 'client_secret');
        }
        break;
    }
    
    if (requiredFields.length > 0) {
      result.credentials.tools.push({
        tool: tool.name,
        requiredFields,
      });
    }
  }

  // Mapear APIs a campos de credencial requeridos
  for (const api of codeProject.apis) {
    const requiredFields: string[] = [];
    
    switch (api.service.toLowerCase()) {
      case 'openai':
        requiredFields.push('api_key', 'organization_id');
        break;
      case 'gemini':
      case 'google':
        requiredFields.push('api_key');
        break;
      case 'anthropic':
        requiredFields.push('api_key');
        break;
      case 'huggingface':
        requiredFields.push('api_token', 'repo_id');
        break;
    }
    
    if (requiredFields.length > 0) {
      result.credentials.apis.push({
        api: api.service,
        requiredFields,
      });
    }
  }

  return result;
};

/**
 * Valida que todas las dependencias requeridas estén configuradas
 */
export const validateCodeProjectDependencies = (
  dependencies: CodeProjectDependencies,
  configuredCredentials: Map<string, string>
): { valid: boolean; missing: string[] } => {
  const missing: string[] = [];

  // Verificar bases de datos
  for (const db of dependencies.credentials.database) {
    const credentialId = configuredCredentials.get(db.provider);
    if (!credentialId) {
      missing.push(`Database: ${db.provider}`);
    }
  }

  // Verificar herramientas
  for (const tool of dependencies.credentials.tools) {
    const credentialId = configuredCredentials.get(tool.tool);
    if (!credentialId) {
      missing.push(`Tool: ${tool.tool}`);
    }
  }

  // Verificar APIs
  for (const api of dependencies.credentials.apis) {
    const credentialId = configuredCredentials.get(api.api);
    if (!credentialId) {
      missing.push(`API: ${api.api}`);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
};
