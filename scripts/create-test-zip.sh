#!/bin/bash
# 📦 Script para Crear ZIP de Prueba

# Crear carpeta temporal con archivos de prueba
mkdir -p test-agent/src

# Crear package.json
cat > test-agent/package.json << 'EOF'
{
  "name": "test-agent",
  "version": "1.0.0",
  "type": "module",
  "main": "src/agent.ts",
  "dependencies": {
    "express": "^4.18.0",
    "openai": "^4.0.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
EOF

# Crear agent.ts
cat > test-agent/src/agent.ts << 'EOF'
import express from 'express';
import { executeTools } from './tools';

const app = express();
app.use(express.json());

/**
 * Main agent endpoint
 * System Prompt: You are a helpful customer support AI agent.
 */
app.post('/webhook/support', async (req, res) => {
  const { message, conversationId } = req.body;
  
  // Agent logic
  const response = await executeTools(message);
  
  res.json({
    conversationId,
    response,
    timestamp: new Date().toISOString()
  });
});

app.listen(3001, () => console.log('Agent running on port 3001'));
EOF

# Crear tools.ts
cat > test-agent/src/tools.ts << 'EOF'
/**
 * Tool: sendConfirmationEmail
 * Sends confirmation email to customer
 */
export async function sendConfirmationEmail(email: string) {
  return { success: true, message: `Email sent to ${email}` };
}

/**
 * Tool: saveToDatabase
 * Saves conversation to database
 */
export async function saveToDatabase(data: any) {
  return { success: true, recordId: `rec_${Date.now()}` };
}

export async function executeTools(message: string) {
  return `Processing: ${message}`;
}
EOF

# Crear tsconfig.json
cat > test-agent/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "lib": ["ES2020"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true
  }
}
EOF

# Comprimir
echo "📦 Comprimiendo test-agent..."
zip -r test-agent.zip test-agent/ -q

# Mostrar info
echo "✅ ZIP creado: test-agent.zip"
ls -lh test-agent.zip
echo ""
echo "📄 Contenido:"
unzip -l test-agent.zip | head -15
echo ""
echo "🚀 Próximos pasos:"
echo "1. Abre Silver Fleet en http://localhost:3000"
echo "2. Selecciona 'TypeScript/Node'"
echo "3. Arrastra test-agent.zip al área de carga"
echo "4. Verifica que detecte Express, 2 tools, 1 endpoint"

# Limpiar carpeta temporal
rm -rf test-agent
