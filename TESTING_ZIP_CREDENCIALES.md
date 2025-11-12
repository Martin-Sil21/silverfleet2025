# 🧪 TESTING - ZIP + Credenciales Detectadas

## 🚀 Inicio Rápido

### 1. Inicia el servidor
```bash
cd C:\Users\marti\OneDrive\Escritorio\Proyectos\silverfleet2025
npm run dev
# Abre: http://localhost:3000
```

### 2. Prepara un ZIP de prueba

Opción A: Usa el agente de prueba que ya existe
```bash
# Ir a: tests/fixtures/
# Comprime: typescript-test-agent.ts + package.json
# Resultado: agent-test.zip
```

Opción B: Crea tu propio ZIP
```
agent/
├── package.json
├── src/
│   ├── main.ts
│   └── tools.ts
└── .gitignore
```

### 3. Carga en la UI

1. Click en **"TypeScript/Node"**
2. **Arrastra tu `.zip`** a la zona de drop (o click para seleccionar)
3. **Espera** a que el parser procese
4. **Verifica** los resultados

---

## ✅ Qué Esperar

### Consola del Navegador
```
🔍 Parsing code agent from 5 files
📄 Processed 5 files
✅ Parsed workflow with 3 nodes (1 agent + 2 tools)
📊 Agent info: {
  framework: "express",
  toolCount: 2,
  tools: [
    { id: "tool_1", name: "queryUsers" },
    { id: "tool_2", name: "sendEmail" }
  ]
}
```

### Si Cargaste un Agente con Supabase
```
✅ External Services Detected:
   • Supabase Database (requires credentials)

✅ Databases Detected:
   • supabase (tables: users, conversations)
```

### Si Cargaste un Agente sin DBs
```
No external services detected
(eso está bien, significa no necesita credenciales)
```

---

## 🎯 Casos de Prueba

### Test 1: ZIP Simple (Express + Tools)
**Archivo:** `tests/fixtures/typescript-test-agent.ts` + `package.json`

**Espera:**
- ✅ Framework detectado: "express"
- ✅ Tools: 2 (sendConfirmationEmail, saveToDatabase)
- ✅ Endpoints: 1 (/webhook/support)
- ✅ Sin errores al procesar ZIP

**Resultado esperado:**
```
✅ Step 1 Completado (puedes continuar a Step 2)
```

### Test 2: ZIP con Supabase
**Crea un archivo `tools-supabase.ts`:**
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export async function getConversations(userId: string) {
  const { data } = await supabase
    .from('conversations')
    .select('*')
    .eq('user_id', userId);
  return data;
}

export async function saveMessage(message: string, userId: string) {
  const { data } = await supabase
    .from('messages')
    .insert([{ text: message, user_id: userId }]);
  return data;
}
```

**Zip conteniendo:**
```
agent/
├── package.json (with @supabase/supabase-js)
└── tools-supabase.ts
```

**Espera:**
- ✅ External Service detectado: "Supabase"
- ✅ Database detectado: "supabase"
- ✅ Tables detectadas: "conversations", "messages"
- ✅ Ambas herramientas: [Requires Credentials]

**Resultado esperado:**
```
✅ External Services Required:
   ❌ Supabase (credentials missing)

✅ Databases Detected:
   • Supabase (tables: conversations, messages)
```

### Test 3: ZIP con Email (Nodemailer)
**Crea un archivo `tools-email.ts`:**
```typescript
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASSWORD
  }
});

export async function sendAlert(email: string, message: string) {
  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: email,
    subject: 'Alert from Agent',
    text: message
  };
  
  await transporter.sendMail(mailOptions);
  return { status: 'sent' };
}
```

**Zip conteniendo:**
```
agent/
├── package.json (with nodemailer)
└── tools-email.ts
```

**Espera:**
- ✅ External Service detectado: "Email Service"
- ✅ Tool: "sendAlert" [Requires Credentials]

**Resultado esperado:**
```
✅ External Services Required:
   ❌ Email Service (credentials missing)
```

### Test 4: ZIP Complejo (Multi-Servicios)
**Crea archivos:**
- `package.json` (con @supabase, nodemailer, axios)
- `db-tools.ts` (con Supabase)
- `email-tools.ts` (con Nodemailer)
- `api-tools.ts` (con axios)

**Espera:**
- ✅ 3 External Services detectadas
- ✅ 1 Database detectada (Supabase)
- ✅ 3 Tools, todos [Requires Credentials]

**Resultado esperado:**
```
✅ External Services Required:
   ❌ Supabase (credentials missing)
   ❌ Email Service (credentials missing)
   ❌ External API (credentials missing)

✅ Databases Detected:
   • Supabase
```

---

## 🔍 Debugging

### Si el ZIP no se procesa

**Síntomas:**
```
❌ "Error processing files"
❌ "No valid files detected"
```

**Soluciones:**
1. Verifica que el ZIP contiene archivos `.ts`, `.js`, o `package.json`
2. No debe ser mayor a 50 MB
3. Los archivos no pueden estar en carpetas muy profundas

### Si no detecta servicios

**Síntomas:**
```
✅ Parser ejecutó
❌ No external services detected
```

**Posibles causas:**
1. El servicio no está en los patrones soportados
2. El import no está visible en el código
3. El patrón de importación es diferente

**Solución:**
- Revisa `services/codeAgentParser.ts` línea ~224
- Agrega nuevo patrón si es necesario

### Si no detecta tablas

**Síntomas:**
```
✅ Database: Supabase
❌ tables: undefined
```

**Motivo:**
- Las tablas solo se extraen si usas `supabase.from('table_name')`
- Si usas variables dinámicas, no se pueden extraer

**Solución:**
- Si quieres probarlo, hardcodea los nombres de tabla

---

## 📊 Verificación Final

### Console Output Esperado
```
✅ ZIP extraído: 5 archivos
✅ Processed 5 files
✅ Databases Detected: 1
✅ External Services Detected: 2
✅ Parsed workflow with 4 nodes (1 agent + 3 tools)
```

### UI Estado Esperado
```
Step 1: Configure Workflow ✅ COMPLETADO
├── ✅ ZIP cargado y procesado
├── ✅ Framework detectado
├── ✅ Tools detectados
├── ✅ Servicios detectados
└── 🔼 Ready for credentials (si hay servicios)

Step 2: (Próximo paso cuando completes Step 1)
```

---

## 🎯 Regression Testing

### Verifica que N8n AÚN funciona

1. Carga un workflow n8n normal
2. Debe funcionar como antes (sin cambios)
3. **Importante:** No debe mostrar "databases" o "external services" (porque n8n tiene su propio sistema)

---

## 📋 Checklist de Testing

- [ ] Inicia servidor: `npm run dev`
- [ ] UI carga sin errores
- [ ] Test 1: ZIP simple (Express)
  - [ ] ZIP se procesa
  - [ ] Tools se detectan
  - [ ] No hay errores en consola
- [ ] Test 2: ZIP con Supabase
  - [ ] Database detectada
  - [ ] Tables extraídas
  - [ ] External Service mostrada
- [ ] Test 3: ZIP con Email
  - [ ] Email Service detectada
  - [ ] Tool enriquecido con credentials flag
- [ ] Test 4: ZIP Complejo
  - [ ] Múltiples servicios detectados
  - [ ] No hay duplicados
- [ ] Regression: N8n workflow
  - [ ] Carga normal
  - [ ] Audita normal
  - [ ] Reporte generado

---

## 💬 Reporta Resultados

Cuando termines testing, comparte:

```
✅ Test 1 (Simple ZIP):
   - Status: [PASS/FAIL]
   - Tools detected: [count]
   - Errors: [if any]

✅ Test 2 (Supabase):
   - Status: [PASS/FAIL]
   - Databases detected: [count]
   - Tables detected: [list]
   - Errors: [if any]

✅ Test 3 (Email):
   - Status: [PASS/FAIL]
   - Services detected: [count]
   - Credentials flag: [yes/no]
   - Errors: [if any]

✅ Test 4 (Complex):
   - Status: [PASS/FAIL]
   - Services: [count]
   - Databases: [count]
   - Errors: [if any]

✅ Regression (N8n):
   - Status: [PASS/FAIL]
   - Same behavior: [yes/no]
   - Errors: [if any]
```

---

## 🚀 Siguiente Fase (Cuando Todo Funcione)

- [ ] UI improvements (mostrar servicios detectados)
- [ ] Credential validation (bloquear si falta configurar)
- [ ] Database auditing (validar cambios en DBs)
- [ ] Tool verification (confirmar que se ejecutó)

