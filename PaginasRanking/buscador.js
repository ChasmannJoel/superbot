const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Carpeta donde están los JSON por día
const carpetaDatos = path.join(__dirname, 'datos');

// Función para buscar campañas por nombre en un archivo JSON
function buscarCampaniasPorNombreEnArchivo(nombre, archivo) {
  const resultados = [];
  const data = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  data.datos.forEach(cuenta => {
    cuenta.cuentas.forEach(cuentaObj => {
      cuentaObj.campanias.forEach(campania => {
        if (campania.nombre.toLowerCase().includes(nombre.toLowerCase())) {
          resultados.push({
            cuenta: cuenta.nombre,
            nombre_campania: campania.nombre,
            mensajes: campania.metricas_diarias.messages,
            costoPorMensaje: campania.metricas_diarias.costoPorMensaje,
            gasto: campania.metricas_diarias.spend
          });
        }
      });
    });
  });
  return resultados;
}

// Preguntar el nombre por consola
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Ingrese el nombre a buscar: ', (nombreBuscado) => {
  fs.readdirSync(carpetaDatos).forEach(dia => {
    const archivo = path.join(carpetaDatos, dia, 'campanias_meta_ads.json');
    if (fs.existsSync(archivo)) {
      const encontrados = buscarCampaniasPorNombreEnArchivo(nombreBuscado, archivo);
      if (encontrados.length > 0) {
        console.log(`\n=== Resultados para el día: ${dia} ===`);
        encontrados.forEach(res => {
          console.log(`Cuenta: ${res.cuenta}`);
          console.log(`Campaña: ${res.nombre_campania}`);
          console.log(`Mensajes: ${res.mensajes}`);
          console.log(`Costo por mensaje: $${res.costoPorMensaje.toFixed(2)}`);
          console.log(`Gasto total: $${res.gasto}`);
          console.log('-----------------------------');
        });
      }
    }
  });
  rl.close();
});