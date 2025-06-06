import { PublicAppConfig } from 'src/app/selectors'

/**
 * Configuración pública de la aplicación
 * Incluye la configuración para protocolos externos como Divvi
 */
export const publicAppConfig: PublicAppConfig = {
  divviProtocol: {
    divviId: 'tucop-wallet',
    campaignIds: [],
    consumer: '0x22886C71a4C1Fa2824BD86210ead1C310B3d7cf5',
    providers: [
      '0x0423189886d7966f0dd7e7d256898daeee625dca',
      '0xc95876688026be9d6fa7a7c33328bd013effa2bb',
      '0x7beb0e14f8d2e6f6678cc30d867787b384b19e20',
    ],
  },
}
