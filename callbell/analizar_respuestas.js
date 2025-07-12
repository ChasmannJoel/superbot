import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función para formatear fecha y hora en formato legible
function formatDateTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

// Función para formatear duración en formato legible
function formatDuration(ms) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60); // <-- Paréntesis corregido aquí
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);

  return `${hours}h ${minutes}m ${seconds}s`;
}

function calcularPromedios(contactos) {
  const resultadoPorPanel = {};
  const FRASE_CIERRE = "¡Gracias por comunicarte con nosotros! Ya podés desestimar este chat. \nPara la próxima escribinos directamente al Principal que te enviamos. 😊";

  for (const contacto of contactos) {
    // Limpia el nombre del panel (soporta "Panel", "Panel:", "panel: ", etc.)
    let panel = contacto.team?.name || 'Desconocido';
    panel = panel.replace(/^panel[:\s]+/i, '').trim();

    const mensajes = contacto.messages || [];

    // Inicializar el panel si no existe
    if (!resultadoPorPanel[panel]) {
      resultadoPorPanel[panel] = {
        conversaciones: 0,
        veces_c4rgado: 0,
        veces_frase_cierre: 0, // <-- nuevo contador
        demoras_leves: { cantidad: 0, detalles: [] },
        demoras_graves: { cantidad: 0, detalles: [] },
        promedios: [],
        demoras_totales: []
      };
    }

    resultadoPorPanel[panel].conversaciones++;

    // Verificar si se menciona 'c4rgado'
    if (mensajes.some(m => (m.text || '').toLowerCase().includes('c4rgado'))) {
      resultadoPorPanel[panel].veces_c4rgado++;
    }

    // Contar veces que aparece la frase de cierre
    const vecesFrase = mensajes.filter(m => (m.text || '').includes(FRASE_CIERRE)).length;
    resultadoPorPanel[panel].veces_frase_cierre += vecesFrase;

    // Ordenar todos los mensajes por fecha
    const mensajesOrdenados = [...mensajes].sort((a, b) => 
      new Date(a.createdAt) - new Date(b.createdAt)
    );

      // ...después de ordenar mensajes...
      const delays = [];
      let i = 0;
      while (i < mensajesOrdenados.length) {
        const current = mensajesOrdenados[i];

        // Si el mensaje actual es recibido, busca el primer enviado siguiente
        if (current.status === 'received') {
          let j = i + 1;
          while (j < mensajesOrdenados.length && mensajesOrdenados[j].status !== 'sent') {
            j++;
          }
          if (j < mensajesOrdenados.length) {
            const next = mensajesOrdenados[j];
            const delayMs = new Date(next.createdAt) - new Date(current.createdAt);
            delays.push(delayMs);

            // Clasificar las demoras con información de hora
            const delayMinutes = delayMs / 1000 / 60;
            // ...dentro del while que arma delayObj...
            const delayObj = {
              contactoUuid: contacto.uuid,
              conversationHref: contacto.conversationHref 
                || (contacto.info?.conversationHref) 
                || (contacto.info?.contact?.conversationHref),
              whatsappCloudAdSourceUrl: 
                contacto.customFields?.["whatsapp cloud ad source url"]
                || contacto.info?.customFields?.["whatsapp cloud ad source url"]
                || contacto.info?.contact?.customFields?.["whatsapp cloud ad source url"],
              horaInicio: formatDateTime(current.createdAt),
              horaRespuesta: formatDateTime(next.createdAt),
              demoraFormateada: formatDuration(delayMs),
              demoraMs: delayMs,
              demoraMinutos: delayMinutes.toFixed(2),
              mensajeInicio: (current.text ? current.text.substring(0, 50) : '') + (current.text && current.text.length > 50 ? '...' : ''),
              mensajeRespuesta: (next.text ? next.text.substring(0, 50) : '') + (next.text && next.text.length > 50 ? '...' : '')
            };

            resultadoPorPanel[panel].demoras_totales.push(delayObj);

            if (delayMinutes > 10) {
              resultadoPorPanel[panel].demoras_graves.cantidad++;
              resultadoPorPanel[panel].demoras_graves.detalles.push(delayObj);
            } else if (delayMinutes > 5) {
              resultadoPorPanel[panel].demoras_leves.cantidad++;
              resultadoPorPanel[panel].demoras_leves.detalles.push(delayObj);
            }
            // Salta al mensaje después del primer enviado encontrado
            i = j;
          } else {
            // No hay más enviados después de este recibido
            break;
          }
        } else {
          // Si no es recibido, avanza al siguiente mensaje
          i++;
        }
      }

    // Calcular promedio solo si hay demoras
    if (delays.length > 0) {
      const suma = delays.reduce((acc, x) => acc + x, 0);
      const promedioMs = suma / delays.length;
      const promedioMinutos = promedioMs / 1000 / 60;

      resultadoPorPanel[panel].promedios.push({
        contactoUuid: contacto.uuid,
        promedioFormateado: formatDuration(promedioMs),
        promedioMinutos: promedioMinutos.toFixed(2),
        cantidadMensajes: delays.length
      });
    }
  }

  // Calcular promedios generales por panel
  for (const panel in resultadoPorPanel) {
    const demoras = resultadoPorPanel[panel].demoras_totales;
    if (demoras.length > 0) {
      const sumaTotal = demoras.reduce((acc, d) => acc + d.demoraMs, 0);
      resultadoPorPanel[panel].promedioGeneralMinutos = (sumaTotal / demoras.length / 1000 / 60).toFixed(2);
      resultadoPorPanel[panel].promedioGeneralFormateado = formatDuration(sumaTotal / demoras.length);
      resultadoPorPanel[panel].totalDemorasAnalizadas = demoras.length;
    }
  }

  return resultadoPorPanel;
}

// Ejecución del código
const archivo = path.join(__dirname, 'contactos.json');
const archivoSalida = path.join(__dirname, 'respuestas_paneles.json'); // <-- salida en la misma carpeta

try {
  const contenido = fs.readFileSync(archivo, 'utf8');
  const contactos = JSON.parse(contenido);
  const resultado = calcularPromedios(contactos);

  console.log(JSON.stringify(resultado, null, 2));

  // Guardar el resultado en la misma carpeta
  fs.writeFileSync(archivoSalida, JSON.stringify(resultado, null, 2), 'utf8');
  console.log('Resumen guardado en respuestas_paneles.json');
} catch (error) {
  console.error('Error al procesar el archivo:', error);
}