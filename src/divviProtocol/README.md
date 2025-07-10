# Divvi Protocol Integration v2

Esta carpeta contiene la integración con el protocolo Divvi para el seguimiento de referidos en transacciones blockchain.

## Migración a v2 Completada ✅

La integración ha sido actualizada exitosamente de v1 a v2 del SDK de Divvi. Los cambios principales incluyen:

### Cambios Realizados

1. **Función Principal**: `getDataSuffix` → `getReferralTag`
2. **Parámetro Requerido**: Se agregó el parámetro `user` (dirección del usuario)
3. **Simplificación**: Ya no se requiere el parámetro `providers` en v2

### Archivos Actualizados

- ✅ `divviService.ts` - Servicio principal actualizado a v2
- ✅ `register.ts` - Lógica de registro actualizada
- ✅ `registerReferral.ts` - Funciones de utilidad actualizadas
- ✅ `selectors.ts` - Selectores actualizados
- ✅ `slice.ts` - Redux slice actualizado con campo `user`
- ✅ `saga.ts` - Saga actualizada para manejar v2

### Nuevas Características v2

#### 1. Parámetro `user` Requerido

```typescript
// v1 (ANTERIOR)
getDataSuffix({
  consumer: consumerAddress,
  providers: providerAddresses,
})

// v2 (ACTUAL)
getReferralTag({
  user: userAddress, // ✅ Nuevo parámetro requerido
  consumer: consumerAddress, // ✅ Se mantiene
  // providers ya no es necesario
})
```

#### 2. Verificación Criptográfica

- Divvi ahora verifica criptográficamente que el `user` especificado es quien realmente consintió la transacción
- Previene referidos falsos y asegura atribución precisa
- Soporta tanto EOA como smart contract wallets (EIP-1271)

#### 3. Soporte para Mensajes Firmados

- Permite referidos off-chain sin transacciones on-chain
- Perfecto para flujos de cash-in, airdrops, etc.
- Soporta múltiples formatos de mensaje

## Estructura de Archivos

```
src/divviProtocol/
├── README.md              # Esta documentación
├── api.ts                 # Re-exportaciones para compatibilidad
├── divviService.ts        # Servicio principal (v2)
├── register.ts            # Lógica de registro (v2)
├── registerReferral.ts    # Utilidades de referidos (v2)
├── saga.ts                # Redux saga (v2)
├── selectors.ts           # Selectores de estado (v2)
└── slice.ts               # Redux slice (v2)
```

## Uso

### Obtener Sufijo de Datos para Transacciones

```typescript
import { fetchDivviCalldata } from 'src/divviProtocol/divviService'

// En un componente o saga
const state = store.getState()
const dataSuffix = await fetchDivviCalldata(state)

if (dataSuffix) {
  // Usar el sufijo en la transacción
  const txData = originalCalldata + dataSuffix
}
```

### Verificar Estado de Referidos

```typescript
import { hasReferralSucceeded } from 'src/divviProtocol/selectors'

const state = store.getState()
const hasSucceeded = hasReferralSucceeded(state, consumerAddress, providersArray)
```

## Configuración

La configuración se obtiene automáticamente desde `app.config.ts`:

```typescript
divviProtocol: {
  divviId: "consumer-address",
  consumer: "consumer-address",
  providers: ["provider1", "provider2"], // Opcional en v2
  campaignIds: ["campaign1", "campaign2"]
}
```

## Flujo de Trabajo

1. **Inicialización**: Se inicializa automáticamente al montar la app
2. **Transacción**: Se agrega el sufijo de datos a las transacciones
3. **Confirmación**: Se detectan transacciones confirmadas
4. **Reporte**: Se reportan automáticamente a la API de Divvi
5. **Seguimiento**: Se actualiza el estado en Redux

## Logs y Debugging

Los logs están disponibles con el tag `divviProtocol/*`:

```
divviProtocol/divviService - Servicio principal
divviProtocol/register - Lógica de registro
divviProtocol/saga - Saga de Redux
```

## Consideraciones de Privacidad

⚠️ **IMPORTANTE**: Para mensajes firmados off-chain, el texto se registra en la blockchain de Optimism y es públicamente visible. Nunca incluir información privada o sensible.

## Compatibilidad

- ✅ EOA (Externally Owned Accounts)
- ✅ Smart Contract Wallets
- ✅ Account Abstraction
- ✅ Safe Multisig
- ✅ EIP-1271 Signatures
