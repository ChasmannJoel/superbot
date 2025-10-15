# Generación de informes

Este módulo permite construir informes operativos a partir de los JSON que ya se generan en los procesos de `clientify/` y `meta/` sin modificar el código existente.

## Requisitos

- Node.js 18 o superior (mismo runtime que el resto del proyecto).

## Uso rápido

```bash
node informes/generar_informes.js --fecha=2025-10-15 --turno=manana
```

El comando genera dos archivos Markdown dentro de `informes/salidas/`:

- `turno_2025-10-15_manana.md`: informe del turno elegido.
- `diario_2025-10-15.md`: informe de rendimiento diario.

### Argumentos disponibles

- `--fecha`: Fecha de referencia en formato `YYYY-MM-DD`. Si se omite se usa la fecha actual.
- `--turno`: `manana`, `tarde` o `noche`. Por defecto `manana`.
- `--objetivoMensajes`: Cantidad objetivo de mensajes para marcar campañas como cumplidas. Valor por defecto `60`.
- `--umbralMensajesPanel`: Mensajes mínimos deseados por panel antes de considerarlo en refuerzo. Valor por defecto `100`.
- `--umbralCostoMensaje`: Costo máximo deseado por mensaje para alertar sobre campañas caras. Valor por defecto `1.2`.

Los argumentos pueden combinarse libremente, por ejemplo:

```bash
node informes/generar_informes.js \
  --fecha=2025-10-15 \
  --turno=noche \
  --objetivoMensajes=70 \
  --umbralMensajesPanel=120 \
  --umbralCostoMensaje=1.4
```

## Fuentes de datos

- `meta/campanias_meta_ads.json`: campañas y métricas diarias por cuenta.
- `clientify/reporte_paneles2.json`: resumen de mensajes y cargas por panel en el día.
- `ayer/campanias_meta_ads.json` *(opcional)*: se usa para comparar rendimiento contra el día anterior cuando está disponible.

La ruta de los archivos puede ajustarse editando las constantes al inicio de `generar_informes.js` si fuese necesario.

## Personalización

El script produce plantillas con secciones que requieren contexto humano (panorama inicial, tareas realizadas, avisos importantes). Estas se dejan como texto editable dentro del Markdown final para que el equipo agregue observaciones cualitativas.

Cada sección cuantitativa puede adaptarse modificando los umbrales mediante argumentos, sin tocar el resto del código de los procesos existentes.

## Próximos pasos

1. Ejecutar el script en los horarios deseados (07:30, 15:30 y 23:30) mediante el scheduler que ya utilicen (cron, pm2, GitHub Actions, etc.).
2. Editar manualmente los archivos generados para añadir comentarios cualitativos y, si se desea, subirlos a la plataforma habitual de reportes.
3. (Opcional) Adjuntar capturas exportadas desde Meta Ads para complementar la sección de campañas.

