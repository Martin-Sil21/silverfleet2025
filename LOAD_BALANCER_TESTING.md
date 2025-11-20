# 🧪 Guía de Testing del Load Balancer

## ✅ Test 1: Verificar que el load balancer está activo

### Pasos:
1. Abre el navegador y ve a `http://localhost:3001`
2. Abre la consola del navegador (F12)
3. Inicia cualquier auditoría
4. Busca en la consola logs como:

```
🔧 [LoadBalancer] Inicializadas 5 Gemini APIs
✅ [LoadBalancer] Usando gemini-1 (1 requests, 1 exitosos)
✅ [LoadBalancer] Usando gemini-2 (1 requests, 1 exitosos)
```

### ✅ Resultado esperado:
- Debes ver logs de diferentes APIs (`gemini-1`, `gemini-2`, etc.)
- NO debe usar siempre la misma API

---

## ✅ Test 2: Panel visual de estadísticas

### Pasos:
1. Después de ejecutar una auditoría
2. Busca el panel "🔄 Load Balancer Status" en la UI (justo debajo del header)
3. Haz clic en "▶ Ver detalles"

### ✅ Resultado esperado:
- Panel muestra total de requests
- Success rate cercano al 100%
- Cada API tiene algunos requests (distribución equitativa)
- Todas las APIs marcan ✅ HEALTHY

---

## ✅ Test 3: Round-robin está funcionando

### Pasos:
1. Ejecuta una auditoría con al menos 10 test cases
2. Abre consola y ejecuta:

```javascript
import { getLoadBalancerStats } from './services/aiClientFactory';
const stats = getLoadBalancerStats();
console.table(stats.apiStats.map(api => ({
  id: api.id,
  requests: api.requestCount,
  successes: api.successCount
})));
```

### ✅ Resultado esperado:
```
┌─────────┬──────────┬──────────┬───────────┐
│ (index) │    id    │ requests │ successes │
├─────────┼──────────┼──────────┼───────────┤
│    0    │'gemini-1'│    20    │    20     │
│    1    │'gemini-2'│    20    │    20     │
│    2    │'gemini-3'│    20    │    20     │
│    3    │'gemini-4'│    20    │    20     │
│    4    │'gemini-5'│    20    │    20     │
└─────────┴──────────┴──────────┴───────────┘
```

Cada API debe tener aproximadamente el mismo número de requests.

---

## ✅ Test 4: Circuit breaker (fallo de API)

### Pasos:
1. BACKUP tu archivo `.env` actual
2. Modifica `.env` y cambia una API key por una inválida:

```env
GEMINI_API_KEY_3=INVALID_KEY_FOR_TESTING
```

3. Reinicia el servidor (`Ctrl+C` y `npm run dev`)
4. Ejecuta una auditoría
5. Revisa la consola

### ✅ Resultado esperado:
```
❌ [LoadBalancer] Error con gemini-3: [error message]
🚨 [LoadBalancer] gemini-3 marcada como UNHEALTHY (3 errores consecutivos)
✅ [LoadBalancer] Usando gemini-4 (requests continuando normalmente)
```

- Las auditorías siguen funcionando (usa otras APIs)
- En el panel UI, `gemini-3` debe aparecer como 🚨 UNHEALTHY

6. **IMPORTANTE**: Restaura tu `.env` con la key correcta y reinicia

---

## ✅ Test 5: Recovery automático

### Pasos:
1. Después del Test 4, deja la API inválida
2. Espera 60 segundos (UNHEALTHY_COOLDOWN)
3. Ejecuta otra auditoría
4. Revisa logs

### ✅ Resultado esperado:
```
♻️ [LoadBalancer] gemini-3 recuperándose del circuit breaker
[gemini-3 intentará usarse de nuevo]
```

Si la key sigue siendo inválida, volverá a marcarla como UNHEALTHY.
Si restauraste la key, debería funcionar.

---

## ✅ Test 6: Reporte detallado en consola

### Pasos:
1. Ejecuta una auditoría completa
2. En el panel UI, haz clic en "📋 Ver Reporte en Consola"
3. O ejecuta en consola:

```javascript
printLoadBalancerReport();
```

### ✅ Resultado esperado:
```
================================================================================
📊 REPORTE DE LOAD BALANCER
================================================================================
Total Requests: 120
Exitosos: 118 (98.3%)
Fallidos: 2 (1.7%)

Distribución:
  Gemini: 120 requests (100.0%)
  OpenAI: 0 requests (0.0%)
  Fallbacks a OpenAI: 0

Tiempo de respuesta promedio: 1250ms

📋 Estado por API:
  gemini-1: ✅ HEALTHY | 24 reqs | 100.0% éxito | 1200ms avg
  gemini-2: ✅ HEALTHY | 24 reqs | 100.0% éxito | 1300ms avg
  gemini-3: ✅ HEALTHY | 24 reqs | 100.0% éxito | 1400ms avg
  gemini-4: ✅ HEALTHY | 24 reqs | 100.0% éxito | 1150ms avg
  gemini-5: ✅ HEALTHY | 24 reqs | 100.0% éxito | 1250ms avg
================================================================================
```

---

## ✅ Test 7: Performance (5x más capacidad)

### Antes (1 API key):
- 50 test cases → ~5 minutos (debido a rate limits)

### Ahora (5 API keys):
- 50 test cases → ~1 minuto (distribución de carga)

### Pasos:
1. Configura una auditoría con 50 test cases
2. Ejecuta y mide el tiempo
3. Compara con ejecuciones anteriores

### ✅ Resultado esperado:
- **Reducción de tiempo de ~80%** en auditorías grandes
- Sin errores de rate limit

---

## ❌ Tests de Errores Comunes

### Error: "No hay APIs disponibles"

**Causa**: No hay API keys en `.env`

**Verificar**:
```bash
cat .env | grep GEMINI_API_KEY
```

Debe mostrar 5 keys.

---

### Error: Panel de stats no aparece

**Causa normal**: No se han ejecutado requests todavía

**Solución**: Ejecuta una auditoría primero

---

### Error: Todas las APIs fallan

**Posibles causas**:
1. API keys inválidas
2. Problema de red
3. Rate limit global de Google

**Diagnóstico**:
```javascript
const stats = getLoadBalancerStats();
stats.apiStats.forEach(api => {
  console.log(`${api.id}: ${api.isHealthy ? 'OK' : api.lastError}`);
});
```

---

## 📊 Métricas de Éxito

Después de ejecutar todos los tests, deberías tener:

✅ **Success rate**: > 95%  
✅ **Distribución**: Cada API con ~20% de los requests  
✅ **Tiempo de respuesta**: < 2000ms promedio  
✅ **Circuit breaker**: Funciona correctamente  
✅ **Recovery**: APIs se recuperan después de 60s  
✅ **UI**: Panel muestra datos en tiempo real  

---

## 🎓 Testing Avanzado

### Test de Carga (opcional)

Para probar con tráfico intenso:

```typescript
// En consola del navegador
for (let i = 0; i < 100; i++) {
  getAIClient().then(ai => {
    console.log(`Request ${i} completado`);
  });
}
```

Esto ejecutará 100 requests en paralelo y deberías ver distribución equitativa.

---

## ✅ Checklist Final

Antes de considerar el testing completo:

- [ ] Logs muestran rotación entre APIs ✅
- [ ] Panel UI funciona correctamente ✅
- [ ] Round-robin distribuye equitativamente ✅
- [ ] Circuit breaker detecta APIs fallidas ✅
- [ ] Recovery automático funciona ✅
- [ ] Reporte en consola genera output correcto ✅
- [ ] Performance mejoró vs versión anterior ✅

Si todos los checks están ✅, el load balancer está **listo para producción**. 🚀

---

**¿Problemas?** Revisa `LOAD_BALANCER_DOCUMENTATION.md` sección "Troubleshooting".
