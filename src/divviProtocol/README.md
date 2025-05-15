# Integración de Divvi Protocol en TuCop Wallet

Este directorio contiene el código para integrar el protocolo Divvi en TuCop Wallet.

## Configuración

La configuración de Divvi se ha incluido dentro del estado de la aplicación en un objeto llamado `publicConfig`. La configuración específica de Divvi es la siguiente:

```javascript
{
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

## Archivos principales

1. `divviService.ts`: Proporciona funciones para interactuar con el SDK de Divvi.
2. `registerReferral.ts`: Contiene funciones para registrar transacciones en el protocolo Divvi.
3. `saga.ts`: Gestiona la inicialización y el ciclo de vida de la integración con Divvi.
4. `selectors.ts`: Proporciona selectores para acceder a la configuración de Divvi desde el estado de Redux.
5. `slice.ts`: Define el estado de Redux para la funcionalidad de Divvi.

## Flujo de la información

1. La configuración de Divvi se inicializa durante el arranque de la aplicación en `src/app/saga.ts`.
2. Esta configuración se obtiene mediante el selector `getDivviConfig` en `divviProtocol/selectors.ts`.
3. Las funciones en `divviService.ts` utilizan esta configuración para obtener el sufijo de datos para las transacciones.
4. El sufijo de datos se agrega a las transacciones en `prepareTransactions.ts`.
5. Las transacciones confirmadas se reportan a Divvi en `saga.ts`.

## Actualización de la configuración

Si necesitas actualizar la configuración de Divvi, puedes hacerlo modificando el archivo `src/app/publicConfig.ts`.
