import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getDatabaseForConversation } from './databaseService';

/**
 * Wrapper de Supabase que automáticamente registra operaciones en el mock database
 * para propósitos de auditoría.
 * 
 * Uso en tu endpoint/webhook de n8n:
 * 
 * const supabase = createAuditedSupabase(conversationId, supabaseUrl, supabaseKey);
 * const data = await supabase.from('productos').select('*'); // Se registra automáticamente
 */

interface AuditedSupabaseClient extends SupabaseClient {
  _conversationId: string;
}

export const createAuditedSupabase = (
  conversationId: string,
  supabaseUrl: string,
  supabaseKey: string
): SupabaseClient => {
  const client = createClient(supabaseUrl, supabaseKey) as AuditedSupabaseClient;
  client._conversationId = conversationId;

  // Interceptar el método `from` para trackear operaciones
  const originalFrom = client.from.bind(client);
  
  client.from = (table: string) => {
    const tableInstance = originalFrom(table);
    const mockDb = getDatabaseForConversation(conversationId);

    // Wrapper para SELECT
    const originalSelect = tableInstance.select.bind(tableInstance);
    tableInstance.select = (...args: any[]) => {
      console.log(`[Audit] 📖 SELECT from ${table} (conversation: ${conversationId})`);
      if (mockDb) {
        // Registrar operación de lectura en el mock
        mockDb.query(table);
      }
      return originalSelect(...args);
    };

    // Wrapper para INSERT
    const originalInsert = tableInstance.insert.bind(tableInstance);
    tableInstance.insert = (data: any, ...args: any[]) => {
      console.log(`[Audit] ✍️ INSERT into ${table}`, data);
      if (mockDb) {
        // Registrar operación de escritura en el mock
        mockDb.insert(table, data);
      }
      return originalInsert(data, ...args);
    };

    // Wrapper para UPDATE
    const originalUpdate = tableInstance.update.bind(tableInstance);
    tableInstance.update = (data: any, ...args: any[]) => {
      console.log(`[Audit] 🔄 UPDATE in ${table}`, data);
      if (mockDb) {
        // Registrar operación de actualización en el mock
        mockDb.update(table, () => true, data); // Actualiza todos (simplificación)
      }
      return originalUpdate(data, ...args);
    };

    // Wrapper para DELETE
    const originalDelete = tableInstance.delete.bind(tableInstance);
    tableInstance.delete = (...args: any[]) => {
      console.log(`[Audit] 🗑️ DELETE from ${table}`);
      if (mockDb) {
        // Registrar operación de eliminación en el mock
        mockDb.delete(table, () => true); // Elimina todos (simplificación)
      }
      return originalDelete(...args);
    };

    return tableInstance;
  };

  return client;
};

/**
 * Helper para usar en n8n Code node
 * 
 * Ejemplo de uso en n8n:
 * 
 * const { createAuditedSupabase } = require('./services/supabaseAuditWrapper');
 * 
 * const conversationId = $json.conversationId;
 * const supabase = createAuditedSupabase(
 *   conversationId,
 *   'https://tu-proyecto.supabase.co',
 *   'tu-api-key'
 * );
 * 
 * // Usar normalmente
 * const { data, error } = await supabase
 *   .from('productos')
 *   .select('*')
 *   .eq('id', productoId);
 * 
 * // La operación se registra automáticamente en la auditoría!
 */

export const createSupabaseHelpers = (conversationId: string, supabaseUrl: string, supabaseKey: string) => {
  const supabase = createAuditedSupabase(conversationId, supabaseUrl, supabaseKey);
  
  return {
    supabase,
    
    // Helper: Buscar un producto
    async buscarProducto(nombre: string) {
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .ilike('nombre', `%${nombre}%`)
        .limit(1)
        .single();
      
      if (error) throw error;
      return data;
    },
    
    // Helper: Crear cliente
    async crearCliente(nombre: string, telefono: string, email?: string) {
      const { data, error } = await supabase
        .from('clientes')
        .insert({ nombre, telefono, email })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    
    // Helper: Crear pedido
    async crearPedido(clienteId: string, productos: any[], total: number) {
      const { data, error } = await supabase
        .from('pedidos')
        .insert({
          cliente_id: clienteId,
          productos,
          total,
          estado: 'pendiente'
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    
    // Helper: Actualizar stock
    async actualizarStock(productoId: string, cantidad: number) {
      const { data, error } = await supabase
        .from('productos')
        .update({ stock: cantidad })
        .eq('id', productoId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    }
  };
};


