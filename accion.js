import { spawn } from 'child_process';

async function runScript(script) {
  return new Promise((resolve, reject) => {
    console.log(`Ejecutando: ${script}`);
    const child = spawn('node', [script], { stdio: 'inherit' });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`Finalizó: ${script}\n`);
        resolve();
      } else {
        reject(new Error(`Error ejecutando ${script}, código de salida: ${code}`));
      }
    });
  });
}

async function main() {
  await runScript('callbell/generar_contactos.js');
  await runScript('callbell/getteam.js');
  await runScript('callbell/informe.js');
  await runScript('callbell/analizar_respuestas.js');
  await runScript('meta/fetch_meta_ads.js');
  console.log('Todos los scripts finalizaron correctamente.');
}

main();
