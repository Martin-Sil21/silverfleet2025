#!/usr/bin/env pwsh
# 📦 Script para Crear ZIP de Prueba (Windows PowerShell)

# Crear carpeta temporal
$testDir = "test-agent"
New-Item -ItemType Directory -Path "$testDir/src" -Force | Out-Null

# Crear package.json
@{
    name = "test-agent"
    version = "1.0.0"
    type = "module"
    main = "src/agent.ts"
    dependencies = @{
        express = "^4.18.0"
        openai = "^4.0.0"
    }
    devDependencies = @{
        "@types/express" = "^4.17.0"
        "@types/node" = "^20.0.0"
        typescript = "^5.0.0"
    }
} | ConvertTo-Json | Out-File "$testDir/package.json" -Encoding UTF8

# Crear agent.ts
@"
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
"@ | Out-File "$testDir/src/agent.ts" -Encoding UTF8

# Crear tools.ts
@"
/**
 * Tool: sendConfirmationEmail
 * Sends confirmation email to customer
 */
export async function sendConfirmationEmail(email: string) {
  return { success: true, message: `Email sent to `$"{email}" };
}

/**
 * Tool: saveToDatabase
 * Saves conversation to database
 */
export async function saveToDatabase(data: any) {
  return { success: true, recordId: `rec_`${Date.now()} };
}

export async function executeTools(message: string) {
  return `Processing: `${message}`;
}
"@ | Out-File "$testDir/src/tools.ts" -Encoding UTF8

# Crear tsconfig.json
@{
    compilerOptions = @{
        target = "ES2020"
        module = "ESNext"
        moduleResolution = "node"
        lib = @("ES2020")
        outDir = "dist"
        rootDir = "src"
        strict = $true
        skipLibCheck = $true
    }
} | ConvertTo-Json | Out-File "$testDir/tsconfig.json" -Encoding UTF8

# Comprimir
Write-Host "📦 Comprimiendo test-agent..." -ForegroundColor Yellow
Compress-Archive -Path $testDir -DestinationPath "test-agent.zip" -Force

# Mostrar info
$zipSize = (Get-Item "test-agent.zip").Length / 1KB
Write-Host "✅ ZIP creado: test-agent.zip ($([Math]::Round($zipSize, 2)) KB)" -ForegroundColor Green
Write-Host ""
Write-Host "📄 Contenido:" -ForegroundColor Cyan
Get-ChildItem -Path $testDir -Recurse | ForEach-Object {
    if (-not $_.PSIsContainer) {
        Write-Host "  - $($_.FullName.Replace($testDir + '\', ''))"
    }
}
Write-Host ""
Write-Host "🚀 Próximos pasos:" -ForegroundColor Magenta
Write-Host "1. Abre Silver Fleet en http://localhost:3000"
Write-Host "2. Selecciona 'TypeScript/Node'"
Write-Host "3. Arrastra test-agent.zip al área de carga"
Write-Host "4. Verifica que detecte Express, 2 tools, 1 endpoint"

# Limpiar carpeta temporal
Remove-Item -Path $testDir -Recurse -Force
Write-Host ""
Write-Host "✨ Listo para auditar!" -ForegroundColor Green
