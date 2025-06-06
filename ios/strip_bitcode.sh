#!/bin/bash

# Script para eliminar bitcode de frameworks específicos
# Ejecutar después del build pero antes del archive

echo "🔧 Eliminando bitcode de frameworks..."

# Función para eliminar bitcode de un framework
strip_bitcode_from_framework() {
    local framework_path="$1"
    local framework_name=$(basename "$framework_path" .framework)

    if [ -f "$framework_path/$framework_name" ]; then
        echo "Procesando: $framework_name"

        # Verificar si el framework contiene bitcode
        if otool -l "$framework_path/$framework_name" | grep -q "__LLVM"; then
            echo "  ⚠️  Bitcode encontrado en $framework_name, eliminando..."

            # Crear backup
            cp "$framework_path/$framework_name" "$framework_path/${framework_name}_backup"

            # Eliminar bitcode
            xcrun bitcode_strip -r "$framework_path/$framework_name" -o "$framework_path/$framework_name"

            echo "  ✅ Bitcode eliminado de $framework_name"
        else
            echo "  ✅ $framework_name ya está libre de bitcode"
        fi
    fi
}

# Buscar y procesar frameworks en el directorio de Pods
PODS_DIR="$SRCROOT/Pods"

if [ -d "$PODS_DIR" ]; then
    # Frameworks específicos que causan problemas
    PROBLEMATIC_FRAMEWORKS=(
        "OpenSSL"
        "PersonaInquirySDK2"
        "AdjustSignature"
    )

    for framework_name in "${PROBLEMATIC_FRAMEWORKS[@]}"; do
        # Buscar el framework en diferentes ubicaciones posibles
        find "$PODS_DIR" -name "${framework_name}.framework" -type d | while read framework_path; do
            strip_bitcode_from_framework "$framework_path"
        done

        # También buscar archivos .a (bibliotecas estáticas)
        find "$PODS_DIR" -name "lib${framework_name}.a" -type f | while read lib_path; do
            if otool -l "$lib_path" | grep -q "__LLVM"; then
                echo "  ⚠️  Bitcode encontrado en $(basename "$lib_path"), eliminando..."
                xcrun bitcode_strip -r "$lib_path" -o "$lib_path"
                echo "  ✅ Bitcode eliminado de $(basename "$lib_path")"
            fi
        done
    done
fi

echo "🎉 Proceso de eliminación de bitcode completado"
