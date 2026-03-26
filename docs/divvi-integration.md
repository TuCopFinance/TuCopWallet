# Integración con Divvi Protocol

Este documento describe la integración del protocolo Divvi en TuCop Wallet.

## ¿Qué es Divvi?

Divvi es un protocolo de referidos y atribución on-chain que permite a las aplicaciones rastrear la actividad de usuarios referidos y recibir recompensas por ello.

## Integración

### Dependencias

- `@divvi/referral-sdk`: SDK oficial de Divvi para la integración

### Configuración

La configuración de Divvi se ha implementado como parte del estado de la aplicación en `publicConfig`. Los valores están definidos en `src/app/publicConfig.ts`:

```javascript
// src/app/publicConfig.ts
export const publicAppConfig: PublicAppConfig = {
  divviProtocol: {
    divviId: 'tucop-wallet',
    campaignIds: [],
    consumer: '0x22886C71a4C1Fa2824BD86210ead1C310B3d7cf5',
    providers: [
      '0x5f0a55FaD9424ac99429f635dfb9bF20c3360Ab8',
      '0xB06a1b291863f923E7417E9F302e2a84018c33C5',
      '0x6226ddE08402642964f9A6de844ea3116F0dFc7e'
    ]
  }
}
```

Esta configuración se inicializa en `src/app/saga.ts` cuando se inicia la aplicación y está disponible a través del selector `getDivviConfig` en `src/divviProtocol/selectors.ts`.

### Componentes principales

1. **divviService.ts**: Obtiene el sufijo de datos Divvi utilizando la configuración del usuario y el SDK oficial.

2. **registerReferral.ts**: Re-exporta las funciones del SDK oficial y proporciona una función auxiliar para añadir el sufijo a las transacciones existentes.

3. **saga.ts**: Gestiona el ciclo de vida de la integración:

   - Inicializa Divvi al iniciar la aplicación
   - Escucha las transacciones confirmadas para reportarlas a Divvi

4. **prepareTransactions.ts**: Modifica las transacciones salientes para incluir el sufijo de datos de Divvi.

### Flujo de integración

1. **Agregar sufijo de datos**: Cuando se prepara una transacción, se agrega el sufijo de datos Divvi al campo `data` (calldata) de la transacción.

2. **Reportar transacción**: Cuando una transacción se confirma, se reporta a Divvi usando el SDK oficial para atribuir correctamente la actividad.

## Código de ejemplo

### Obtener sufijo de datos

```typescript
import { getDataSuffix } from '@divvi/referral-sdk'

const dataSuffix = getDataSuffix({
  consumer: '0x22886C71a4C1Fa2824BD86210ead1C310B3d7cf5',
  providers: [
    '0x5f0a55FaD9424ac99429f635dfb9bF20c3360Ab8',
    '0xB06a1b291863f923E7417E9F302e2a84018c33C5',
    '0x6226ddE08402642964f9A6de844ea3116F0dFc7e',
  ],
})
```

### Reportar transacción

```typescript
import { submitReferral } from '@divvi/referral-sdk'

await submitReferral({
  txHash: '0x123...',
  chainId: 42220, // chainId de Celo Mainnet
})
```

## Referencias

- [Documentación oficial de Divvi](https://divvi.xyz/docs)
- [SDK de Divvi en NPM](https://www.npmjs.com/package/@divvi/referral-sdk)

## Prueba de la integración

Para verificar que la integración con Divvi funciona correctamente, sigue estos pasos:

### 1. Verificación de configuración

Puedes verificar que la configuración de Divvi está correctamente cargada usando las herramientas de desarrollo de Redux:

```javascript
// En la consola de Redux DevTools
state.app.publicConfig.divviProtocol

// Debe mostrar algo como:
{
  divviId: 'tucop-wallet',
  campaignIds: [],
  consumer: '0x22886C71a4C1Fa2824BD86210ead1C310B3d7cf5',
  providers: ['0x5f0a55FaD9424ac99429f635dfb9bF20c3360Ab8', '0xB06a1b291863f923E7417E9F302e2a84018c33C5', '0x6226ddE08402642964f9A6de844ea3116F0dFc7e']
}
```

### 2. Verificación de sufijo de datos

Realiza una transacción (envío de tokens, swap, etc.) y verifica en los logs que se esté agregando el sufijo de datos de Divvi a la transacción:

```
[DEBUG] divviProtocol/divviService - Generando sufijo de datos de Divvi
[DEBUG] viem/prepareTransactions - Se agregó sufijo de datos de Divvi a la transacción
```

### 3. Verificación de reporte de transacción

Una vez que la transacción se confirme, verifica en los logs que se esté reportando correctamente a Divvi:

```
[INFO] divviProtocol/saga - Transacción 0x123... reportada exitosamente a Divvi
```

### 4. Verificación en el portal de Divvi

Para confirmar que la integración funciona end-to-end, verifica en el [portal de Divvi](https://app.divvi.xyz/) que las transacciones de tus usuarios estén siendo registradas y atribuidas correctamente.
