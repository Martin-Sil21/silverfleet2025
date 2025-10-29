# 🚫 Configuración de Bloqueo de Usuarios en n8n

## Fecha: Octubre 28, 2025

## 🎯 Problema Resuelto

Cuando tu flujo de n8n bloquea a un usuario, el sistema de auditoría necesita saber que **NO es un error**, sino un comportamiento **esperado e intencional**.

---

## 📋 Dos Métodos de Detección

El sistema de auditoría detecta bloqueos de **2 formas**:

### **Método 1: Respuesta Explícita (RECOMENDADO) ✅**

El webhook devuelve un JSON indicando el bloqueo:
```json
{
  "blocked": true,
  "reason": "Usuario bloqueado por política de negocio",
  "message": "La conversación ha finalizado"
}
```

### **Método 2: Análisis Inteligente Automático 🧠**

Si el webhook devuelve vacío o error, el sistema:
1. Consulta la base de datos (`is_blocked = true`)
2. Analiza el último mensaje del bot
3. Usa Gemini AI para interpretar el contexto
4. Determina si fue intencional

---

## 🔧 Configuración en n8n (Método 1 - RECOMENDADO)

### **Paso 1: Identifica el nodo de bloqueo**

En tu flujo, encuentra el nodo que responde cuando bloqueás al usuario.

Ejemplo:
```
IF → ¿Está bloqueado?
  ├─ SÍ → [Respond to Webhook - BLOQUEO]
  └─ NO → [Respond to Webhook - NORMAL]
```

### **Paso 2: Configura la respuesta de bloqueo**

1. **Abrí el nodo** "Respond to Webhook" de la rama de bloqueo
2. En **"Respond With"**: Cambiá de "No Data" a **"Using Respond to Webhook Node"**
3. En el cuerpo de la respuesta, agregá:

```json
{
  "blocked": true,
  "reason": "Usuario bloqueado por exceder límite de pedidos",
  "message": "Tu cuenta ha sido suspendida. Contacta a soporte@empresa.com"
}
```

### **Paso 3: Personaliza los campos**

**Campos obligatorios:**
- `blocked`: **SIEMPRE true** (esto indica el bloqueo)

**Campos opcionales:**
- `reason`: Por qué se bloqueó (para logs internos)
- `message`: Mensaje para el usuario final
- `contact`: Información de contacto para soporte

**Ejemplo completo:**
```json
{
  "blocked": true,
  "reason": "Cantidad solicitada excede el límite permitido (1000 vs máx 500)",
  "message": "No podemos procesar tu pedido. Para cantidades mayores contactá a ventas@empresa.com",
  "contact": {
    "email": "ventas@empresa.com",
    "phone": "+54 11 1234-5678"
  }
}
```

---

## 📊 Ejemplo Real en n8n

### **Flujo de Bloqueo por Cantidad Excesiva**

```
┌─────────────────────────────────────┐
│ Webhook (Recibe pedido)             │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ IF: Cantidad > 500                  │
└──────┬────────────────────┬─────────┘
       │                    │
      SÍ                   NO
       │                    │
       ▼                    ▼
┌─────────────┐    ┌─────────────────┐
│ Set en BD   │    │ Procesar pedido │
│ is_blocked  │    │ normalmente     │
│ = true      │    └─────────────────┘
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Respond to Webhook                  │
│                                     │
│ Body:                               │
│ {                                   │
│   "blocked": true,                  │
│   "reason": "Cantidad > 500",       │
│   "message": "Contactá a ventas"    │
│ }                                   │
└─────────────────────────────────────┘
```

---

## 🎯 Resultado en la Auditoría

### **Con el campo `blocked: true` (Método 1):**

```
✅ "Usuario pidiendo 1000 unidades": Usuario bloqueado por el flujo

Status: SUCCESS (no ERROR)
Log: USER_BLOCKED: Cantidad solicitada excede el límite permitido

📝 Modificaciones en BD:
  🔄 MODIFICÓ en tabla usuarios
     Campo: is_blocked
     Antes: false → Después: true

Score: 9/10
Análisis: "El bot manejó correctamente la situación, 
          bloqueando al usuario según política de negocio"
```

### **Sin el campo `blocked` (Método 2 - Automático):**

```
🔍 Analizando si es bloqueo intencional...
   ✅ BD: is_blocked = true
   ✅ Bot dijo: "No puedo procesar tu pedido"
   ✅ Gemini AI: "Bloqueo por cantidad fuera de política"

→ Conclusión: USER_BLOCKED (NO error)

✅ "Usuario pidiendo 1000 unidades": Usuario bloqueado correctamente
```

---

## 🚨 Casos de Bloqueo Comunes

### **1. Bloqueo por Política de Negocio**
```json
{
  "blocked": true,
  "reason": "Cantidad solicitada excede límite máximo",
  "message": "Para pedidos mayores a 500 unidades contactá a ventas@empresa.com"
}
```

### **2. Bloqueo por Comportamiento Abusivo**
```json
{
  "blocked": true,
  "reason": "Usuario utilizó lenguaje inapropiado",
  "message": "Tu cuenta ha sido suspendida por violar nuestros términos de servicio"
}
```

### **3. Transferencia a Humano**
```json
{
  "blocked": true,
  "reason": "Consulta requiere intervención humana",
  "message": "Te estoy transfiriendo con un asesor. Por favor esperá..."
}
```

### **4. Horario Fuera de Atención**
```json
{
  "blocked": false,
  "paused": true,
  "reason": "Fuera de horario de atención",
  "message": "Nuestro horario es Lun-Vie 9-18hs. Volvé mañana!"
}
```

---

## 🔍 Verificación en Base de Datos

Si usás el **Método 2 (automático)**, asegurate de que:

1. **Tengas una columna de bloqueo** en tu tabla de usuarios:
   - Nombres comunes: `is_blocked`, `bloqueado`, `blocked`, `estado`, `status`

2. **El flujo actualice la BD** cuando bloquea:
   ```sql
   UPDATE usuarios SET is_blocked = true WHERE telefono = '+5491112345678'
   ```

3. **Conectaste Supabase en la auditoría**:
   - URL de Supabase
   - API Key
   - Tablas seleccionadas (ej: `usuarios`)

---

## 📈 Comparación de Métodos

| Aspecto | Método 1 (Explícito) | Método 2 (Automático) |
|---------|---------------------|----------------------|
| **Configuración** | Agregar JSON en n8n | Ya incluido |
| **Precisión** | 100% (siempre correcto) | 95% (basado en IA) |
| **Velocidad** | Instantáneo | ~2-3 segundos análisis |
| **Requiere BD** | NO | SÍ |
| **Personalización** | Alta (puedes agregar campos) | Limitada |
| **Recomendado** | ✅ SÍ | Fallback |

---

## 🎓 Mejores Prácticas

### ✅ **HACER:**

1. **Usar Método 1 siempre que sea posible**
   - Más confiable
   - Más rápido
   - Más fácil de debugear

2. **Ser descriptivo en `reason`**
   ```json
   { "reason": "Cantidad 1000 excede máx 500" }
   ```
   En lugar de:
   ```json
   { "reason": "Bloqueado" }
   ```

3. **Incluir `message` para el usuario**
   - Explicá por qué fue bloqueado
   - Ofrecé alternativas
   - Proporcioná contacto

4. **Actualizar la BD también**
   - Aunque uses Método 1, actualizá `is_blocked = true`
   - Esto da doble validación

### ❌ **NO HACER:**

1. **No devolver completamente vacío**
   - Aunque el análisis automático funciona, es menos confiable

2. **No bloquear sin explicación**
   - Siempre incluí un `message` para el usuario

3. **No usar "No Data" en n8n**
   - Siempre devolvé un JSON estructurado

---

## 🧪 Cómo Probar

### **Prueba Manual en n8n:**

1. Ejecutá tu flujo con un pedido que active el bloqueo
2. Verificá que el webhook devuelve:
   ```json
   { "blocked": true, "reason": "...", "message": "..." }
   ```
3. Verificá en tu BD que `is_blocked = true`

### **Prueba en la Auditoría:**

1. Ejecutá la auditoría con un caso que active bloqueo
2. Verificá que muestra:
   ```
   🚫 "Usuario X": Usuario bloqueado por el flujo
   Status: SUCCESS
   ```
3. En el reporte final:
   ```
   📝 Modificaciones en BD:
     🔄 MODIFICÓ: is_blocked = false → true
   ```

---

## 🎯 Checklist de Configuración

- [ ] Identifiqué el nodo que maneja el bloqueo en n8n
- [ ] Cambié "No Data" a "Using Respond to Webhook Node"
- [ ] Agregué `{ "blocked": true }` en el JSON de respuesta
- [ ] Incluí `reason` y `message` descriptivos
- [ ] Mi flujo actualiza `is_blocked = true` en la BD
- [ ] Conecté Supabase en la configuración de auditoría
- [ ] Probé un caso de bloqueo y verificó que aparece como SUCCESS
- [ ] El reporte final muestra modificaciones en BD correctamente

---

## 🚀 Resultado Final

Con esta configuración, cuando tu flujo bloquee a un usuario:

✅ **Sistema detecta:** "Bloqueo intencional"  
✅ **Marca como:** SUCCESS (no error)  
✅ **Reporta:** Modificaciones en BD + razón del bloqueo  
✅ **Score:** Correcto (8-10/10)

**¡Tu auditoría ahora es 100% confiable y basada en datos reales!** 🎉


