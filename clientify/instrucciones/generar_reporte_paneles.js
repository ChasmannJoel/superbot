import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { format } from 'date-fns';
import pkg from 'date-fns-tz';
const { utcToZonedTime } = pkg;

// Para obtener __dirname en módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración de zona horaria
const TIMEZONE = 'America/Argentina/Buenos_Aires';

// Función para obtener la fecha de hoy en formato DD-MM
function getTodayDateFormatted() {
    const now = new Date();
    const argentinaTime = utcToZonedTime(now, TIMEZONE);
    const day = format(argentinaTime, 'd', { timeZone: TIMEZONE });
    const month = format(argentinaTime, 'M', { timeZone: TIMEZONE });
    return { day: parseInt(day), month: parseInt(month) };
}

// Función para verificar si un tag con formato DD-MM-panel es de hoy
function isTagFromToday(day, month) {
    const today = getTodayDateFormatted();
    return day === today.day && month === today.month;
}



// Función para normalizar una entrada de remarks
function normalizeRemarkEntry(entry) {
    if (!entry || typeof entry !== 'string') return null;
    
    // Limpiar espacios extra y caracteres especiales
    let normalized = entry.trim();
    
    // Paso 1: Normalizar espacios múltiples a uno solo
    normalized = normalized.replace(/\s+/g, ' ');
    
    // Paso 2: Limpiar espacios alrededor de guiones y puntos
    normalized = normalized.replace(/\s*[-\.]\s*/g, '-');
    
    // Paso 3: Normalizar múltiples comas a una sola
    normalized = normalized.replace(/,+/g, ',');
    
    // Paso 4: Limpiar espacios alrededor de comas
    normalized = normalized.replace(/\s*,\s*/g, ',');
    
    // Paso 5: Convertir patrones de carga variados a formato estándar
    // Patrones como: "3B!", "3B !!", "3B,C", "3B,,!", "3B-C", "3B-!", etc.
    
    // Buscar el patrón base: dd-mm-panel[campaign][separadores][indicador]
    const mainPattern = /^(\d{1,2})[-\.](\d{1,2})-(.+)$/;
    const match = normalized.match(mainPattern);
    
    if (!match) return null;
    
    const [, day, month, panelPart] = match;
    
    // Analizar la parte del panel
    let cleanPanelPart = panelPart.trim();
    
    // Detectar indicadores de carga al final: solo !
    const loadIndicators = /!$/;
    const hasLoadIndicator = loadIndicators.test(cleanPanelPart);
    
    if (hasLoadIndicator) {
        cleanPanelPart = cleanPanelPart.replace(/!$/, '').trim();
    }
    
    // Detectar separadores antes del indicador: espacios, comas, guiones
    // Remover separadores al final
    cleanPanelPart = cleanPanelPart.replace(/[\s,\-]+$/, '').trim();
    
    // Ahora cleanPanelPart debería contener solo: numeroPanel + letraCampaña (opcional)
    // Ejemplo: "3B", "3", "2A", "15", etc.
    
    if (!cleanPanelPart) return null;
    
    // ✅ CORRECCIÓN: Extraer SOLO el número del panel y la letra de campaña
    // Ejemplos: "4 4 10 9d" → panel="4", campaign="A"
    const panelMatch = cleanPanelPart.match(/^(\d+)([A-Za-z]?)/);
    
    if (!panelMatch) return null;
    
    const [, panelNumber, campaignLetter] = panelMatch;
    
    // Construir el resultado normalizado
    const result = {
        day: parseInt(day),
        month: parseInt(month),
        panel: panelNumber, // ✅ Solo el número del panel
        campaign: campaignLetter || null,
        isLoad: hasLoadIndicator,
        original: entry,
        normalized: `${day}-${month}-${panelNumber}${campaignLetter || ''}${hasLoadIndicator ? '!' : ''}`
    };
    
    return result;
}

// Función para extraer paneles de los remarks con formato DD.MM-panel o DD-MM-panel
function extractPanelsFromRemarks(remarks) {
    if (!remarks || typeof remarks !== 'string') return [];
    
    const panels = [];
    
    // Paso 1: Normalizar separadores principales
    let normalizedRemarks = remarks.replace(/\n/g, ',');
    
    // Paso 1.5: Manejar indicadores de carga entre códigos
    // Patrones como: "30-09-3B ! 30-09-4A" o "30-09-3B, C, 30-09-4A"
    normalizedRemarks = normalizeLoadIndicatorsBetweenCodes(normalizedRemarks);
    
    // Paso 2: Dividir por comas y espacios múltiples, pero ser cuidadoso con los espacios
    // Primero dividir por comas
    const entries = normalizedRemarks.split(',').filter(entry => entry.trim());
    
    // Paso 3: Para cada entrada, intentar dividir por espacios solo si hay múltiples patrones válidos
    const allEntries = [];
    
    entries.forEach(entry => {
        entry = entry.trim();
        if (!entry) return;
        
        // Si la entrada contiene múltiples espacios y parece tener múltiples patrones, dividir
        if (entry.includes('  ') || entry.split(' ').length > 4) {
            const spaceSplit = entry.split(/\s+/);
            const validSpaceEntries = spaceSplit.filter(subEntry => 
                /^\d{1,2}[-\.]\d{1,2}-.+/.test(subEntry.trim())
            );
            
            if (validSpaceEntries.length > 1) {
                allEntries.push(...validSpaceEntries);
            } else {
                allEntries.push(entry);
            }
        } else {
            allEntries.push(entry);
        }
    });
    
    // Paso 4: Procesar cada entrada individual
    allEntries.forEach(entry => {
        const normalized = normalizeRemarkEntry(entry);
        
        if (normalized) {
            panels.push({
                day: normalized.day,
                month: normalized.month,
                panel: normalized.panel,
                campaign: normalized.campaign,
                isLoad: normalized.isLoad,
                isSpecialPanel: false, // Ya manejado en isLoad
                original: normalized.original,
                normalized: normalized.normalized
            });
        }
    });
    
    // Log para debugging
    if (panels.length > 0) {
        console.log(`📝 Remarks procesados:`);
        panels.forEach(panel => {
            console.log(`   "${panel.original}" → "${panel.normalized}" (Panel: ${panel.panel}, Campaña: ${panel.campaign || 'SIN_CAMPAÑA'}, Carga: ${panel.isLoad ? 'SÍ' : 'NO'})`);
        });
    }
    
    return panels;
}

// Nueva función para manejar indicadores de carga entre códigos
function normalizeLoadIndicatorsBetweenCodes(remarks) {
    let processed = remarks;
    
    // Patrón para detectar: código + espacios/comas + indicador + espacios/comas + código
    // Ejemplo: "30-09-3B ! 30-09-4A" o "30-09-3B, C, 30-09-4A"
    const betweenCodesPattern = /(\d{1,2}[-\.]\d{1,2}-[^\s,!cC]+)[\s,]*([!cC])[\s,]*(\d{1,2}[-\.]\d{1,2}-)/g;
    
    processed = processed.replace(betweenCodesPattern, (match, firstCode, indicator, nextCodeStart) => {
        // Aplicar el indicador al código anterior
        const codeWithIndicator = firstCode + indicator;
        return `${codeWithIndicator}, ${nextCodeStart}`;
    });
    
    // Patrón para indicadores sueltos al final después de un código
    // Ejemplo: "30-09-3B !" (cuando no hay código siguiente)
    const endPattern = /(\d{1,2}[-\.]\d{1,2}-[^\s,!cC]+)[\s,]*([!cC])[\s]*$/g;
    
    processed = processed.replace(endPattern, (match, code, indicator) => {
        return code + indicator;
    });
    
    // Limpiar espacios múltiples y comas múltiples que puedan haber quedado
    processed = processed.replace(/\s*,\s*/g, ',');
    processed = processed.replace(/,+/g, ',');
    processed = processed.replace(/\s+/g, ' ');
    
    console.log(`🔄 Normalización entre códigos:`);
    console.log(`   Entrada: "${remarks}"`);
    console.log(`   Salida:  "${processed}"`);
    
    return processed;
}

// Función para capitalizar la primera letra de cada palabra
function capitalizePanel(panelName) {
    if (!panelName || panelName === 'null' || panelName === 'undefined') return null;
    
    let cleanName = panelName.toString().trim();
    
    // ✅ CORRECCIÓN: Extraer solo el número del panel
    // Si viene algo como "4 4 10 9d", tomar solo el primer número
    const panelMatch = cleanName.match(/^(\d+)/);
    
    if (!panelMatch) return null;
    
    return panelMatch[1]; // Retornar solo el número del panel
}

// Nueva función para validar datos antes de crear el reporte
function validatePanelData(panelConsolidado) {
    console.log('\n🔍 VALIDANDO DATOS DE PANELES:');
    
    Object.keys(panelConsolidado).forEach(panelNumero => {
        const data = panelConsolidado[panelNumero];
        
        if (data.cargas > data.total) {
            console.warn(`⚠️ Panel ${panelNumero}: Cargas (${data.cargas}) > Total (${data.total}). Corrigiendo...`);
            // Corrección: las cargas no pueden ser más que el total
            data.cargas = Math.min(data.cargas, data.total);
        }
        
        if (data.total < 0 || data.cargas < 0) {
            console.warn(`⚠️ Panel ${panelNumero}: Valores negativos detectados. Total: ${data.total}, Cargas: ${data.cargas}`);
        }
        
        console.log(`✅ Panel ${panelNumero}: ${data.total} mensajes, ${data.cargas} cargas`);
    });
    
    return panelConsolidado;
}

// Función principal
function processContactsReport() {
    try {
        console.log('🔍 Iniciando procesamiento de contactos...');
        
        const today = getTodayDateFormatted();
        console.log(`📅 Fecha de hoy: ${today.day}-${today.month}`);
        
        // Leer el archivo de contactos
        const contactsPath = path.join(__dirname, '..', 'datos', 'contactos_hoy_completos.json');
        console.log(`📂 Buscando archivo en: ${contactsPath}`);
        
        if (!fs.existsSync(contactsPath)) {
            throw new Error(`❌ No se encontró el archivo: ${contactsPath}`);
        }
        
        const contactsData = JSON.parse(fs.readFileSync(contactsPath, 'utf8'));
        
        console.log(`📊 Total de contactos en el archivo: ${contactsData.length}`);
        
        // Filtrar contactos con remarks de hoy y agrupar por panel
        const panelCounts = {};
        const panelCargas = {}; // Contar los que cargaron (con "!")
        const panelCampaigns = {}; // Contar campañas por panel
        let totalContactsToday = 0;
        let validRemarksFound = 0;
        let remarksFromToday = 0;
        let totalMessagesToday = 0;
        
        contactsData.forEach(contact => {
            let contactHasDataFromToday = false;
            let contactMessagesToday = 0;
            
            // Procesar solo remarks
            if (contact.remarks) {
                const remarksPanels = extractPanelsFromRemarks(contact.remarks);
                
                if (remarksPanels.length > 0) {
                    validRemarksFound++;
                    
                    remarksPanels.forEach(panelInfo => {
                        // Verificar si el panel de los remarks es de hoy
                        if (isTagFromToday(panelInfo.day, panelInfo.month)) {
                            remarksFromToday++;
                            contactHasDataFromToday = true;
                            contactMessagesToday++;
                            totalMessagesToday++;
                            
                            const capitalizedPanel = capitalizePanel(panelInfo.panel);
                            
                            // Solo procesar si el panel no es nulo
                            if (capitalizedPanel) {
                                if (!panelCounts[capitalizedPanel]) {
                                    panelCounts[capitalizedPanel] = 0;
                                    panelCargas[capitalizedPanel] = 0;
                                    panelCampaigns[capitalizedPanel] = {};
                                }
                                panelCounts[capitalizedPanel]++;
                                
                                // Contar campañas
                                const campaign = panelInfo.campaign || 'SIN_CAMPAÑA';
                                if (!panelCampaigns[capitalizedPanel][campaign]) {
                                    panelCampaigns[capitalizedPanel][campaign] = 0;
                                }
                                panelCampaigns[capitalizedPanel][campaign]++;
                                
                                // Verificar si es una carga
                                if (panelInfo.isLoad) {
                                    panelCargas[capitalizedPanel]++;
                                }
                            }
                        }
                    });
                }
            }
            
            // Contar el contacto si tiene datos de hoy
            if (contactHasDataFromToday) {
                totalContactsToday++;
                
                // Log para debug de contactos con múltiples mensajes
                if (contactMessagesToday > 1) {
                    console.log(`👤 Contacto ${contact.id} (${contact.first_name}) tiene ${contactMessagesToday} mensajes hoy`);
                }
            }
        });
        
        console.log(`📋 Remarks con datos válidos: ${validRemarksFound}`);
        console.log(`📅 Entradas de remarks de hoy: ${remarksFromToday}`);
        console.log(`📨 Total mensajes de hoy: ${totalMessagesToday}`);
        console.log(`✅ Contactos únicos de hoy: ${totalContactsToday}`);
        console.log(`📋 Paneles encontrados: ${Object.keys(panelCounts).length}`);
        
        // Consolidar paneles (sumar los normales con los "C" y los "!")
        const panelConsolidado = {};
        const campaignConsolidado = {};
        
        // Primero, procesamos todos los paneles para identificar números base
        Object.keys(panelCounts).forEach(panelName => {
            // ✅ CORRECCIÓN: El panelName ya debería ser solo el número
            const panelNumero = panelName.toString();
            
            if (!panelConsolidado[panelNumero]) {
                panelConsolidado[panelNumero] = {
                    total: 0,
                    cargas: 0
                };
                campaignConsolidado[panelNumero] = {};
            }
            
            // ✅ CORRECCIÓN: Contar mensajes correctamente
            panelConsolidado[panelNumero].total += panelCounts[panelName];
            
            // ✅ CORRECCIÓN: Solo sumar las cargas reales (no duplicar)
            panelConsolidado[panelNumero].cargas += panelCargas[panelName] || 0;
            
            // Consolidar campañas
            const campaigns = panelCampaigns[panelName] || {};
            Object.keys(campaigns).forEach(campaign => {
                if (!campaignConsolidado[panelNumero][campaign]) {
                    campaignConsolidado[panelNumero][campaign] = 0;
                }
                campaignConsolidado[panelNumero][campaign] += campaigns[campaign];
            });
        });
        
        // ✅ NUEVO: Validar datos antes de crear el reporte
        const datosValidados = validatePanelData(panelConsolidado);
        
        // Crear el reporte consolidado
        const report = Object.keys(datosValidados)
            .sort((a, b) => parseInt(a) - parseInt(b)) // Ordenar numéricamente
            .map(panelNumero => {
                const data = datosValidados[panelNumero];
                const porcentajeCarga = data.total > 0 ? ((data.cargas / data.total) * 100).toFixed(1) : 0;
                
                // Obtener campañas consolidadas para este panel
                const campaigns = campaignConsolidado[panelNumero] || {};
                
                return {
                    panel: panelNumero,
                    total_mensajes_hoy: data.total,
                    cargas_hoy: data.cargas,
                    porcentaje_carga: `${porcentajeCarga}%`,
                    campañas: campaigns,
                    detalle_por_origen: ["clientify"]
                };
            });
        
        // Guardar el reporte
        const reportPath = path.join(__dirname, '..', 'reporte_paneles2.json');
        console.log(`💾 Guardando reporte en: ${reportPath}`);
        
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
        
        // Mostrar resumen de porcentajes de carga
        console.log('\n📊 RESUMEN DE PORCENTAJES DE CARGA:');
        console.log('=====================================');
        
        report.forEach(panelData => {
            console.log(`📌 Panel ${panelData.panel}:`);
            console.log(`   Total contactos: ${panelData.total_mensajes_hoy}`);
            console.log(`   Contactos que cargaron: ${panelData.cargas_hoy}`);
            console.log(`   Porcentaje de carga: ${panelData.porcentaje_carga}`);
            
            // Mostrar campañas si existen
            const campaigns = panelData.campañas;
            if (campaigns && Object.keys(campaigns).length > 0) {
                console.log(`   Campañas:`);
                Object.keys(campaigns).forEach(campaign => {
                    console.log(`     ${campaign}: ${campaigns[campaign]} mensajes`);
                });
            }
            console.log('');
        });
        
        // Calcular porcentaje general usando los datos consolidados
        const totalGeneral = report.reduce((sum, panel) => sum + panel.total_mensajes_hoy, 0);
        const totalCargas = report.reduce((sum, panel) => sum + panel.cargas_hoy, 0);
        const porcentajeGeneral = totalGeneral > 0 ? ((totalCargas / totalGeneral) * 100).toFixed(1) : 0;
        
        console.log(`🎯 RESUMEN GENERAL:`);
        console.log(`   Total contactos hoy: ${totalGeneral}`);
        console.log(`   Total que cargaron: ${totalCargas}`);
        console.log(`   Porcentaje general de carga: ${porcentajeGeneral}%`);
        
        // Verificar que se creó el archivo
        if (fs.existsSync(reportPath)) {
            console.log(`✅ Archivo creado exitosamente: ${reportPath}`);
        } else {
            console.log(`❌ Error: No se pudo crear el archivo: ${reportPath}`);
        }
        
        console.log(`📁 Reporte guardado en: ${reportPath}`);
        console.log('\n📈 Resumen del reporte:');
        report.forEach(item => {
            console.log(`   ${item.panel}: ${item.total_mensajes_hoy} mensajes`);
        });
        
        return report;
        
    } catch (error) {
        console.error('❌ Error procesando el reporte:', error.message);
        throw error;
    }
}

// Ejecutar si es llamado directamente
console.log('🚀 Script iniciado');
try {
    processContactsReport();
} catch (error) {
    console.error('❌ Error:', error);
}

export {
    processContactsReport,
    getTodayDateFormatted,
    isTagFromToday,
    extractPanelsFromRemarks,
    capitalizePanel
};