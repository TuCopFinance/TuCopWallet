import React from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import BottomSheet, { BottomSheetModalRefType } from 'src/components/BottomSheet'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import FeeSummary, { FeeComponent } from 'src/components/FeeSummary'
import { getTokenDisplayName } from 'src/tokens/utils'
import { useTokenInfo } from 'src/tokens/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

// Per-leg breakdown row for multi-leg atomic swaps (e.g. Dolares -> Pesos
// aggregate: 3 legs, each with its own provider + network fee). Rendered
// as a card inside the bottom sheet under a "Desglose por cambio" section.
// Fees within a leg are shown in the ACTUAL token they were denominated
// or paid in (provider fee = leg's fromToken per Squid convention;
// network fee = whichever token the fee-currency picker used, which may
// have cascaded if the fromToken was fully drained).
export interface LegFeeCard {
  legIndex: number
  fromTokenId: string
  providerFee?: FeeComponent
  networkFee?: FeeComponent
}

interface Props {
  forwardedRef: React.RefObject<BottomSheetModalRefType>
  // Post-tx aggregate fee rows. Same visual structure as the pre-confirm
  // FeeInfoBottomSheet (Desglose row-by-row + Mas informacion). For a
  // single-leg swap these are the only rows shown. For multi-leg the
  // aggregate rows stay on top and the per-leg breakdown appears below.
  networkFee?: FeeComponent
  providerFee?: FeeComponent
  crossChainFee?: FeeComponent
  // Optional Squid integrator percentage for the explainer text (e.g. "0.5%").
  providerFeePercentage?: string
  // Multi-leg breakdown. When present + non-empty, renders one card per
  // leg with its own provider + network fee rows in each leg's real
  // fee token. The aggregate rows above still show the sum per fee-token.
  legs?: LegFeeCard[]
  // Destination token id for the leg-card header text ("Cambio de USDm -> Pesos").
  toTokenId?: string
  // True when the batch's gas was paid as ONE atomic tx (EIP-7702). In that
  // case per-leg cards intentionally have no networkFee row - render a
  // small footnote instead so the user understands the aggregate gas row
  // covers all legs together.
  sharedGasNote?: boolean
}

export function TxFeeDetailsBottomSheet({
  forwardedRef,
  networkFee,
  providerFee,
  crossChainFee,
  providerFeePercentage,
  legs,
  toTokenId,
  sharedGasNote,
}: Props) {
  const { t } = useTranslation()
  const handleClose = () => forwardedRef.current?.close()

  // Pick the same explainer copy the pre-confirm sheet uses so the tone is
  // uniform. 4 context variants: sameChain / sameChainWithAppFee /
  // crossChain / crossChainWithAppFee. Multi-leg falls under sameChain.
  const contextKey =
    crossChainFee && providerFee
      ? 'crossChainWithAppFee'
      : crossChainFee
        ? 'crossChain'
        : providerFee || (legs && legs.some((l) => !!l.providerFee))
          ? 'sameChainWithAppFee'
          : 'sameChain'

  const hasLegs = !!legs && legs.length > 0

  return (
    <BottomSheet
      forwardedRef={forwardedRef}
      title={t('swapScreen.transactionDetails.fees')}
      testId="TxFeeDetailsBottomSheet"
    >
      <Text style={styles.sectionLabel}>{t('swapScreen.transactionDetails.feesBreakdown')}</Text>

      {networkFee && (
        <View style={styles.row} testID="TxFeeDetailsBottomSheet/NetworkFee">
          <Text style={styles.bodyText}>{t('transactionFeed.networkFee')}</Text>
          <FeeSummary
            layout="inline"
            components={[networkFee]}
            primaryStyle={styles.feeAmountText}
            testID="TxFeeDetailsBottomSheet/NetworkFee/Amount"
          />
        </View>
      )}

      {providerFee && (
        <>
          <View style={styles.divider} />
          <View style={styles.row} testID="TxFeeDetailsBottomSheet/ProviderFee">
            <Text style={styles.bodyText}>{t('swapScreen.transactionDetails.appFee')}</Text>
            <FeeSummary
              layout="inline"
              components={[providerFee]}
              primaryStyle={styles.feeAmountText}
              testID="TxFeeDetailsBottomSheet/ProviderFee/Amount"
            />
          </View>
        </>
      )}

      {crossChainFee && (
        <>
          <View style={styles.divider} />
          <View style={styles.row} testID="TxFeeDetailsBottomSheet/CrossChainFee">
            <Text style={styles.bodyText}>
              {t('swapScreen.transactionDetails.estimatedCrossChainFee')}
            </Text>
            <FeeSummary
              layout="inline"
              components={[crossChainFee]}
              primaryStyle={styles.feeAmountText}
              testID="TxFeeDetailsBottomSheet/CrossChainFee/Amount"
            />
          </View>
        </>
      )}

      {hasLegs && (
        <View style={styles.legsSection} testID="TxFeeDetailsBottomSheet/Legs">
          <Text style={styles.sectionLabel}>
            {t('swapScreen.transactionDetails.legsBreakdown')}
          </Text>
          {legs.map((leg) => (
            <LegCardRow key={`leg-${leg.legIndex}`} leg={leg} toTokenId={toTokenId} />
          ))}
          {sharedGasNote && (
            <Text style={styles.sharedGasNote} testID="TxFeeDetailsBottomSheet/SharedGasNote">
              {t('swapScreen.transactionDetails.sharedGasNote')}
            </Text>
          )}
        </View>
      )}

      <View style={styles.moreInfoContainer}>
        <Text style={styles.sectionLabel}>
          {t('swapScreen.transactionDetails.feesMoreInfoLabel')}
        </Text>
        <Text style={styles.infoText}>
          <Trans
            i18nKey="swapScreen.transactionDetails.feesInfo"
            context={contextKey}
            tOptions={{
              appFeePercentage: providerFeePercentage ?? '',
            }}
          />
        </Text>
      </View>

      <Button
        type={BtnTypes.SECONDARY}
        size={BtnSizes.FULL}
        text={t('earnFlow.poolInfoScreen.infoBottomSheet.gotIt')}
        onPress={handleClose}
        testID="TxFeeDetailsBottomSheet/GotIt"
      />
    </BottomSheet>
  )
}

// Card rendered per leg inside the "Desglose por cambio" section. Header
// reads "Cambio de <fromLabel> -> <toLabel>" (fromLabel + toLabel use
// getTokenDisplayName so USDm -> "Dolares", COPm -> "Pesos", etc.).
// Under the header: one row for provider fee (if present) and one for
// network fee (if present), each rendered via FeeSummary in that leg's
// real fee token, with the local-currency approximation on the right.
function LegCardRow({ leg, toTokenId }: { leg: LegFeeCard; toTokenId?: string }) {
  const { t } = useTranslation()
  const fromTokenInfo = useTokenInfo(leg.fromTokenId)
  const toTokenInfo = useTokenInfo(toTokenId)
  const fromLabel = fromTokenInfo ? getTokenDisplayName(fromTokenInfo.symbol) : ''
  const toLabel = toTokenInfo ? getTokenDisplayName(toTokenInfo.symbol) : ''
  const header = fromLabel && toLabel ? `${fromLabel} -> ${toLabel}` : `${fromLabel}${toLabel}`

  return (
    <View style={styles.legCard} testID={`TxFeeDetailsBottomSheet/Leg-${leg.legIndex}`}>
      <Text style={styles.legHeader}>{header}</Text>
      {leg.providerFee && (
        <View style={styles.legRow}>
          <Text style={styles.legBody}>{t('swapScreen.transactionDetails.appFee')}</Text>
          <FeeSummary
            layout="inline"
            components={[leg.providerFee]}
            primaryStyle={styles.legAmount}
            testID={`TxFeeDetailsBottomSheet/Leg-${leg.legIndex}/ProviderFee`}
          />
        </View>
      )}
      {leg.networkFee && (
        <View style={styles.legRow}>
          <Text style={styles.legBody}>{t('transactionFeed.networkFee')}</Text>
          <FeeSummary
            layout="inline"
            components={[leg.networkFee]}
            primaryStyle={styles.legAmount}
            testID={`TxFeeDetailsBottomSheet/Leg-${leg.legIndex}/NetworkFee`}
          />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.Smallest8,
  },
  sectionLabel: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.black,
  },
  bodyText: {
    ...typeScale.bodyMedium,
    color: Colors.black,
  },
  feeAmountText: {
    ...typeScale.bodyMedium,
    color: Colors.black,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.gray2,
    marginVertical: Spacing.Smallest8,
  },
  legsSection: {
    marginTop: Spacing.Regular16,
    gap: Spacing.Smallest8,
  },
  legCard: {
    padding: Spacing.Smallest8,
    borderRadius: 8,
    backgroundColor: Colors.gray1,
    gap: 4,
  },
  legHeader: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.black,
  },
  legRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  legBody: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
  legAmount: {
    ...typeScale.bodySmall,
    color: Colors.black,
    textAlign: 'right',
  },
  sharedGasNote: {
    ...typeScale.bodyXSmall,
    color: Colors.gray4,
    fontStyle: 'italic',
    marginTop: 4,
  },
  moreInfoContainer: {
    marginTop: Spacing.Regular16,
    marginBottom: Spacing.Regular16,
    gap: Spacing.Smallest8,
  },
  infoText: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
})
