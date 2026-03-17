import React from 'react'
import { useTranslation } from 'react-i18next'
import { Image, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { checkUserStart } from 'src/buckspay/slice'
import Touchable from 'src/components/Touchable'
import { useDispatch } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

const BucksPayLogo = require('./buckspay-logo.png')

interface OfframpProvider {
  id: string
  name: string
  descriptionKey: string
  logo: any
  onPress: () => void
}

function SelectOfframpProvider() {
  const { t } = useTranslation()
  const dispatch = useDispatch()

  const providers: OfframpProvider[] = [
    {
      id: 'buckspay',
      name: 'BucksPay',
      descriptionKey: 'buckspay.providerDescription',
      logo: BucksPayLogo,
      onPress: () => {
        dispatch(checkUserStart())
      },
    },
  ]

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('buckspay.selectProvider')}</Text>
        <Text style={styles.subtitle}>{t('buckspay.selectProviderSubtitle')}</Text>
        {providers.map((provider) => (
          <Touchable
            key={provider.id}
            style={styles.providerCard}
            onPress={provider.onPress}
            testID={`offramp-provider-${provider.id}`}
          >
            <Image source={provider.logo} style={styles.providerLogo} resizeMode="contain" />
            <View style={styles.providerInfo}>
              <Text style={styles.providerName}>{provider.name}</Text>
              <Text style={styles.providerDescription}>{t(provider.descriptionKey)}</Text>
            </View>
            <Text style={styles.chevron}>{'>'}</Text>
          </Touchable>
        ))}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  content: {
    flex: 1,
    padding: Spacing.Thick24,
  },
  title: {
    ...typeScale.titleMedium,
    color: Colors.black,
    marginBottom: Spacing.Smallest8,
  },
  subtitle: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
    marginBottom: Spacing.Thick24,
  },
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.Regular16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray2,
    backgroundColor: Colors.white,
  },
  providerLogo: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  providerInfo: {
    flex: 1,
    marginLeft: Spacing.Small12,
  },
  providerName: {
    ...typeScale.labelSemiBoldMedium,
    color: Colors.black,
  },
  providerDescription: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
  chevron: {
    ...typeScale.titleSmall,
    color: Colors.gray3,
    marginLeft: Spacing.Smallest8,
  },
})

export default SelectOfframpProvider
