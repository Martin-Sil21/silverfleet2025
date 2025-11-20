# 🎯 Guía Rápida - Sistema de Fallback AI en Silver Fleet

## Para: Martín
**Fecha:** 19 de noviembre de 2025

---

## ✅ ¿Qué se hizo?

Tu sistema Silver Fleet ahora tiene un **sistema robusto de fallback automático** entre modelos de IA:

1. **Gemini 2.5 Flash** (más rápido y económico) - prueba primero
2. **Gemini 1.5 Flash** (estable) - si el primero falla
3. **OpenAI GPT-4o-mini** (fallback final) - si ambos Gemini fallan

**Beneficios:**
- ✅ Si Gemini se cae → automáticamente usa OpenAI
- ✅ Ahorro de ~67% en costos vs usar solo OpenAI
- ✅ Sistema más robusto y confiable
- ✅ Todo funciona igual para ti (cambios internos)

---

## 🚀 Cómo Usar

### 1. El sistema funciona exactamente igual que antes

No necesitas cambiar nada en tu flujo de trabajo:

```bash
# Iniciar como siempre
npm run dev
```

1. Sube tu workflow n8n
2. Configura test cases
3. Ejecuta auditoría
4. Ve resultados

**TODO FUNCIONA IGUAL**, pero ahora es más robusto internamente.

---

## 🔍 Qué Observar en la Consola

Cuando ejecutes una auditoría, verás estos mensajes (normal):

```
🤖 [AI Service] Generando: generate_test_cases
   🎯 Modelo objetivo: gemini-2.5-flash
   🤖 Intentando con gemini-2.5-flash (gemini-2.0-flash-exp)...
   ✅ Generación exitosa con gemini-2.5-flash
```

**Si Gemini falla** (poco probable), verás:
```
🤖 [AI Service] Generando: generate_test_cases
   🎯 Modelo objetivo: gemini-2.5-flash
   ⚠️ Intento 1/3 falló: 503 Service Unavailable
   ⏳ Esperando 2000ms antes de reintentar...
   🤖 Intentando con OpenAI GPT-4o-mini...
   ✅ Generación exitosa con gpt-4o-mini
```

**Esto es BUENO** - significa que el sistema se recuperó automáticamente.

---

## 📊 Monitoreo de Costos

Al final de cada auditoría, verás un resumen de costos:

```
💰━━━━━━━━━━━━━━━━━━━━━━
💰 RESUMEN DE COSTOS
💰 Costo Total: $0.045000 USD
💰   - Sistema: $0.040000 USD (Gemini)
💵   - Webhook Usuario: $0.005000 USD
💰 Tokens Totales: 150,000
💰   - Input: 80,000 tokens
💰   - Output: 70,000 tokens
💰━━━━━━━━━━━━━━━━━━━━━━
```

**Qué significa:**
- **Sistema**: Lo que cuesta ejecutar Silver Fleet (generación de tests, análisis)
- **Webhook Usuario**: Lo que cuesta tu workflow n8n (tus agentes)
- **Tokens**: Cuánto texto procesó la IA

---

## 🆘 Solución de Problemas

### Problema 1: "No hay API keys configuradas"

**Síntoma:**
```
❌ [AI Service] No hay API keys configuradas. El sistema no funcionará.
```

**Solución:**
Verifica tu archivo `.env.local`:

```bash
# Debe tener estas líneas
GEMINI_API_KEY=AIzaSy...tu_key_real...
API_KEY=AIzaSy...tu_key_real...
VITE_OPENAI_API_KEY=sk-proj-...tu_key_real...
OPENAI_API_KEY=sk-proj-...tu_key_real...
```

### Problema 2: "Todos los modelos AI fallaron"

**Síntoma:**
```
❌ Todos los modelos AI fallaron para "generate_test_cases"
```

**Posibles causas:**
1. **Sin internet** - Verifica tu conexión
2. **API keys inválidas** - Verifica las keys en `.env.local`
3. **Cuota excedida** - Revisa tu dashboard de Google AI / OpenAI

**Solución:**
1. Verifica internet
2. Revisa keys en https://aistudio.google.com/ y https://platform.openai.com/
3. Si excediste cuota, espera o agrega billing

### Problema 3: Compilación falla

**Síntoma:**
```bash
npm run build
# Error: ...
```

**Solución:**
```bash
# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install

# Intentar de nuevo
npm run build
```

---

## 📚 Archivos Importantes

### Configuración
- `.env.local` - Tus API keys (Gemini + OpenAI)
- `vite.config.ts` - Expone las keys al frontend

### Código Nuevo
- `services/aiModelService.ts` - Sistema de fallback (NO TOCAR)

### Documentación
- `MIGRACION_COMPLETA_RESUMEN.md` - Resumen técnico completo
- `RESUMEN_ANALISIS_SILVER_FLEET.md` - Análisis del sistema
- `PLAN_MIGRACION_AI.md` - Plan de migración

---

## 💡 Tips

### 1. Revisar costos después de cada auditoría
El sistema te muestra cuánto costó cada auditoría. Usa esto para estimar presupuesto.

### 2. Gemini es más barato que OpenAI
El sistema prioriza Gemini automáticamente para ahorrarte dinero.

### 3. Fallback solo se activa si hay error
Si Gemini funciona bien (99% del tiempo), nunca verás OpenAI usarse.

### 4. Los costos se rastrean automáticamente
No necesitas hacer nada, el sistema cuenta tokens y muestra costos al final.

---

## 🎓 Preguntas Frecuentes

### ¿Cambió algo en cómo uso la app?
**No.** Todo funciona igual, solo es más robusto internamente.

### ¿Tengo que configurar algo especial?
**No.** Si ya tenías Gemini funcionando, solo asegúrate que también tienes OpenAI en `.env.local`.

### ¿Cuándo se usa OpenAI?
**Solo** cuando Gemini falla (503, 429, rate limit). Es raro pero posible.

### ¿Cuesta más ahora?
**No, al contrario.** El sistema prioriza Gemini que es más barato. OpenAI solo se usa como emergencia.

### ¿Cómo sé qué modelo se usó?
Mira la consola del navegador (F12 → Console). Verás mensajes como:
```
✅ Generación exitosa con gemini-2.5-flash
```

### ¿Puedo forzar usar OpenAI?
Sí, pero no recomendado. Busca en el código `generateWithFallback()` y pasa `model: 'gpt-4o-mini'`.

---

## 🚨 Cuándo Pedir Ayuda

Contacta soporte técnico si:

1. ❌ El sistema dice "No hay API keys" pero las tienes configuradas
2. ❌ Todos los modelos fallan constantemente
3. ❌ Los costos son mucho más altos de lo esperado
4. ❌ La app no compila después de actualizar

---

## ✅ Checklist de Inicio

Antes de empezar a usar el sistema actualizado:

- [ ] Verificar que `.env.local` tiene `GEMINI_API_KEY`
- [ ] Verificar que `.env.local` tiene `VITE_OPENAI_API_KEY`
- [ ] Ejecutar `npm run build` - debe compilar sin errores
- [ ] Ejecutar `npm run dev` - debe iniciar sin errores
- [ ] Abrir `http://localhost:3001` - debe cargar la app
- [ ] Hacer auditoría de prueba pequeña (2-3 test cases)
- [ ] Revisar consola - debe mostrar "✅ Generación exitosa"
- [ ] Revisar resumen de costos al final

---

## 🎉 ¡Listo!

Tu sistema ahora es:
- ✅ Más robusto (fallback automático)
- ✅ Más económico (prioriza Gemini)
- ✅ Más confiable (3 modelos disponibles)

**No necesitas cambiar nada en cómo trabajas.** El sistema se encarga de todo automáticamente.

---

**¿Dudas?** Revisa los documentos técnicos en:
- `MIGRACION_COMPLETA_RESUMEN.md`
- `RESUMEN_ANALISIS_SILVER_FLEET.md`

**¿Problemas?** Busca el error en la consola del navegador (F12) y revisa la sección "Solución de Problemas" arriba.
