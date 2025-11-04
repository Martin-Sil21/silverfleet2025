# 🐛 Debug: Table Detection Issue

## Estado Actual

### ✅ Implementado
1. **Sistema de testeo de credenciales** (`credentialTester.ts`)
   - Botón "Test Connection" en modal de credenciales
   - Valida conexión a Supabase antes de guardar
   
2. **Auto-detección de tablas** (`workflowDatabaseAnalyzer.ts`)
   - Múltiples estrategias de búsqueda
   - Logging extensivo para debugging
   
3. **Vista previa de configuración DB** (AgentConfig Step 5)
   - Muestra tablas detectadas
   - Warnings cuando hay problemas
   
4. **Verificación de herramientas** (`toolExecutionVerifier.ts`)
   - Detecta ejecución de email, calendar, CRM
   - Se integra en análisis final

### ❌ Problema Actual
**Las tablas no se detectan** en tu workflow a pesar de tener 7 credenciales configuradas.

## Causa Raíz
El analizador busca nombres de tablas en estas ubicaciones:
```javascript
params.table
params.tableName
params.tableId
params.resource
params.operation.table
```

**Pero tu workflow de n8n podría usar una estructura diferente.**

## 🔍 Cómo Debuggear

### Paso 1: Ver los logs
1. Abre el navegador
2. Presiona `F12` para abrir DevTools
3. Ve a la pestaña **Console**
4. Refresca la página (`Ctrl + F5`)
5. Sube tu workflow y configura credenciales
6. En Step 5, busca en la consola logs que empiecen con:
   ```
   🔍 [Workflow Analyzer] Analizando X nodos...
   📊 Nodo Supabase encontrado: "..."
   ```

### Paso 2: Identificar la estructura
Los logs mostrarán algo como:
```json
Params (primeros 500 chars): {"operation":"insert","table":"conversaciones",...}
```
O tal vez:
```json
Params: {"resource":"conversaciones","action":"create",...}
```

### Paso 3: Compartir el output
Copia y pega aquí el contenido de los logs, especialmente:
- Cuántos nodos Supabase encuentra
- Qué contiene `params` en cada nodo
- Si aparece algún nombre de tabla en el JSON

## 🎯 Lo que buscamos

Necesitamos saber **dónde está el nombre de la tabla** en tus nodos de Supabase. Ejemplos de ubicaciones posibles:

```javascript
// Opción 1: Directo
{ table: "conversaciones" }

// Opción 2: En resource
{ resource: "conversaciones" }

// Opción 3: En options
{ options: { table: "conversaciones" } }

// Opción 4: En un array
{ tables: [{ name: "conversaciones" }] }

// Opción 5: En operation
{ operation: { resource: "conversaciones" } }
```

## 🚀 Próximos Pasos

Una vez que veas los logs:
1. Si ves nombres de tabla en el JSON → actualizaremos el código para buscar en esa ubicación específica
2. Si no hay nombres de tabla → revisaremos el tipo de nodos que usa tu workflow
3. Si hay errores → los solucionaremos uno por uno

## 💡 Tip Adicional

Si ves este warning en Step 5:
> Database Configuration Issues: No database tables detected

Haz clic derecho en esa sección → Inspect → ve a Console y verás logs más detallados.

---

**Estado**: Esperando logs del navegador para continuar debugging.
