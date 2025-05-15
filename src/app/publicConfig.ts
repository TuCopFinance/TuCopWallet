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
      '0x5f0a55FaD9424ac99429f635dfb9bF20c3360Ab8',
      '0xB06a1b291863f923E7417E9F302e2a84018c33C5',
      '0x6226ddE08402642964f9A6de844ea3116F0dFc7e',
    ],
  },
}
