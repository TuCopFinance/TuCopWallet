#!/bin/bash

echo "🔧 Eliminando bitcode de frameworks problemáticos en iOS..."

# Frameworks que contienen bitcode
FRAMEWORKS=(
    "Pods/PersonaInquirySDK2/Persona2.xcframework/ios-arm64/Persona2.framework/Persona2"
    "Pods/PersonaInquirySDK2/Persona2.xcframework/ios-arm64_x86_64-simulator/Persona2.framework/Persona2"
    "Pods/OpenSSL-Universal/Frameworks/OpenSSL.xcframework/ios-arm64_armv7/OpenSSL.framework/OpenSSL"
    "Pods/OpenSSL-Universal/Frameworks/OpenSSL.xcframework/ios-arm64_i386_x86_64-simulator/OpenSSL.framework/OpenSSL"
)

for framework in "${FRAMEWORKS[@]}"; do
    if [ -f "$framework" ]; then
        echo "Procesando: $(basename "$framework")"
        if otool -l "$framework" | grep -q "__LLVM"; then
            echo "  ⚠️  Eliminando bitcode..."
            xcrun bitcode_strip -r "$framework" -o "$framework"
            echo "  ✅ Bitcode eliminado"
        else
            echo "  ✅ Ya está libre de bitcode"
        fi
    else
        echo "  ⚠️  Framework no encontrado: $framework"
    fi
done

echo "🎉 Proceso completado. Ahora puedes compilar sin errores de bitcode."
