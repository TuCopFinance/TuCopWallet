# ADR-0004: Upgrade a React Native 0.77.3 con Old Architecture

## Estado

Aceptado

## Fecha

2025-03-20

## Contexto

TuCOP Wallet estaba en React Native 0.72.15. Google Play requiere soporte
para dispositivos con 16KB page size a partir de noviembre 2025. Esto
requiere AGP 8.3+ que no es compatible con RN 0.72.

Además, RN 0.77 trae mejoras de performance y DevX.

## Opciones Consideradas

1. **Quedarse en RN 0.72**: Parchear AGP manualmente.
   Problema: No soportado, riesgo de incompatibilidades.

2. **Upgrade a RN 0.74-0.76**: Versiones intermedias.
   Problema: Muchos breaking changes acumulados.

3. **Upgrade directo a RN 0.77.3**: Última versión estable.
   Incluye: AGP 8.5.1, Gradle 8.10.2, Kotlin 2.0.21.

4. **RN 0.77 + New Architecture**: Fabric + TurboModules.
   Problema: Muchas dependencias no soportan New Arch.

## Decisión

Upgrade a **React Native 0.77.3** manteniendo **Old Architecture**
(`newArchEnabled=false`).

Cambios clave:

- MainActivity/MainApplication migrados a Kotlin (requerido por RN 0.77 Old Arch)
- SoLoader usa `OpenSourceMergedSoMapping` (fix crash libreact_featureflagsjni.so)
- AGP 8.5.1 + `useLegacyPackaging = true` (16KB page size compliance)
- Hermes habilitado por defecto

## Consecuencias

### Positivas

- Compliance con Google Play requirements
- Mejor performance (Hermes optimizado)
- Acceso a nuevas APIs de React Native
- Preparados para futura migración a New Architecture

### Negativas

- Old Architecture no tiene soporte indefinido
- Algunas librerías nuevas solo soportan New Arch
- Migración a Kotlin requirió reescribir MainActivity/MainApplication

## Referencias

- [React Native 0.77 Changelog](https://reactnative.dev/blog/2025/01/21/release-0.77)
- [16KB Page Size Requirement](https://developer.android.com/guide/practices/page-sizes)
- PR #42, PR #43 - Implementación
- `android/app/src/main/java/xyz/mobilestack/MainActivity.kt`
