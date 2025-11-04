# Silver Fleet AI Agent Auditor - Copilot Instructions

## Project Overview
Silver Fleet is an AI-powered auditing system for n8n workflows. It generates synthetic user personas, simulates conversations, and validates AI agent behaviors against custom criteria—either through visual simulation or real API endpoint testing.

**Core Architecture**: React SPA (Vite + TypeScript) → Google Gemini AI → n8n workflow audit → optional real database verification

## Key Concepts

### 1. Dual Audit Modes
- **Visual Audit**: Simulates workflow execution using Gemini AI to emulate each node (agents + tools). No external calls.
- **Real Audit**: Sends actual HTTP requests to configured n8n webhook endpoints, tracks real conversation state, monitors database changes.

### 2. State Machine Flow
The app follows strict status transitions (see `AuditStatus` enum in `types.ts`):
```
CONFIG → AUDITING → REPORT_READY
       ↓         ↓ (optional)
       ERROR   IMPROVING → IMPROVEMENT_REPORT_READY
```
Never set status to `AUDITING` without valid `auditConfig`. UI rendering depends on this state.

### 3. Data Model Hierarchy
```
AuditConfig (workflow definition + criteria + mode)
  └─> TestCase[] (AI-generated user personas with goals)
       └─> AuditResult[] (execution traces + AI analysis per persona)
            └─> ExecutionStep[] (turn-by-turn or node-by-node evidence)
```

### 4. n8n Workflow Parsing
`services/n8nParser.ts` transforms raw n8n JSON into `ParsedN8nWorkflow`:
- Detects **AI agent nodes** by searching for system prompt fields (`systemMessage`, `system_prompt`, `systemInstruction`)
- All other nodes are classified as **tool nodes** (non-AI utilities)
- Extracts webhook URLs from `httpRequest` nodes for real audits
- Maintains original node IDs and connections for visual canvas rendering

### 5. Real-Time Conversation Simulation
**Key Pattern** (`services/geminiService.ts::runFullAudit`):
```typescript
// Real audit runs MAX_CONVERSATION_TURNS (12) rounds
for (let turnCount = 1; turnCount <= MAX_CONVERSATION_TURNS; turnCount++) {
  // 1. Generate unique user messages for ALL active conversations (parallel)
  const userMessages = await Promise.all(
    activeConversations.map(conv => 
      generateUserMessageText(conv.testCase, conv.history, language)
    )
  );
  
  // 2. Send all requests to endpoint (parallel)
  const responses = await Promise.all(/* fetch calls */);
  
  // 3. Update conversation histories IMMEDIATELY
  // 4. Check if goals met, mark complete if true
}
```
**Critical**: Append to `conv.history` BEFORE generating next message to avoid repetition.

### 6. Database Auditing System
`services/realDatabaseAuditor.ts` verifies agent claims vs actual DB changes:
- **Snapshot-based diffing**: Takes DB snapshots before/after each turn, compares to detect INSERT/UPDATE/DELETE
- **Intelligent filtering**: Uses workflow analysis (`workflowDatabaseAnalyzer.ts`) to auto-detect relevant filter fields (e.g., `sessionId`, `phone`)
- **Auto-schema mapping**: AI-powered field detection via `databaseSchemaAnalyzer.ts` finds conversation/user/blocked status fields
- **Tool verification**: `toolVerificator.ts` validates if agent executed promised actions (email sends, calendar events, etc.)

**Workflow info extraction pattern** (see `analyzeWorkflowDatabases`):
```typescript
// Detects patterns like:
node.parameters?.table = "conversaciones"
node.parameters?.filterField = "{{ $json.sessionId }}" 
// → Creates mapping: conversaciones.sessionId ← payload.sessionId
```

### 7. Credentials Management
`services/credentialsManager.ts` stores DB/API credentials in localStorage:
- Supports: Supabase, Airtable, Google Sheets, Email, Calendar, Postgres, MySQL, MongoDB
- Use `generateCredentialId()` for new credentials
- Retrieved via `getCredentialById()` when tools need config

### 8. Subflow & External Tool Detection
`services/workflowAnalyzer.ts` scans n8n workflows for:
- **Subflows**: Detects `executeWorkflow` nodes → requires uploading referenced workflow JSON
- **External tools**: Identifies email/calendar/CRM/messaging nodes → requires credentials config

Pattern: `AgentConfig.tsx` displays detected items, requires user to upload JSON/select credentials before audit can run.

## Development Patterns

### State Updates in Real Audits
Always update `liveAuditData` state via `setLiveAuditData()` callback for UI reactivity:
```typescript
const step: ExecutionStep = { nodeId: `Turn ${N}`, ... };
onProgress({ 
  testCaseId: conv.testCase.id,
  step: step  // This updates LiveAuditView in real-time
});
```

### Payload Generation Strategy
`generateSamplePayload()` uses first 2 nodes to infer expected structure. **Must** include `conversationId` field—add fallback if missing:
```typescript
if (!parsed.conversationId) {
  parsed.conversationId = `conv_${Date.now()}`;
}
```

### i18n Convention
All user-facing text uses translation keys via `useTranslation()` hook:
```typescript
const { t, language } = useTranslation();
return <p>{t('errorTitle')}</p>;  // Loads from locales/en.json or es.json
```
Always add keys to BOTH `locales/en.json` and `locales/es.json`.

### Gemini AI Prompting Rules
1. **Language instruction**: Append `getLanguageInstruction(language)` to every Gemini prompt to enforce Spanish/English output
2. **JSON responses**: Use `responseMimeType: "application/json"` + `responseSchema` for structured data
3. **Rate limits**: Add `delay(500)` between visual audit node executions
4. **Persona consistency**: Pass full conversation history to `generateUserMessageText()` to avoid repeating messages

### Component Organization
```
components/
├── AgentConfig.tsx       # Main config form (workflow upload, criteria, audit type)
├── AuditReport.tsx       # Results display with per-test-case drill-down
├── LiveAuditView.tsx     # Real-time progress for real audits (turn-by-turn)
├── ExecutionCanvas.tsx   # Visual node-by-node trace animation
└── icons/                # Heroicons-style SVG components
```

**Card pattern**: Wrap major sections in `<Card>` component for consistent styling.

## Critical Files

### Core Services
- `services/geminiService.ts` — ALL Gemini AI interactions (test case generation, workflow execution, analysis)
- `services/realDatabaseAuditor.ts` — Database snapshot/diff engine for real audits
- `services/n8nParser.ts` — Workflow JSON → internal data model transformation
- `services/workflowAnalyzer.ts` — Subflow/tool detection logic

### Type Definitions
- `types.ts` — Central type definitions (AuditConfig, TestCase, AuditResult, WorkflowNode, etc.)

### Entry Points
- `App.tsx` — Main state machine controller, renders different views based on AuditStatus
- `index.tsx` — React root + LanguageProvider wrapper

## Build & Run

```bash
npm install              # Install dependencies
npm run dev             # Dev server on http://localhost:3000
npm run build           # Production build → dist/
```

**Environment**: Requires `GEMINI_API_KEY` in `.env.local` (Vite exposes as `process.env.API_KEY`)

## Common Tasks

### Adding a New Audit Criterion
1. Add translation keys to `locales/en.json` and `es.json`
2. Update `DEFAULT_CRITERIA` in `AgentConfig.tsx`
3. AI will auto-evaluate in `analyzeResult()` based on criteria array

### Supporting a New Database Type
1. Extend `CredentialType` in `credentialsManager.ts`
2. Add credential form fields in `AgentConfig.tsx::renderCredentialFields()`
3. Implement query logic in `RealDatabaseAuditor.queryTable()` switch statement

### Extending Tool Verification
1. Add tool type to `DetectedTool` in `workflowAnalyzer.ts`
2. Update detection arrays (`EMAIL_NODE_TYPES`, `CRM_NODE_TYPES`, etc.)
3. Implement verification logic in `services/toolVerificator.ts::verifyAllTools()`

## Anti-Patterns to Avoid

❌ **Don't** mutate `auditResults` directly—always use `setAuditResults()` callback  
❌ **Don't** forget to call `handleProgressUpdate()` during long operations (users need feedback)  
❌ **Don't** assume payload structure—use defensive checks (`payload?.field`)  
❌ **Don't** create duplicate Supabase clients—`getOrCreateSupabaseClient()` caches instances  
❌ **Don't** execute Markdown notebook cells—only code cells can run  

## Testing Strategy

- **Visual audits** are faster for rapid iteration (no external deps)
- **Real audits** require: valid endpoint URL + test success + sample payload
- Database audits need `service_role` Supabase key (not `anon` key) to bypass RLS
- Use `testCaseCount: 1-3` during development to minimize Gemini API costs

## Architecture Decisions

**Why Gemini for everything?**: Unified model for test generation, simulation, and analysis—simpler than multi-model orchestration  
**Why localStorage for credentials?**: No backend dependency, suitable for single-user dev tool  
**Why snapshot-based DB auditing?**: Works with any DB—no change data capture setup required  
**Why conversation state machine?**: Prevents UI race conditions from async audit operations  

## Performance Notes

- Parallel conversation execution in real audits (all test cases run simultaneously per turn)
- Visual audits are sequential (one test case at a time) to maintain trace clarity
- Database snapshots filter by conversation identifiers to minimize data transfer
- Gemini Flash model (`gemini-2.5-flash`) for message generation, Pro model for analysis
