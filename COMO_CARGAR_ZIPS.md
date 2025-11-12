# 📦 Cómo Cargar ZIPs en Silver Fleet

## ✨ Lo Nuevo: Soporte Completo para Archivos ZIP

A partir de ahora, puedes cargar tu proyecto TypeScript/Node **completamente comprimido en un ZIP**. El sistema lo descomprimirá automáticamente.

---

## 🚀 Formas de Cargar Proyectos

### ✅ Opción 1: Cargar un ZIP (RECOMENDADO)

```
Tu Carpeta:
  silverfleet2025.zip  ← Click aquí en el app
    ├── src/
    │   ├── agent.ts
    │   ├── tools.ts
    │   └── handlers.ts
    ├── package.json
    └── tsconfig.json
```

**Pasos:**
1. En Silver Fleet, ve a "TypeScript/Node" agent selector
2. Arrastra `silverfleet2025.zip` al área de drop
3. **O** haz click y selecciona `silverfleet2025.zip` del explorador
4. El sistema:
   - 📦 Descomprime automáticamente
   - 🔍 Detecta framework
   - 🛠️ Extrae tools
   - 🎯 Genera payload

### ✅ Opción 2: Cargar Archivos Individuales (como antes)

Todavía puedes seleccionar archivos .ts, .js, package.json uno por uno.

### ✅ Opción 3: Mezclar ZIP + Archivos

Puedes seleccionar:
- 1 ZIP + archivos sueltos
- 2 ZIPs + archivos sueltos
- etc.

Todo se fusionará automáticamente.

---

## 📊 Qué Sucede al Cargar un ZIP

```
1️⃣ Usuario carga archivo .zip
   │
2️⃣ Sistema valida que sea ZIP válido
   │
3️⃣ Descomprime en memoria (NO en disco)
   │
4️⃣ Filtra automáticamente:
   ├── ✅ Incluye: .ts, .js, .json, .tsx, .jsx
   ├── ✅ Incluye: package.json (siempre)
   └── ❌ Excluye: node_modules, dist, build, .git, .env, archivos binarios
   │
5️⃣ Convierte archivos a objetos File (compatibles con parser)
   │
6️⃣ Parsea como TypeScript agent
   │
7️⃣ Muestra resultados (framework, tools, endpoints)
```

---

## 💾 Ventajas de Cargar ZIP

| Ventaja | Detalle |
|:---|:---|
| **Rapidez** | 1 click vs seleccionar 10 archivos |
| **Completo** | Carga todo tu proyecto de una vez |
| **Seguro** | NO se sube a servidor, se descomprime en browser |
| **Inteligente** | Filtra automáticamente archivos irrelevantes |
| **Flexible** | Puedes mezclar ZIPs con archivos sueltos |

---

## 🎯 Casos de Uso

### 📂 Caso 1: Tu Proyecto Completo

```bash
cd ~/mis-proyectos/chatbot
zip -r chatbot.zip src/ package.json tsconfig.json README.md
# Luego carga chatbot.zip en Silver Fleet
```

### 📂 Caso 2: Múltiples Agentes

```bash
# Agent 1
zip -r agent1.zip src/agent1/ package.json

# Agent 2
zip -r agent2.zip src/agent2/ package.json

# Carga agent1.zip y luego agent2.zip por separado
# o ambos a la vez si tu sistema lo permite
```

### 📂 Caso 3: Desde GitHub

```bash
# Descargar repo como ZIP
git clone --depth 1 https://github.com/user/repo.git
cd repo
zip -r repo.zip . -x "node_modules/*" ".git/*"

# Cargar en Silver Fleet
```

---

## 🔒 Privacidad & Seguridad

✅ **El ZIP se descomprime EN TU NAVEGADOR**
- No se sube a ningún servidor
- No se guarda en disco
- Se procesa en memoria
- Se descarta al terminar

✅ **Filtrado automático**
- `node_modules/` → Nunca se procesa
- `.git/` → Nunca se procesa
- `.env` → Nunca se procesa
- Archivos binarios → Ignorados

---

## 🛠️ Crear ZIPs desde Terminal

### macOS / Linux
```bash
# Comprimir proyecto
zip -r agent.zip . -x "node_modules/*" ".git/*" "dist/*"

# Verificar contenido
unzip -l agent.zip | head -20
```

### Windows (PowerShell)
```powershell
# Comprimir proyecto
Compress-Archive -Path "C:\Users\marti\proyecto" -DestinationPath "C:\Users\marti\proyecto.zip" -Force

# Verificar tamaño
Get-Item "C:\Users\marti\proyecto.zip" | Select-Object Length
```

### Windows (Explorador)
1. Click derecho en la carpeta
2. "Enviar a" → "Carpeta comprimida"
3. Carga el .zip generado en Silver Fleet

---

## ❓ Preguntas Frecuentes

**P: ¿Qué tamaño máximo de ZIP puedo cargar?**
R: No hay límite técnico (el navegador moderno maneja ZIPs de 1GB+), pero lo recomendado es < 50MB para mejor rendimiento.

**P: ¿Se ejecutan los archivos después de descomprimir?**
R: NO. Solo se leen y parsean. No hay ejecución de código.

**P: ¿Qué pasa con las dependencias (node_modules)?**
R: Se filtran automáticamente. Solo se analizan archivos .ts, .js, .json.

**P: ¿Puedo cargar un ZIP de un repositorio de GitHub?**
R: Sí. Descargalo como ZIP desde GitHub (botón "Code") y cargalo directamente.

**P: ¿Se guarda el ZIP después de procesar?**
R: NO. Se descomprime en memoria y se descarta. Tu archivo local no se modifica.

**P: ¿Funciona con ZIPs anidados?**
R: NO. Si el ZIP contiene otro ZIP, solo se descomprime el primero.

---

## 🎬 Demo Rápida

```
Carpeta de tu agente:
src/
  ├── agent.ts
  ├── tools.ts
  └── config.ts
package.json

↓ Comprimir (Windows: Click derecho → Enviar a → Carpeta comprimida)
↓
agent.zip (50 KB)

↓ Cargar en Silver Fleet
↓
"Drag files or ZIP here"
  └─ Arrastra agent.zip

↓ Sistema procesa
↓ ✅ "Framework detected: Express"
✅ "Tools detected: 3"
✅ "Endpoints detected: 1"
```

---

## 🚀 Próximos Pasos

Una vez cargues el ZIP:

1. ✅ Verifica que los frameworks/tools se detecten correctamente
2. ✅ Completa la configuración de auditoría
3. ✅ Ejecuta la auditoría (visual o real)
4. ✅ Revisa el reporte

**¡Listo!** Ahora puedes auditar tu proyecto completo de una vez.

