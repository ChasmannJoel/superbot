import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

let isRunning = false;
// -------- CONFIG --------
const WORKDIR = '/root/superbot1.0';
const LOG_FILE = path.join(WORKDIR, 'cron_ejecuciones.log');
const INTERVAL = 5 * 60 * 1000; // 1 minutos
const SCRIPTS = [
  'callbell/generar_contactos.js',
  'callbell/getteam.js',
  'callbell/informe.js',
  'callbell/analizar_respuestas.js',
  'meta/fetch_meta_ads.js',
  'pruebarun.js'
];
// ------------------------

/** Agrega una línea al log */
function log(line) {
  const stamp = `[${new Date().toISOString()}] `;
  fs.appendFileSync(LOG_FILE, stamp + line + '\n');
}


/** Ejecuta un script hijo y encadena la promesa */
function runScript(script) {
  return new Promise((resolve, reject) => {
    log(`▶️ Ejecutando ${script}`);
    const child = spawn('node', [path.join(WORKDIR, script)], { stdio: 'inherit' });

    child.on('close', (code) => {
      if (code === 0) {
        log(`✅ Finalizó ${script}`);
        resolve();
      } else {
        log(`❌ Error en ${script} – exit ${code}`);
        reject(new Error(`exit ${code}`));
      }
    });
  });
}


async function runBatch() {
  if (isRunning) {
    log('⏳ Batch anterior aún en ejecución. Omitiendo...');
    return;
  }

  isRunning = true;
  try {
    // Ejecutar todos los scripts
    for (const s of SCRIPTS) {
      await runScript(s);
    }
    
    // Notificar a Apps Script solo si todo salió bien
    const result = await notifyAppScript();
    log(`📤 Notificación exitosa: ${JSON.stringify(result)}`);
    
    log('🎉 Batch completa');
  } catch (err) {
    log(`💥 Error en batch: ${err.message}`);
  } finally {
    isRunning = false;
  }
}

async function main() {
  while (true) {
    await runBatch();
    log(`⏳ Esperando ${INTERVAL / 60000} minutos para la próxima tanda...`);
    await new Promise(res => setTimeout(res, INTERVAL));
  }
}

main();