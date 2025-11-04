#!/usr/bin/env node
/**
 * Script para limpiar logs verbosos y dejar solo los críticos para herramientas
 */

const fs = require('fs');
const path = require('path');

// Logs que DEBEMOS MANTENER (prefijos permitidos)
const KEEP_PATTERNS = [
  '🔧 [HERRAMIENTA',
  '🔍 [HERRAMIENTA',
  '❌ [HERRAMIENTA', 
  '✅ [HERRAMIENTA',
  '⚠️ [HERRAMIENTA'
];

// Archivos que procesar
const FILES_TO_CLEAN = [
  'services/independentConversationRunner.ts',
  'services/toolVerificator.ts'
];

function shouldKeepLog(line) {
  // Si la línea está comentada, mantener como está
  if (line.trim().startsWith('//')) return true;
  
  // Si no es un console.log/error/warn, mantener
  if (!line.includes('console.log') && !line.includes('console.error') && !line.includes('console.warn')) {
    return true;
  }
  
  // Verificar si contiene algún patrón de HERRAMIENTA
  return KEEP_PATTERNS.some(pattern => line.includes(pattern));
}

function cleanFile(filePath) {
  const fullPath = path.join(__dirname, '..', filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⏭️  Saltando ${filePath} (no existe)`);
    return;
  }
  
  console.log(`\n🔍 Procesando ${filePath}...`);
  
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  let modified = 0;
  
  const newLines = lines.map(line => {
    if (shouldKeepLog(line)) {
      return line;
    }
    
    // Comentar este log
    const indent = line.match(/^(\s*)/)[1];
    modified++;
    return `${indent}// ${line.trim()}`;
  });
  
  fs.writeFileSync(fullPath, newLines.join('\n'), 'utf8');
  console.log(`   ✅ ${modified} logs comentados`);
}

console.log('🧹 Limpiando logs verbosos...\n');
console.log('📋 Manteniendo solo logs con estos prefijos:');
KEEP_PATTERNS.forEach(p => console.log(`   - ${p}`));

FILES_TO_CLEAN.forEach(cleanFile);

console.log('\n✅ Limpieza completa!');
console.log('\n💡 Ahora en la consola solo verás:');
console.log('   🔧 [HERRAMIENTA-GMAIL] - Operaciones de Gmail');
console.log('   🔍 [HERRAMIENTA] - Verificaciones de herramientas');
console.log('   ❌/✅/⚠️ - Resultados de verificación');
