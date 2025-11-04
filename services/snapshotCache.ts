/**
 * 🚀 Snapshot Cache - Evita consultas duplicadas a BD
 * 
 * Cuando múltiples conversaciones corren en paralelo, todas intentan
 * tomar snapshots de las mismas tablas al mismo tiempo.
 * 
 * Este caché deduplica las consultas para que solo se haga UNA request
 * por tabla cada X segundos.
 */

export interface CachedSnapshot {
  data: any;
  timestamp: number;
  tableName: string;
}

class SnapshotCache {
  private cache: Map<string, CachedSnapshot> = new Map();
  private pendingPromises: Map<string, Promise<any>> = new Map();
  private readonly CACHE_TTL_MS = 2000; // 2 segundos de caché

  /**
   * Obtiene un snapshot con deduplicación
   * Si ya hay una consulta en curso para esta tabla, espera a que termine
   * Si hay un snapshot reciente (< 2s), lo retorna del caché
   */
  async getOrFetch(
    tableName: string,
    fetchFn: () => Promise<any>
  ): Promise<any> {
    const cacheKey = tableName;
    const now = Date.now();

    // 1️⃣ Verificar si hay snapshot en caché (< 2s de antigüedad)
    const cached = this.cache.get(cacheKey);
    if (cached && (now - cached.timestamp) < this.CACHE_TTL_MS) {
      console.log(`📦 [SnapshotCache] Cache HIT para "${tableName}" (${now - cached.timestamp}ms old)`);
      return cached.data;
    }

    // 2️⃣ Verificar si ya hay una consulta en progreso para esta tabla
    const pending = this.pendingPromises.get(cacheKey);
    if (pending) {
      console.log(`⏳ [SnapshotCache] Esperando consulta en progreso para "${tableName}"...`);
      return pending;
    }

    // 3️⃣ Hacer la consulta y cachearla
    console.log(`🔍 [SnapshotCache] Cache MISS - Consultando "${tableName}"...`);
    const promise = fetchFn().then(data => {
      // Guardar en caché
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        tableName
      });
      
      // Limpiar de pendientes
      this.pendingPromises.delete(cacheKey);
      
      console.log(`✅ [SnapshotCache] Consultado y cacheado "${tableName}"`);
      return data;
    }).catch(error => {
      // En caso de error, también limpiar de pendientes
      this.pendingPromises.delete(cacheKey);
      throw error;
    });

    // Registrar como pendiente
    this.pendingPromises.set(cacheKey, promise);
    
    return promise;
  }

  /**
   * Limpia el caché (llamar al finalizar auditoría)
   */
  clear(): void {
    console.log(`🧹 [SnapshotCache] Limpiando caché (${this.cache.size} entradas)`);
    this.cache.clear();
    this.pendingPromises.clear();
  }

  /**
   * Limpia entradas antiguas (> 5 segundos)
   */
  cleanOldEntries(): void {
    const now = Date.now();
    const MAX_AGE_MS = 5000; // 5 segundos
    
    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > MAX_AGE_MS) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Retorna estadísticas del caché
   */
  getStats() {
    return {
      cachedEntries: this.cache.size,
      pendingQueries: this.pendingPromises.size,
      entries: Array.from(this.cache.values()).map(c => ({
        table: c.tableName,
        age: Date.now() - c.timestamp
      }))
    };
  }
}

// Instancia global singleton
const globalSnapshotCache = new SnapshotCache();

export default globalSnapshotCache;
