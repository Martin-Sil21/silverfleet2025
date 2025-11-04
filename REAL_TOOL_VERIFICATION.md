# 🔧 Sistema de Verificación Real de Herramientas

## Resumen Ejecutivo

Se ha implementado un **sistema completo de verificación en tiempo real** que permite a los auditores **acceder directamente a herramientas externas** (Gmail, Google Calendar, etc.) para confirmar que el agente realmente ejecutó las acciones prometidas **durante la conversación**, no solo post-análisis.

## ✅ Cambios Implementados

### 1. **Gmail Integration** (`services/integrations/EmailIntegration.ts`)
**Nueva funcionalidad completa** para verificar emails enviados:

```typescript
class GmailIntegration {
  // Buscar emails por criterios (remitente, destinatario, asunto, fecha, contenido)
  async searchSentEmails(criteria: EmailSearchCriteria): Promise<EmailDetails[]>
  
  // Obtener detalles completos de un email (headers, body, attachments)
  async getEmailDetails(messageId: string): Promise<EmailDetails | null>
  
  // Verificar si se envió un email específico
  async verifyEmailSent(criteria: EmailSearchCriteria): Promise<EmailVerificationResult>
}
```

**Características**:
- ✅ Búsqueda por múltiples criterios (to, from, subject, date range, body text)
- ✅ Decodificación de contenido base64url de Gmail API
- ✅ Extracción de snippets y body completo
- ✅ Parsing de headers (From, To, Subject, Date)
- ✅ Manejo de estructura multi-parte (text/html/attachments)

**Uso de credenciales**: Requiere `GmailOAuthCredential` con API Key configurado en `credentialsManager`

---

### 2. **Google Calendar Integration** (`services/integrations/CalendarIntegration.ts`)
**Nueva funcionalidad completa** para verificar eventos de calendario:

```typescript
class GoogleCalendarIntegration {
  // Buscar eventos por criterios (título, asistentes, fecha, ubicación)
  async searchEvents(criteria: CalendarSearchCriteria): Promise<CalendarEventDetails[]>
  
  // Obtener detalles de un evento específico
  async getEventDetails(eventId: string, calendarId?: string): Promise<CalendarEventDetails | null>
  
  // Verificar si se creó un evento específico
  async verifyEventCreated(criteria: CalendarSearchCriteria): Promise<CalendarVerificationResult>
}
```

**Características**:
- ✅ Búsqueda por summary, asistentes, ubicación, descripción
- ✅ Filtrado por rango de fechas (afterDate, beforeDate)
- ✅ Parsing completo de eventos (start, end, attendees, organizer, status)
- ✅ Soporte para eventos recurrentes (singleEvents=true)
- ✅ Links directos a eventos en Google Calendar

**Uso de credenciales**: Requiere `GoogleCalendarOAuthCredential` con OAuth2 tokens

---

### 3. **IntegrationManager** (`services/IntegrationManager.ts`)
**Orquestador central** que coordina todas las integraciones:

```typescript
class IntegrationManager {
  // Analizar respuesta del bot y extraer acciones prometidas
  extractActionClaims(botResponse: string, turnNumber: number): ToolActionClaim[]
  
  // Verificar una acción de email contra Gmail API
  async verifyEmailAction(claim: ToolActionClaim): Promise<ToolActionVerification>
  
  // Verificar una acción de calendario contra Calendar API
  async verifyCalendarAction(claim: ToolActionClaim): Promise<ToolActionVerification>
  
  // Verificar TODAS las acciones prometidas en una respuesta
  async verifyAllActions(botResponse: string, turnNumber: number): Promise<ToolActionVerification[]>
  
  // Generar reporte de verificaciones
  generateVerificationReport(verifications: ToolActionVerification[]): string
}
```

**Flujo de trabajo**:
1. **Extracción automática**: Detecta keywords en la respuesta del bot (ej: "te envío el email", "agendé la reunión")
2. **Parsing inteligente**: Extrae emails, fechas, asuntos, asistentes usando regex
3. **Delay configurable**: Espera N segundos antes de verificar (dar tiempo a que el sistema ejecute)
4. **Verificación paralela**: Consulta APIs externas para confirmar acción
5. **Reporte estructurado**: Genera resultados con evidencia y mensajes claros

**Tipos de acciones soportadas**:
- ✅ `email_send` - Envío de emails
- ✅ `calendar_create` - Creación de eventos
- ✅ `calendar_update` - Actualización de eventos
- 🚧 `crm_update` - Actualización de CRM (futuro)
- 🚧 `sms_send` - Envío de SMS (futuro)
- 🚧 `whatsapp_send` - Envío de WhatsApp (futuro)

---

### 4. **Integración con Flujo de Auditoría**

#### **Modificaciones en `geminiService.ts`**:

1. **Nuevo import**:
```typescript
import { IntegrationManager, createIntegrationManager, type IntegrationConfig } from './IntegrationManager';
```

2. **Gestión global** (similar a database auditor):
```typescript
let globalIntegrationManager: IntegrationManager | null = null;

export function initializeGlobalIntegrationManager(config, tools, subflows)
export function getGlobalIntegrationManager(): IntegrationManager | null
export function cleanupGlobalIntegrationManager()
```

3. **Inicialización en `runFullAudit()`**:
```typescript
if (config.integrationConfig?.email || config.integrationConfig?.calendar) {
  initializeGlobalIntegrationManager({
    enabledIntegrations: {
      email: config.integrationConfig.email,
      calendar: config.integrationConfig.calendar
    },
    verificationDelay: config.integrationConfig.verificationDelay || 3
  }, dependencies.tools, dependencies.subflows);
}
```

#### **Modificaciones en `independentConversationRunner.ts`**:

1. **Nuevo import**:
```typescript
import { getGlobalIntegrationManager } from './geminiService';
```

2. **Verificación después de cada respuesta del bot** (después del paso 🔟):
```typescript
const integrationManager = getGlobalIntegrationManager();
if (integrationManager) {
  const botResponse = findAgentMessageText(step.output);
  const toolVerifications = await integrationManager.verifyAllActions(
    botResponse, 
    turnCount
  );
  
  // Guardar verificaciones en estado de conversación
  conv.toolVerifications.push(...toolVerifications);
  
  // Log resultados en tiempo real
  toolVerifications.forEach(v => {
    onProgress({ 
      message: `${v.verified ? '✅' : '❌'} ${v.claim.type}: ${v.message}` 
    });
  });
}
```

#### **Modificaciones en `types.ts`**:

1. **Extendido `ConversationState`**:
```typescript
export type ConversationState = {
  // ... campos existentes
  toolVerifications?: ToolActionVerification[]; // 🔧 Verificaciones de herramientas
};
```

2. **Extendido `AuditConfig`**:
```typescript
export interface AuditConfig {
  // ... campos existentes
  integrationConfig?: {
    email?: { credentialId: string; type: 'gmail-oauth' | 'smtp' };
    calendar?: { credentialId: string; type: 'google-calendar-oauth' };
    verificationDelay?: number; // Segundos de espera antes de verificar
  };
}
```

---

## 🎯 Flujo de Ejecución

### Diagrama de Flujo:

```
┌─────────────────────────────────────┐
│  Usuario inicia auditoría           │
│  con config.integrationConfig       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  runFullAudit() inicializa          │
│  IntegrationManager global          │
│  - Lee credenciales de Gmail        │
│  - Lee credenciales de Calendar     │
│  - Carga herramientas detectadas    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Conversación en progreso (Turn N)  │
│  1. Usuario envía mensaje           │
│  2. Bot responde                    │
│  3. Se toma snapshot BD (AFTER)     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  🔍 IntegrationManager actúa        │
│  extractActionClaims(botResponse)   │
│  - Detecta: "te envío el email"    │
│  - Extrae: destinatario, asunto     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  ⏱️ Espera configurable (3s default) │
│  Dar tiempo a que webhook ejecute   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  📧 Verificación contra API real    │
│  - GmailIntegration.verifyEmailSent()│
│  - Busca en bandeja de enviados     │
│  - Compara destinatario/asunto      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  ✅/❌ Resultado de verificación     │
│  - found: true/false                │
│  - evidence: EmailDetails           │
│  - message: "Email encontrado..."   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  📊 Log en LiveAuditView            │
│  "✅ Email verificado: propuesta..."│
│  o                                  │
│  "❌ Email NO encontrado"           │
└─────────────────────────────────────┘
```

---

## 📝 Ejemplos de Uso

### Ejemplo 1: Verificar Email Enviado

**Bot dice**: "Perfecto Juan, te envío la propuesta formal a juan@empresa.com con todos los detalles."

**Sistema detecta**:
- Acción: `email_send`
- Destinatario: `juan@empresa.com`
- Keywords: "propuesta formal"

**Verificación**:
```typescript
await GmailIntegration.verifyEmailSent({
  to: "juan@empresa.com",
  subject: "propuesta formal",
  afterDate: new Date() // Desde ahora
})
```

**Resultado**:
```
✅ Email verificado: "Propuesta Comercial - Silver Fleet" 
   enviado a juan@empresa.com hace 2 minutos
```

---

### Ejemplo 2: Verificar Evento de Calendario

**Bot dice**: "Listo, agendé la reunión para el martes 15 a las 10:00 con maria@startup.com"

**Sistema detecta**:
- Acción: `calendar_create`
- Fecha: "martes 15"
- Hora: "10:00"
- Asistente: `maria@startup.com`

**Verificación**:
```typescript
await GoogleCalendarIntegration.verifyEventCreated({
  summary: "reunión",
  attendees: ["maria@startup.com"],
  afterDate: new Date()
})
```

**Resultado**:
```
✅ Evento verificado: "Reunión - Silver Fleet Demo" 
   el 15/11/2025 10:00 con 1 asistente(s)
```

---

## 🔐 Configuración de Credenciales

### 1. Gmail OAuth2

**Requerido en `credentialsManager`**:
```typescript
{
  id: "gmail_cred_123",
  type: "gmail-oauth",
  name: "Gmail Auditoría",
  data: {
    apiKey: "ya29.a0AfH6SMBx..." // OAuth2 Access Token
  }
}
```

**Cómo obtener**:
1. Crear proyecto en Google Cloud Console
2. Habilitar Gmail API
3. Crear credenciales OAuth 2.0
4. Obtener Access Token (via OAuth flow)
5. Guardar en credentialsManager

---

### 2. Google Calendar OAuth2

**Requerido en `credentialsManager`**:
```typescript
{
  id: "calendar_cred_456",
  type: "google-calendar-oauth",
  name: "Calendar Auditoría",
  data: {
    clientId: "123456789-abc.apps.googleusercontent.com",
    clientSecret: "GOCSPX-...",
    refreshToken: "1//0eXb...",
    accessToken: "ya29.a0AfH6SMBx..." // Opcional (se puede regenerar)
  }
}
```

**Cómo obtener**:
1. Mismo proyecto en Google Cloud Console
2. Habilitar Google Calendar API
3. Usar mismo OAuth 2.0 credentials
4. Solicitar scope: `https://www.googleapis.com/auth/calendar.readonly`
5. Guardar tokens

---

## 🚀 Cómo Activar

### En `AuditConfig`:

```typescript
const auditConfig: AuditConfig = {
  // ... configuración normal
  integrationConfig: {
    email: {
      credentialId: "gmail_cred_123",
      type: "gmail-oauth"
    },
    calendar: {
      credentialId: "calendar_cred_456",
      type: "google-calendar-oauth"
    },
    verificationDelay: 5 // Esperar 5 segundos antes de verificar
  }
};
```

### En UI (futuro):

```tsx
<Card title="🔗 Verificación de Herramientas">
  <Checkbox 
    label="Verificar envíos de email (Gmail)" 
    onChange={enableEmailVerification}
  />
  <Select 
    label="Cuenta Gmail" 
    options={gmailCredentials}
    value={selectedGmailCred}
  />
  
  <Checkbox 
    label="Verificar eventos de calendario" 
    onChange={enableCalendarVerification}
  />
  <Select 
    label="Cuenta Calendar" 
    options={calendarCredentials}
    value={selectedCalendarCred}
  />
  
  <Input 
    type="number"
    label="Delay de verificación (segundos)"
    value={verificationDelay}
    min={1}
    max={30}
  />
</Card>
```

---

## 📊 Estructura de Datos

### `ToolActionClaim`
```typescript
{
  type: 'email_send' | 'calendar_create' | ...,
  description: "Enviar email a juan@empresa.com",
  extractedData: {
    to: ["juan@empresa.com"],
    subject: "propuesta formal",
    bodySnippet: "Perfecto Juan, te envío..."
  },
  turnNumber: 3,
  timestamp: Date
}
```

### `ToolActionVerification`
```typescript
{
  claim: ToolActionClaim,
  verified: true,
  verificationMethod: "Gmail API",
  evidence: {
    id: "18b3f...",
    from: "bot@silverfleet.com",
    to: ["juan@empresa.com"],
    subject: "Propuesta Comercial - Silver Fleet",
    snippet: "Estimado Juan, adjunto encontrará...",
    date: Date
  },
  message: "✅ Email encontrado: 'Propuesta Comercial...'",
  timestamp: Date
}
```

---

## 🎨 Próximos Pasos (UI)

### Pendiente: Task 5 - Extender LiveAuditView

**Objetivo**: Mostrar verificaciones de herramientas en tiempo real

**Diseño propuesto**:

```tsx
{/* Sección de Verificación de Herramientas */}
{selectedResult.toolVerifications && selectedResult.toolVerifications.length > 0 && (
  <Card title="🔧 Verificación de Herramientas">
    {selectedResult.toolVerifications.map((verification, idx) => (
      <div key={idx} className="verification-item">
        <div className="verification-header">
          <span className={verification.verified ? 'badge-success' : 'badge-error'}>
            {verification.verified ? '✅' : '❌'}
          </span>
          <span className="verification-type">
            {verification.claim.type.replace('_', ' ').toUpperCase()}
          </span>
          <span className="verification-turn">
            Turn {verification.claim.turnNumber}
          </span>
        </div>
        
        <div className="verification-details">
          <p><strong>Promesa:</strong> {verification.claim.description}</p>
          <p><strong>Resultado:</strong> {verification.message}</p>
          
          {verification.evidence && (
            <details>
              <summary>Ver evidencia</summary>
              <pre>{JSON.stringify(verification.evidence, null, 2)}</pre>
            </details>
          )}
        </div>
      </div>
    ))}
    
    {/* Estadísticas */}
    <div className="verification-stats">
      <div className="stat">
        <span className="stat-value">
          {selectedResult.toolVerifications.filter(v => v.verified).length}
        </span>
        <span className="stat-label">Verificadas</span>
      </div>
      <div className="stat">
        <span className="stat-value">
          {selectedResult.toolVerifications.filter(v => !v.verified).length}
        </span>
        <span className="stat-label">Fallidas</span>
      </div>
    </div>
  </Card>
)}
```

---

## 🔒 Seguridad y Permisos

### Gmail API
- **Scopes necesarios**: `https://www.googleapis.com/auth/gmail.readonly`
- **Permisos**: Solo lectura de bandeja de enviados
- **Límites de rate**: 250 unidades/usuario/segundo, 1 billón unidades/día

### Calendar API
- **Scopes necesarios**: `https://www.googleapis.com/auth/calendar.readonly`
- **Permisos**: Solo lectura de calendarios
- **Límites de rate**: 500,000 requests/día por proyecto

### Credenciales
- ✅ Almacenadas en `localStorage` (desarrollo)
- 🚧 Futuro: Backend seguro con encriptación
- ✅ No se envían a logs ni consola
- ✅ Separadas por tipo de integración

---

## 🐛 Debugging

### Logs disponibles:

```typescript
console.log(`📧 [Gmail] Buscando emails: ${query}`);
console.log(`📧 [Gmail] Encontrados ${data.messages.length} email(s)`);
console.log(`📅 [Calendar] Buscando eventos: ${params}`);
console.log(`📅 [Calendar] Encontrados ${data.items.length} evento(s)`);
console.log(`🔍 [IntegrationManager] Detectadas ${claims.length} promesa(s)`);
console.log(`✅ ${verified ? '✅' : '❌'} ${verification.message}`);
```

### Verificar en UI (LiveAuditView):

```
🔍 Verificando herramientas...
  ✅ email_send: Email encontrado: "Propuesta..."
  ❌ calendar_create: No se encontró ningún evento...
```

---

## 📈 Métricas y Costos

### API Quotas (Google):
- **Gmail API**: 1,000,000,000 unidades/día (gratis hasta cierto límite)
- **Calendar API**: 500,000 requests/día (gratis hasta cierto límite)

### Latencia esperada:
- Gmail search: ~200-500ms
- Calendar search: ~150-400ms
- Total con delay: ~3-5 segundos por verificación

### Escalabilidad:
- ✅ Verificaciones en paralelo por conversación
- ✅ Rate limiting implementado (delay configurable)
- ✅ Caché de credenciales en memoria
- 🚧 Futuro: Queue system para verificaciones masivas

---

## ✅ Estado Actual

### Completado:
1. ✅ Gmail Integration (búsqueda, parsing, verificación)
2. ✅ Calendar Integration (búsqueda, parsing, verificación)
3. ✅ IntegrationManager (extracción, orquestación, reporte)
4. ✅ Integración con flujo de auditoría (geminiService + independentConversationRunner)
5. ✅ Gestión global de manager
6. ✅ Logs en tiempo real durante auditoría
7. ✅ Almacenamiento de resultados en ConversationState

### Pendiente:
1. ⏳ UI para configurar credenciales OAuth (en AgentConfig.tsx)
2. ⏳ UI para mostrar verificaciones en LiveAuditView
3. ⏳ OAuth flow completo (actualmente requiere tokens manuales)
4. ⏳ Soporte para más herramientas (CRM, SMS, WhatsApp)
5. ⏳ Backend para almacenamiento seguro de credenciales

---

## 🎓 Cómo Usar (Desarrollador)

### Paso 1: Configurar credenciales

```typescript
import { saveCredential } from './services/credentialsManager';

saveCredential({
  id: generateCredentialId(),
  type: 'gmail-oauth',
  name: 'Gmail Auditoría',
  data: {
    apiKey: 'YOUR_ACCESS_TOKEN'
  },
  createdAt: Date.now(),
  updatedAt: Date.now()
});
```

### Paso 2: Configurar audit

```typescript
const config: AuditConfig = {
  // ... configuración normal de workflow, criteria, etc.
  integrationConfig: {
    email: {
      credentialId: "gmail_cred_id",
      type: "gmail-oauth"
    }
  }
};
```

### Paso 3: Ejecutar auditoría

```typescript
await runFullAudit(
  config,
  testCases,
  onProgress,
  onResultComplete,
  onAllComplete,
  language
);
```

### Paso 4: Ver resultados

```typescript
// En onProgress callback:
onProgress: (update) => {
  console.log(update.message);
  // "✅ email_send: Email encontrado..."
  
  if (update.step) {
    const conv = conversations.find(c => c.testCase.id === update.testCaseId);
    if (conv?.toolVerifications) {
      console.log('Verificaciones totales:', conv.toolVerifications.length);
    }
  }
}
```

---

## 🎉 Impacto

### Antes:
- ❌ Solo análisis post-conversación con IA
- ❌ No hay confirmación real de acciones
- ❌ Falsos positivos/negativos por interpretación de IA
- ❌ No se accede a herramientas externas

### Ahora:
- ✅ Verificación en tiempo real durante conversación
- ✅ Acceso directo a Gmail/Calendar APIs
- ✅ Evidencia concreta (email real, evento real)
- ✅ Logs inmediatos en UI
- ✅ Estructurado y extensible para más herramientas

### Beneficios:
1. **Mayor confianza**: Auditoría basada en datos reales, no solo análisis de texto
2. **Debugging más fácil**: Ver exactamente qué falló y por qué
3. **Compliance**: Evidencia auditable de acciones del bot
4. **UX mejorada**: Feedback en tiempo real al auditor
5. **Escalable**: Arquitectura permite agregar más integraciones fácilmente

---

## 🔧 Mantenimiento

### Agregar nueva integración (ej: WhatsApp):

1. **Crear `services/integrations/WhatsAppIntegration.ts`**:
```typescript
export class WhatsAppIntegration {
  async searchSentMessages(criteria): Promise<MessageDetails[]> { ... }
  async verifyMessageSent(criteria): Promise<VerificationResult> { ... }
}
```

2. **Extender `IntegrationManager`**:
```typescript
private whatsappIntegration?: WhatsAppIntegration;

// En constructor:
if (config.enabledIntegrations.whatsapp) {
  this.whatsappIntegration = new WhatsAppIntegration(credentialId);
}

// En verifyAllActions:
case 'whatsapp_send':
  verification = await this.verifyWhatsAppAction(claim);
  break;
```

3. **Actualizar tipos**:
```typescript
// types.ts
integrationConfig?: {
  // ... existentes
  whatsapp?: { credentialId: string; type: 'whatsapp-api' };
}
```

4. **Listo!** La arquitectura se encarga del resto.

---

## 📚 Referencias

- [Gmail API - Search](https://developers.google.com/gmail/api/guides/filtering)
- [Gmail API - Messages](https://developers.google.com/gmail/api/reference/rest/v1/users.messages)
- [Google Calendar API - Events](https://developers.google.com/calendar/api/v3/reference/events)
- [OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server)

---

**Última actualización**: 01 de Noviembre, 2025  
**Autor**: GitHub Copilot  
**Estado**: ✅ Backend completo | ⏳ UI pendiente
