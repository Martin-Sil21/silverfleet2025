# 🔄 Auditar Agentes TypeScript/Node

Silver Fleet ahora soporta auditar agentes de código además de n8n workflows.

## ¿Qué es lo nuevo?

Antes: Solo podías auditar workflows de n8n
Ahora: Puedes auditar:
- ✅ n8n Workflows (visual nodes)
- ✅ **Agentes TypeScript/Node** (NUEVO!)
- 🚧 Python (próximamente)

## Cómo auditar tu agente TypeScript

### 1. En la interfaz, selecciona "TypeScript/Node Agent"

![Select Agent Type]

### 2. Carga los archivos de tu proyecto

Puedes cargar:
- `package.json` (para detectar framework)
- `src/agent.ts` (agente principal)
- `src/tools.ts` (herramientas)
- `src/handlers.ts` (manejadores)
- Otros archivos TypeScript relevantes

**No necesitas el proyecto completo**, solo los archivos clave.

### 3. Silver Fleet Detecta Automáticamente

El sistema analiza:
- 🎯 **Framework**: Baileys, OpenAI, LangChain, Custom
- 📝 **System Prompt**: Desde comentarios JSDoc
- 🔧 **Herramientas**: Funciones `export function`
- 🌐 **Endpoints**: URLs HTTP detectadas
- 📦 **Payload**: Schema esperado inferido

### 4. Continúa como siempre

El resto del flujo es idéntico:
- Configura criterios de auditoría
- Define payload de entrada
- Ejecuta auditoría (visual o real)
- Obtén reporte

## Ejemplo: Agente Baileys (WhatsApp)

Si tienes un proyecto como este:

```
builderbot-obraseco/
├── package.json          ← Cargar
├── src/
│   ├── agent.ts         ← Cargar
│   ├── tools.ts         ← Cargar
│   ├── handlers.ts      ← Cargar
│   └── config.ts
└── ...
```

### `package.json`
```json
{
  "name": "builderbot-obraseco",
  "description": "WhatsApp bot for construction orders",
  "dependencies": {
    "@adiwajshing/baileys": "^6.0.0"
  }
}
```
**Silver Fleet detecta**: Framework = Baileys ✅

### `src/agent.ts`
```typescript
/**
 * WhatsApp bot que gestiona órdenes de construcción
 * - Recibe especificaciones de obra
 * - Valida presupuestos
 * - Envía confirmaciones
 */
export async function handleMessage(msg) {
  // ...
}
```
**Silver Fleet detecta**: System Prompt = "WhatsApp bot que gestiona..." ✅

### `src/tools.ts`
```typescript
/**
 * Valida que el presupuesto sea razonable
 */
export function validateBudget(amount: number): boolean {
  return amount > 0 && amount < 999999;
}

/**
 * Registra la orden en la BD
 */
export async function saveOrder(order: Order): Promise<void> {
  // ...
}
```
**Silver Fleet detecta**: 2 herramientas ✅

## ¿Cómo funciona internamente?

```
Tu Agente TypeScript
        ↓
[CodeAgentParser]
        ↓
Detecta propósito, herramientas, endpoints
        ↓
[AgentAdapter]
        ↓
Convierte a formato estándar de Silver Fleet
        ↓
[Gemini Service + Database Auditor]
        ↓
Auditoría igual que n8n
        ↓
Reporte consolidado
```

## Limitaciones Actuales

1. **Análisis estático**: Lee código sin ejecutarlo
   - ✅ Detecta estructura y herramientas
   - ⚠️ No ejecuta funciones (como Gemini si lo hace)

2. **Frameworks soportados**:
   - ✅ Baileys (WhatsApp)
   - ✅ OpenAI
   - ✅ LangChain
   - ✅ Custom TypeScript
   - 🚧 FastAPI/Flask (Python)

3. **Auditoría Real**:
   - Para auditoría real (no visual), necesitas un endpoint HTTP
   - Silver Fleet enviará requests automáticamente

## FAQ

**P: ¿Tengo que subir el proyecto completo?**
R: No. Solo necesitas los archivos principales:
- package.json (para detectar framework)
- Archivos con agentes y herramientas

**P: ¿Se ejecuta mi código?**
R: No. Silver Fleet hace análisis estático (lee el código).
Para auditoría real, necesitas un endpoint que ejecute tu agente.

**P: ¿Puedo mezclar n8n con agentes de código?**
R: Ahora no, pero es roadmap futuro.

**P: ¿Qué pasa si no detecta mi framework?**
R: Se marca como "custom-typescript" y funciona igual.
Los criterios de auditoría se aplican normalmente.

**P: ¿Se guarda mi código?**
R: No. Todo se procesa en tu navegador.
Los archivos nunca se envían a nuestros servidores (solo se usan para análisis local).

## Roadmap

- [ ] Soporte para Python
- [ ] Análisis dinámico (ejecutar funciones)
- [ ] Detectar tests unitarios
- [ ] Generar tests automaticamente
- [ ] Mezclar n8n + code agents en mismo workflow

## Problemas o Sugerencias

Contacta al equipo de Silver Fleet con:
1. Archivos del agente (sin datos sensibles)
2. Framework usado
3. Qué NO detectó correctamente

---

¡Feliz auditoria! 🚀
