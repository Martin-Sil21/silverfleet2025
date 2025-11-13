# 🎯 Mejoras para Cards de Proyectos ZIP

## Problema Detectado
El archivo `AgentConfig.tsx` tiene problemas de encoding con emojis (� en lugar de 💾, 📦, etc).

## Solución: Reemplazo Manual

### 1️⃣ CARD 2 - Payload con Preview Completo

**Ubicación**: Línea ~818 en `components/AgentConfig.tsx`

**Reemplazar**:
```tsx
{/* CARD 2: Payload de Entrada */}
<Card>
  <h2>� Payload de Entrada</h2>
  ...
  {samplePayload && !payloadError && (
    <div className="p-3 bg-green-50...">
      <p>✅ Payload generado...</p>
    </div>
  )}
</Card>
```

**Por**:
```tsx
{/* CARD 2: Payload de Entrada - MEJORADO */}
<Card>
  <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
    💾 Payload de Entrada
  </h2>
  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
    Estructura de datos que se enviará a los endpoints durante la auditoría
  </p>
  <div className="space-y-4">
    {!samplePayload && (
      <button
        type="button"
        onClick={() => handleGeneratePayload(workflow, connections)}
        disabled={isGeneratingPayload}
        className="w-full px-4 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
      >
        {isGeneratingPayload ? (
          <>
            <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
            Generando payload...
          </>
        ) : (
          <>🤖 Generar Payload con IA</>
        )}
      </button>
    )}
    
    {payloadError && (
      <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-sm text-red-700 dark:text-red-300">❌ {payloadError}</p>
      </div>
    )}
    
    {samplePayload && !payloadError && (
      <div className="space-y-3">
        {/* Header con botón regenerar */}
        <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="w-5 h-5 text-green-600" />
            <p className="text-sm font-semibold text-green-700 dark:text-green-300">
              Payload generado ({Object.keys(samplePayload).length} campos)
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleGeneratePayload(workflow, connections)}
            disabled={isGeneratingPayload}
            className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
          >
            🔄 Regenerar
          </button>
        </div>
        
        {/* Preview del JSON */}
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Vista previa:</p>
          <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto max-h-40 overflow-y-auto">
            {JSON.stringify(samplePayload, null, 2)}
          </pre>
        </div>
        
        {/* Info adicional */}
        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
          <span className="text-blue-600 dark:text-blue-400">ℹ️</span>
          <p className="text-xs text-blue-800 dark:text-blue-300">
            Este payload se usará como base para generar variaciones en cada conversación de prueba
          </p>
        </div>
      </div>
    )}
  </div>
</Card>
```

### 2️⃣ CARD 3 - Endpoints con Estado Claro

**Agregar después del test de endpoint**:

```tsx
{testStatus === 'success' && (
  <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
    <div className="flex items-center gap-2">
      <CheckCircleIcon className="w-5 h-5 text-green-600" />
      <div>
        <p className="text-sm font-semibold text-green-700 dark:text-green-300">
          Endpoint verificado ✓
        </p>
        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
          {testMessage}
        </p>
      </div>
    </div>
  </div>
)}
{testStatus === 'error' && (
  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
    <div className="flex items-center gap-2">
      <XCircleIcon className="w-5 h-5 text-red-600" />
      <div>
        <p className="text-sm font-semibold text-red-700 dark:text-red-300">
          Error de conexión ✗
        </p>
        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
          {testMessage}
        </p>
      </div>
    </div>
  </div>
)}
```

### 3️⃣ CARD 4 - Credenciales BD con Formularios Inline

**Reemplazar la Card actual de credenciales** (línea ~900):

```tsx
{/* CARD 4: Credenciales de Base de Datos - MEJORADO */}
{codeProject.databases.length > 0 && (
  <Card>
    <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
      🔐 Credenciales de Base de Datos
    </h2>
    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
      Configura las credenciales para verificar las operaciones de base de datos durante la auditoría
    </p>
    
    <div className="space-y-4">
      {codeProject.databases.map((db, idx) => {
        const dbTables = (db as any).tables || [];
        const isSupabase = db.provider.toLowerCase().includes('supabase');
        
        return (
          <div key={idx} className="p-4 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-purple-50/30 dark:bg-purple-900/10">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-200">
                  {db.provider}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {dbTables.length} tabla(s): {dbTables.slice(0, 3).map((t: any) => t.name).join(', ')}
                  {dbTables.length > 3 && ` +${dbTables.length - 3} más`}
                </p>
              </div>
              <span className="px-3 py-1 text-xs bg-purple-600 text-white rounded-full">
                {dbTables.length} tablas
              </span>
            </div>
            
            {/* Formulario inline para Supabase */}
            {isSupabase && (
              <div className="space-y-3 p-3 bg-white dark:bg-gray-800 rounded border border-purple-100 dark:border-purple-800">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Supabase URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://xxxxx.supabase.co"
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Service Role Key (anon key NO funciona)
                  </label>
                  <input
                    type="password"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded font-mono"
                  />
                </div>
                <button
                  type="button"
                  className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded transition-colors"
                >
                  💾 Guardar Credenciales
                </button>
              </div>
            )}
            
            {/* Botón para abrir modal si no es Supabase */}
            {!isSupabase && (
              <button
                onClick={onManageCredentials}
                className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
              >
                ⚙️ Configurar Credenciales
              </button>
            )}
            
            {/* Advertencia */}
            <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
              <p className="text-xs text-yellow-800 dark:text-yellow-300 flex items-start gap-2">
                <span>⚠️</span>
                <span>
                  Requiere permisos de <strong>lectura</strong> en las tablas para verificar que los agentes guardan correctamente los datos
                </span>
              </p>
            </div>
          </div>
        );
      })}
    </div>
  </Card>
)}
```

### 4️⃣ AGREGAR CARD 6 - Resumen Final

**Agregar ANTES del último `</div>` del return** (después de la Card 5):

```tsx
{/* CARD 6: Resumen y Validación Final - NUEVO */}
<Card>
  <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
    ✅ Resumen de Configuración
  </h2>
  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
    Verifica que todo esté configurado antes de iniciar la auditoría
  </p>
  
  <div className="space-y-3">
    {/* Checklist */}
    <div className="space-y-2">
      {/* Check 1: Payload */}
      <div className={`flex items-center gap-3 p-3 rounded-lg border ${
        samplePayload
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
          : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      }`}>
        {samplePayload ? (
          <CheckCircleIcon className="w-5 h-5 text-green-600" />
        ) : (
          <XCircleIcon className="w-5 h-5 text-gray-400" />
        )}
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Payload generado
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {samplePayload ? `${Object.keys(samplePayload).length} campos configurados` : 'Generar payload en el paso anterior'}
          </p>
        </div>
      </div>
      
      {/* Check 2: Endpoint */}
      <div className={`flex items-center gap-3 p-3 rounded-lg border ${
        testStatus === 'success'
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
          : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      }`}>
        {testStatus === 'success' ? (
          <CheckCircleIcon className="w-5 h-5 text-green-600" />
        ) : (
          <XCircleIcon className="w-5 h-5 text-gray-400" />
        )}
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Endpoint verificado
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {testStatus === 'success' ? endpointUrl : 'Testear endpoint en el paso anterior'}
          </p>
        </div>
      </div>
      
      {/* Check 3: Credenciales (opcional) */}
      {codeProject.databases.length > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700">
          <span className="text-blue-600">ℹ️</span>
          <div>
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">
              Credenciales de BD (opcional)
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Configura para verificar operaciones de base de datos
            </p>
          </div>
        </div>
      )}
    </div>
    
    {/* Botón iniciar (placeholder - ya existe en otro lugar) */}
    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
      <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
        Los criterios de auditoría y número de casos de prueba se configuran en el siguiente paso
      </p>
    </div>
  </div>
</Card>
```

## 🔧 Pasos para Implementar

1. **Guardar cambios actuales** en git: `git commit -am "wip: antes de mejoras cards"`
2. **Abrir** `components/AgentConfig.tsx` en VS Code
3. **Buscar** cada sección usando Ctrl+F con los comentarios `{/* CARD 2...`, `{/* CARD 3...`, etc.
4. **Reemplazar** cada sección con el código mejorado de arriba
5. **Probar** recargando el navegador

## ✅ Resultado Esperado

- ✅ Card 1: Proyecto con más detalles
- ✅ Card 2: Payload con preview JSON y botón regenerar
- ✅ Card 3: Endpoint con estado visual claro
- ✅ Card 4: Credenciales con formularios inline para Supabase
- ✅ Card 5: Tipo auditoría (sin cambios)
- ✅ **NUEVO** Card 6: Checklist de configuración completa

## 🎯 Ventajas

1. **Flujo más claro**: Usuario ve paso a paso qué falta configurar
2. **Menos clicks**: Formularios inline en lugar de modales
3. **Validación visual**: Checkmarks verdes para pasos completados
4. **Mejor UX**: Similar al flujo de n8n pero adaptado a proyectos ZIP
