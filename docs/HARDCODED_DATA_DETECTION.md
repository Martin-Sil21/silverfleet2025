# 🔧 Detección de Datos Hardcodeados

## Problema

Durante las pruebas, a veces hardcodeamos datos en el flujo de n8n para evitar acciones reales (como enviar emails). Por ejemplo:

```javascript
// En vez de tomar el email de la conversación:
const userEmail = "{{ $json.extractedEmail }}";

// Hardcodeamos un email de prueba:
const userEmail = "test@ejemplo.com";
```

**¿El auditor debería detectar esto como un error?** 

✅ **SÍ, ABSOLUTAMENTE**

## Por Qué Es Un Error Crítico

Un bot en producción debe:
1. **Recolectar datos del usuario** mediante preguntas
2. **Guardar lo que el usuario dijo**, no valores inventados
3. **Usar esos datos recolectados** para acciones posteriores

Si el bot guarda datos que **nunca fueron mencionados en la conversación**, es una señal de:
- 🚫 Flujo mal configurado
- 🚫 Datos hardcodeados de prueba que llegaron a producción  
- 🚫 El bot no está recolectando información correctamente

## Cómo Lo Detecta Silver Fleet

### 1. Verificación Inteligente con Gemini AI

El `intelligentToolVerificator.ts` analiza:

```typescript
// Extrae TODA la conversación
const conversationHistory = [
  "Usuario: Hola",
  "Bot: ¿Cómo te llamas?",
  "Usuario: María",
  "Bot: ¿Tu email?",
  "Usuario: maria@gmail.com"
  // ...
];

// Extrae TODOS los cambios en BD
const databaseChanges = [
  {
    type: "INSERT",
    table: "usuarios",
    record: {
      nombre: "María",           // ✅ Mencionado en conversación
      email: "test@ejemplo.com",  // ❌ NUNCA mencionado - HARDCODED!
      telefono: "+54911123456"    // ❌ NUNCA mencionado - HARDCODED!
    }
  }
];
```

### 2. Prompt Específico para Detección

El prompt de Gemini incluye instrucciones explícitas:

```
## 3. DATOS GUARDADOS
- **CRÍTICO - DATOS HARDCODEADOS**: ¿Se guardaron datos que NUNCA fueron mencionados en la conversación?
  * Ej: Si se guardó un email pero el usuario NUNCA lo mencionó → discrepancia crítica
  * Ej: Si se guardó un teléfono pero el usuario NUNCA lo dio → discrepancia crítica
  * Ej: Si se guardó un nombre específico pero el bot nunca lo preguntó → discrepancia crítica
  * Estos son datos HARDCODEADOS en el flujo que NO provienen de la conversación real
  * SIEMPRE es un error grave: el bot debe recolectar datos, no inventarlos
```

### 3. Tipo de Discrepancia Específico

```typescript
export interface DetailedDiscrepancy {
  type: 'hardcoded_data' | 'price_mismatch' | 'email_wrong_recipient' | ...
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  expected: any;  // null o undefined (porque nunca se mencionó)
  actual: any;    // "test@ejemplo.com" (el valor hardcodeado)
  context: string;
  evidence: string[];
  turnNumber: number;
}
```

## Ejemplo de Detección

### Conversación Real:
```
Turno 1:
Usuario: "Hola, quiero información sobre yates"
Bot: "¡Hola! ¿Cuál es tu nombre?"

Turno 2:
Usuario: "Soy Juan"
Bot: "Perfecto Juan, ¿en qué te puedo ayudar?"

Turno 3:
Usuario: "Quiero un presupuesto para un yate de 50 pies"
Bot: "Te envío el presupuesto a tu email"
```

### Cambios en Base de Datos:
```json
{
  "type": "INSERT",
  "table": "presupuestos",
  "record": {
    "nombre": "Juan",                      // ✅ OK - mencionado
    "email": "martin@silverfleet.com",     // ❌ HARDCODED - nunca mencionado
    "telefono": "+5491112345678",          // ❌ HARDCODED - nunca mencionado
    "yate_pies": 50,                       // ✅ OK - mencionado
    "presupuesto_usd": 150000              // ✅ OK - calculado por el sistema
  }
}
```

### Discrepancia Detectada:
```json
{
  "type": "hardcoded_data",
  "severity": "critical",
  "title": "Datos Hardcodeados en Email y Teléfono",
  "description": "El sistema guardó un email y teléfono que NUNCA fueron mencionados en la conversación. El usuario solo dijo su nombre (Juan) pero nunca proporcionó datos de contacto.",
  "expected": null,
  "actual": {
    "email": "martin@silverfleet.com",
    "telefono": "+5491112345678"
  },
  "context": "En toda la conversación, el usuario solo mencionó: su nombre (Juan) y el tamaño del yate (50 pies). Nunca mencionó email ni teléfono.",
  "evidence": [
    "Turno 1: Usuario no mencionó email",
    "Turno 2: Usuario solo dijo 'Soy Juan'",
    "Turno 3: Usuario solo habló del yate de 50 pies",
    "Bot nunca preguntó por email o teléfono",
    "Datos aparecieron mágicamente en la BD sin origen en la conversación"
  ],
  "turnNumber": 3
}
```

### Impacto en el Score:

El análisis de Gemini Pro verá esto en el prompt:

```
=== INTELLIGENT VERIFICATION RESULTS ===
Overall Accuracy Score: 3.0/10
Discrepancies Found: 1

Critical Issues Detected:
  ❌ HARDCODED_DATA: Datos Hardcodeados en Email y Teléfono
     Description: El sistema guardó un email y teléfono que NUNCA fueron mencionados...
     Expected: null
     Actual: {"email":"martin@silverfleet.com","telefono":"+5491112345678"}
     Context: En toda la conversación, el usuario solo mencionó...
     Severity: critical
     Evidence: Turno 1: Usuario no mencionó email, Turno 2: Usuario solo dijo 'Soy Juan'...

=== END INTELLIGENT VERIFICATION ===
```

Y aplicará las reglas estrictas:

```
IMPORTANT SCORING RULES:
- If intelligent verification found discrepancies, scores MUST be lowered significantly.
- Wrong data (prices, recipients, status) = automatic score reduction.
- Critical discrepancies should result in score ≤5
```

**Resultado**: Score general ≤ 5/10 (probablemente 3-4)

## Beneficios

1. **Detecta configuraciones de prueba olvidadas**: Si dejaste hardcodeados datos de testing, el auditor lo encuentra
2. **Valida recolección de datos**: Confirma que el bot REALMENTE está preguntando y guardando lo correcto
3. **Previene errores en producción**: Antes de lanzar, sabes si tu flujo recolecta datos correctamente
4. **Transparencia total**: El reporte muestra exactamente qué datos aparecieron de la nada

## Visualización en el Reporte

En la **Sección 3: Herramientas Externas** verás:

```
🔧 HARDCODED_DATA: Datos Hardcodeados en Email y Teléfono
CRITICAL | Turno 3

El sistema guardó un email y teléfono que NUNCA fueron mencionados en la conversación...

Esperado: null
Real: {"email":"martin@silverfleet.com","telefono":"+5491112345678"}

Contexto: "En toda la conversación, el usuario solo mencionó su nombre..."

Evidencia:
• Turno 1: Usuario no mencionó email
• Turno 2: Usuario solo dijo 'Soy Juan'
• Turno 3: Usuario solo habló del yate de 50 pies
• Bot nunca preguntó por email o teléfono
```

## Cómo Evitarlo en Tus Flujos

### ❌ MAL (Hardcoded):
```javascript
// Nodo: Send Email
{
  "recipient": "test@ejemplo.com",  // HARDCODED
  "subject": "Presupuesto",
  "body": "{{ $json.proposal }}"
}
```

### ✅ BIEN (Recolectado):
```javascript
// Nodo: Extract Email (después de preguntar)
{
  "recipient": "{{ $json.extractedEmail }}", // De la conversación
  "subject": "Presupuesto", 
  "body": "{{ $json.proposal }}"
}
```

### ✅ MEJOR (Con validación):
```javascript
// Nodo: Validate Data
const email = {{ $json.extractedEmail }};
if (!email || !email.includes('@')) {
  throw new Error('Email no recolectado correctamente');
}
return { recipient: email };
```

## Conclusión

✅ **SÍ, la última actualización CUBRE COMPLETAMENTE este caso**

El sistema ahora:
1. Detecta datos que aparecen en BD sin ser mencionados
2. Los marca como `hardcoded_data` con severidad CRITICAL
3. Reduce el score automáticamente a ≤5
4. Muestra evidencia detallada en el reporte
5. Te ayuda a identificar qué datos son hardcodeados

**No hay excusa**: si hay datos hardcodeados en tu flujo, Silver Fleet los encontrará 🔍
