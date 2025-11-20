# 📚 Ejemplos Prácticos de Uso del Load Balancer

## Ejemplo 1: Uso Básico (reemplazar código antiguo)

### ❌ Antes (código viejo):
```typescript
import { GoogleGenAI } from "@google/genai";

async function miFunction() {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: 'Hola, ¿cómo estás?'
  });
  
  return response.text;
}
```

### ✅ Ahora (código nuevo):
```typescript
import { getAIClient } from './services/aiClientFactory';

async function miFunction() {
  const ai = await getAIClient(); // ← Load balancing automático
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: 'Hola, ¿cómo estás?'
  });
  
  return response.text;
}
```

**¡Es así de simple!** Solo cambia `new GoogleGenAI()` por `await getAIClient()`.

---

## Ejemplo 2: Verificar Estado del Load Balancer

```typescript
import { getLoadBalancerStats } from './services/aiClientFactory';

function mostrarEstadoAPIs() {
  const stats = getLoadBalancerStats();
  
  console.log(`📊 Estadísticas del Load Balancer:`);
  console.log(`Total requests: ${stats.totalRequests}`);
  console.log(`Success rate: ${(stats.successfulRequests/stats.totalRequests*100).toFixed(1)}%`);
  console.log(`\n📋 Estado por API:`);
  
  stats.apiStats.forEach(api => {
    const status = api.isHealthy ? '✅' : '🚨';
    const successRate = api.requestCount > 0 
      ? (api.successCount / api.requestCount * 100).toFixed(1) 
      : '0';
    
    console.log(`  ${status} ${api.id}: ${api.requestCount} reqs, ${successRate}% éxito, ${api.avgResponseTime.toFixed(0)}ms avg`);
  });
}

// Llamar después de ejecutar auditorías
mostrarEstadoAPIs();
```

**Output esperado**:
```
📊 Estadísticas del Load Balancer:
Total requests: 100
Success rate: 98.0%

📋 Estado por API:
  ✅ gemini-1: 20 reqs, 100.0% éxito, 1200ms avg
  ✅ gemini-2: 20 reqs, 95.0% éxito, 1350ms avg
  ✅ gemini-3: 20 reqs, 100.0% éxito, 1180ms avg
  ✅ gemini-4: 20 reqs, 100.0% éxito, 1220ms avg
  ✅ gemini-5: 20 reqs, 95.0% éxito, 1280ms avg
```

---

## Ejemplo 3: Ejecutar Múltiples Requests en Paralelo

```typescript
import { getAIClient } from './services/aiClientFactory';

async function ejecutarVariasConsultas() {
  const preguntas = [
    '¿Cuál es la capital de Francia?',
    '¿Quién escribió Don Quijote?',
    '¿Cuánto es 2+2?',
    '¿Qué es TypeScript?',
    '¿Cuál es el océano más grande?'
  ];
  
  // Ejecutar todas las consultas en paralelo
  const respuestas = await Promise.all(
    preguntas.map(async (pregunta) => {
      const ai = await getAIClient(); // Cada una usa una API diferente
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: pregunta
      });
      return { pregunta, respuesta: response.text };
    })
  );
  
  console.log(respuestas);
}

ejecutarVariasConsultas();
```

**Resultado**: Las 5 preguntas se ejecutan en paralelo, cada una con una API diferente, completándose en ~1 segundo total en lugar de ~5 segundos secuenciales.

---

## Ejemplo 4: Retry Automático con executeWithRetry

```typescript
import { executeWithRetry, getAIClient } from './services/aiClientFactory';

async function operacionCritica() {
  try {
    const resultado = await executeWithRetry(
      async (ai) => {
        // Esta operación se reintentará hasta 3 veces si falla
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-pro',
          contents: 'Analiza este documento importante...'
        });
        return response.text;
      },
      3 // máximo 3 intentos
    );
    
    console.log('✅ Operación exitosa:', resultado);
  } catch (error) {
    console.error('❌ Operación falló después de 3 intentos:', error);
  }
}

operacionCritica();
```

**Comportamiento**:
- Si el primer intento falla, espera 1 segundo y reintenta con otra API
- Si el segundo falla, espera 2 segundos y reintenta
- Si el tercero falla, lanza el error

---

## Ejemplo 5: Monitoreo en Tiempo Real

```typescript
import { getLoadBalancerStats } from './services/aiClientFactory';

// Actualizar estadísticas cada 2 segundos
setInterval(() => {
  const stats = getLoadBalancerStats();
  
  // Mostrar solo si hay actividad
  if (stats.totalRequests > 0) {
    console.clear();
    console.log('🔄 Load Balancer Status (actualizado cada 2s)');
    console.log('='.repeat(60));
    console.log(`Total: ${stats.totalRequests} | Éxito: ${stats.successfulRequests} | Fallidos: ${stats.failedRequests}`);
    console.log(`Success Rate: ${(stats.successfulRequests/stats.totalRequests*100).toFixed(1)}%`);
    console.log(`Avg Response Time: ${stats.avgResponseTime.toFixed(0)}ms`);
    
    // Alertar si alguna API está unhealthy
    const unhealthyAPIs = stats.apiStats.filter(api => !api.isHealthy);
    if (unhealthyAPIs.length > 0) {
      console.log('\n⚠️ APIs CON PROBLEMAS:');
      unhealthyAPIs.forEach(api => {
        console.log(`  🚨 ${api.id}: ${api.lastError}`);
      });
    }
  }
}, 2000);
```

---

## Ejemplo 6: Integración con React Component

```tsx
import React, { useState, useEffect } from 'react';
import { getLoadBalancerStats } from '../services/aiClientFactory';

const MyComponent: React.FC = () => {
  const [stats, setStats] = useState(null);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(getLoadBalancerStats());
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);
  
  if (!stats || stats.totalRequests === 0) {
    return null;
  }
  
  return (
    <div className="p-4 bg-gray-100 rounded">
      <h3>🔄 Load Balancer Stats</h3>
      <div className="grid grid-cols-3 gap-2">
        <div>Total: {stats.totalRequests}</div>
        <div>Success: {stats.successfulRequests}</div>
        <div>Failed: {stats.failedRequests}</div>
      </div>
      
      <div className="mt-2">
        {stats.apiStats.map(api => (
          <div key={api.id} className={api.isHealthy ? 'text-green-600' : 'text-red-600'}>
            {api.isHealthy ? '✅' : '🚨'} {api.id}: {api.requestCount} reqs
          </div>
        ))}
      </div>
    </div>
  );
};

export default MyComponent;
```

---

## Ejemplo 7: Logging Avanzado

```typescript
import { getAIClient } from './services/aiClientFactory';

async function consultaConLogging(pregunta: string) {
  const startTime = Date.now();
  
  try {
    console.log(`📤 Enviando: "${pregunta}"`);
    
    const ai = await getAIClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: pregunta
    });
    
    const responseTime = Date.now() - startTime;
    console.log(`✅ Respuesta recibida en ${responseTime}ms`);
    console.log(`📥 Respuesta: "${response.text.substring(0, 100)}..."`);
    
    return response.text;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ Error después de ${responseTime}ms:`, error);
    throw error;
  }
}

// Uso
consultaConLogging('¿Cuál es el sentido de la vida?');
```

**Output esperado**:
```
📤 Enviando: "¿Cuál es el sentido de la vida?"
✅ [LoadBalancer] Usando gemini-3 (15 requests, 14 exitosos)
✅ Respuesta recibida en 1245ms
📥 Respuesta: "El sentido de la vida es una pregunta filosófica que ha sido debatida durante siglos..."
```

---

## Ejemplo 8: Dashboard de Salud de APIs

```typescript
import { getLoadBalancerStats } from './services/aiClientFactory';

function generarDashboardHTML() {
  const stats = getLoadBalancerStats();
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Load Balancer Dashboard</title>
      <style>
        body { font-family: Arial; padding: 20px; }
        .healthy { color: green; }
        .unhealthy { color: red; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      </style>
    </head>
    <body>
      <h1>🔄 Load Balancer Dashboard</h1>
      
      <h2>📊 Resumen Global</h2>
      <ul>
        <li>Total Requests: ${stats.totalRequests}</li>
        <li>Success Rate: ${(stats.successfulRequests/stats.totalRequests*100).toFixed(1)}%</li>
        <li>Avg Response Time: ${stats.avgResponseTime.toFixed(0)}ms</li>
      </ul>
      
      <h2>📋 Estado por API</h2>
      <table>
        <tr>
          <th>API</th>
          <th>Estado</th>
          <th>Requests</th>
          <th>Success Rate</th>
          <th>Avg Time</th>
        </tr>
        ${stats.apiStats.map(api => `
          <tr class="${api.isHealthy ? 'healthy' : 'unhealthy'}">
            <td>${api.id}</td>
            <td>${api.isHealthy ? '✅ HEALTHY' : '🚨 UNHEALTHY'}</td>
            <td>${api.requestCount}</td>
            <td>${api.requestCount > 0 ? (api.successCount/api.requestCount*100).toFixed(1) : '0'}%</td>
            <td>${api.avgResponseTime.toFixed(0)}ms</td>
          </tr>
        `).join('')}
      </table>
      
      <p><small>Generado: ${new Date().toLocaleString()}</small></p>
    </body>
    </html>
  `;
  
  return html;
}

// Generar y guardar dashboard
const dashboardHTML = generarDashboardHTML();
// Puedes guardarlo en un archivo o mostrarlo en una ventana
```

---

## Ejemplo 9: Alertas Automáticas

```typescript
import { getLoadBalancerStats } from './services/aiClientFactory';

let lastAlertTime = 0;
const ALERT_COOLDOWN = 60000; // 1 minuto entre alertas

function verificarSaludAPIs() {
  const stats = getLoadBalancerStats();
  const now = Date.now();
  
  // Verificar success rate global
  if (stats.totalRequests > 10) {
    const successRate = (stats.successfulRequests / stats.totalRequests) * 100;
    
    if (successRate < 90 && now - lastAlertTime > ALERT_COOLDOWN) {
      console.error(`🚨 ALERTA: Success rate bajo: ${successRate.toFixed(1)}%`);
      // Aquí podrías enviar un email, webhook, etc.
      lastAlertTime = now;
    }
  }
  
  // Verificar APIs individuales
  stats.apiStats.forEach(api => {
    if (!api.isHealthy && now - lastAlertTime > ALERT_COOLDOWN) {
      console.error(`🚨 ALERTA: ${api.id} está UNHEALTHY - ${api.lastError}`);
      lastAlertTime = now;
    }
  });
}

// Ejecutar verificación cada 10 segundos
setInterval(verificarSaludAPIs, 10000);
```

---

## Ejemplo 10: Resetear Estadísticas

```typescript
import { resetLoadBalancerStats, getLoadBalancerStats } from './services/aiClientFactory';

function iniciarNuevaSesion() {
  console.log('🔄 Iniciando nueva sesión de monitoreo...');
  
  // Mostrar estadísticas actuales
  const oldStats = getLoadBalancerStats();
  console.log(`Sesión anterior: ${oldStats.totalRequests} requests`);
  
  // Resetear
  resetLoadBalancerStats();
  
  // Verificar reset
  const newStats = getLoadBalancerStats();
  console.log(`Nueva sesión: ${newStats.totalRequests} requests (debe ser 0)`);
}

iniciarNuevaSesion();
```

---

## 🎓 Tips y Best Practices

### 1. **Siempre usa `await getAIClient()`**
```typescript
// ❌ NO HACER
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// ✅ HACER
const ai = await getAIClient();
```

### 2. **No cachees el cliente AI**
```typescript
// ❌ NO HACER (pierde load balancing)
const cachedAI = await getAIClient();
for (let i = 0; i < 100; i++) {
  await cachedAI.models.generateContent(...); // Siempre usa la misma API
}

// ✅ HACER
for (let i = 0; i < 100; i++) {
  const ai = await getAIClient(); // Obtiene API diferente cada vez
  await ai.models.generateContent(...);
}
```

### 3. **Monitorea regularmente**
```typescript
// En producción, revisa estadísticas periódicamente
setInterval(() => {
  const stats = getLoadBalancerStats();
  if (stats.totalRequests > 0) {
    const successRate = (stats.successfulRequests / stats.totalRequests) * 100;
    if (successRate < 95) {
      console.warn(`⚠️ Success rate: ${successRate.toFixed(1)}%`);
    }
  }
}, 60000); // Cada minuto
```

### 4. **Usa executeWithRetry para operaciones críticas**
```typescript
// Para requests importantes, usa retry automático
const resultado = await executeWithRetry(
  async (ai) => await ai.models.generateContent(...),
  3 // reintentos
);
```

---

## 📞 ¿Necesitas Ayuda?

Si estos ejemplos no cubren tu caso de uso, revisa:
- `LOAD_BALANCER_DOCUMENTATION.md` - Documentación completa
- `LOAD_BALANCER_TESTING.md` - Guía de testing
- Consola del navegador - Logs detallados del load balancer

---

**¡Disfruta del 5x más de capacidad!** 🚀
