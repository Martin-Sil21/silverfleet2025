# 🔍 Guía de Detección de Patrones - Data Reuse

## Problema que Resuelve

Tu auditoría puede detectar ahora un **problema crítico común** en bots conversacionales:

**El bot reutiliza los mismos datos para TODOS los clientes**, en lugar de personalizar por usuario.

### Ejemplo del Problema

```
Conversación 1 (Usuario: Juan)
Bot: "Hola Juan, te envío el confirmación al email juan@mail.com"
BD: Se guarda email = "maria@default.com" ❌ (ERROR: no es el de Juan)

Conversación 2 (Usuario: Pedro)
Bot: "Hola Pedro, te envío el confirmación al email pedro@mail.com"
BD: Se guarda email = "maria@default.com" ❌ (ERROR: no es el de Pedro)

Conversación 3 (Usuario: Ana)
Bot: "Hola Ana, te envío el confirmación al email ana@mail.com"
BD: Se guarda email = "maria@default.com" ❌ (ERROR: no es el de Ana)
```

**¿Qué está pasando?** El desarrollador hardcodeó `maria@default.com` en lugar de extraerlo dinámicamente del usuario.

---

## Patrones que Detecta

### 1. 🔄 **Reutilización de Datos Entre Conversaciones**
**Tipo:** `data_reuse_across_conversations`  
**Severidad:** CRÍTICA

El bot usa **exactamente los mismos datos** en múltiples conversaciones con diferentes usuarios.

**Ejemplos:**
- Todos los usuarios reciben email en `admin@empresa.com`
- Todos los usuarios tienen el mismo nombre guardado: "Cliente"
- Todos los usuarios tienen el mismo teléfono: "+34 600000000"

**¿Por qué es malo?**
- Los emails se pierden (van al mismo inbox)
- Los datos no reflejan la realidad del usuario
- Imposible rastrear qué cliente hizo qué

---

### 2. 📧 **Emails Duplicados al Mismo Destinatario**
**Tipo:** `duplicate_email_same_recipient`  
**Severidad:** CRÍTICA

En UNA conversación, el bot envía **múltiples emails al mismo destinatario** sin filtro.

**Ejemplo:**
```
Turno 1: Bot envía email a "juan@mail.com"
Turno 2: Bot envía OTRO email a "juan@mail.com" (sin razón)
Turno 3: Bot envía OTRO email a "juan@mail.com" (spam)
```

**¿Por qué es malo?**
- El usuario recibe emails duplicados
- Mala experiencia (spam)
- Desperdicio de recursos

**¿Cómo se detecta?**
La auditoría cuenta cuántas veces se envía email al mismo destinatario en una conversación. Si es más de 1, lo reporta.

---

### 3. 🔁 **Acciones Repetidas Sin Filtro**
**Tipo:** `repeated_action_no_filter`  
**Severidad:** ALTA

El bot repite la misma acción (guardar datos, enviar mensaje) en múltiples turnos sin condición.

**Ejemplo:**
```
Turno 1: Guarda "nombre = Juan"
Turno 2: Guarda "nombre = Juan" (de nuevo)
Turno 3: Guarda "nombre = Juan" (de nuevo)
```

**Solución:** Agregar condicional: "si aún no se guardó, guardar"

---

### 4. 🔧 **Datos Hardcodeados Globales**
**Tipo:** `hardcoded_global_data`  
**Severidad:** CRÍTICA

Todos los usuarios tienen datos IDÉNTICOS en BD, cuando deberían ser personalizados.

**Indicador:** Las BD snapshots de 3+ conversaciones son idénticas al 100%.

**Solución:** Extraer datos del usuario (`{{ $json.nombre }}`) en lugar de hardcodear (`"Cliente"`).

---

### 5. 👥 **Falta de Personalización en Respuestas**
**Tipo:** `inconsistent_personalization`  
**Severidad:** ALTA

El bot da respuestas IDÉNTICAS a diferentes usuarios.

**Ejemplo:**
```
Usuario 1: "Hola, soy Juan"
Bot: "Entendido. Tu información ha sido procesada."

Usuario 2: "Hola, soy Pedro"
Bot: "Entendido. Tu información ha sido procesada." ← MISMA RESPUESTA
```

**Indicador:** Los outputs de múltiples conversaciones son palabra por palabra iguales.

---

## Cómo Usar la Funcionalidad

### Paso 1: Auditar con 3+ Personas

Para detectar patrones, **necesitas al menos 3 conversaciones** con diferentes personas:

```
Test Case Count: 3 o más
```

Ejemplo de personas diferentes:
- Persona 1: Cliente nuevo, pide información
- Persona 2: Cliente que necesita producto alternativo
- Persona 3: Cliente que quiere devolver un pedido

### Paso 2: Ejecutar la Auditoría

Realiza la auditoría normalmente (Visual o Real):

1. Sube tu workflow n8n
2. Configura los criterios
3. Selecciona **3+ personas**
4. ¡Audita!

### Paso 3: Ver la Pestaña "Patrones"

Después de completada la auditoría, verás una **nueva pestaña 🔍 Patrones**:

```
[📊 Dashboard] [📝 Reporte Detallado] [🔍 Patrones] ← NUEVA
```

Haz click en **"🔍 Patrones"**

### Paso 4: Interpretar los Resultados

Verás un reporte como este:

```
Análisis de Patrones - Reutilización de Datos

Score de Reutilización: 8.5/10 (MALO - Mucha reutilización)
Score de Personalización: 1.5/10 (MALO - Muy poco personalizado)

─────────────────────────────────────────

Patrones Detectados:

🔴 CRÍTICO: El bot envía siempre al MISMO EMAIL
   Frecuencia: 3 veces
   Conversaciones Afectadas: 3
   
   Evidencia:
   • Cliente 1 (conv_123): recibió email a admin@empresa.com
   • Cliente 2 (conv_456): recibió email a admin@empresa.com ← SAME!
   • Cliente 3 (conv_789): recibió email a admin@empresa.com ← SAME!
   
   Recomendación:
   Extraer el email del usuario EN CADA CONVERSACIÓN (no hardcodearlo).
   Usar: {{ $json.userEmail }} o similar desde el payload.
```

### Scores Explicados

**Score de Reutilización (0-10):**
- **0-3:** ✅ Bien - Datos personalizados
- **4-6:** ⚠️ Intermedio - Algo de reutilización
- **7-10:** 🔴 Crítico - Mucha reutilización

**Score de Personalización:**
- Complementario al de reutilización
- 10 = Bien personalizado
- 0 = Nada personalizado

---

## Ejemplo Completo: Detección en Acción

### Setup del Test

```json
{
  "testCaseCount": 3,
  "personas": [
    {
      "name": "Juan - Cliente Nuevo",
      "email": "juan@empresa.com",
      "phone": "+34 600111111"
    },
    {
      "name": "María - Cliente Premium",
      "email": "maria@empresa.com",
      "phone": "+34 600222222"
    },
    {
      "name": "Pedro - Cliente VIP",
      "email": "pedro@empresa.com",
      "phone": "+34 600333333"
    }
  ]
}
```

### Workflow del Bot (CON ERROR)

```
┌─────────────────────┐
│ Webhook (entrada)   │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Agente AI           │
│ "Procesa cliente"   │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Email (hardcoded)   │ ← PROBLEMA
│ To: admin@mail.com  │    (debería ser dinámico)
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ BD: Guardar datos   │ ← PROBLEMA
│ (hardcoded) email   │    (debería ser del usuario)
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Respuesta           │
└─────────────────────┘
```

### Resultados de la Auditoría

**Antes (sin Pattern Detector):**
```
Conversación 1: ✅ PASSED (8.5/10)
Conversación 2: ✅ PASSED (8.5/10)
Conversación 3: ✅ PASSED (8.5/10)

Overall: 8.5/10 ✅ "Bot works great!"
```

**Después (CON Pattern Detector):**
```
Conversación 1: ✅ PASSED (8.5/10)
Conversación 2: ✅ PASSED (8.5/10)
Conversación 3: ✅ PASSED (8.5/10)

🔍 PATTERN ANALYSIS:

🔴 CRÍTICO: El bot envía siempre al MISMO EMAIL
   Frecuencia: 3
   Conversaciones Afectadas: 3
   
🔴 CRÍTICO: Datos idénticos guardados en todas conversaciones
   Conversaciones Afectadas: 3
   
Personalización Score: 1.5/10 ⚠️ GRAVE

Recomendación: El bot está reutilizando datos. Configurar campos dinámicos.
```

---

## Soluciones por Tipo de Error

### Problema: El bot envía siempre al mismo email

**Código n8n incorrecto (hardcoded):**
```javascript
// ❌ MALO
const emailTo = "admin@empresa.com"; // Hardcoded
sendEmail(emailTo, template);
```

**Solución:**
```javascript
// ✅ BIEN
const emailTo = $json.userEmail || $json.email || $json.recipient;
// Extraer del payload de entrada
sendEmail(emailTo, template);
```

**En n8n:**
```
Email Node:
  To: {{ $json.userEmail }}  ← Dinámico, no hardcoded
  Subject: "Confirmación de {{ $json.userName }}"
```

---

### Problema: Datos idénticos en todas las conversaciones

**Código incorrecto (hardcoded):**
```javascript
// ❌ MALO
const userData = {
  name: "Cliente",      // Hardcoded
  email: "admin@mail.com", // Hardcoded
  phone: "+34 600000000"   // Hardcoded
};
```

**Solución:**
```javascript
// ✅ BIEN
const userData = {
  name: $json.name,           // Del usuario
  email: $json.email,         // Del usuario
  phone: $json.phone          // Del usuario
};
```

---

### Problema: Emails duplicados en la misma conversación

**Código incorrecto (sin filtro):**
```javascript
// ❌ MALO
// En cada turno, envía email (sin condición)
for (let i = 0; i < turns; i++) {
  sendEmail(userEmail, message); // ← Se envía en CADA turno
}
```

**Solución:**
```javascript
// ✅ BIEN
// Enviar email solo si no se envió en este turno
if (!data.emailSentInThisTurn) {
  sendEmail(userEmail, message);
  data.emailSentInThisTurn = true;
}
```

**En n8n (con Set node):**
```
IF: {{ $json.emailSentThisTurn }} = false
  THEN: Enviar Email
  THEN: Set: emailSentThisTurn = true
ELSE: Skip
```

---

## Interpretación de Recomendaciones

La auditoría genera **recomendaciones específicas** para cada patrón:

### Ejemplo 1: Email duplicado
```
Recomendación:
Implementar lógica de verificación: "si ya se envió email en este turno, no enviar de nuevo" 
o usar un flag de control por conversación
```

**Acciones:**
1. En el workflow, añade un campo `emailSentThisTurn` al payload
2. Antes de enviar email, verifica: `IF emailSentThisTurn = false`
3. Después de enviar, set: `emailSentThisTurn = true`

### Ejemplo 2: Email hardcodeado
```
Recomendación:
Extraer el email del usuario EN CADA CONVERSACIÓN (no hardcodearlo).
Usar: {{ $json.userEmail }} o similar desde el payload.
```

**Acciones:**
1. En el Email Node, reemplaza `admin@mail.com` por `{{ $json.userEmail }}`
2. Asegúrate que `userEmail` viene en el payload de entrada
3. Si no viene, extrae el primer email mencionado en la conversación

---

## Mejores Prácticas

### ✅ DO: Lo que debes hacer

1. **Usar variables dinámicas** en lugar de valores hardcodeados
   ```
   {{ $json.userName }}  ← Dinámico
   {{ $json.email }}     ← Dinámico
   ```

2. **Filtros por conversación** para evitar duplicados
   ```
   IF: conversationId no procesado
     THEN: Procesar
     STORE: conversationId
   ```

3. **Test con múltiples personas** (3+) en la auditoría
   - Cada persona debe ser diferente
   - Cada persona con datos reales (nombre, email, teléfono)

4. **Revisar la BD después de cada turno**
   - ¿Se guardaron los datos del usuario?
   - ¿O se guardaron valores genéricos?

### ❌ DON'T: Lo que debes evitar

1. **Hardcodear datos de usuario**
   ```
   ❌ const email = "admin@mail.com"
   ✅ const email = $json.userEmail
   ```

2. **Procesar sin condicional de unicidad**
   ```
   ❌ En cada turno: sendEmail()
   ✅ IF emailSentThisTurn = false: sendEmail()
   ```

3. **Usar valores por defecto como permanentes**
   ```
   ❌ name = name || "Cliente"  (siempre "Cliente" si no viene)
   ✅ name = name; if (!name) { requestFromUser() }
   ```

4. **Reutilizar datos entre conversaciones**
   ```
   ❌ global userData para todos los usuarios
   ✅ userData por conversationId/sessionId
   ```

---

## Troubleshooting

### P: ¿Por qué veo "Patrones Detectados" si el bot está bien?

**R:** Posibles causas:
1. Los test cases tienen datos similares (no lo suficientemente diferentes)
2. El bot está cachando datos de test anteriores
3. Hay un filtro incorrecto que está devolviendo datos de otras conversaciones

**Solución:** 
- Usa datos completamente diferentes en cada test case
- Limpia la BD antes de cada auditoría
- Verifica que haya un `conversationId` único por conversación

---

### P: ¿Por qué el score de personalización es bajo?

**R:** Causas comunes:
1. Mismo email para todos → reutilización
2. Mismos datos guardados en BD
3. Respuestas genéricas del bot (sin mencionar datos personales)

**Solución:**
- Personaliza el prompt del agente: "Siempre menciona el nombre del usuario"
- Verifica que cada conversación extraiga datos únicos
- Confirma que BD está guardando datos por conversacion (`WHERE sessionId = X`)

---

### P: ¿Y si el bot DEBE usar datos por defecto?

**R:** Si es intencional (ej: todos reciben emails en un canal central), configura:

```json
{
  "centralEmailChannel": "central@empresa.com",
  "personalEmailFallback": true  // Si no viene email, usar central
}
```

Pero entonces la auditoría reportará esto como "no personalizado" (que es correcto).

---

## Próximos Pasos

1. **Ejecuta la auditoría** con 3+ personas
2. **Revisa la pestaña Patrones**
3. **Implementa las recomendaciones** en tu workflow
4. **Audita de nuevo** para verificar que se solucionó

---

## Referencia Rápida

| Patrón | Tipo | Severidad | Causa Raíz | Solución |
|--------|------|-----------|-----------|----------|
| Email duplicado | `duplicate_email_same_recipient` | 🔴 CRÍTICA | Bucle sin filtro | Agregar condicional `IF not sentThisTurn` |
| Datos reutilizados | `data_reuse_across_conversations` | 🔴 CRÍTICA | Hardcoded global | Usar `{{ $json.field }}` dinámico |
| Datos idénticos en BD | `hardcoded_global_data` | 🔴 CRÍTICA | Valor por defecto fijo | Extraer del usuario o request nuevo |
| Respuestas genéricas | `inconsistent_personalization` | 🟠 ALTA | Prompt sin personalización | Mejorar instrucción del agente |
| Acciones repetidas | `repeated_action_no_filter` | 🟠 ALTA | Sin validación de unicidad | Validar estado previo |

---

**¿Tienes dudas?** Revisa los logs en la consola del navegador cuando se ejecuta el análisis de patrones.

✨ ¡Ahora puedes detectar reutilización de datos como un profesional!
