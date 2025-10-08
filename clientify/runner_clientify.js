import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scripts = [
  'fetch_contacts.js',
  'hoy.js',
  'descargar_remarks.js',
  'generar_reporte_paneles.js'
];

async function runScript(script) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'instrucciones', script);
    const proc = spawn('node', [scriptPath], { stdio: 'inherit' });
    proc.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script ${script} terminó con código ${code}`));
      }
    });
  });
}

(async () => {
  for (const script of scripts) {
    console.log(`\n--- Ejecutando ${script} ---`);
    try {
      await runScript(script);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }
  const end = new Date();
  const hora = end.toLocaleTimeString();
  console.log(`\n✅ Proceso completo. Todos los scripts ejecutados.\nHora de finalización: ${hora}`);
})();