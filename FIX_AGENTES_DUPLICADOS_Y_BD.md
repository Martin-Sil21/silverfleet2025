# 🔧 FIX: Agentes Duplicados y Detección de BD

## 📋 Problemas Resueltos

### 1. ❌ Agentes Duplicados
**Problema:** Mismo agente detectado 2-3 veces con el mismo prompt

**Causa:** 
- Detector de Gemini capturaba el agente
- Detector de "custom agents" (con system prompt) lo capturaba OTRA VEZ
- Sin control de archivos ya procesados

**Solución:**
```typescript
// ANTES: Todos los detectores corrían en paralelo
if (content.includes('gemini')) {
  agents.push(extractGeminiAgent(file));
}
// ... más detectores siguen ejecutándose en el mismo archivo

if (systemPrompt && systemPrompt.length > 50) {
  agents.push(createAgentFromPrompt(file, systemPrompt)); // ← DUPLICADO
}

// DESPUÉS: Control de flujo con continue + threshold más alto
let agentDetected = false;

if (content.includes('gemini')) {
  const agent = extractGeminiAgent(file);
  if (agent) {
    agents.push(agent);
    processedFiles.add(file.path);
    agentDetected = true;
    continue; // ← SALTAR al siguiente archivo
  }
}

// Custom agents solo si NO fue detectado antes
if (!agentDetected && !processedFiles.has(file.path)) {
  const systemPrompt = extractSystemPromptFromFile(content);
  if (systemPrompt && systemPrompt.length > 100) { // ← Umbral aumentado
    agents.push(createAgentFromPrompt(file, systemPrompt));
  }
}
```

---

### 2. ❌ Nombres de Agentes Raros ("Output, Agent", "index Agent")
**Problema:** Nombres como "Output, Agent" por archivos con comas o puntos

**Solución:**
```typescript
// 🔥 Helper para sanitizar nombres
function sanitizeAgentName(name: string): string {
  return name
    .replace(/[,._-]+/g, ' ')  // Remover caracteres raros
    .replace(/\s+/g, ' ')        // Normalizar espacios
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Uso:
agentName = sanitizeAgentName(file.name.replace(/\.(ts|js|py)$/, ''));
// "output," → "Output"
// "my_agent.test" → "My Agent Test"
```

---

### 3. ❌ BuilderBot sin Prompt
**Problema:** Flows de BuilderBot sin keywords → prompt vacío

**Solución:**
```typescript
// ANTES: Siempre retornaba agente
if (!hasFlows) return null;
return { ...agent };

// DESPUÉS: Validar que tenga keywords O prompt
if (keywords.length === 0 && !systemPrompt) {
  return null; // ← NO crear agente si no tiene info útil
}
```

---

### 4. ❌ Base de Datos "SQL Migrations" (genérico)
**Problema:** No detectaba que era Supabase/PostgreSQL

**Solución:**
```typescript
// ANTES:
return [{
  provider: 'SQL Migrations',
  type: 'sql',
  confidence: 0.8
}];

// DESPUÉS: Detectar Supabase por patrones
let isSupabase = false;
let provider = 'SQL Migrations';
let dbType = 'sql';

if (file.path.toLowerCase().includes('supabase') || 
    originalContent.includes('uuid_generate_v4()') ||
    originalContent.includes('gen_random_uuid()')) {
  isSupabase = true;
  provider = 'Supabase/PostgreSQL';
  dbType = 'postgresql';
}

return [{
  provider,
  type: dbType,
  confidence: isSupabase ? 0.95 : 0.8
}];
```

---

### 5. ❌ Tablas de BD No Visibles
**Problema:** Schema parseado pero no visible en logs

**Solución:**
```typescript
// En summarizeDatabases()
dbMap.set(type, {
  provider: type,
  confidence: schema.confidence || 0.8,
  evidence: schema.detectedFrom || [],
  // 🔥 NUEVO: Incluir metadata del schema
  ...(schema.tables && { tables: schema.tables }),
  ...(schema.type && { type: schema.type }),
} as any);

// En AgentConfig.tsx logs
if ((db as any).tables && Array.isArray((db as any).tables)) {
  const tables = (db as any).tables;
  console.log(`      Tablas detectadas: ${tables.length}`);
  tables.slice(0, 5).forEach((table: any) => {
    console.log(`         - ${table.name} (${table.fields?.length || 0} campos)`);
  });
}
```

---

### 6. ✅ Deduplicación Mejorada
**Antes:** Deduplicaba solo por filePath + 100 chars de prompt

**Ahora:** Deduplicación inteligente que mantiene el agente más completo:
```typescript
function deduplicateAgents(agents: CodeAgentComponent[]): CodeAgentComponent[] {
  const seen = new Map<string, CodeAgentComponent>();
  
  for (const agent of agents) {
    const primaryKey = `${filePath}:${promptKey}`;
    
    if (!seen.has(primaryKey)) {
      seen.set(primaryKey, agent);
      unique.push(agent);
    } else {
      // Mantener el que tenga más información
      const existingScore = (existing.tools?.length || 0) + (existing.systemPrompt?.length || 0);
      const newScore = (agent.tools?.length || 0) + (agent.systemPrompt?.length || 0);
      
      if (newScore > existingScore) {
        // Reemplazar con el más completo
        unique[index] = agent;
      }
    }
  }
  
  return unique;
}
```

---

## 📊 Resultado Esperado

### Antes
```
🤖 Agentes IA detectados:
   1. Output, Agent (agent)          ← Nombre raro
   2. index Agent (agent)             ← Genérico
   3. index Agent (agent)             ← DUPLICADO
   4. app Flow (agent)
   5. index Flow (agent)              ← Sin keywords
   6. mediaProcessing Agent (agent)
   7. mediaProcessing Agent (agent)   ← DUPLICADO

📊 Bases de datos detectadas:
   1. SQL Migrations (confidence: 0.8)  ← Genérico
      Evidence: supabase-setup.sql
```

### Después
```
🤖 Agentes IA detectados:
   1. Agent 1: Planificador y Validador (agent)
      Framework: Google Gemini
      Prompt: Sos el Agente 1 - Planificador y Validador...
      Tools: buscar_productos, calc_durlock, actualizar_resumen
      
   2. Agent 2: Asesor Comercial (agent)
      Framework: Google Gemini
      Prompt: IDENTIDAD: Martín, asesor técnico-comercial...
      
   3. Main App Flow (hola, menu, ayuda) (agent)
      Framework: BuilderBot
      
   4. Media Processing Agent (agent)
      Framework: Google Gemini
      Prompt: El usuario envió esta imagen. Analizarla...

📊 Bases de datos detectadas:
   1. Supabase/PostgreSQL (confidence: 0.95)
      Evidence: base-ts-baileys-postgres/supabase-setup.sql
      Tablas detectadas: 3
         - resumen_conversaciones_obra_seco (17 campos)
         - memoria_temporal_obra_seco (3 campos)
         - chat_history_obra_seco (4 campos)
```

---

## 🎯 Cambios Técnicos

### Archivos Modificados

1. **`services/deepProjectAnalyzer.ts`**
   - ✅ Control de flujo con `continue` para evitar duplicados
   - ✅ Threshold aumentado (50 → 100 chars) para custom agents
   - ✅ Función `sanitizeAgentName()` para limpiar nombres
   - ✅ Deduplicación inteligente con scoring
   - ✅ Extracción mejorada de nombres desde exports
   - ✅ Validación de BuilderBot (keywords O prompt)

2. **`services/advancedSchemaParser.ts`**
   - ✅ Detección de Supabase por patrones (`uuid_generate_v4()`, path con "supabase")
   - ✅ Confidence aumentado a 0.95 para Supabase
   - ✅ Provider específico: "Supabase/PostgreSQL" vs "SQL Migrations"
   - ✅ Helper `extractDefaultValue()` para valores default

3. **`components/AgentConfig.tsx`**
   - ✅ Log de tablas de BD con cantidad de campos
   - ✅ Límite de 5 tablas + contador de restantes

---

## ✅ Testing

Recarga la app y sube el ZIP de BuilderBot:

```bash
npm run dev
# Subir ZIP → Ver consola
```

**Checklist:**
- [ ] No hay agentes duplicados
- [ ] Nombres descriptivos ("Agent 1: Planificador")
- [ ] BD dice "Supabase/PostgreSQL" (no "SQL Migrations")
- [ ] Muestra tablas con cantidad de campos
- [ ] BuilderBot flows tienen keywords en el nombre
- [ ] Log indica "X duplicates removed"

---

**Estado:** ✅ COMPLETADO  
**Fecha:** Noviembre 13, 2025
