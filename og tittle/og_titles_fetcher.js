


// === Bucle infinito para ejecución periódica cada 30 minutos ===
async function mainLoop() {
  while (true) {
    try {
      await procesarPendientes();
    } catch (e) {
      console.log('[OG][LOOP][ERROR]', e);
    }
    console.log('[OG][LOOP] Esperando 30 minutos para la próxima ejecución...');
    await new Promise(res => setTimeout(res, 30 * 60 * 1000));
  }
}

mainLoop();
