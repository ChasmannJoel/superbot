#!/bin/bash

BASE_DIR="/root/superbot1.0"

# Calcular la fecha de AYER en formato YYYY-MM-DD
AYER=$(date -d "yesterday" +%F)
DEST_DIR="$BASE_DIR/datos/$AYER"

mkdir -p "$DEST_DIR"

# Copiar los archivos .json de la carpeta 'ayer' al destino, sueltos
cp "$BASE_DIR/ayer/"*.json "$DEST_DIR/" 2>/dev/null