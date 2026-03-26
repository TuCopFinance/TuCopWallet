#!/bin/bash

# Definir el nombre del archivo de salida
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="$SCRIPT_DIR/../changelogs.txt"

# Obtener los últimos 10 commits y guardarlos en el archivo
git log -20 --pretty=format:"%h - %an, %ar : %s" > $OUTPUT_FILE

# Mostrar un mensaje de éxito
echo "Los change logs se han guardado en $OUTPUT_FILE"
