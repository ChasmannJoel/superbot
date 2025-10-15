import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

// Para obtener __dirname en módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const API_TOKEN = "ffaa4635254e463ebc1084a5ae872a7f043a58df";
const CONTACTS_HOY_PATH = path.join(__dirname, '../datos/contactos_hoy.json');
const CONTACTS_COMPLETOS_PATH = path.join(__dirname, '../datos/contactos_hoy_completos.json');

// Helper para delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Función para reintentos con timeout agresivo
async function fetchConReintentos(url, headers, intentos = 2, espera = 1000) {
  for (let i = 0; i < intentos; i++) {
    try {
      // Timeout agresivo de 5 segundos por request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 5000);

      const res = await fetch(url, { 
        headers,
        signal: controller.signal 
      });
      
      clearTimeout(timeoutId);
      const contentType = res.headers.get("content-type");

      if (!res.ok || !contentType || !contentType.includes("application/json")) {
        const errorText = await res.text();
        console.error(`❌ Error HTTP ${res.status} en intento ${i + 1}:`, errorText.slice(0, 100));
        if (i < intentos - 1) {
          console.log(`⏳ Esperando ${espera/1000}s antes de reintentar...`);
          await delay(espera);
          continue;
        } else {
          console.error("🚫 Abortando este contacto.");
          return null;
        }
      }

      return res;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error(`⏰ Timeout en intento ${i + 1}`);
      } else {
        console.error(`🔌 Error de red en intento ${i + 1}:`, err.message);
      }
      
      if (i < intentos - 1) {
        console.log(`⏳ Esperando ${espera/1000}s antes de reintentar...`);
        await delay(espera);
      } else {
        console.error("🚫 Abortando este contacto.");
        return null;
      }
    }
  }
}

// Función para obtener detalle completo de un contacto
async function obtenerDetalleContacto(contactId, headers) {
  const url = `https://api.clientify.net/v1/contacts/${contactId}/`;
  
  try {
    const res = await fetchConReintentos(url, headers);
    if (!res) return null;

    const contactDetail = await res.json();
    
    // Devolver solo los campos que necesitamos
    return {
      url: contactDetail.url,
      id: contactDetail.id,
      first_name: contactDetail.first_name,
      last_name: contactDetail.last_name,
      phones: contactDetail.phones,
      tags: contactDetail.tags,
      description: contactDetail.description,
      remarks: contactDetail.remarks,
      created: contactDetail.created,
      modified: contactDetail.modified,
      last_contact: contactDetail.last_contact
    };
  } catch (error) {
    console.error(`❌ Error obteniendo detalle del contacto ${contactId}:`, error.message);
    return null;
  }
}

// Función para procesar contactos en lotes
async function procesarLoteContactos(loteContactos, headers, loteNum, totalLotes) {
  console.log(`📦 Procesando lote ${loteNum}/${totalLotes} (${loteContactos.length} contactos)...`);

  const promesas = loteContactos.map(async (contacto, index) => {
    const localIndex = (loteNum - 1) * 10 + index + 1;
    console.log(`🔄 Lote ${loteNum} - Contacto ${localIndex}: ID ${contacto.id} (${contacto.first_name})`);

    const detalle = await obtenerDetalleContacto(contacto.id, headers);

    if (detalle && detalle.remarks && detalle.remarks.trim() !== '') {
      console.log(`  ✅ Tiene remarks: "${detalle.remarks.slice(0, 50)}..."`);
    } else if (detalle) {
      console.log(`  ⚪ Sin remarks`);
    } else {
      console.log(`  ❌ Error obteniendo detalle`);
    }

    return detalle;
  });

  const resultados = await Promise.all(promesas);
  return resultados.filter(Boolean); // Filtrar nulls
}

// Función principal optimizada
async function descargarRemarksContactosHoy() {
  try {
    console.log('🚀 Iniciando descarga de remarks de contactos de hoy...');

    // Verificar que existe el archivo de contactos de hoy
    if (!fs.existsSync(CONTACTS_HOY_PATH)) {
      throw new Error(`❌ No se encontró el archivo: ${CONTACTS_HOY_PATH}. Ejecuta primero 'node hoy.js'`);
    }
    
    // Leer contactos de hoy
    const contactosHoy = JSON.parse(fs.readFileSync(CONTACTS_HOY_PATH, 'utf8'));
    console.log(`📊 Contactos de hoy encontrados: ${contactosHoy.length}`);
    
    if (contactosHoy.length === 0) {
      console.log('⚠️ No hay contactos de hoy para procesar.');
      return;
    }

    // Headers para la API
    const headers = { Authorization: `Token ${API_TOKEN}` };
    
    // Dividir en lotes de 10 para procesar en paralelo
    const TAMAÑO_LOTE = 10;
    const lotes = [];
    for (let i = 0; i < contactosHoy.length; i += TAMAÑO_LOTE) {
      lotes.push(contactosHoy.slice(i, i + TAMAÑO_LOTE));
    }
    
    console.log(`📦 Procesando ${contactosHoy.length} contactos en ${lotes.length} lotes de ${TAMAÑO_LOTE}...`);

    // Procesar lotes de manera secuencial (pero contactos dentro del lote en paralelo)
    const contactosCompletos = [];
    let conRemarks = 0;
    let lotesFallidosConsecutivos = 0;
    const MAX_LOTES_FALLIDOS = 3; // Cortar después de 3 lotes consecutivos fallidos

    for (let i = 0; i < lotes.length; i++) {
      const resultadosLote = await procesarLoteContactos(lotes[i], headers, i + 1, lotes.length);
      contactosCompletos.push(...resultadosLote);

      // Contar remarks
      const remarksEnLote = resultadosLote.filter(c => c.remarks && c.remarks.trim() !== '').length;
      conRemarks += remarksEnLote;

      console.log(`✅ Lote ${i + 1} completado: ${resultadosLote.length}/${lotes[i].length} exitosos, ${remarksEnLote} con remarks`);

      // Verificar si el lote falló completamente
      if (resultadosLote.length === 0) {
        lotesFallidosConsecutivos++;
        console.log(`⚠️ Lote fallido ${lotesFallidosConsecutivos}/${MAX_LOTES_FALLIDOS} consecutivos`);
        
        if (lotesFallidosConsecutivos >= MAX_LOTES_FALLIDOS) {
          console.log(`🛑 CORTANDO PROCESO: ${MAX_LOTES_FALLIDOS} lotes consecutivos fallaron completamente`);
          console.log(`💡 La API de Clientify parece estar caída o muy lenta`);
          console.log(`📊 Datos parciales obtenidos: ${contactosCompletos.length} contactos de ${contactosHoy.length} totales`);
          break;
        }
      } else {
        // Resetear contador si el lote tuvo éxito
        lotesFallidosConsecutivos = 0;
      }

      // Pausa pequeña entre lotes para no sobrecargar
      if (i < lotes.length - 1) {
        await delay(1000); // 1 segundo entre lotes
      }
    }

    // Guardar resultado
    fs.writeFileSync(CONTACTS_COMPLETOS_PATH, JSON.stringify(contactosCompletos, null, 2), 'utf8');
    
    // Mostrar estadísticas
    console.log('\n📈 Resumen:');
    console.log(`✅ Contactos procesados: ${contactosCompletos.length}`);
    console.log(`💾 Contactos guardados: ${contactosCompletos.length}`);
    console.log(`📝 Contactos con remarks: ${conRemarks}`);
    console.log(`📁 Archivo guardado en: ${CONTACTS_COMPLETOS_PATH}`);

    // Mostrar algunos ejemplos de remarks
    const ejemplosRemarks = contactosCompletos
      .filter(c => c.remarks && c.remarks.trim() !== '')
      .slice(0, 5);
      
    if (ejemplosRemarks.length > 0) {
      console.log('\n📋 Ejemplos de remarks encontrados:');
      ejemplosRemarks.forEach((contacto, index) => {
        console.log(`  ${index + 1}. ID ${contacto.id}: "${contacto.remarks}"`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error en el proceso:', error.message);
    throw error;
  }
}

// Ejecutar siempre al importar
descargarRemarksContactosHoy().catch(console.error);

export { descargarRemarksContactosHoy };