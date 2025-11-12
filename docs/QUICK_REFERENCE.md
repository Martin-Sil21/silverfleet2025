# ⚡ Referencia Rápida - Detección de Patrones

## 🎯 En 30 segundos

**Problema:** Tu bot reutiliza datos entre clientes o envía emails duplicados.

**Solución:** Ejecuta auditoría con **3+ personas** → Pestaña **🔍 Patrones** → Ve los problemas.

---

## 5 Patrones Principales

| # | Patrón | Tipo | Severidad | Síntoma | Fix |
|---|--------|------|-----------|---------|-----|
| 1 | Reutilización global | `data_reuse_*` | 🔴 CRÍTICA | Todos reciben mismo email | `{{ $json.userEmail }}` |
| 2 | Emails duplicados | `duplicate_email_*` | 🔴 CRÍTICA | 3 emails al mismo usuario | `IF emailSent = false` |
| 3 | Acciones repetidas | `repeated_action_*` | 🟠 ALTA | Guardar datos 3 veces | Agregar condición |
| 4 | Datos hardcodeados | `hardcoded_*` | 🔴 CRÍTICA | BD snapshots idénticas | Extraer del usuario |
| 5 | Sin personalización | `inconsistent_*` | 🟠 ALTA | Respuestas iguales | Mejorar prompt AI |

---

## Cómo Usar

```
1. Auditoría con 3+ personas ← REQUERIDO
2. Completar auditoría
3. Click: 🔍 Patrones
4. Leer recomendaciones
5. Arreglar en n8n
6. Auditar de nuevo
```

---

## Scores

**Reutilización (0-10):**
- 0-3 = ✅ Bien
- 4-6 = ⚠️ Revisar
- 7-10 = 🔴 Arreglar

**Personalización (0-10):**
- Inverso a reutilización
- 10 = Excelente
- 0 = Nada personalizado

---

## Problemas Comunes y Fixes

### ❌ Todos reciben email en admin@mail.com

```javascript
// ANTES
Email Node: TO: admin@mail.com  ← ❌

// DESPUÉS  
Email Node: TO: {{ $json.userEmail }}  ← ✅
```

---

### ❌ Todos guardados como "Cliente" en BD

```javascript
// ANTES
Set Node: { name: "Cliente" }  ← ❌

// DESPUÉS
Set Node: { name: {{ $json.userName }} }  ← ✅
```

---

### ❌ Email enviado en cada turno

```javascript
// ANTES
For each turn:
  sendEmail()  ← ❌ Sin filtro

// DESPUÉS
If NOT emailSentThisTurn:
  sendEmail()
  Set emailSentThisTurn = true  ← ✅
```

---

### ❌ Respuestas genéricas de bot

```javascript
// ANTES
System: "Respond to user queries"  ← ❌ Genérico

// DESPUÉS
System: "Always mention {{ userName }} and reference their request"  ← ✅
```

---

## Checklist de Arreglos

```
□ Cambié emails hardcodeados a {{ $json.userEmail }}
□ Cambié BD hardcodeados a {{ $json.field }}
□ Agregué filtro IF para evitar duplicados
□ Mejoré prompt del AI para personalización
□ Validé que cada conversación tiene ID único
□ Re-audité y patrones desaparecieron
```

---

## Documentación Completa

- 📖 **Guía Completa:** `PATTERN_DETECTION_GUIDE.md`
- 🔧 **Ejemplos Código:** `PATTERN_FIXES_EXAMPLES.md`
- 📋 **Resumen:** `PATTERN_DETECTION_SUMMARY.md`

---

## Preguntas Frecuentes

**P: ¿Necesito 3 personas?**
R: Sí, mínimo 3 para detectar patrones de reutilización.

**P: ¿Cuánto tarda?**
R: 2-4 segundos adicionales en el reporte.

**P: ¿Y si mi bot DEBE usar datos por defecto?**
R: Será reportado como no personalizado (correcto).

**P: ¿Dónde veo los patrones?**
R: Nueva pestaña: 🔍 Patrones (después de auditoría completa).

---

**¿Listo? 🚀**
Audita ahora y descubre los problemas que no sabías que tenías.

⚠️ **Tip:** Comienza con 3 personas. Luego prueba con 5+ para detectar patrones más sutiles.
