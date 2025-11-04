# 🧪 Silver Fleet - Guía de Testing

## Quick Start para Testing

### 1. Preparar Entorno

```bash
cd silverfleet2025
npm install
npm run dev
```

Abrir: http://localhost:3000

---

### 2. Preparar Workflow de n8n

**Requisitos mínimos del workflow**:
- ✅ Webhook trigger node (entrada)
- ✅ Al menos 1 nodo AI Agent
- ✅ (Opcional) Nodos de Supabase
- ✅ (Opcional) Nodos de Email/Calendar

**Exportar desde n8n**:
1. Abrir workflow en n8n
2. Menú → Download
3. Guardar como `workflow.json`

---

### 3. Testing Visual Audit (Sin Dependencias Externas)

#### Objetivo
Probar que el sistema puede:
- Cargar y parsear workflows
- Generar test cases con IA
- Simular conversaciones
- Analizar resultados

#### Pasos

1. **Cargar Workflow**
   - Click "Choose File"
   - Seleccionar `workflow.json`
   - Esperar detección automática

2. **Revisar Detección**
   - ✅ Agentes AI detectados
   - ✅ Tools detectados
   - (Puede mostrar BDs/herramientas no configuradas - OK para visual)

3. **Configurar Criterios**
   - Usar criterios por defecto O
   - Click "Suggest Criteria with AI" para personalizados
   - Mínimo 3 criterios

4. **Ejecutar Visual Audit**
   - Seleccionar "Visual Audit"
   - Test Case Count: 2-3 (para prueba rápida)
   - Click "Start Audit"

5. **Verificar Resultados**
   - ✅ Generación de test cases
   - ✅ Ejecución nodo por nodo
   - ✅ Análisis con scores
   - ✅ Report final con detalles

**Resultado Esperado**: ✅ Audit completo sin errores

---

### 4. Testing Real Audit con Supabase

#### Requisitos Previos
- ✅ Proyecto Supabase activo
- ✅ service_role key (Dashboard → Settings → API)
- ✅ Al menos 1 tabla con datos
- ✅ Workflow n8n desplegado y funcionando

#### Preparar Supabase

```sql
-- Ejemplo de tabla de conversaciones
CREATE TABLE conversaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id TEXT,
  phone TEXT,
  message TEXT,
  response TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insertar datos de prueba
INSERT INTO conversaciones (conversation_id, phone, message)
VALUES ('test-001', '+1234567890', 'Hola, necesito ayuda');
```

#### Pasos

1. **Cargar Workflow**
   - Mismo proceso que visual audit

2. **Configurar Credencial Supabase**
   - En panel "Detected Databases"
   - Click "Create New Credential"
   - Tipo: Supabase
   - URL: `https://xxx.supabase.co`
   - Service Role Key: `eyJhbG...` (desde Supabase dashboard)
   - Save

3. **Asociar Credencial**
   - En cada tabla detectada
   - Select dropdown: Elegir credencial creada

4. **Configurar Endpoint**
   - Seleccionar "Real Audit"
   - Endpoint URL: URL de tu webhook n8n
   - Ejemplo: `https://n8n.yourserver.com/webhook/test`

5. **Generar Payload de Prueba**
   - Click "Generate Sample Payload"
   - Revisar JSON generado
   - Ajustar si es necesario
   - Click "Test Endpoint" para verificar

6. **Ejecutar Audit**
   - Test Case Count: 1-2 (primera vez)
   - Click "Start Audit"

7. **Monitorear Ejecución**
   - Ver progreso en tiempo real
   - "Live Audit View" muestra turn-by-turn
   - Observar snapshots de BD

8. **Analizar Resultados**
   - ✅ Scores por criterio
   - ✅ Database Changes Viewer
   - ✅ Tool Verifications (si aplica)
   - ✅ Discrepancias detectadas

**Resultado Esperado**: 
- ✅ Conversaciones exitosas
- ✅ Cambios en BD detectados
- ✅ Reporte completo con verificaciones

---

### 5. Testing con Email Verification (Opcional)

#### Requisitos
- Workflow que envíe emails
- Credencial de Email configurada

#### Configurar Gmail OAuth

1. **Google Cloud Console**
   - Crear proyecto
   - Habilitar Gmail API
   - Crear OAuth 2.0 credentials
   - Agregar scopes: `gmail.readonly`

2. **En Silver Fleet**
   - Panel "External Tools Detected"
   - Create New Credential → Email
   - Provider: Gmail
   - OAuth Token: (obtenido de Google)

3. **Ejecutar Audit**
   - Real Audit con endpoint configurado
   - Sistema verificará emails automáticamente

4. **Verificar Resultados**
   - Tool Verifications Viewer
   - ✅ Si email fue enviado
   - ❌ Si agente dijo que envió pero no lo hizo

---

### 6. Testing con Calendar Verification (Opcional)

Similar a Email pero con Google Calendar API.

---

## 🔍 Casos de Prueba Recomendados

### Test Case 1: Happy Path
**Objetivo**: Usuario logra su objetivo sin problemas

```json
{
  "title": "Usuario pregunta y obtiene respuesta",
  "persona": "Cliente nuevo con pregunta simple",
  "goal": "Obtener información sobre horarios",
  "initialPayload": {
    "phone": "+1234567890",
    "message": "¿Cuál es el horario de atención?"
  }
}
```

**Resultado Esperado**:
- ✅ Conversación exitosa
- ✅ Score alto (8-10)
- ✅ Sin discrepancias

---

### Test Case 2: Edge Case
**Objetivo**: Usuario con input ambiguo

```json
{
  "title": "Usuario con pregunta vaga",
  "persona": "Persona indecisa que no sabe lo que quiere",
  "goal": "Necesita ayuda pero no sabe expresarlo",
  "initialPayload": {
    "phone": "+0987654321",
    "message": "Hola"
  }
}
```

**Resultado Esperado**:
- ✅ Agente maneja ambigüedad
- ✅ Hace preguntas clarificadoras
- ⚠️ Puede tomar varios turnos

---

### Test Case 3: Error Handling
**Objetivo**: Agente debe manejar errores gracefully

```json
{
  "title": "Usuario solicita algo imposible",
  "persona": "Cliente exigente con expectativas irreales",
  "goal": "Solicita algo que el sistema no puede hacer",
  "initialPayload": {
    "phone": "+1122334455",
    "message": "Quiero hablar con el CEO ahora mismo"
  }
}
```

**Resultado Esperado**:
- ✅ Respuesta cortés explicando limitaciones
- ✅ Ofrece alternativa
- ❌ No inventa información falsa

---

## 🐛 Troubleshooting

### Problema: "Endpoint returned 401/403"
**Causa**: Webhook n8n no es público o tiene auth

**Solución**:
```bash
# En n8n, asegurar webhook settings:
- Authentication: None (para testing)
- Respond: Immediately
```

---

### Problema: "No database changes detected"
**Causa**: Usando `anon` key en lugar de `service_role` key

**Solución**:
```bash
# En Supabase Dashboard → Settings → API:
- Usar service_role key (empieza con eyJhbG...)
- NO usar anon key
```

---

### Problema: "Gemini API quota exceeded"
**Causa**: Demasiadas llamadas a la API

**Solución**:
```bash
# Reducir test case count:
- Empezar con 1-2 test cases
- Máximo 12 turnos por conversación
- Esperar unos minutos entre audits
```

---

### Problema: "Tool verification failed"
**Causa**: Credenciales de herramientas incorrectas o expiradas

**Solución**:
```bash
# Verificar OAuth tokens:
- Gmail/Calendar tokens expiran cada 1 hora
- Regenerar token si es necesario
- Asegurar scopes correctos
```

---

## 📊 Métricas de Éxito

### Visual Audit
- ✅ Carga de workflow < 2 segundos
- ✅ Generación de test cases < 10 segundos
- ✅ Ejecución completa < 30 segundos (2 test cases)
- ✅ Score promedio > 7/10

### Real Audit
- ✅ Inicialización de auditores < 5 segundos
- ✅ Respuesta del endpoint < 3 segundos por turno
- ✅ Snapshots de BD < 2 segundos cada uno
- ✅ Verificación de herramientas < 5 segundos
- ✅ 100% de conversaciones completas

### Database Auditing
- ✅ Detección de cambios en tiempo real
- ✅ 0 falsos positivos en discrepancias
- ✅ Todos los inserts/updates/deletes capturados

---

## 🎯 Checklist de Testing Completo

### Funcionalidad Core
- [ ] Carga de workflow.json
- [ ] Parsing de agentes vs tools
- [ ] Auto-detección de tablas
- [ ] Auto-detección de herramientas
- [ ] Generación de criterios con IA
- [ ] Generación de test cases
- [ ] Generación de payload de muestra

### Visual Audit
- [ ] Ejecución secuencial de test cases
- [ ] Simulación nodo por nodo
- [ ] Canvas de ejecución visual
- [ ] Análisis con Gemini AI
- [ ] Scores por criterio
- [ ] Reporte final completo

### Real Audit
- [ ] Validación de endpoint
- [ ] Test de conectividad
- [ ] Ejecución paralela de conversaciones
- [ ] Progress tracking en tiempo real
- [ ] Detección de objetivos cumplidos
- [ ] Max 12 turnos por conversación

### Database Auditing
- [ ] Conexión a Supabase
- [ ] Snapshots antes/después
- [ ] Detección de INSERT
- [ ] Detección de UPDATE
- [ ] Detección de DELETE
- [ ] Filtrado por conversationId
- [ ] Resumen de operaciones

### Tool Verification
- [ ] Extracción de promesas del agente
- [ ] Verificación de emails (Gmail/Outlook/SendGrid)
- [ ] Verificación de calendario (Google/Outlook)
- [ ] Detección de discrepancias
- [ ] Badges ✅/❌ en reporte

### UI/UX
- [ ] Responsive design
- [ ] Feedback en tiempo real
- [ ] Manejo de errores graceful
- [ ] Validación de inputs
- [ ] Loading states claros
- [ ] Mensajes de éxito/error

---

## 🚀 Flujo de Testing Recomendado

### Día 1: Setup y Visual Audit
1. ✅ Instalar dependencias
2. ✅ Cargar workflow simple
3. ✅ Ejecutar visual audit básico
4. ✅ Verificar que genera reportes

### Día 2: Real Audit Básico
1. ✅ Configurar Supabase
2. ✅ Crear credencial
3. ✅ Testear endpoint
4. ✅ Ejecutar 1 conversación real

### Día 3: Database Auditing
1. ✅ Verificar snapshots
2. ✅ Confirmar detección de cambios
3. ✅ Revisar resumen de operaciones
4. ✅ Validar discrepancias

### Día 4: Tool Verifications
1. ✅ Configurar Email credential
2. ✅ Ejecutar audit con envío de emails
3. ✅ Verificar detección de emails
4. ✅ Probar calendar si aplica

### Día 5: Testing Completo
1. ✅ Workflow complejo con todo integrado
2. ✅ Múltiples conversaciones simultáneas
3. ✅ Validar todos los componentes
4. ✅ Documentar bugs/mejoras

---

**Sistema listo para testing exhaustivo** 🧪✅
