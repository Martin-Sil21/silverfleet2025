# Auditoría de Base de Datos

## Descripción General

El sistema de auditoría ahora incluye capacidades de tracking y análisis de operaciones de base de datos, permitiendo evaluar cómo los agentes conversacionales manejan la información almacenada.

## Características

### 1. Mock Database Service

El servicio `databaseService.ts` proporciona una base de datos simulada en memoria que:

- **Registra todas las operaciones**: READ, WRITE, UPDATE, DELETE
- **Mantiene estado por conversación**: Cada test case tiene su propia instancia de BD
- **Simula tablas y registros**: Soporta un esquema JSON configurable

### 2. Configuración

#### En la UI (`AgentConfig.tsx`)

```typescript
// Habilitar tracking de BD
enableDatabaseTracking: true

// Definir esquema inicial
databaseSchema: {
  "productos": [
    {"id": "prod_1", "nombre": "Cielorraso PVC", "precio": 4500}
  ],
  "clientes": [],
  "pedidos": []
}
```

#### Operaciones Disponibles

```typescript
const db = getDatabaseForConversation(conversationId);

// Leer datos
const productos = db.query('productos');
const producto = db.query('productos', (p) => p.id === 'prod_1');

// Insertar
db.insert('clientes', { id: 'cli_1', nombre: 'Juan', telefono: '+54911...' });

// Actualizar
db.update('productos', (p) => p.id === 'prod_1', { precio: 5000 });

// Eliminar
db.delete('pedidos', (p) => p.id === 'ord_123');
```

### 3. Generación de Test Cases

El sistema ahora genera personas y objetivos que naturalmente requieren interacciones con la base de datos:

```typescript
// Ejemplo de persona generada automáticamente
{
  title: "Consulta de producto específico",
  persona: "Cliente metódico que necesita información detallada antes de comprar",
  conversationGoal: "Obtener precio y disponibilidad del producto X",
  // El agente deberá consultar la BD para responder
}
```

### 4. Tracking Durante Auditoría

El servicio registra automáticamente:

- **Tipo de operación**: READ, WRITE, UPDATE, DELETE
- **Tabla afectada**: Nombre de la tabla
- **Timestamp**: Momento exacto de la operación
- **Datos**: Información involucrada (opcional)

### 5. Resumen de Actividad

Al finalizar cada conversación, se genera un `DatabaseOperationSummary`:

```typescript
{
  totalOperations: 15,
  reads: 10,
  writes: 3,
  updates: 2,
  deletes: 0,
  tablesUsed: ['productos', 'clientes', 'pedidos'],
  recordsCreated: 3,
  operations: [
    { type: 'READ', table: 'productos', timestamp: 1234567890 },
    // ...más operaciones
  ]
}
```

### 6. Análisis y Evaluación

El análisis de resultados considera las operaciones de BD:

- ¿El agente consultó la información necesaria?
- ¿Se guardaron datos correctamente cuando era esperado?
- ¿Las operaciones son coherentes con el contexto de la conversación?
- ¿La recuperación de información fue oportuna?

### 7. Visualización

#### Durante Auditoría en Vivo (`LiveAuditView`)

- Panel lateral con estadísticas en tiempo real
- Contador de operaciones por tipo
- Listado de tablas utilizadas
- Registro cronológico de operaciones

#### En el Reporte Final (`AuditReport`)

- Resumen de operaciones por test case
- Gráficos de actividad de BD
- Tablas utilizadas destacadas
- Exportación a CSV incluye métricas de BD

## Ejemplo de Uso Completo

### 1. Configurar Esquema

```json
{
  "productos": [
    {"id": "prod_1", "nombre": "Producto A", "precio": 1000, "stock": 50},
    {"id": "prod_2", "nombre": "Producto B", "precio": 2000, "stock": 30}
  ],
  "clientes": [],
  "pedidos": []
}
```

### 2. El Sistema Genera Personas

```javascript
// Persona 1: Consulta de stock
{
  title: "Verificar disponibilidad",
  persona: "Cliente urgente que necesita el producto YA",
  goal: "Confirmar que hay stock del producto A"
}

// Persona 2: Registro de pedido
{
  title: "Realizar pedido",
  persona: "Cliente decidido listo para comprar",
  goal: "Generar un pedido de 5 unidades del producto B"
}
```

### 3. Durante la Conversación

```
Usuario: "Hola, tienen el producto A disponible?"
→ Agent consulta BD: db.query('productos', p => p.id === 'prod_1')
→ Operación registrada: READ en tabla 'productos'

Agente: "Sí, tenemos 50 unidades en stock."

Usuario: "Perfecto, quiero comprar 5."
→ Agent guarda en BD: db.insert('pedidos', {...})
→ Agent actualiza stock: db.update('productos', ...)
→ Operaciones registradas: WRITE en 'pedidos', UPDATE en 'productos'
```

### 4. Análisis

```
✅ Operaciones de BD: 3 totales
   - 1 lectura (productos)
   - 1 escritura (pedidos)
   - 1 actualización (productos)
   
✅ Tablas utilizadas: productos, pedidos

✅ El agente:
   - Consultó el stock antes de confirmar
   - Registró el pedido correctamente
   - Actualizó el inventario
   - Manejó la información de forma coherente
```

## Consideraciones

### Performance

- El mock es en memoria, muy rápido
- No afecta significativamente el tiempo de auditoría
- Se limpia automáticamente después de cada test

### Limitaciones

- No es una BD real (no persistencia entre auditorías)
- No soporta transacciones complejas
- Filtros simples mediante funciones JavaScript

### Extensibilidad

Para agregar nuevas operaciones:

```typescript
// En databaseService.ts
class MockDatabase {
  // Agregar nuevo método
  queryWithJoin(table1: string, table2: string, joinField: string): any[] {
    // Implementar lógica
  }
}
```

## Integración con Webhooks

El agente debe implementar lógica para interactuar con la BD:

```javascript
// En tu n8n workflow o endpoint
const conversationId = req.body.conversationId;
const db = getDatabaseForConversation(conversationId);

// Tu lógica de negocio
if (userAsksForPrice) {
  const product = db.query('productos', p => p.nombre === requestedProduct)[0];
  response.message = `El precio es ${product.precio}`;
}
```

## Mejores Prácticas

1. **Define esquemas realistas**: Simula tu BD de producción
2. **Crea personas que requieran BD**: Fuerza el uso de datos
3. **Revisa las operaciones**: Verifica que sean las esperadas
4. **Evalúa la coherencia**: ¿Los datos consultados se usan correctamente?
5. **Mide el impacto**: ¿Cuántas operaciones son necesarias por objetivo?

## Roadmap

Próximas mejoras planeadas:

- [ ] Soporte para relaciones entre tablas
- [ ] Validación de schema
- [ ] Simulación de latencia de BD
- [ ] Detección de queries ineficientes
- [ ] Integración con BDs reales para auditorías de producción
- [ ] Métricas de performance de queries

---

**Última actualización**: Octubre 2025  
**Versión**: 1.0.0


