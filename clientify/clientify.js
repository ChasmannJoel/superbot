// Obtener mapeo dinámico desde la hoja "Paneles"
function obtenerMapeoPaneles() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hojaPaneles = ss.getSheetByName("Paneles");
    
    if (!hojaPaneles) {
      console.warn("No se encontró la hoja 'Paneles'. Usando mapeo por defecto.");
      return {};
    }
    
    // Obtener datos de las columnas H (nombre) e I (código)
    const rango = hojaPaneles.getRange("H:I");
    const valores = rango.getValues();
    
    const mapeo = {};
    
    // Iterar sobre las filas (empezar desde fila 1 para saltar encabezados si los hay)
    for (let i = 1; i < valores.length; i++) {
      const nombre = valores[i][0]; // Columna H (nombre)
      const codigo = valores[i][1]; // Columna I (código)
      
      // Solo agregar si ambos valores existen y no están vacíos
      if (codigo !== "" && nombre !== "" && codigo !== null && nombre !== null) {
        // Normalizar el código: quitar ceros a la izquierda y convertir a string
        const codigoNormalizado = parseInt(codigo).toString();
        mapeo[codigoNormalizado] = nombre.toString().trim();
      }
    }
    
    console.log("Mapeo de paneles cargado:", mapeo);
    return mapeo;
    
  } catch (error) {
    console.error("Error al obtener mapeo de paneles:", error);
    return {};
  }
}

// Mapeo de códigos numéricos a nombres de paneles
function mapearCodigoAPanel(codigo, mapeo = null) {
  // Si no se proporciona mapeo, obtenerlo dinámicamente
  if (!mapeo) {
    mapeo = obtenerMapeoPaneles();
  }
  
  // Normalizar el código: quitar ceros a la izquierda y convertir a string
  const codigoNormalizado = parseInt(codigo).toString();
  
  return mapeo[codigoNormalizado] || codigo; // Si no encuentra mapeo, devuelve el código original
}

function generarReporteCompleto() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName("Reporte Clientify");
  if (!hoja) {
    hoja = ss.insertSheet("Reporte Clientify");
  }
  if (!hoja) {
    throw new Error("No se pudo crear ni obtener la hoja 'Reporte Clientify'");
  }
  hoja.clear();
  hoja.getRange(1, 1, hoja.getMaxRows(), hoja.getMaxColumns()).clearNote();

  // Configuración
  const API_URL = "http://168.231.70.228:3010/root/superbot1.0";
  const API_KEY = "clave-super-secreta";
  const TIMEZONE = "America/Buenos_Aires";
  const fechaActual = Utilities.formatDate(new Date(), TIMEZONE, "dd/MM/yyyy HH:mm");

  // Obtener datos del servidor
  const datos = obtenerDatosDelServidor(API_URL, API_KEY);
  if (!datos) return;

  const { reportePaneles, respuestasPaneles } = datos;

  // Obtener mapeo de paneles una sola vez
  const mapeoPaneles = obtenerMapeoPaneles();

  // Crear encabezados
  crearEncabezados(hoja, fechaActual);

  // Llenar datos principales
  llenarDatosPrincipales(hoja, reportePaneles, respuestasPaneles, mapeoPaneles);

  // Aplicar formato
  aplicarFormato(hoja);

  // Agregar notas explicativas
  agregarNotas(hoja);
}

function obtenerDatosDelServidor(apiUrl, apiKey) {
  try {
    const response = UrlFetchApp.fetch(apiUrl, {
      method: "get",
      headers: { "x-api-key": apiKey },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() === 200) {
      return JSON.parse(response.getContentText());
    } else {
      console.error("Error al obtener datos:", response.getContentText());
      return null;
    }
  } catch (error) {
    console.error("Error en la conexión:", error);
    return null;
  }
}


function crearEncabezados(hoja, fechaActual) {
  // Título principal (estilo "card")
  hoja.getRange(1, 1).setValue("📊 REPORTE DE EFICIENCIA - PANELES")
    .setFontWeight("bold")
    .setFontSize(16)
    .setFontColor("#333333");
  hoja.getRange(1, 1, 1, 10).merge()
    .setBackground("#e3f2fd");

  // Fecha y subtítulo
  hoja.getRange(2, 1).setValue(`⏰ Actualizado el ${fechaActual} | Demoras: leve (5-10 min) ⚠️ grave (>10 min)`)
    .setFontColor("#666666");
  hoja.getRange(2, 1, 1, 10).merge();

  // Encabezados de columnas (los estilos principales están en aplicarFormato)
const encabezados = [
  "👤 Panel", "💬 Mensajes", "⏱️ Leves", "⚠️ Graves",
  "Detalles", "✅ Cargas", "📈 % Carga", "Origen"
];
hoja.getRange(4, 1, 1, encabezados.length).setValues([encabezados]);
}
function llenarDatosPrincipales(hoja, reportePaneles, respuestasPaneles, mapeoPaneles) {
  const filaInicio = 5;

  reportePaneles.forEach((panelData, index) => {
    const panelName = panelData.panel;
    // Aplicar mapeo si es un código numérico
    const panelNameMapeado = mapearCodigoAPanel(panelName, mapeoPaneles);
    const panelKey = normalizarPanel(panelNameMapeado);
    const respuestas = Object.entries(respuestasPaneles).find(
      ([key]) => normalizarPanel(key) === panelKey
    )?.[1] || {};
    const fila = filaInicio + index;

    if (index % 2 === 0) {
      hoja.getRange(fila, 1, 1, 7).setBackground("#fafafa");
    }
    hoja.getRange(fila, 1).setValue(panelNameMapeado);

    // --- NUEVO: Tooltip con mensajes por usuario ---
    let tooltip = "Mensajes por usuario:\n";
    if (panelData.totales_por_usuario && Object.keys(panelData.totales_por_usuario).length > 0) {
      tooltip += Object.entries(panelData.totales_por_usuario)
        .map(([usuario, cantidad]) => `• ${usuario}: ${cantidad}`)
        .join('\n');
    } else {
      tooltip += "Sin datos";
    }
    hoja.getRange(fila, 2)
      .setValue(panelData.total_mensajes_hoy || 0)
      .setNote(tooltip);
    // --- FIN NUEVO ---

    hoja.getRange(fila, 3).setValue(respuestas.demoras_leves?.cantidad || 0);
    hoja.getRange(fila, 4).setValue(respuestas.demoras_graves?.cantidad || 0);

    // Detalles
    if (respuestas.demoras_leves?.cantidad > 0 || respuestas.demoras_graves?.cantidad > 0) {
      hoja.getRange(fila, 5).setValue("🔍 Ver")
        .setFontColor("#5c6bc0")
        .setFontWeight("bold")
        .setNote(crearNotaDetalles(respuestas));
    } else {
      hoja.getRange(fila, 5).clearContent().clearNote();
    }

    // Cargas finalizadas (veces_frase_cierre)
    hoja.getRange(fila, 6).setValue(respuestas.veces_frase_cierre || 0);

    // Índice de carga (%) usando fórmula de Sheets
    const filaExcel = fila;
    const locale = SpreadsheetApp.getActive().getSpreadsheetLocale();
    const separador = (locale === "es_AR" || locale === "es_ES") ? ";" : ",";
    hoja.getRange(fila, 7)
      .setFormula(`=IF(B${filaExcel}=0${separador}0${separador}F${filaExcel}/B${filaExcel}*100)`)
      .setNumberFormat('0.00" %"');

    // --- MARCAR ORIGEN WHATICKET O CLIENTIFY ---
    let origen = "Otro";

    if (panelData.detalle_por_origen) {
      if (
        (Array.isArray(panelData.detalle_por_origen) && panelData.detalle_por_origen.includes("whaticket")) ||
        (typeof panelData.detalle_por_origen === "object" && panelData.detalle_por_origen["whaticket"] !== undefined)
      ) {
        origen = "Whaticket";
      } else if (
        (Array.isArray(panelData.detalle_por_origen) && panelData.detalle_por_origen.includes("clientify")) ||
        (typeof panelData.detalle_por_origen === "object" && panelData.detalle_por_origen["clientify"] !== undefined)
      ) {
        origen = "Clientify";
      }
    }

    hoja.getRange(fila, 8).setValue(origen);


    // Resaltar filas con demoras graves
    if (respuestas.demoras_graves?.cantidad > 0) {
      hoja.getRange(fila, 1, 1, 7).setBackground("#ffebeb");
    }
  });
}
function crearNotaDetalles(respuestas) {
  let nota = "";

  if (respuestas.demoras_leves?.cantidad > 0) {
    nota += "\n🚦DEMORAS LEVES🚦\n\n\n";
    respuestas.demoras_leves.detalles.forEach(d => {
      nota += ` CONVERSACION: ${d.conversationHref}\n`;
      nota += `  Tiempo de Demora: ⏱️ ${d.demoraFormateada}`;
      nota += `  ───────────────────────────────\n`;
    });
  }

  if (respuestas.demoras_graves?.cantidad > 0) {
    nota += "\n⚠️⚠️⚠️DEMORAS GRAVES⚠️⚠️⚠️ \n\n\n";
    respuestas.demoras_graves.detalles.forEach(d => {
      nota += ` CONVERSACION:  ${d.conversationHref}\n`;
      nota += `  Tiempo de Demora: ⏱️ ${d.demoraFormateada}`;
      nota += `  ───────────────────────────────\n`;
    });
  }

  return nota.trim() || "Sin demoras registradas";
}

function aplicarFormato(hoja) {
  const lastRow = hoja.getLastRow();
  if (lastRow < 5) return; // No hay datos

  // 1. Ajustar tamaño de columnas y filas
  hoja.setColumnWidths(1, 7, 100);
  hoja.setRowHeight(4, 40);
  hoja.setColumnWidth(8, 100); // Ajustar ancho columna Origen

  // 2. Encabezados modernos
  const rangoEncabezados = hoja.getRange(4, 1, 1, 7);
  rangoEncabezados
    .setBackground("#5c6bc0")
    .setFontColor("white")
    .setFontWeight("bold")
    .setFontSize(11)
    .setWrap(true);

  // --- NUEVO: Encabezado columna Origen (columna 8) ---
  hoja.getRange(4, 8).setBackground("#5c6bc0")
    .setFontColor("white")
    .setFontWeight("bold")
    .setFontSize(11)
    .setWrap(true)
    .setValue("Origen");

  // 3. Colorear filas alternas en A, B y E (azul suave/blanco)
  for (let i = 5; i <= lastRow; i++) {
    const azul = "#e3f2fd";
    const blanco = "#ffffff";
    const color = (i % 2 === 0) ? azul : blanco;
    hoja.getRange(i, 1, 1, 1).setBackground(color); // Columna A
    hoja.getRange(i, 2, 1, 1).setBackground(color); // Columna B
    hoja.getRange(i, 5, 1, 1).setBackground(color); // Columna E
  }

  // 4. Formato condicional para C y D (alerta de demoras)
  const rangoC = hoja.getRange(5, 3, lastRow - 4, 1);
  const rangoD = hoja.getRange(5, 4, lastRow - 4, 1);

  rangoC.setBackground("#fffde7"); // Amarillo suave por defecto
  rangoD.setBackground("#fffde7");

  for (let i = 5; i <= lastRow; i++) {
    const valorC = hoja.getRange(i, 3).getValue();
    const valorD = hoja.getRange(i, 4).getValue();

    // Si hay más de 3, amarillo fuerte; más de 5, naranja; más de 10, rojo
    if (valorC > 10 || valorD > 10) {
      hoja.getRange(i, 3, 1, 2).setBackground("#ff5252"); // Rojo fuerte
    } else if (valorC > 5 || valorD > 5) {
      hoja.getRange(i, 3, 1, 2).setBackground("#ffb74d"); // Naranja
    } else if (valorC > 3 || valorD > 3) {
      hoja.getRange(i, 3, 1, 2).setBackground("#fff176"); // Amarillo fuerte
    }
    // Si es 0, dejar amarillo suave (ya seteado)
  }

  // 5. Cargas (F: blanca, G: rojo a verde según %)
  for (let i = 5; i <= lastRow; i++) {
    hoja.getRange(i, 6).setBackground("#ffffff"); // F siempre blanca

    const porcentaje = hoja.getRange(i, 7).getValue();
    let colorG = "#ff5252"; // Rojo por defecto (0%)
    if (porcentaje >= 40) {
      colorG = "#43a047"; // Verde fuerte
    } else if (porcentaje >= 30) {
      colorG = "#8bc34a"; // Verde claro
    } else if (porcentaje >= 20) {
      colorG = "#fff176"; // Amarillo fuerte
    } else if (porcentaje > 0) {
      colorG = "#ffb74d"; // Naranja
    }
    hoja.getRange(i, 7).setBackground(colorG);
    hoja.getRange(i, 6).setBackground(colorG); // F acompaña el color de G
  }

  // 6. Bordes y alineación
  const rangoDatos = hoja.getRange(5, 1, lastRow - 4, 7);
  rangoDatos
    .setBorder(true, true, true, true, true, true, "#e0e0e0", SpreadsheetApp.BorderStyle.SOLID)
    .setFontFamily("Arial")
    .setFontSize(10)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  // 7. Congelar encabezados
  hoja.setFrozenRows(4);
}

function agregarNotas(hoja) {
  const ultimaFila = hoja.getLastRow() + 2;
  const rangoNotas = hoja.getRange(ultimaFila, 1, 4, 2);

  // Estilo de "card" para notas
  rangoNotas
    .setBackground("#f5f5f5")
    .setFontColor("#424242")
    .setBorder(true, true, true, true, true, true, "#e0e0e0", SpreadsheetApp.BorderStyle.SOLID);

  hoja.getRange(ultimaFila, 1).setValue("📌 NOTAS")
    .setFontWeight("bold");
  hoja.getRange(ultimaFila + 1, 1).setValue("🚦 Leve: 5-10 min");
  hoja.getRange(ultimaFila + 2, 1).setValue("⚠️ Grave: >10 min");
  hoja.getRange(ultimaFila + 3, 1).setValue("ℹ️ Click en '🔍 Ver' para detalles");
  hoja.getRange(ultimaFila + 4, 1).setValue("ℹ️ LINK A HOJA DE REPORTE POR CAMPAÑAS");
  hoja.getRange(ultimaFila + 5, 1).setValue("https://docs.google.com/spreadsheets/d/1-BujAi_wgbUAXmYzagjd-G1ldvvxWjA9Us6y1QUgu60/edit?gid=254354496#gid=254354496");
}

  function normalizarPanel(nombre) {
  return nombre
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}



