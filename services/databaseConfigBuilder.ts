/**
 * 🔧 Database Config Builder
 * Construye automáticamente realDatabaseConfig basándose en:
 * - Credenciales configuradas
 * - Análisis del workflow (tablas detectadas)
 */

import type { RealDatabaseConfig } from '../types';
import type { WorkflowNode } from '../types';
import { getCredentialById, type Credential } from './credentialsManager';
import { analyzeWorkflowDatabases } from './workflowDatabaseAnalyzer';

export interface AutoDatabaseConfig {
  config: RealDatabaseConfig | null;
  warnings: string[];
}

/**
 * Construye realDatabaseConfig automáticamente
 */
export function buildDatabaseConfig(
  workflow: WorkflowNode[],
  dbCredentials: Map<string, string>,
  rawWorkflowJson?: string
): AutoDatabaseConfig {
  const warnings: string[] = [];
  
  try {
    console.log('\n🔧 [DB Config Builder] Starting database configuration...');
    console.log(`   Credentials configured: ${dbCredentials.size}`);
    console.log(`   Workflow nodes: ${workflow.length}`);
    console.log(`   Raw JSON available: ${!!rawWorkflowJson}`);
    
    // Si no hay credenciales configuradas, no hay nada que hacer
    if (dbCredentials.size === 0) {
      console.log('   ⚠️ No database credentials configured');
      return { config: null, warnings: [] };
    }
    
    // Analizar workflow para detectar tablas
    let workflowNodes: any[] = workflow;
    if (rawWorkflowJson) {
      try {
        const parsed = JSON.parse(rawWorkflowJson);
        workflowNodes = parsed.nodes || workflow;
      } catch (error) {
        console.warn('Could not parse raw workflow JSON for table detection');
      }
    }
    
    const dbInfo = analyzeWorkflowDatabases(workflowNodes);
    
    console.log(`   Tables detected: ${dbInfo.tables.length}`);
    if (dbInfo.tables.length > 0) {
      console.log(`   Tables: ${dbInfo.tables.join(', ')}`);
    }
    
    if (dbInfo.tables.length === 0) {
      warnings.push('No database tables detected in workflow');
      console.log('   ⚠️ No tables detected - check workflow structure');
      return { config: null, warnings };
    }
  
  // Tomar la primera credencial configurada (por ahora solo soportamos 1 BD)
  const firstCredentialId = Array.from(dbCredentials.values())[0];
  console.log(`   Looking for credential ID: ${firstCredentialId}`);
  console.log(`   All credential IDs configured:`, Array.from(dbCredentials.entries()));
  
  const credential = getCredentialById(firstCredentialId);
  
  if (!credential) {
    const errorMsg = `Configured credential not found (ID: ${firstCredentialId})`;
    console.error(`   ❌ ${errorMsg}`);
    console.error(`   💡 Try creating a new credential instead of selecting existing one`);
    warnings.push(errorMsg);
    warnings.push('Try creating a new credential instead of selecting an existing one');
    return { config: null, warnings };
  }
  
  console.log(`   ✅ Credential found: ${credential.name} (${credential.type})`);
  
  // Construir config según tipo de credencial
  let config: RealDatabaseConfig | null = null;
  const credData = credential.data as any; // Type assertion for flexibility
  
  if (!credData) {
    const errorMsg = 'Credential data is empty or invalid';
    console.error(`   ❌ ${errorMsg}`);
    warnings.push(errorMsg);
    return { config: null, warnings };
  }
  
  switch (credential.type as string) {
    case 'supabase':
      if (!credData.url || !credData.key) {
        warnings.push('Supabase credential is missing URL or key');
        console.error('   ❌ Invalid Supabase credential data:', { hasUrl: !!credData.url, hasKey: !!credData.key });
        break;
      }
      config = {
        type: 'supabase',
        url: credData.url,
        key: credData.key,
        tables: dbInfo.tables
      };
      break;
    
    case 'airtable':
      if (!credData.baseId || !credData.apiKey) {
        warnings.push('Airtable credential is missing Base ID or API key');
        break;
      }
      config = {
        type: 'airtable',
        url: `https://api.airtable.com/v0/${credData.baseId}`,
        key: credData.apiKey,
        tables: dbInfo.tables
      };
      break;
    
    case 'google-sheets-oauth':
      config = {
        type: 'google-sheets',
        url: '', // Google Sheets API uses different URL structure
        key: '', // OAuth token would go here
        tables: dbInfo.tables
      };
      warnings.push('Google Sheets database auditing requires additional OAuth setup');
      break;
    
    default:
      warnings.push(`Database type "${credential.type}" not supported for real-time auditing`);
  }
  
  if (config) {
    console.log(`\n✅ [DB Config Builder] Auto-configured database:`, {
      type: config.type,
      tables: config.tables,
      credentialName: credential.name
    });
  }
  
  return { config, warnings };
  
  } catch (error) {
    console.error('❌ [DB Config Builder] Error:', error);
    return { 
      config: null, 
      warnings: [`Error building database config: ${error instanceof Error ? error.message : 'Unknown error'}`] 
    };
  }
}
