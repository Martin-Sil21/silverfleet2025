# 🧪 Guía de Testing: TypeScript End-to-End

## Verificación Rápida (5 minutos)

### 1️⃣ Verificar que todo compiló
```bash
npm run build
# ✅ Debería decir: ✓ built in X.XXs
```

### 2️⃣ Iniciar dev server
```bash
npm run dev
# ✅ Debería ver: ➜ Local: http://localhost:3000/
```

### 3️⃣ Abrir UI
```
http://localhost:3000
```
Debería ver:
- ✅ Selector de agentes (n8n + TypeScript)
- ✅ Botones para ambos tipos
- ✅ Sin errores en consola (F12)

---

## Testing Completo (15 minutos)

### Test 1: Verificar que N8N Sigue Funcionando

1. **Preparar n8n JSON**
   - Busca un workflow n8n que tengas
   - O crea uno simple

2. **Auditar n8n**
   - Click "n8n Workflows"
   - Sube el JSON
   - Verifica que se detecten nodos
   - Completa steps 1-5
   - Inicia auditoría
   - Espera reporte

3. **Verificar**
   - ✅ Reporte genera correctamente
   - ✅ Scores se calculan
   - ✅ Sin errores en consola

---

### Test 2: Cargar y Auditar TypeScript

1. **Obtén archivos de prueba**
   ```
   tests/fixtures/typescript-test-agent.ts
   tests/fixtures/package.json
   ```

2. **Carga en UI**
   - Click "TypeScript/Node"
   - Arrastra ambos archivos (.ts + package.json)
   - Espera a que parsee

3. **Verifica parseado**
   - Debería detectar:
     - Framework: Express
     - Tools: sendConfirmationEmail, saveToDatabase
     - Endpoint: POST /webhook/support
     - Payload: { conversationId, userName, userEmail, ... }

4. **Completa Steps**
   - Step 1: Ya está (parseado)
   - Step 2: No hay subflows (auto-complete)
   - Step 3: Configure credenciales (opcional para testing)
   - Step 4: Escribe criterios de auditoría
   - Step 5: Inicia auditoría

5. **Espera Reporte**
   - Debería generar test cases
   - Auditar el agente
   - Generar scores
   - Mostrar análisis

---

### Test 3: Comparar N8N vs TypeScript

1. **Auditaste ambos?** ✅
   - n8n: ✅ Funciona
   - TypeScript: ✅ Funciona

2. **Verifica similitudes**
   - Ambos generan reporte
   - Ambos tienen scores
   - Ambos tienen ejecutionTrace
   - Ambos muestran criterios

3. **Valida que es agnóstico**
   - El flujo es idéntico
   - Los reportes tienen mismo formato
   - Scores se calculan igual
   - No hay diferencias "mágicas"

---

## Checklist: ¿Todo OK?

```
✅ Build sin errores
✅ No hay console errors
✅ Selector de agentes visible
✅ n8n carga y audita
✅ TypeScript carga
✅ TypeScript audita
✅ Reportes se generan
✅ Scores se calculan
✅ Mismo formato para ambos
```

---

## Si Algo Falla

### Error: "No valid TypeScript files"
- Verifica que cargues .ts + package.json
- No uses .js

### Error: "Parse error"
- Revisa consola (F12)
- El parser busca export functions
- Verifica que .ts tenga export

### Error: "Endpoint test failed"
- Para TypeScript, el test es opcional
- O inicia el servidor en puerto indicado

### n8n dejó de funcionar
- Eso es un BUG
- Revisa git diff
- Rollback cambios en N8nParser

---

## Resultado Esperado

```
✅ N8n: Funciona de punta a punta
✅ TypeScript: Funciona de punta a punta  
✅ Ambos: Agnóstico (mismo código)
✅ UI: Selector funcional
✅ Reports: Mismo formato
✅ Sin breaking changes
```

---

## Siguiente Paso

Si todo funciona:
1. Commit: "✨ TypeScript auditing end-to-end working"
2. Agregar JavaScript (2h)
3. Agregar Python (6h)
4. Celebrar 🎉

Si algo no funciona:
1. Debug en consola
2. Revisa el gitdiff
3. Restaura si es necesario
