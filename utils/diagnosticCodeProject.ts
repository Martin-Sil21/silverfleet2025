/**
 * 🔬 Diagnóstico: Inspeccionar estructura real de codeProject.databases
 * 
 * Carga tu ZIP y muestra exactamente qué está en databases
 * Ejecutar en consola del navegador después de cargar un ZIP
 */

export function diagnosticarCodeProject() {
  const codeProject = (window as any).__lastCodeProject;
  
  if (!codeProject) {
    console.error('❌ No hay proyecto cargado. Sube un ZIP primero.');
    return;
  }
  
  console.log('\n🔬 DIAGNÓSTICO DE CODEPROJECT\n');
  console.log('═'.repeat(70));
  
  console.log('\n📊 DATABASES:');
  console.log(`   Cantidad: ${codeProject.databases?.length || 0}`);
  
  if (!codeProject.databases || codeProject.databases.length === 0) {
    console.log('   ⚠️ NO HAY DATABASES DETECTADAS');
    return;
  }
  
  codeProject.databases.forEach((db: any, idx: number) => {
    console.log(`\n   Database ${idx + 1}:`);
    console.log(`      Provider: ${db.provider}`);
    console.log(`      Confidence: ${db.confidence}`);
    console.log(`      Evidence: ${db.evidence?.length || 0} archivos`);
    
    // CRÍTICO: ¿Tiene tables?
    if (db.tables) {
      console.log(`      ✅ TIENE TABLES: ${Array.isArray(db.tables) ? db.tables.length : 'No es array'}`);
      
      if (Array.isArray(db.tables)) {
        db.tables.slice(0, 3).forEach((table: any, tidx: number) => {
          console.log(`\n         Tabla ${tidx + 1}:`);
          
          if (typeof table === 'string') {
            console.log(`            Nombre (string): ${table}`);
            console.log(`            ⚠️ NO TIENE FIELDS - Es solo el nombre`);
          } else if (typeof table === 'object') {
            console.log(`            Nombre: ${table.name}`);
            console.log(`            Tipo: objeto`);
            console.log(`            Keys: ${Object.keys(table).join(', ')}`);
            
            if (table.fields) {
              console.log(`            ✅ TIENE FIELDS: ${Array.isArray(table.fields) ? table.fields.length : 'No es array'}`);
              
              if (Array.isArray(table.fields) && table.fields.length > 0) {
                const firstField = table.fields[0];
                if (typeof firstField === 'string') {
                  console.log(`               Tipo de campo: string simple`);
                  console.log(`               Ejemplo: ${table.fields.slice(0, 5).join(', ')}`);
                } else {
                  console.log(`               Tipo de campo: objeto`);
                  console.log(`               Ejemplo: ${JSON.stringify(firstField)}`);
                }
              }
            } else {
              console.log(`            ❌ NO TIENE FIELDS`);
            }
            
            // Mostrar estructura completa de la primera tabla
            if (tidx === 0) {
              console.log(`\n            📋 Estructura completa:`);
              console.log(JSON.stringify(table, null, 2).split('\n').map(l => `            ${l}`).join('\n'));
            }
          }
        });
        
        if (db.tables.length > 3) {
          console.log(`\n         ... y ${db.tables.length - 3} tablas más`);
        }
      }
    } else {
      console.log(`      ❌ NO TIENE TABLES`);
      console.log(`      Keys disponibles: ${Object.keys(db).join(', ')}`);
    }
  });
  
  console.log('\n═'.repeat(70));
  console.log('\n💡 RECOMENDACIONES:\n');
  
  if (!codeProject.databases || codeProject.databases.length === 0) {
    console.log('   1. deepProjectAnalyzer NO detectó databases');
    console.log('   2. Revisar que el proyecto tenga archivos de Supabase/Prisma/SQL');
    console.log('   3. Buscar en código: "supabase", "prisma", "db.", "from("');
  } else {
    const dbWithoutTables = codeProject.databases.filter((db: any) => !db.tables);
    if (dbWithoutTables.length > 0) {
      console.log('   ⚠️ Algunas databases NO tienen "tables"');
      console.log('   → deepProjectAnalyzer.analyzeDatabaseSchemas() falló');
      console.log('   → Revisar si hay archivos schema.prisma, *.sql, migrations/');
    }
    
    const dbWithStringTables = codeProject.databases.filter((db: any) => 
      db.tables && Array.isArray(db.tables) && typeof db.tables[0] === 'string'
    );
    if (dbWithStringTables.length > 0) {
      console.log('   ⚠️ Algunas tables son strings (sin fields)');
      console.log('   → zipDatabaseAnalyzer usará HEURÍSTICAS (funciona, pero menos preciso)');
    }
    
    const dbWithObjectTables = codeProject.databases.filter((db: any) =>
      db.tables && Array.isArray(db.tables) && typeof db.tables[0] === 'object' && db.tables[0].fields
    );
    if (dbWithObjectTables.length > 0) {
      console.log('   ✅ Algunas tables tienen schema completo');
      console.log('   → zipDatabaseAnalyzer creará mappings PERFECTOS');
    }
  }
  
  console.log('\n');
}

// Auto-llamar si está en el navegador
if (typeof window !== 'undefined') {
  (window as any).diagnosticarCodeProject = diagnosticarCodeProject;
  console.log('💡 Función cargada. Ejecuta: diagnosticarCodeProject()');
}
