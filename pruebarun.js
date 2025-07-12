import fetch from 'node-fetch';

// Configuración centralizada
const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzi0Q4xGe6LDp_ag_O0MscwY--ZBI9U9b9RPmVQAUi3IlJiLobHZCImw0K-4fKicsDS/exec';
const SHARED_SECRET = 'TU_SECRETO_COMPARTIDO';

async function notifyAppScript() {
  try {
    const response = await fetch(`${APP_SCRIPT_URL}?authuser=0`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json' // Explicitamente pedimos JSON
      },
      body: JSON.stringify({
        secret: SHARED_SECRET,
        action: 'ejecucion',
        timestamp: new Date().toISOString() // Agregamos timestamp para tracking
      })
    });

    // Verificar estado HTTP primero
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseText = await response.text();
    console.log('🔍 Respuesta cruda:', responseText);

    // Limpieza de caracteres especiales antes de parsear
    const cleanedText = responseText
      .replace(/âš ï¸/g, '⚠️')  // Reemplaza emojis corruptos
      .replace(/[^\x20-\x7E]/g, '');  // Elimina caracteres no ASCII

    try {
      const jsonResponse = JSON.parse(cleanedText);
      console.log('✅ Respuesta parseada:', jsonResponse);
      return jsonResponse;
    } catch (parseError) {
      console.error('❌ Error parseando JSON:', parseError);
      throw new Error(`Respuesta no es JSON válido: ${responseText.substring(0, 100)}...`);
    }
  } catch (err) {
    console.error('⚠️ Error en notificación:', err);
    throw err; // Re-lanzamos el error para manejo externo
  }
}

// Ejecución principal
async function main() {
  try {
    const result = await notifyAppScript();
    console.log('🚀 Notificación exitosa:', result);
  } catch (error) {
    console.error('💥 Error crítico:', error.message);
    process.exit(1); // Salida con código de error
  }
}

main();