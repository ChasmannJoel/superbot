import { spawn } from 'child_process';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

let isRunning = false;

// -------- CONFIG --------
const WORKDIR = '/root/superbot1.0';
const LOG_FILE = path.join(WORKDIR, 'cron_ejecuciones.log');

const SCRIPTS = [
  'ayer/fetch_ayer_meta.js'
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

/** Ejecuta todos los scripts en orden */
async function runBatch() {
  if (isRunning) {
    log('⏳ Batch anterior aún en ejecución. Omitiendo...');
    console.log('⏳ Batch anterior aún en ejecución.');
    process.exit(1);
  }

  isRunning = true;
  try {
    for (const s of SCRIPTS) {
      await runScript(s);
    }

    log('🎉 Batch completa');
    console.log('✅ Batch completa sin errores.');

    // Notificar al bot que todo terminó OK
    try {
      console.log('[RUNNER] Enviando notificación al bot...');
      const res = await fetch('http://localhost:3066/alerta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: '✅ Batch completa sin errores.', secret: 'tu_clave_super_secreta' })
      });
      const text = await res.text();
      console.log(`[RUNNER] Respuesta del bot: ${res.status} - ${text}`);
    } catch (err) {
      console.error('[RUNNER] Error notificando al bot:', err.message);
    }

    // Espera 2 segundos para asegurar que los logs y la petición se completen
    await new Promise(r => setTimeout(r, 4000));
    process.exit(0);

  } catch (err) {
    log(`💥 Error en batch: ${err.message}`);
    console.error(`💥 Error en batch: ${err.message}`);
    process.exit(1);

  } finally {
    isRunning = false;
  }
}

// Ejecutar una sola vez:
runBatch();