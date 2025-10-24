<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Silver Fleet - AI Agent Auditor

Una herramienta profesional para probar y evaluar rigurosamente tus agentes de IA integrados con n8n.

## Características

- 🔍 **Auditoría automatizada** de workflows de IA
- 🤖 **Integración con n8n**: Ejecuta workflows reales en tu instancia self-hosted
- 📊 **Reportes detallados** con métricas de rendimiento
- 💡 **Sugerencias de mejora** automáticas basadas en IA
- 🌍 **Multiidioma**: Español e Inglés
- 🎨 **Interfaz moderna** con modo oscuro

## Requisitos

- Node.js (v16 o superior)
- Una API Key de Google Gemini
- (Opcional) Una instancia de n8n self-hosted con API habilitada

## Instalación

1. Clona el repositorio:
   ```bash
   git clone <tu-repo>
   cd silverfleet2025
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Configura las variables de entorno:
   
   Crea un archivo `.env.local` en la raíz del proyecto con:
   ```env
   VITE_GEMINI_API_KEY=tu_api_key_de_gemini_aqui
   ```

4. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```

## Uso

### Modo Simulación (Predeterminado)

1. **Importa un workflow** (opcional): Sube un archivo JSON exportado desde n8n
2. **Configura tu workflow**: Define los agentes de IA y sus system prompts
3. **Define criterios de auditoría**: Especifica cómo quieres evaluar el rendimiento
4. **Genera casos de prueba**: La IA creará escenarios de prueba automáticamente
5. **Ejecuta la auditoría**: Obtén reportes detallados del rendimiento

### Modo Ejecución Real en n8n

Para ejecutar workflows reales en tu instancia de n8n:

1. **Activa "Usar ejecución real en n8n"** en la sección de configuración
2. **Configura la conexión**:
   - **URL de n8n**: La URL de tu instancia (ej: `https://tu-n8n.com`)
   - **API Key**: Generada en Settings > API en tu n8n
   - **Workflow ID**: (Opcional) ID del workflow a ejecutar

3. **Requisitos de n8n**:
   - Tu workflow debe tener un trigger webhook o manual
   - La API debe estar habilitada en tu instancia
   - Asegúrate de que tu workflow acepta datos en formato:
     ```json
     {
       "userPrompt": "mensaje del usuario",
       "testCase": "id_del_caso",
       "turn": 0
     }
     ```

## Estructura del Proyecto

```
silverfleet2025/
├── components/         # Componentes React
├── services/          # Servicios (Gemini, n8n, parsers)
├── locales/           # Archivos de traducción
├── types.ts           # Definiciones de tipos TypeScript
└── App.tsx            # Componente principal
```

## Tecnologías

- **React** + **TypeScript**
- **Vite** - Build tool
- **Tailwind CSS** - Estilos
- **Google Gemini AI** - Análisis y generación
- **n8n API** - Integración con workflows

## Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Haz fork del proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## Licencia

Este proyecto está bajo la licencia MIT. Ver el archivo `LICENSE` para más detalles.
