import express from 'express';
import fs from 'fs/promises'; // Usamos la versión con promises
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const DEFAULT_PORT = 3010;
const rawPort = process.env.SERVER_PORT;
const parsedPort = rawPort ? Number(rawPort) : Number.NaN;
if (rawPort && (!Number.isFinite(parsedPort) || parsedPort <= 0)) {
  console.warn(`⚠️  Valor de SERVER_PORT inválido ("${rawPort}"), usando puerto por defecto ${DEFAULT_PORT}`);
}
const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT;

// Configuración de rutas absolutas
const PATHS = {
  reporte2: path.join(__dirname, 'clientify', 'reporte_paneles2.json'),
  campanias: path.join(__dirname, 'meta', 'campanias_meta_ads.json'),
  horariosMeta: path.join(__dirname, 'meta', 'horarios_ejecucion_meta_ads.json'),
  errorReport: path.join(__dirname, 'error_report.json') // ✅ NUEVO: Archivo de errores
};

// Middleware de verificación mejorado
const checkFiles = async () => {
  const results = {};
  
  for (const [key, filePath] of Object.entries(PATHS)) {
    try {
      await fs.access(filePath, fs.constants.R_OK);
      const content = await fs.readFile(filePath, 'utf8');
      JSON.parse(content); // Validación adicional
      results[key] = { exists: true, valid: true };
    } catch (err) {
      results[key] = { 
        exists: err.code !== 'ENOENT',
        valid: false,
        error: err.message
      };
    }
  }
  
  return results;
};

// Endpoint con diagnóstico completo
app.get('/root/superbot1.0', async (req, res) => {
  try {
    const fileStatus = await checkFiles();
    
    // Verificar si todos los archivos son válidos
    const allValid = Object.values(fileStatus).every(f => f.exists && f.valid);
    
    if (!allValid) {
      return res.status(500).json({
        error: "Problemas con los archivos",
        details: fileStatus,
        solution: "Verifique que los archivos existan y tengan formato JSON válido"
      });
    }

    // Leer archivos

    const [reporte2, campanias, horariosMeta] = await Promise.all([
      fs.readFile(PATHS.reporte2, 'utf8').then(JSON.parse),
      fs.readFile(PATHS.campanias, 'utf8').then(JSON.parse),
      fs.readFile(PATHS.horariosMeta, 'utf8').then(JSON.parse),
    ]);

    // Usar solo reporte2
    const reportePaneles = Array.isArray(reporte2) ? reporte2 : [];

    res.json({
      success: true,
      reportePaneles,
      campaniasMetaAds: campanias,
      horariosMetaAds: horariosMeta
    });

  } catch (err) {
    console.error('Error en endpoint:', err);
    res.status(500).json({
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Endpoint de diagnóstico
app.get('/debug-files', async (req, res) => {
  res.json(await checkFiles());
});

// ✅ NUEVO: Endpoint para el reporte de errores
app.get('/errores', async (req, res) => {
  try {
    // Verificar si el archivo existe
    try {
      await fs.access(PATHS.errorReport, fs.constants.R_OK);
    } catch (err) {
      return res.status(404).json({
        error: "No hay reporte de errores disponible",
        message: "El archivo error_report.json no existe. Esto puede significar que no ha habido errores recientes o que el runner no se ha ejecutado.",
        file_path: PATHS.errorReport
      });
    }

    // Leer y parsear el archivo
    const errorReportContent = await fs.readFile(PATHS.errorReport, 'utf8');
    const errorReport = JSON.parse(errorReportContent);

    // Agregar información adicional
    const stats = await fs.stat(PATHS.errorReport);
    
    res.json({
      success: true,
      last_updated: stats.mtime.toISOString(),
      file_size_bytes: stats.size,
      error_report: errorReport,
      summary: {
        has_errors: errorReport.summary?.total_errors > 0,
        total_errors: errorReport.summary?.total_errors || 0,
        failed_scripts_count: errorReport.summary?.failed_scripts?.length || 0,
        last_batch_time: errorReport.timestamp
      }
    });

  } catch (err) {
    console.error('Error al leer reporte de errores:', err);
    res.status(500).json({
      error: "Error al procesar el reporte de errores",
      message: err.message,
      details: "El archivo puede estar corrupto o tener formato JSON inválido"
    });
  }
});

// ✅ NUEVO: Endpoint simplificado solo con errores actuales
app.get('/errores/simple', async (req, res) => {
  try {
    try {
      await fs.access(PATHS.errorReport, fs.constants.R_OK);
    } catch (err) {
      return res.json({
        has_errors: false,
        message: "No hay errores reportados"
      });
    }

    const errorReportContent = await fs.readFile(PATHS.errorReport, 'utf8');
    const errorReport = JSON.parse(errorReportContent);

    res.json({
      has_errors: errorReport.summary?.total_errors > 0,
      total_errors: errorReport.summary?.total_errors || 0,
      failed_scripts: errorReport.summary?.failed_scripts || [],
      last_execution: errorReport.timestamp,
      environment: errorReport.batch_info?.environment || 'unknown'
    });

  } catch (err) {
    res.status(500).json({
      has_errors: true,
      error: "Error al leer reporte",
      message: err.message
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🛠️  Servidor de diagnóstico en http://0.0.0.0:${PORT}/debug-files`);
  console.log(`🚀 Endpoint principal en http://0.0.0.0:${PORT}/root/superbot1.0`);
  console.log(`❌ Reporte de errores en http://0.0.0.0:${PORT}/errores`);
  console.log(`📋 Errores simples en http://0.0.0.0:${PORT}/errores/simple`);
});