import { RootState } from 'src/redux/reducers'

export const bridgeRampSwapSelector = (state: RootState) => state.bridgeramp.swap

export const bridgeRampLastCompletedSwapSelector = (state: RootState) =>
  state.bridgeramp.lastCompletedSwap
