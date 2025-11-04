/**
 * 🔗 Integration Config Builder
 * Construye automáticamente integrationConfig basándose en:
 * - Credenciales configuradas para herramientas externas (Email, Calendar)
 * - Análisis del workflow (herramientas detectadas)
 */

import type { DetectedTool, WorkflowDependencies } from './workflowDependencyAnalyzer';
import { getCredentialById, type Credential } from './credentialsManager';

export interface IntegrationConfig {
  enabledIntegrations: {
    email?: { 
      credentialId: string; 
      type: 'gmail-oauth' | 'smtp';
    };
    calendar?: { 
      credentialId: string; 
      type: 'google-calendar-oauth';
    };
  };
  verificationDelay?: number;
}

/**
 * Construye integrationConfig automáticamente a partir de las credenciales de tools
 */
export function buildIntegrationConfig(
  dependencies: WorkflowDependencies | null,
  toolCredentials: Map<string, string>
): IntegrationConfig | null {
  
  if (!dependencies || toolCredentials.size === 0) {
    console.log('🔗 [Integration Builder] No dependencies or credentials - skipping integration config');
    return null;
  }
  
  console.log('\n🔗 [Integration Builder] Building integration config...');
  console.log(`   Tools detected: ${dependencies.tools.length}`);
  console.log(`   Tool credentials: ${toolCredentials.size}`);
  
  const config: IntegrationConfig = {
    enabledIntegrations: {},
    verificationDelay: 3 // 🔥 3 segundos (NO milisegundos - se multiplica por 1000 en IntegrationManager)
  };
  
  let foundIntegrations = false;
  
  // 📧 Buscar herramientas de Email
  const emailTools = dependencies.tools.filter(t => t.toolType === 'email');
  if (emailTools.length > 0) {
    console.log(`   📧 Email tools found: ${emailTools.length}`);
    
    // Buscar credencial para la primera herramienta de email
    const emailTool = emailTools[0];
    const credentialId = toolCredentials.get(emailTool.nodeId);
    
    if (credentialId) {
      const credential = getCredentialById(credentialId);
      
      if (credential) {
        console.log(`   ✅ Email credential found: ${credential.name} (${credential.type})`);
        
        // Mapear tipo de credencial a tipo de integración
        const integrationType = credential.type === 'gmail-oauth' 
          ? 'gmail-oauth' 
          : 'smtp';
        
        config.enabledIntegrations.email = {
          credentialId: credentialId,
          type: integrationType
        };
        
        foundIntegrations = true;
      } else {
        console.warn(`   ⚠️ Email credential ID not found: ${credentialId}`);
      }
    } else {
      console.warn(`   ⚠️ No credential configured for email tool: ${emailTool.nodeId}`);
    }
  }
  
  // 📅 Buscar herramientas de Calendar
  const calendarTools = dependencies.tools.filter(t => t.toolType === 'calendar');
  if (calendarTools.length > 0) {
    console.log(`   📅 Calendar tools found: ${calendarTools.length}`);
    
    // Buscar credencial para la primera herramienta de calendario
    const calendarTool = calendarTools[0];
    const credentialId = toolCredentials.get(calendarTool.nodeId);
    
    if (credentialId) {
      const credential = getCredentialById(credentialId);
      
      if (credential) {
        console.log(`   ✅ Calendar credential found: ${credential.name} (${credential.type})`);
        
        config.enabledIntegrations.calendar = {
          credentialId: credentialId,
          type: 'google-calendar-oauth'
        };
        
        foundIntegrations = true;
      } else {
        console.warn(`   ⚠️ Calendar credential ID not found: ${credentialId}`);
      }
    } else {
      console.warn(`   ⚠️ No credential configured for calendar tool: ${calendarTool.nodeId}`);
    }
  }
  
  if (!foundIntegrations) {
    console.log('   ℹ️ No external tool integrations configured');
    return null;
  }
  
  console.log('   ✅ Integration config built successfully');
  return config;
}
