import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import cron from 'node-cron';

const BASE_DIR = "/root/superbot1.0";

function backup() {
  const ayer = new Date(Date.now() - 86400000);
  const yyyy = ayer.getFullYear();
  const mm = String(ayer.getMonth() + 1).padStart(2, '0');
  const dd = String(ayer.getDate()).padStart(2, '0');
  const fecha = `${yyyy}-${mm}-${dd}`;
  const destDir = path.join(BASE_DIR, 'datos', fecha);

  fs.mkdirSync(destDir, { recursive: true });

  exec(`cp ${BASE_DIR}/ayer/*.json ${destDir}/`, (err, stdout, stderr) => {
    if (err) {
      console.error('Error copiando archivos:', stderr);
    } else {
      console.log('Backup realizado:', stdout);
    }
  });
}

// Ejecutar todos los días a las 11:00 AM
cron.schedule('0 2 * * *', backup);

// Si quieres que corra inmediatamente al iniciar:
backup();