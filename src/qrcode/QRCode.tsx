import Clipboard from '@react-native-clipboard/clipboard'
import React, { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { nameSelector } from 'src/account/selectors'
import Button, { BtnSizes } from 'src/components/Button'
import ExchangesBottomSheet from 'src/components/ExchangesBottomSheet'
import InLineNotification, { NotificationVariant } from 'src/components/InLineNotification'
import { ExternalExchangeProvider } from 'src/fiatExchanges/ExternalExchanges'
import CopyIcon from 'src/icons/CopyIcon'
import StyledQRCode from 'src/qrcode/StyledQRCode'
import { useSelector } from 'src/redux/hooks'
import { SVG } from 'src/send/actions'
import { NETWORK_NAMES } from 'src/shared/conts'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { vibrateInformative } from 'src/styles/hapticFeedback'
import { Spacing } from 'src/styles/styles'
import variables from 'src/styles/variables'
import { NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
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
    Logger.showMessage(t('addressCopied'))
    vibrateInformative()
  }

  const onPressInfo = () => {
    props.onPressInfo?.()
    setBottomSheetVisible(true)
  }

  const onPressExchange = (exchange: ExternalExchangeProvider) => {
    props.onPressExchange?.(exchange)
  }

  const getSupportedNetworks = () => {
    const supportedNetworkIds = [NetworkId['celo-mainnet']]
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
        <Text style={styles.bold} />
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
                <Text testID="bottomSheetLink" style={styles.link} onPress={onPressInfo}></Text>
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
  bold: {
    ...typeScale.labelSemiBoldXSmall,
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
  qrContainer: {
    marginTop: '5%',
    marginBottom: Spacing.Thick24,
    color: colors.accent,
    tintColor: colors.accent,
  },
  name: {
    ...typeScale.labelSemiBoldMedium,
    marginHorizontal: variables.width / 5,
    marginBottom: 8,
  },
  address: {
    ...typeScale.bodyMedium,
    color: colors.accent,
    marginHorizontal: variables.width / 5,
    // Adjusted marginBottom to accommodate the button's padding/margin
    marginBottom: Spacing.Thick24,
    textAlign: 'center',
  },
  exchangeText: {
    ...typeScale.bodyMedium,
    color: colors.accent,
    textAlign: 'center',
  },
})
