import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let isRunning = false;

// ✅ ADAPTABLE: Detecta automáticamente el entorno
const isVPS = os.platform() === 'linux' && fs.existsSync('/root');
const WORKDIR = isVPS ? '/root/superbot1.0' : __dirname;
const LOG_FILE = path.join(WORKDIR, 'cron_ejecuciones.log');

const INTERVAL = 17 * 60 * 1000; // 17 minutos
const MAX_ERRORS_PER_SCRIPT = 15; // ✅ NUEVO: Máximo de errores antes de saltar al siguiente
const SCRIPTS = [
  'clientify/runner_clientify.js',
  'meta/fetch_meta_ads.js', 
  'pruebarun.js'
];

// ✅ NUEVO: Contador de errores por script
const errorCounters = {};
// ✅ NUEVO: Registro de problemas para JSON
const problemLog = {
  timestamp: null,
  batch_info: {},
  scripts: {},
  summary: {
    total_errors: 0,
    failed_scripts: [],
    successful_scripts: [],
    skipped_scripts: []
  }
};

// ✅ MEJORADO: Crear directorio si no existe
function ensureLogDirectory() {
  const logDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

/** Agrega una línea al log */
function log(line) {
  const stamp = `[${new Date().toISOString()}] `;
  try {
    ensureLogDirectory();
    fs.appendFileSync(LOG_FILE, stamp + line + '\n');
    console.log(stamp + line); // También mostrar en consola
  } catch (error) {
    console.error('Error escribiendo al log:', error.message);
    console.log(stamp + line); // Fallback a consola
  }
}

/** ✅ NUEVO: Resetea el contador de errores para un script */
function resetErrorCounter(script) {
  errorCounters[script] = 0;
  log(`🔄 Contador de errores reseteado para ${script}`);
  
  // ✅ NUEVO: Actualizar log de problemas
  if (problemLog.scripts[script]) {
    problemLog.scripts[script].status = 'recovered';
    problemLog.scripts[script].last_success = new Date().toISOString();
  }
}

/** ✅ NUEVO: Incrementa el contador de errores para un script */
function incrementErrorCounter(script, errorMessage = '') {
  if (!errorCounters[script]) {
    errorCounters[script] = 0;
  }
  errorCounters[script]++;
  log(`❌ Error ${errorCounters[script]}/${MAX_ERRORS_PER_SCRIPT} para ${script}`);
  
  // ✅ NUEVO: Registrar error en problemLog
  if (!problemLog.scripts[script]) {
    problemLog.scripts[script] = {
      total_errors: 0,
      errors: [],
      status: 'running',
      first_error: null,
      last_error: null
    };
  }
  
  const errorEntry = {
    timestamp: new Date().toISOString(),
    error_count: errorCounters[script],
    message: errorMessage,
    type: errorMessage.includes('ENOENT') ? 'file_not_found' : 
           errorMessage.includes('504') ? 'server_timeout' :
           errorMessage.includes('500') ? 'server_error' : 'unknown'
  };
  
  problemLog.scripts[script].total_errors++;
  problemLog.scripts[script].errors.push(errorEntry);
  problemLog.scripts[script].last_error = new Date().toISOString();
  problemLog.scripts[script].status = 'failing';
  
  if (!problemLog.scripts[script].first_error) {
    problemLog.scripts[script].first_error = new Date().toISOString();
  }
  
  problemLog.summary.total_errors++;
  
  return errorCounters[script];
}

/** ✅ NUEVO: Verifica si un script ha alcanzado el límite de errores */
function hasReachedErrorLimit(script) {
  return errorCounters[script] >= MAX_ERRORS_PER_SCRIPT;
}

/** ✅ NUEVO: Guarda el reporte de problemas en JSON */
function saveProblemReport() {
  try {
    const reportPath = path.join(WORKDIR, 'error_report.json');
    
    // Actualizar summary
    problemLog.summary.failed_scripts = Object.keys(problemLog.scripts).filter(
      script => problemLog.scripts[script].status === 'failing' || problemLog.scripts[script].status === 'skipped'
    );
    problemLog.summary.successful_scripts = Object.keys(problemLog.scripts).filter(
      script => problemLog.scripts[script].status === 'success' || problemLog.scripts[script].status === 'recovered'
    );
    problemLog.summary.skipped_scripts = Object.keys(problemLog.scripts).filter(
      script => problemLog.scripts[script].status === 'skipped'
    );
    
    // ✅ MODIFICADO: Siempre guardar el reporte (sobreescribir cada vez)
    fs.writeFileSync(reportPath, JSON.stringify(problemLog, null, 2));
    
    if (problemLog.summary.total_errors > 0) {
      log(`📄 Reporte de errores guardado en: ${reportPath} (${problemLog.summary.total_errors} errores)`);
    } else {
      log(`📄 Reporte de batch exitoso guardado en: ${reportPath}`);
    }
  } catch (error) {
    log(`❌ Error al guardar reporte: ${error.message}`);
  }
}

/** Ejecuta un script hijo con manejo de errores mejorado */
function runScript(script) {
  return new Promise((resolve, reject) => {
    log(`▶️ Ejecutando ${script} (errores: ${errorCounters[script] || 0}/${MAX_ERRORS_PER_SCRIPT})`);
    const scriptPath = path.join(WORKDIR, script);
    
    // ✅ VALIDACIÓN: Verificar que el script existe
    if (!fs.existsSync(scriptPath)) {
      const error = `Script no encontrado: ${scriptPath}`;
      log(`❌ ${error}`);
      incrementErrorCounter(script);
      reject(new Error(error));
      return;
    }
    
    const child = spawn('node', [scriptPath], { stdio: 'inherit' });

    child.on('close', (code) => {
      if (code === 0) {
        log(`✅ Finalizó ${script}`);
        resetErrorCounter(script); // ✅ NUEVO: Resetear contador en éxito
        
        // ✅ NUEVO: Marcar como exitoso en problemLog
        if (!problemLog.scripts[script]) {
          problemLog.scripts[script] = {};
        }
        problemLog.scripts[script].status = 'success';
        problemLog.scripts[script].last_success = new Date().toISOString();
        
        resolve();
      } else {
        const errorMessage = `Script ${script} terminó con código ${code}`;
        const errorCount = incrementErrorCounter(script, errorMessage);
        log(`❌ Error en ${script} – exit ${code}`);
        
        // ✅ NUEVO: Verificar límite de errores
        if (hasReachedErrorLimit(script)) {
          log(`🚨 ${script} ha alcanzado el límite de ${MAX_ERRORS_PER_SCRIPT} errores consecutivos`);
          log(`⏭️ Saltando al siguiente script...`);
          
          // ✅ NUEVO: Marcar como saltado
          problemLog.scripts[script].status = 'skipped';
          problemLog.scripts[script].skipped_at = new Date().toISOString();
          
          resetErrorCounter(script); // Resetear para la próxima vez
          resolve(); // ✅ CAMBIO: Resolver en lugar de rechazar
        } else {
          reject(new Error(errorMessage));
        }
      }
    });

    // ✅ NUEVO: Manejar errores de spawn
    child.on('error', (error) => {
      const errorMessage = `Error al ejecutar ${script}: ${error.message}`;
      const errorCount = incrementErrorCounter(script, errorMessage);
      log(`❌ ${errorMessage}`);
      
      if (hasReachedErrorLimit(script)) {
        log(`🚨 ${script} ha alcanzado el límite de ${MAX_ERRORS_PER_SCRIPT} errores consecutivos`);
        log(`⏭️ Saltando al siguiente script...`);
        
        // ✅ NUEVO: Marcar como saltado
        problemLog.scripts[script].status = 'skipped';
        problemLog.scripts[script].skipped_at = new Date().toISOString();
        
        resetErrorCounter(script);
        resolve();
      } else {
        reject(error);
      }
    });
  });
}

/** ✅ MEJORADO: Ejecuta un script con reintentos automáticos */
async function runScriptWithRetry(script) {
  while (!hasReachedErrorLimit(script)) {
    try {
      await runScript(script);
      return; // Éxito, salir del bucle
    } catch (error) {
      log(`🔄 Reintentando ${script} en 5 segundos...`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Esperar 5 segundos
    }
  }
  
  log(`⏭️ Límite de errores alcanzado para ${script}, continuando con el siguiente`);
}

async function runBatch() {
  if (isRunning) {
    log('⏳ Batch anterior aún en ejecución. Omitiendo...');
    return;
  }

  isRunning = true;
  
  // ✅ NUEVO: Reinicializar reporte de problemas para cada batch
  problemLog.timestamp = new Date().toISOString();
  problemLog.batch_info = {
    environment: isVPS ? 'VPS' : 'Windows',
    workdir: WORKDIR,
    start_time: new Date().toISOString(),
    scripts_to_run: SCRIPTS,
    max_errors_per_script: MAX_ERRORS_PER_SCRIPT
  };
  // ✅ NUEVO: Limpiar errores anteriores
  problemLog.scripts = {};
  problemLog.summary = {
    total_errors: 0,
    failed_scripts: [],
    successful_scripts: [],
    skipped_scripts: []
  };
  
  log(`🚀 Iniciando batch en ${isVPS ? 'VPS' : 'Windows'} - WORKDIR: ${WORKDIR}`);
  
  try {
    // ✅ MEJORADO: Ejecutar todos los scripts con reintentos
    for (const script of SCRIPTS) {
      log(`📋 Procesando script: ${script}`);
      await runScriptWithRetry(script);
      log(`✅ Script ${script} completado o saltado`);
    }
    
    // Notificar a Apps Script solo si todo salió bien (si existe la función)
    if (typeof notifyAppScript === 'function') {
      const result = await notifyAppScript();
      log(`📤 Notificación exitosa: ${JSON.stringify(result)}`);
    }
    
    // ✅ NUEVO: Actualizar información final del batch
    problemLog.batch_info.end_time = new Date().toISOString();
    problemLog.batch_info.duration_ms = new Date() - new Date(problemLog.batch_info.start_time);
    
    // ✅ NUEVO: Guardar reporte si hay problemas
    saveProblemReport();
    
    log('🎉 Batch completa');
  } catch (err) {
    log(`💥 Error en batch: ${err.message}`);
    
    // ✅ NUEVO: Registrar error general del batch
    problemLog.batch_info.batch_error = {
      message: err.message,
      timestamp: new Date().toISOString()
    };
    saveProblemReport();
  } finally {
    isRunning = false;
  }
}

async function main() {
  log(`🎯 Runner iniciado en ${os.platform()} - ${isVPS ? 'Modo VPS' : 'Modo desarrollo'}`);
  log(`⚙️ Configuración: Máximo ${MAX_ERRORS_PER_SCRIPT} errores por script antes de saltar al siguiente`);
  
  // ✅ NUEVO: Inicializar contadores
  SCRIPTS.forEach(script => {
    errorCounters[script] = 0;
  });
  
  while (true) {
    await runBatch();
    log(`⏳ Esperando ${INTERVAL / 60000} minutos para la próxima tanda...`);
    await new Promise(res => setTimeout(res, INTERVAL));
  }
}

main();