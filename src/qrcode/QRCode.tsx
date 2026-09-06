import Clipboard from '@react-native-clipboard/clipboard'
import { PostHogMaskView } from 'posthog-react-native'
import React, { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { nameSelector } from 'src/account/selectors'
import Button, { BtnSizes } from 'src/components/Button'
import ExchangesBottomSheet from 'src/components/ExchangesBottomSheet'
import InLineNotification, { NotificationVariant } from 'src/components/InLineNotification'
import { ExternalExchangeProvider } from 'src/fiatExchanges/ExternalExchanges'
import CopyIcon from 'src/icons/actions/CopyIcon'
import StyledQRCode from 'src/qrcode/StyledQRCode'
import { useSelector } from 'src/redux/hooks'
import { SVG } from 'src/send/actions'
import { NETWORK_NAMES } from 'src/shared/conts'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { vibrateInformative } from 'src/styles/hapticFeedback'
import { Spacing } from 'src/styles/styles'
import { getSupportedNetworkIdsForTokenBalances } from 'src/tokens/utils'
import { NetworkId } from 'src/transactions/types'
import { navigateToURI } from 'src/utils/linking'
import { showToast } from 'src/components/showToast'
import { walletAddressSelector } from 'src/web3/selectors'

interface Props {
  qrSvgRef: React.MutableRefObject<SVG>
  exchanges?: ExternalExchangeProvider[]
  onCloseBottomSheet?: () => void
  onPressCopy?: () => void
  onPressInfo?: () => void
  onPressExchange?: (exchange: ExternalExchangeProvider) => void
}

export default function QRCodeDisplay(props: Props) {
  const { t } = useTranslation()
  const { exchanges, qrSvgRef } = props
  const address = useSelector(walletAddressSelector)
  const displayName = useSelector(nameSelector)

  const [bottomSheetVisible, setBottomSheetVisible] = useState(false)

  const onCloseBottomSheet = () => {
    props.onCloseBottomSheet?.()
    setBottomSheetVisible(false)
  }

  const onPressCopy = () => {
    props.onPressCopy?.()
    Clipboard.setString(address || '')
    showToast({ message: t('addressCopied') })
    vibrateInformative()
  }

  const onPressExchange = (exchange: ExternalExchangeProvider) => {
    props.onPressExchange?.(exchange)
  }

  const getSupportedNetworks = () => {
    const supportedNetworkIds = getSupportedNetworkIdsForTokenBalances()
    const networks = supportedNetworkIds.map((networkId: NetworkId) => {
      return NETWORK_NAMES[networkId]
    })
    return networks.join(', ')
  }

  const description = () => (
    <Text style={styles.description}>
      <Trans
        i18nKey={'fiatExchangeFlow.exchange.informational'}
        tOptions={{ networks: getSupportedNetworks() }}
      >
        {/* <0> anchor wraps the network name ("Celo"). Making it a
            tappable link lets a curious user open Celo's homepage
            before choosing the network at their exchange, without
            having to google what "Celo" means. */}
        <Text style={styles.boldLink} onPress={() => navigateToURI('https://celo.org/')} />
      </Trans>
    </Text>
  )

  return (
    <View style={styles.container}>
      <View style={[styles.bottomContent]}>
        {exchanges && exchanges.length > 0 ? (
          <>
            <Text style={styles.exchangeText}>
              <Trans i18nKey="fiatExchangeFlow.exchange.informationText">
                {/* <0> anchor: "red Celo" - taps into Celo's homepage
                     so the user can verify what network their exchange
                     should be set to before they hit send. */}
                <Text
                  style={styles.boldLink}
                  onPress={() => navigateToURI('https://celo.org/')}
                ></Text>
                {/* <1> anchor: the specific USDT-on-Celo contract. The
                     Ethereum USDT and Celo USDT are DIFFERENT contracts;
                     sending Ethereum-USDT to a Celo address burns the
                     funds. Tapping opens Celoscan on the exact contract
                     so the user can cross-check it in their exchange's
                     "receive address" screen. */}
                <Text
                  style={styles.boldLink}
                  onPress={() =>
                    navigateToURI(
                      'https://celoscan.io/token/0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e'
                    )
                  }
                ></Text>
              </Trans>
            </Text>
            <ExchangesBottomSheet
              isVisible={!!bottomSheetVisible}
              onClose={onCloseBottomSheet}
              onExchangeSelected={onPressExchange}
              exchanges={exchanges}
            />
          </>
        ) : (
          <View style={{ marginLeft: 33, marginRight: 33 }}>
            <InLineNotification
              variant={NotificationVariant.Info}
              description={description()}
              style={styles.link}
              testID="supportedNetworksNotification"
            />
          </View>
        )}
      </View>

      {/* The QR image encodes the wallet address; the text below shows it in
          plain hex. Both mask together so session replay never captures a
          reproducible identifier of this user's on-chain identity.

          The masking wrapper does NOT propagate the parent's
          alignItems:center down its children, so we wrap everything
          in a full-width View that re-establishes horizontal centering.
          Without it the QR ends up drifting left of the screen midline
          because its own container is sized to the QR + padding and
          the flex parent is broken by PostHogMaskView. */}
      <PostHogMaskView>
        <View style={styles.maskInner}>
          <View testID="QRCode" style={styles.qrContainer}>
            <StyledQRCode qrSvgRef={qrSvgRef} />
          </View>

          {!!displayName && (
            <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail" testID="displayName">
              {displayName}
            </Text>
          )}
          <Text testID="address" style={styles.address}>
            {address}
          </Text>
        </View>
      </PostHogMaskView>

      <Button
        text={t('fiatExchangeFlow.exchange.copyAddress')}
        onPress={onPressCopy}
        icon={<CopyIcon color={colors.white} />}
        iconMargin={12}
        iconPositionLeft={false}
        testID="copyButton"
        size={BtnSizes.FULL}
        // Ensure the button wrapper takes full width within its container
        // and add horizontal padding to align with other content.
        style={{
          width: '100%',
          paddingHorizontal: Spacing.Regular16,
          marginBottom: Spacing.Regular16,
        }}
        // Removed touchableStyle={{ width: '100%' }} as BtnSizes.FULL and the wrapper style should handle width.
      />
    </View>
  )
}

const styles = StyleSheet.create({
  bottomContent: {
    paddingHorizontal: Spacing.Regular16,
    width: '100%',
    marginTop: 120,
    marginBottom: 16,
  },
  boldLink: {
    // Bold + underline + accent color -> unmistakably a tap target.
    // Applied to the two Trans children in the informationText and the
    // one child in informational so both surfaces render "red Celo"
    // and the USDT contract as clickable links.
    fontWeight: '600',
    textDecorationLine: 'underline',
    color: colors.accent,
  },
  description: {
    ...typeScale.bodyXSmall,
  },
  container: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  link: {
    ...typeScale.labelSemiBoldMedium,
    textDecorationLine: 'underline',
    color: colors.accent,
    flexWrap: 'wrap',
    width: '100%',
  },
  maskInner: {
    // Full-width wrapper inside PostHogMaskView. Re-establishes
    // horizontal centering that the mask component breaks.
    width: '100%',
    alignItems: 'center',
  },
  qrContainer: {
    marginTop: '5%',
    marginBottom: Spacing.Thick24,
    // Do NOT tint the QR container - the SVG renders modules in
    // #000 for scanner compatibility (see StyledQRGen.tsx). A
    // tintColor here would repaint everything with the brand color
    // and reintroduce the scan failures.
    padding: Spacing.Regular16,
    backgroundColor: colors.white,
    // Belt-and-suspenders: even inside maskInner (alignItems:center),
    // an explicit alignSelf ensures the container never drifts left
    // if some future refactor changes the outer flex direction.
    alignSelf: 'center',
  },
  name: {
    ...typeScale.labelSemiBoldMedium,
    marginHorizontal: Spacing.Regular16,
    marginBottom: 8,
    textAlign: 'center',
  },
  address: {
    // Was bodyMedium with a 20% side margin, which cut the 42-char
    // wallet address at the ~28th character and forced a jagged wrap
    // onto a second line ("0xea510eca6966208499cdec45522" +
    // "11f3c3ca0df4e"). bodySmall + Regular16 side padding lets the
    // full address land on ONE line on modern phones (iPhone 12+ /
    // most Android). On very narrow devices it still wraps, but the
    // break happens near the midpoint instead of jumping around.
    ...typeScale.bodySmall,
    color: colors.accent,
    marginHorizontal: Spacing.Regular16,
    marginBottom: Spacing.Thick24,
    textAlign: 'center',
    // Explicit letterSpacing keeps hex chars visually distinguishable
    // at the smaller size (0/O, 5/S adjacency reads cleaner).
    letterSpacing: 0.2,
  },
  exchangeText: {
    ...typeScale.bodyMedium,
    color: colors.accent,
    textAlign: 'center',
  },
})
