
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_TOKEN = "ffaa4635254e463ebc1084a5ae872a7f043a58df";
const RAW_DATA_FILE = path.join(__dirname, '../datos/contacts_raw.json');
// Crear carpeta datos si no existe
const datosDir = path.join(__dirname, '../datos');
if (!fs.existsSync(datosDir)) {
  fs.mkdirSync(datosDir, { recursive: true });
}

// -------------------------
// Helpers
// -------------------------
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchConReintentos(url, headers, intentos = 3, espera = 2000) {
  for (let i = 0; i < intentos; i++) {
    try {
      console.log(`🔄 Intento ${i + 1}/${intentos}: ${url.slice(0, 80)}...`);
      
      // Crear AbortController para timeout del request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log(`⏰ Request timeout después de 10 segundos, abortando...`);
        controller.abort();
      }, 10000); // 10 segundos de timeout por request

      const res = await fetch(url, { 
        headers,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId); // Limpiar timeout si el request completó
      
      const contentType = res.headers.get("content-type");

      if (!res.ok || !contentType || !contentType.includes("application/json")) {
        const errorText = await res.text();
        console.error("Error HTTP:", res.status, "Intento:", i + 1);
        console.error("Content-Type:", contentType);
        console.error("Respuesta:", errorText.slice(0, 300));
        if (i < intentos - 1) {
          console.log(`Esperando 2 segundos antes de reintentar... (${i + 1}/${intentos})`);
          await delay(espera);
          continue;
        } else {
          console.error(`Demasiados intentos fallidos (${intentos}). Abortando este endpoint.`);
          return null;
        }
      }

      console.log(`✅ Request exitoso en intento ${i + 1}`);
      return res;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error(`⏰ Request abortado por timeout en intento ${i + 1}`);
      } else {
        console.error("Error de red o parseo:", err.message, "Intento:", i + 1);
      }
      
      if (i < intentos - 1) {
        console.log(`Esperando 2 segundos antes de reintentar... (${i + 1}/${intentos})`);
        await delay(espera);
      } else {
        console.error(`Demasiados intentos fallidos (${intentos}). Abortando este endpoint.`);
        return null;
      }
    }
  }
}

// -------------------------
// Generar endpoints
// -------------------------
function generarRangoUTC() {
  const ahora = new Date();
  
  // Calcular ayer, hoy y mañana en UTC (días completos)
  const ayer = new Date(ahora);
  ayer.setUTCDate(ahora.getUTCDate() - 1);
  ayer.setUTCHours(0, 0, 0, 0);
  
  const pasadoManana = new Date(ahora);
  pasadoManana.setUTCDate(ahora.getUTCDate() + 2);
  pasadoManana.setUTCHours(0, 0, 0, 0);

  // Formatear como YYYY-MM-DD + T00:00:00Z
  const inicioUTC = ayer.toISOString();
  const finUTC = pasadoManana.toISOString();

  console.log(`📅 Rango UTC (Ayer, Hoy, Mañana): desde ${inicioUTC} hasta ${finUTC}`);

  return { inicioUTC, finUTC };
}

function generarEndpoint(tipo, inicioUTC, finUTC) {
  return `https://api.clientify.net/v1/contacts/?${tipo}[gte]=${inicioUTC}&${tipo}[lt]=${finUTC}`;
}

// -------------------------
// Fetch de contactos (un tipo: created o modified)
// -------------------------
async function fetchByTipo(tipo, inicioUTC, finUTC) {
  let url = generarEndpoint(tipo, inicioUTC, finUTC);
  const headers = { Authorization: `Token ${API_TOKEN}` };
  let contactos = [];
  let paginaNum = 1;

  console.log(`📋 Descargando contactos filtrados por ${tipo}`);
  console.log(`➡️ Endpoint inicial: ${url}`);

  while (url) {
    console.log(`📄 Procesando página ${paginaNum} de ${tipo}...`);
    
    const res = await fetchConReintentos(url, headers);
    if (!res) {
      console.error(`❌ Error en página ${paginaNum}, abortando descarga de ${tipo}`);
      return contactos; // Retornar lo que tenemos hasta ahora
    }

    const data = await res.json();
    
    const contactosFiltrados = data.results.map(contact => ({
      url: contact.url,
      id: contact.id,
      first_name: contact.first_name,
      last_name: contact.last_name,
      phones: contact.phones,
      tags: contact.tags,
      description: contact.description,
      remarks: contact.remarks,
      created: contact.created,
      modified: contact.modified,
      last_contact: contact.last_contact
    }));

    contactos = contactos.concat(contactosFiltrados);
    console.log(`📥 Página ${paginaNum}: ${contactosFiltrados.length} contactos (Total ${tipo}: ${contactos.length})`);

    url = data.next;
    paginaNum++;
    
    // Reducir delay entre páginas - solo si hay siguiente página
    if (url) await delay(500); // Reducido de 1000ms a 500ms
  }

  console.log(`✅ ${tipo} completado: ${contactos.length} contactos en ${paginaNum - 1} páginas`);
  return contactos;
}

// -------------------------
// Función principal
// -------------------------
async function fetchAllContacts() {
  const { inicioUTC, finUTC } = generarRangoUTC();

  // Traemos contactos por created y modified en paralelo
  const [contactosCreated, contactosModified] = await Promise.all([
    fetchByTipo("created", inicioUTC, finUTC),
    fetchByTipo("modified", inicioUTC, finUTC)
  ]);

  console.log(`🟢 Contactos traídos por created: ${contactosCreated.length}`);
  console.log(`🟡 Contactos traídos por modified: ${contactosModified.length}`);

  // Combinamos eliminando duplicados (por id)
  const mapa = new Map();
  [...contactosCreated, ...contactosModified].forEach(c => {
    mapa.set(c.id, c);
  });

  const contactosFinales = Array.from(mapa.values());

  console.log(`✅ Total final (sin duplicados): ${contactosFinales.length}`);
  return contactosFinales;
}

// -------------------------
// Timeout global
// -------------------------
const TIMEOUT_MINUTES = 5; // Reducido de 15 a 5 minutos
const TIMEOUT_MS = TIMEOUT_MINUTES * 60 * 1000;

function crearTimeoutGlobal() {
  return setTimeout(() => {
    console.error(`⏰ TIMEOUT: El script ha superado los ${TIMEOUT_MINUTES} minutos de ejecución`);
    console.error("🛑 Cortando ejecución para evitar bloqueo indefinido");
    process.exit(1);
  }, TIMEOUT_MS);
}

// -------------------------
// Ejecución
// -------------------------
(async () => {
  const inicioTiempo = Date.now();
  const timeoutId = crearTimeoutGlobal();
  
  console.log(`⏱️ Iniciando descarga de contactos (timeout: ${TIMEOUT_MINUTES} minutos)`);
  
  try {
    const contactos = await fetchAllContacts();
    
    // Limpiar timeout si terminó exitosamente
    clearTimeout(timeoutId);
    
    const tiempoTotal = ((Date.now() - inicioTiempo) / 1000 / 60).toFixed(2);
    console.log(`⌚ Tiempo total de ejecución: ${tiempoTotal} minutos`);

    if (contactos.length > 0) {
      fs.writeFileSync(RAW_DATA_FILE, JSON.stringify(contactos, null, 2), "utf-8");
      console.log(`📂 Contactos guardados en: ${RAW_DATA_FILE}`);
      console.log("🎯 Ejecuta 'process_report.js' para generar el reporte de paneles");
    } else {
      console.log("⚠️ No se encontraron contactos para procesar");
    }
  } catch (err) {
    clearTimeout(timeoutId);
    const tiempoTotal = ((Date.now() - inicioTiempo) / 1000 / 60).toFixed(2);
    console.error(`❌ Error en fetch_contacts.js después de ${tiempoTotal} minutos:`, err.message);
  }
})();