# 🚧 Mejoras Pendientes del Sistema de Auditoría

**Estado**: Incompleto
**Fecha**: 2025-01-16

---

## ✅ COMPLETADO: Sección de Base de Datos

### Lo que se mejoró:
1. **Estado Final Primero**: Ahora muestra el estado final de cada tabla (cuántos registros quedaron)
2. **Últimos Registros**: Muestra los 3 últimos registros guardados por tabla
3. **Historial Colapsable**: El detalle completo de operaciones está colapsado por defecto
4. **Más Visual**: Cards grandes con números destacados

### Ubicación:
- `components/ProfessionalAuditReport.tsx` - Líneas 428-515

---

## ❌ PENDIENTE: Comparación Automática de Precios

### Problema:
El sistema no extrae ni compara precios automáticamente. El usuario debe hacerlo manualmente.

### Lo que se necesita:
1. **Extractor de Precios**:
   - Buscar patrones en conversaciones: `$1000`, `1000 pesos`, etc.
   - Extraer precios de campos específicos en BD (precio, monto, total, etc.)
   - Extraer precios mencionados en system prompts de agentes

2. **Comparador Inteligente**:
   - Normalizar formatos (con/sin $, con/sin decimales)
   - Comparar precio_mencionado vs precio_en_BD
   - Detectar discrepancias automáticamente

3. **Visualización**:
   - Tabla comparativa clara
   - Highlight de discrepancias
   - % de diferencia

### Archivos a crear/modificar:
- `services/priceExtractor.ts` (NUEVO)
- `services/priceComparator.ts` (NUEVO)
- `components/ProfessionalAuditReport.tsx` (Mejorar pestaña Precios)

---

## ❌ PENDIENTE: Integración de Custom Hooks

### Problema:
El análisis detecta custom hooks (ej: `obrasecoDb.getChatHistory()`) pero no los usa bien durante la auditoría.

### Lo que se detecta actualmente:
- `services/deepProjectAnalyzer.ts` detecta custom hooks
- `services/databaseWrapperDetector.ts` detecta wrappers de BD
- Se guardan en `codeProject.deepAnalysis.hooks`

### Lo que falta:
1. **Pasar hooks al auditor**: 
   - Cuando se ejecuta una auditoría ZIP, pasar los hooks detectados al `RealDatabaseAuditor`
   
2. **Usar hooks para filtrar BD**:
   - Si el hook usa `session_id`, el auditor debería saber qué campo filtrar
   - Mapear hook → tabla → campo_filtro automáticamente

3. **Verificar uso de hooks**:
   - Detectar en la respuesta del bot si mencionó algo que implica uso de un hook
   - Verificar que la BD refleje esa operación

### Archivos a modificar:
- `services/geminiService.ts` - Pasar hooks al inicializar auditor
- `services/realDatabaseAuditor.ts` - Usar hooks para queries inteligentes
- `services/auditAnalyzer.ts` - Verificar uso de hooks en análisis

---

## ❌ PENDIENTE: Verificación de Herramientas Externas

### Problema:
El análisis detecta herramientas (Gmail, Calendar, etc.) pero no se verifican bien.

### Lo que se detecta:
- `services/integrationMapper.ts` detecta integraciones
- `services/workflowDependencyAnalyzer.ts` detecta tools

### Lo que falta:
1. **Pestaña "Herramientas" en el reporte**:
   - Mostrar qué herramientas se usaron
   - Verificaciones por herramienta (enviado, no enviado, error)
   - Evidencia de uso (logs, respuestas de APIs)

2. **Verificador inteligente**:
   - Para Gmail: verificar que realmente se envió el email
   - Para Calendar: verificar que se creó el evento
   - Para APIs: verificar llamadas y respuestas

3. **Mock vs Real**:
   - Detectar si se usó mock o herramienta real
   - Advertir si debería usar real pero usó mock

### Archivos a modificar:
- `components/ProfessionalAuditReport.tsx` - Mejorar pestaña Tools
- `services/toolVerificator.ts` - Mejorar lógica de verificación
- Agregar verificadores específicos por tipo de tool

---

## ❌ PENDIENTE: Análisis Semántico de System Prompts

### Problema:
Los system prompts de los agentes contienen información clave (precios, políticas, restricciones) que no se extrae ni se usa en la auditoría.

### Lo que se necesita:
1. **Extractor de Información Clave**:
   - Precios mencionados en prompts
   - Políticas (ej: "no dar descuentos mayores a 10%")
   - Restricciones (ej: "solo atender de 9 a 18hs")
   - Datos de productos/servicios

2. **Comparador Prompt vs Realidad**:
   - ¿El bot respetó los precios del prompt?
   - ¿Siguió las políticas?
   - ¿Respetó las restricciones?

3. **Visualización en Reporte**:
   - Sección "Cumplimiento de Políticas"
   - Tabla de verificación (política → cumplida/violada)

### Archivos a crear:
- `services/promptAnalyzer.ts` (NUEVO)
- `services/policyChecker.ts` (NUEVO)

---

## 📋 Prioridades

### 🔥 Alta (Implementar ya):
1. ✅ Estado final de BD (HECHO)
2. ❌ Comparación automática de precios
3. ❌ Integración de custom hooks en auditoría

### 🟡 Media (Siguiente iteración):
4. Verificación de herramientas externas
5. Análisis semántico de prompts

### 🔵 Baja (Futuro):
6. Gráficos y estadísticas avanzadas
7. Export a PDF/Excel
8. Comparación entre auditorías

---

## 🧪 Testing

### Para validar mejoras:
1. Cargar el ZIP de ObraSeco
2. Ejecutar auditoría completa
3. Verificar:
   - ✅ Estado final de BD se muestra correctamente
   - ❌ Precios se comparan automáticamente
   - ❌ Custom hooks se usan en queries
   - ❌ Herramientas externas se verifican

---

## 📝 Notas

- El usuario necesita el sistema **funcional y completo**, no a medias
- Priorizar **claridad y utilidad** sobre complejidad técnica
- El reporte debe ser **apto para boludos** (palabras del usuario)
- El estado final es más importante que el historial

