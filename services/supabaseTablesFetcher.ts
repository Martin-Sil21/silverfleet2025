import { createClient } from '@supabase/supabase-js';

/**
 * Fetches available tables from Supabase using the REST API introspection
 */
export const fetchSupabaseTables = async (url: string, key: string): Promise<string[]> => {
  try {
    // Use the Supabase REST API to introspect the schema
    const response = await fetch(`${url}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Error al conectar: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // The root endpoint returns OpenAPI spec with table definitions
    if (data.definitions) {
      const tables = Object.keys(data.definitions).filter(key => {
        // Filter out internal tables and views
        return !key.startsWith('_') && 
               !key.includes('pg_') && 
               !key.includes('information_schema');
      });
      return tables.sort();
    }

    // Fallback: try to get tables from paths in OpenAPI spec
    if (data.paths) {
      const tables = Object.keys(data.paths)
        .map(path => path.replace(/^\//, '').split('?')[0])
        .filter(table => table && !table.startsWith('_') && !table.includes('rpc'))
        .filter((v, i, a) => a.indexOf(v) === i); // unique
      return tables.sort();
    }

    throw new Error('No se pudo obtener la estructura de la base de datos. Verifica los permisos.');
  } catch (error) {
    console.error('Error fetching Supabase tables:', error);
    if (error instanceof Error) {
      throw new Error(`Error al obtener tablas: ${error.message}`);
    }
    throw new Error('Error desconocido al conectar con Supabase');
  }
};

/**
 * Test connection to Supabase
 */
export const testSupabaseConnection = async (url: string, key: string): Promise<boolean> => {
  try {
    const response = await fetch(`${url}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
    });
    
    return response.ok;
  } catch (error) {
    console.error('Connection test failed:', error);
    return false;
  }
};

