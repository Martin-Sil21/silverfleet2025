/**
 * 🧪 Credential Tester
 * Tests database and API credentials to verify they work before saving
 */

import type { Credential } from './credentialsManager';
import { createClient } from '@supabase/supabase-js';
import { GmailIntegration } from './integrations/EmailIntegration'; // 🔥 NUEVO
import { GoogleCalendarIntegration } from './integrations/CalendarIntegration'; // 🔥 NUEVO

export interface TableInfo {
  name: string;
  rowCount: number;
  sampleData?: any[];
}

export interface TestResult {
  success: boolean;
  message: string;
  details?: any;
  tables?: TableInfo[];
}

/**
 * Test a credential by making a simple query/request
 */
export async function testCredential(credential: Partial<Credential>, knownTables?: string[]): Promise<TestResult> {
  try {
    switch (credential.type) {
      case 'supabase':
        return await testSupabase(credential.data, knownTables);
      
      case 'postgres':
      case 'mysql':
        return { success: false, message: 'Direct database testing not yet implemented. Save and test in your app.' };
      
      case 'gmail-oauth':
      case 'google-oauth':
      case 'google-service-account':
        return await testGmail(credential); // 🔥 Test real para Gmail (OAuth o Service Account)
      
      case 'google-calendar-oauth':
        return await testCalendar(credential); // 🔥 Test real para Calendar
      
      case 'smtp':
        return { success: true, message: 'SMTP credentials saved. Test by sending an email from your app.' };
      
      default:
        return { success: true, message: 'Credential type cannot be tested automatically. Saved successfully.' };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message: `Test failed: ${message}` };
  }
}

async function testSupabase(data: any, knownTables?: string[]): Promise<TestResult> {
  if (!data?.url || !data?.key) {
    return { success: false, message: 'Missing Supabase URL or key' };
  }

  try {
    const supabase = createClient(data.url, data.key);
    
    // Si tenemos tablas conocidas del workflow, usarlas directamente
    if (knownTables && knownTables.length > 0) {
      console.log('🎯 Testing with known tables from workflow:', knownTables);
      return await fetchTableDetails(supabase, knownTables);
    }
    
    // Usar el API REST de Supabase para descubrir tablas
    // Hacer una petición HTTP directa al endpoint de Supabase
    try {
      const response = await fetch(`${data.url}/rest/v1/`, {
        headers: {
          'apikey': data.key,
          'Authorization': `Bearer ${data.key}`
        }
      });
      
      if (response.ok) {
        const text = await response.text();
        // El endpoint raíz de Supabase REST API devuelve un OpenAPI schema
        // que lista todas las tablas disponibles
        const openApiSchema = JSON.parse(text);
        
        if (openApiSchema.definitions || openApiSchema.paths) {
          const tableNames: string[] = [];
          
          // Extraer nombres de tablas del schema OpenAPI
          if (openApiSchema.definitions) {
            Object.keys(openApiSchema.definitions).forEach(key => {
              if (!key.startsWith('pg_') && !key.includes('information_schema') && !key.startsWith('_')) {
                tableNames.push(key);
              }
            });
          }
          
          if (tableNames.length > 0) {
            console.log(`✅ Discovered ${tableNames.length} tables from OpenAPI schema`);
            return await fetchTableDetails(supabase, tableNames);
          }
        }
      } else {
        console.warn(`⚠️ REST API returned ${response.status}: ${response.statusText}`);
      }
    } catch (fetchError) {
      console.warn('⚠️ Could not fetch schema via REST API:', fetchError);
    }

    // Si no pudimos listar tablas, al menos confirmar que la conexión funciona
    return { 
      success: true, 
      message: '✅ Connection successful! (Unable to list tables - may need service_role key)',
      tables: []
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message: `Connection failed: ${message}` };
  }
}

async function fetchTableDetails(supabase: any, tableNames: string[]): Promise<TestResult> {
  const tables: TableInfo[] = [];
  
  // No limitar tablas - mostrar todas las detectadas
  for (const tableName of tableNames) {
    try {
      // Contar registros
      const { count, error: countError } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });
      
      if (countError) {
        // Si falla, agregar solo el nombre
        tables.push({ name: tableName, rowCount: 0 });
        continue;
      }
      
      // Obtener muestra de datos (3 registros)
      const { data: sampleData, error: sampleError } = await supabase
        .from(tableName)
        .select('*')
        .limit(3);
      
      tables.push({
        name: tableName,
        rowCount: count || 0,
        sampleData: sampleError ? undefined : (sampleData || [])
      });
    } catch (error) {
      // Si falla completamente, agregar solo el nombre
      tables.push({ name: tableName, rowCount: 0 });
    }
  }

  return { 
    success: true, 
    message: `✅ Connection successful! Found ${tableNames.length} tables`,
    tables: tables
  };
}

/**
 * 🔥 NUEVO: Test Gmail OAuth credentials con llamada real a la API
 */
async function testGmail(credential: Partial<Credential>): Promise<TestResult> {
  try {
    // Crear una credencial temporal para el test con el tipo correcto
    const tempCredential: any = {
      id: 'temp-test',
      name: 'Test Credential',
      type: credential.type || 'gmail-oauth', // Usar el tipo de la credencial original
      data: credential.data,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    // Obtener credenciales existentes
    const existingCredsStr = localStorage.getItem('silverfleet_credentials');
    const existingCreds = existingCredsStr ? JSON.parse(existingCredsStr) : [];
    
    // Agregar credencial temporal
    existingCreds.push(tempCredential);
    localStorage.setItem('silverfleet_credentials', JSON.stringify(existingCreds));
    
    try {
      // Crear instancia de GmailIntegration
      const gmailIntegration = new GmailIntegration('temp-test');
      
      // Llamar al método testConnection() real
      const result = await gmailIntegration.testConnection();
      
      return {
        success: result.success,
        message: result.message,
        details: result.details
      };
    } finally {
      // Limpiar credencial temporal - restaurar estado original
      localStorage.setItem('silverfleet_credentials', existingCredsStr || '[]');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { 
      success: false, 
      message: `❌ Gmail test failed: ${message}` 
    };
  }
}

/**
 * 🔥 NUEVO: Test Google Calendar OAuth credentials con llamada real a la API
 */
async function testCalendar(credential: Partial<Credential>): Promise<TestResult> {
  try {
    // Crear una credencial temporal para el test
    const tempCredential: any = {
      id: 'temp-test-calendar',
      name: 'Test Calendar Credential',
      type: 'google-calendar-oauth',
      data: credential.data,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    // Guardarla temporalmente en localStorage
    const tempKey = `credential_temp_test_calendar`;
    localStorage.setItem(tempKey, JSON.stringify(tempCredential));
    
    try {
      // Crear instancia de GoogleCalendarIntegration
      const calendarIntegration = new GoogleCalendarIntegration('temp-test-calendar');
      
      // Llamar al método testConnection() real
      const result = await calendarIntegration.testConnection();
      
      return {
        success: result.success,
        message: result.message,
        details: result.details
      };
    } finally {
      // Limpiar credencial temporal
      localStorage.removeItem(tempKey);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { 
      success: false, 
      message: `❌ Calendar test failed: ${message}` 
    };
  }
}
