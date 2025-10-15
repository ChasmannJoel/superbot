import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Configura paths ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Importación CORRECTA (observa la ruta relativa)
import { obtenerPaginas, obtenerBMs } from './services/facebook.js'; // Asegúrate de que la ruta sea correcta


// Carga JSON (versión compatible)
const cuentasPath = path.join(__dirname, '../meta/cuentas_meta_ads.json');
const cuentas = JSON.parse(fs.readFileSync(cuentasPath, 'utf8'));

async function main() {
  try {
    const resultados = [];
    
    for (const cuenta of cuentas) {
      try {
        const [paginas, bms] = await Promise.all([
          obtenerPaginas(cuenta.token, cuenta.nombre),
          obtenerBMs(cuenta.token)
        ]);
        
        resultados.push({ nombre: cuenta.nombre, paginas, bms });
      } catch (err) {
        console.error(`Error en ${cuenta.nombre}:`, err.message);
      }
    }

    const outputPath = path.join(__dirname, 'resultado_facebook.json');
    fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2));
    console.log('✅ Datos guardados en:', outputPath);
    return { success: true, path: outputPath };
  } catch (err) {
    console.error('❌ Error en main():', err);
    throw err;
  }
}

// Ejecución con manejo de errores
main().catch(err => {
  console.error('Error global:', err);
  process.exit(1);
});