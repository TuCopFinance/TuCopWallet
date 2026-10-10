import { RootState } from 'src/redux/reducers'

export const bridgeRampSessionSelector = (state: RootState) => state.bridgeramp.session

export const bridgeRampPartySelector = (state: RootState) => state.bridgeramp.party

export const bridgeRampDestinationsSelector = (state: RootState) => state.bridgeramp.destinations

export const bridgeRampWithdrawSelector = (state: RootState) => state.bridgeramp.withdraw

export const bridgeRampSwapSelector = (state: RootState) => state.bridgeramp.swap
