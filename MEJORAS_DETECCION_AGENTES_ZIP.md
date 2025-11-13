# 🔬 Mejoras en Detección de Agentes ZIP - v2.0

## Problema Identificado
Los agentes detectados en proyectos ZIP eran demasiado genéricos. El sistema no realmente "comprendía" qué hacía cada agente, sus intenciones, herramientas específicas, etc.

## Solución Implementada

### 1. Detección Profunda de Agentes (`codeProjectAnalyzer.ts`)
Mejoré la función `detectAgents()` para extraer:

- ✅ **Intención del Agente**: Qué propósito de negocio cumple
  - Busca en comentarios, docstrings, system prompts
  - Extrae descripción clara y accionable

- ✅ **Responsabilidades**: Qué acciones específicas realiza
  - Analiza nombres de funciones
  - Detecta patrones de uso (send, create, update, etc.)

- ✅ **Bases de Datos Utilizadas**: Cuáles DBs usa específicamente cada agente
  - Detecta PostgreSQL, MongoDB, Supabase, etc. en el código del agente

- ✅ **Casos de Uso**: Qué input espera, qué output produce
  - Parametros de entrada esperados
  - Valores de salida
  - Ejemplos de interacción

**Ejemplo de salida mejorada:**
```
✅ Agent detectado: SalesAgent
   Framework: OpenAI
   Intention: Procesar solicitudes de ventas y crear órdenes en el sistema
   Tools: Email, Payment Processor
   Databases: PostgreSQL (orders, customers)
   Responsibilities: create_order, send_invoice, process_payment
```

### 2. Análisis Profundo con Gemini (`zipProjectDeepAnalyzer.ts`)
Nuevo servicio que usa IA para:

1. **Comprender la arquitectura completa** del proyecto
2. **Para cada agente, generar:**
   - Intención clara (propósito de negocio)
   - Capacidades específicas (no tools, sino qué HACE)
   - Inputs exactos (estructura esperada)
   - Outputs exactos (qué devuelve)
   - Ejemplos de interacciones realistas
   - Valor de negocio

3. **Analizar flujos de datos** entre componentes
4. **Identificar puntos de integración** externos

**Estructura de salida:**
```typescript
interface DeepAgentAnalysis {
  name: string;
  intention: string;           // "Agent de ventas que procesa órdenes"
  capabilities: string[];       // ["Crear orden", "Calcular impuestos", ...]
  databases: string[];         // ["PostgreSQL orders", ...]
  tools: string[];             // ["Stripe Payment", "SendGrid Email"]
  inputs: string[];            // ["customer_id", "amount", ...]
  outputs: string[];           // ["order_id", "confirmation", ...]
  exampleInteractions: string[]; // Ejemplos reales
  businessValue: string;       // Por qué importa este agente
}
```

### 3. Integración en AgentConfig.tsx
Cuando se carga un proyecto ZIP:

```
1. Detectar agentes (improved)
   ↓
2. Realizar análisis profundo con Gemini
   ├─ Generar descriptores de agentes
   ├─ Entender arquitectura completa
   └─ Guardar en window.__zipProjectAnalysis
   ↓
3. Generar criterios basados en análisis
   ├─ Para cada agente: ¿cumple su intención?
   ├─ ¿Usa correctamente sus tools?
   ├─ ¿Mantiene contexto?
   └─ Criterios específicos y medibles
   ↓
4. (Payload generation usa análisis)
   ↓
5. Usuario ve información DETALLADA del proyecto
```

## Beneficios

| Antes | Ahora |
|-------|-------|
| "Agent: SalesAgent" | "Agent: SalesAgent - Procesa órdenes de venta usando Stripe y Gemini 2.5 Pro, accede a PostgreSQL" |
| Criterios genéricos | Criterios específicos por agente |
| Test cases genéricos | Test cases que prueben cada agente específicamente |
| Sin entender intención | Entiende qué hace CADA agente en el negocio |

## Ejemplo Real: Proyecto Construcción

**Antes:**
```
Agentes detectados: 2
Agent 1, Agent 2
(Sin detalles)
```

**Ahora:**
```
Deep Analysis: Proyecto de ventas para materiales de construcción

Agent 1: CotizationAgent
  Intention: Recibe consultas de clientes y genera cotizaciones personalizadas
  Capabilities: 
    - Calcular presupuesto según cantidad y tipo
    - Aplicar descuentos por volumen
    - Generar PDF con cotización
  Uses: PostgreSQL (materials, prices), Stripe (payment), Email (SendGrid)
  Inputs: customer_id, material_type, quantity
  Outputs: quote_id, pdf_url, total_price
  Example: "Necesito 500 kg de cemento" → "Tu cotización es $5000, descuento 10%"

Agent 2: OrderProcessingAgent
  Intention: Confirma órdenes, procesa pagos y genera documentación
  Capabilities:
    - Validar stock disponible
    - Procesar pago con Stripe
    - Generar recibo y guía de envío
  Uses: PostgreSQL (inventory, orders), Stripe, SendGrid, Google Calendar
  Inputs: order_id, payment_method
  Outputs: confirmation_number, shipping_tracking
  Example: "Confirmar orden" → "Pago procesado, envío en 2 días"

Criterios de Auditoría:
1. CotizationAgent ¿genera cotizaciones dentro del rango de precio?
2. OrderProcessingAgent ¿procesa pagos correctamente?
3. ¿Ambos mantienen historial de conversación?
4. ¿Notifican cambios relevantes por email?
5. ¿Consultan BD actualizada?
```

## Archivos Nuevos/Modificados

- ✅ `services/codeProjectAnalyzer.ts` - Detección mejorada
- ✅ `services/zipProjectDeepAnalyzer.ts` - Análisis profundo con Gemini
- ✅ `components/AgentConfig.tsx` - Integración del análisis

## Cómo Funciona Ahora

### Step 1: Upload ZIP
Sistema ejecuta automáticamente:
1. Extrae archivos
2. Detecta agentes mejorado (intención, responsabilidades, DBs, casos de uso)
3. Análisis profundo con Gemini (comprende realmente el proyecto)
4. Genera descriptores detallados
5. Crea criterios específicos

### Step 2-5: 
Igual que n8n (credenciales, auditoría, reporte)

## Próximo Paso

Cuando `generateTestCases()` se ejecute:
- Usará `window.__zipProjectAnalysis` para generar test cases ESPECÍFICOS
- Cada test case probará UN agente específico con inputs realistas
- Los criterios evaluarán si ese agente cumple su intención

## Ejemplo de Test Case Generado

```typescript
{
  id: "TC-001",
  title: "CotizationAgent: Consulta de material",
  persona: "Carlos, gerente de obra, necesita presupuesto",
  goal: "Recibir cotización precisa de 1000 kg de hormigón",
  initialPayload: {
    conversationId: "conv_2025_01_123",
    agent: "CotizationAgent",  // ESPECÍFICO
    userId: "user_456",
    materialType: "hormigón",   // Input específico
    quantity: 1000,
    source: "web_chat"
  },
  expectedOutputs: [
    "Debe calcularse 1000 * $10 = $10000",
    "Aplicar descuento por cantidad",
    "Generar PDF de cotización"
  ]
}
```

## Conclusión

Ahora el sistema NO solo detecta que hay agentes, sino que REALMENTE ENTIENDE:
- Qué hace cada agente (intención de negocio)
- Cómo interactúa (inputs/outputs)
- Qué herramientas usa (DBs, APIs, servicios)
- Cómo probarlo (criterios y ejemplos)

**Es equivalente a analizar un workflow n8n**: Se entiende la arquitectura, se genera test cases específicos, se audita contra criterios reales.
