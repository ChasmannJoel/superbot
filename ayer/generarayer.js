import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

// Para obtener __dirname en módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEYS = [
  "8bxu5GXjZQsgJ5VbEMVU2wriRHayGus2.56baa9dd6af1bb716d7a0f68a308ee49190269a241ffcfd7621dab9540ed3ff5",
  "fEXgdaNWRKuBQJxkSjaUnKexHQVvvVJB.3f43128cefee3a8e5af823c509255c1d92de8e024a522b54a7a74b8b61520ef4"
];
const API_URL = "https://api.callbell.eu/v1/contacts";
const PAGINAS_SIN_CONTACTOS_LIMITE = 5;

// Calcular el rango de ayer (00:00 a 23:59:59)
const ahora = new Date();
const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
const ayer = new Date(hoy.getTime() - 24 * 60 * 60 * 1000);
const inicioAyer = new Date(ayer.setHours(0, 0, 0, 0));
const finAyer = new Date(ayer.setHours(23, 59, 59, 999));

async function obtenerMensajesContacto(apiKey, contactoUuid) {
  const url = `https://api.callbell.eu/v1/contacts/${contactoUuid}/messages`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) {
    console.error(`Error obteniendo mensajes para contacto ${contactoUuid}:`, res.statusText);
    return [];
  }
  const data = await res.json();
  return data.messages || [];
}

async function obtenerContactosAyer(apiKey) {
  let contactosAyer = [];
  let page = 1;
  let paginasSinContactosAyer = 0;
  let encontradoPrimerContacto = false;

  while (true) {
    const url = `${API_URL}?page=${page}&sort=-createdAt`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!res.ok) {
      console.error(`Error en página ${page}:`, res.statusText);
      break;
    }
    const data = await res.json();
    const contactosPagina = data.contacts || [];

    // Filtrar contactos de ayer (00:00 a 23:59:59)
    const contactosAyerEnPagina = contactosPagina.filter(contacto => {
      if (!contacto.createdAt) return false;
      const fechaContacto = new Date(contacto.createdAt);
      return fechaContacto >= inicioAyer && fechaContacto <= finAyer;
    });

    if (contactosAyerEnPagina.length > 0) {
      // Obtener los mensajes de todos los contactos en paralelo
      await Promise.all(contactosAyerEnPagina.map(async (contacto) => {
        contacto.messages = await obtenerMensajesContacto(apiKey, contacto.uuid);
      }));
      contactosAyer = contactosAyer.concat(contactosAyerEnPagina);
      if (!encontradoPrimerContacto) {
        encontradoPrimerContacto = true;
        paginasSinContactosAyer = 0; // Reinicia el contador al encontrar el primero
      }
      console.log(`Página ${page}: ${contactosAyerEnPagina.length} contactos de ayer`);
    } else {
      if (encontradoPrimerContacto) {
        paginasSinContactosAyer++;
        console.log(`Página ${page}: 0 contactos de ayer (${paginasSinContactosAyer}/${PAGINAS_SIN_CONTACTOS_LIMITE})`);
        if (paginasSinContactosAyer >= PAGINAS_SIN_CONTACTOS_LIMITE) break;
      } else {
        console.log(`Página ${page}: 0 contactos de ayer (buscando primer contacto)`);
      }
    }

    if (contactosPagina.length < 20) break; // Última página
    page++;
    await new Promise(r => setTimeout(r, 300)); // Pausa para no saturar la API
  }
  return contactosAyer;
}

(async () => {
  // Ejecutar la consulta para todas las API keys en paralelo
  const resultados = await Promise.all(API_KEYS.map(apiKey => obtenerContactosAyer(apiKey)));
  const todosContactos = resultados.flat();
  // Guarda el JSON en la misma carpeta que este script
  const rutaArchivo = path.join(__dirname, 'contactos_ayer.json');
  fs.writeFileSync(rutaArchivo, JSON.stringify(todosContactos, null, 2), 'utf8');
  console.log(`contactos_ayer.json generado con ${todosContactos.length} contactos (con mensajes incluidos).`);
})();