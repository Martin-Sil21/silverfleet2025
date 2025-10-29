# 🗄️ Cómo Ver la Base de Datos en Tiempo Real

## ⚠️ Si no ves NADA de base de datos...

### **Paso 1: ¿Configuraste Supabase?**

En el formulario de auditoría, debe estar activado:

```
✅ Conectar a Base de Datos Real (Supabase)

Supabase URL: https://xxx.supabase.co
Supabase API Key: eyJhbGciOiJIUzI1...

[Conectar a Supabase]  ← PRESIONAR ESTE BOTÓN

Tablas a monitorear:
☑ usuarios
☑ productos
☑ citas
```

**Si NO hiciste esto** → **NO HABRÁ auditoría de BD**

---

## ✅ **Qué deberías ver si está configurado correctamente:**

### **Al Inicio de la Auditoría:**

En el panel derecho (Activity Log) verás:

```
━━━━━━━━━━━━━━━━━━━━━━
🗄️ AUDITORÍA DE BASE DE DATOS ACTIVADA
━━━━━━━━━━━━━━━━━━━━━━
🔗 Tipo: supabase
📊 Tablas monitoreadas: usuarios, productos, citas
🔗 Conectando...
✅ Conexión exitosa! Rastreando cambios en tiempo real...
━━━━━━━━━━━━━━━━━━━━━━
```

### **Durante la Conversación:**

Cuando el bot haga cambios en la BD, verás:

```
✅ "Carlos Giménez" respondió en 2456ms
    ➕ BD: INSERT en tabla "citas" (nuevo ID: 123)
    🔄 BD: UPDATE en tabla "usuarios" (campos: estado, ultima_interaccion)
    📊 Total de cambios en este turno: 2
```

### **Al Final:**

```
📝 BD Real "Carlos Giménez": 3 modificaciones detectadas
   (1 inserts, 2 updates, 0 deletes)
```

---

## 🎨 **Colores en el Log:**

- **Verde con fondo**: ➕ INSERT (nuevo registro)
- **Amarillo con fondo**: 🔄 UPDATE (registro modificado)
- **Rojo con fondo**: ➖ DELETE (registro eliminado)
- **Cyan con borde**: 📝 Resumen de modificaciones
- **Rojo con borde grueso**: 🚨 DISCREPANCIAS CRÍTICAS

---

## ❌ **Si ves esto al inicio:**

```
━━━━━━━━━━━━━━━━━━━━━━
⚠️  AUDITORÍA DE BD DESACTIVADA
━━━━━━━━━━━━━━━━━━━━━━
ℹ️  No se monitoreará la base de datos durante esta auditoría
ℹ️  Para activarla, configura Supabase en el formulario
━━━━━━━━━━━━━━━━━━━━━━
```

**Significa:** NO configuraste Supabase

**Solución:**
1. Cancelá la auditoría
2. Activá "Conectar a Base de Datos Real (Supabase)"
3. Ingresá URL y Key de Supabase
4. Presioná "Conectar a Supabase"
5. Seleccioná las tablas
6. Iniciá la auditoría de nuevo

---

## 🔧 **Ubicación de los Logs de BD:**

### **Opción 1: Panel Derecho (Activity Log)**

Durante la auditoría, mirá el panel derecho con fondo negro/verde. Ahí aparecerán todos los logs de BD con colores destacados.

### **Opción 2: Reportes Finales**

Al terminar la auditoría, hacé clic en cada conversación y mirá:

**"Modificaciones en Base de Datos"**
- Lista completa de INSERT, UPDATE, DELETE
- Antes y Después de cada cambio
- Campos modificados

**"Verificación de Precios"**
- Comparación visual: Bot ofreció $X vs BD tiene $Y
- Diferencia y porcentaje
- Estado: ✓ Correcto o ✗ Incorrecto

---

## 🚨 **Troubleshooting:**

### **"Conexión exitosa pero no veo cambios"**

Puede ser que tu bot **NO esté modificando la BD**. Verificá:
- ¿Tu flujo de n8n modifica tablas de Supabase?
- ¿Las tablas que seleccionaste son las correctas?

### **"Error al conectar"**

```
❌ ERROR: No se pudo conectar a la base de datos
❌ Detalle: Invalid API key
```

Verificá:
- URL de Supabase correcta (termina en `.supabase.co`)
- API Key correcta (es muy larga, empieza con `eyJh...`)
- Key es **anon (public)** o **service_role**, NO otra

### **"No aparece el botón Conectar a Supabase"**

Asegurate de tener activado:
```
✅ Conectar a Base de Datos Real (Supabase)
```

---

## 📊 **Ejemplo Completo:**

**Configuración:**
```
✅ Conectar a Base de Datos Real (Supabase)
URL: https://abc123.supabase.co
Key: eyJhbGc...
Tablas: usuarios, citas
```

**Log durante auditoría:**
```
━━━━━━━━━━━━━━━━━━━━━━
🗄️ AUDITORÍA DE BASE DE DATOS ACTIVADA
━━━━━━━━━━━━━━━━━━━━━━
✅ Conexión exitosa! Rastreando cambios en tiempo real...

━━━ Ronda 1/12 ━━━
✅ "Usuario 1" respondió en 2340ms

━━━ Ronda 2/12 ━━━
✅ "Usuario 1" respondió en 1876ms

━━━ Ronda 3/12 ━━━
✅ "Usuario 1" respondió en 2103ms
    ➕ BD: INSERT en tabla "citas" (nuevo ID: 456)
    📊 Total de cambios en este turno: 1

━━━ Ronda 4/12 ━━━
✅ "Usuario 1" respondió en 1987ms
    🔄 BD: UPDATE en tabla "usuarios" (campos: estado, ultima_interaccion)
    📊 Total de cambios en este turno: 1

...

📊 Analizando resultados finales...
📝 BD Real "Usuario 1": 2 modificaciones detectadas
   (1 inserts, 1 updates, 0 deletes)
```

---

**Si sigues sin ver logs de BD, mandá un screenshot del formulario de configuración!** 📸


