import React from 'react'
import {
  Animated,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  View,
} from 'react-native'
import MarranitosPoolCard from 'src/earn/marranitos/MarranitosPoolCard'
import { Spacing } from 'src/styles/styles'

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList)

const pools = [
  {
    positionId: '1',
    network: 'marranitos',
    tokens: ['marranitos', 'marranitos'],
    apy: '0.05',
    tvl: '1000',
    isActive: true,
  },
  {
    positionId: '2',
    network: 'marranitos',
    tokens: ['marranitos', 'marranitos'],
    apy: '0.05',
    tvl: '1000',
    isActive: true,
  },
  {
    positionId: '3',
    network: 'marranitos',
    tokens: ['marranitos', 'marranitos'],
    apy: '0.05',
    tvl: '1000',
    isActive: true,
  },
]

interface MarranitosPoolsProps {
  refreshControl?: React.ReactElement
  paddingBottom: number
  listHeaderHeight: number
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
}
const MarranitosPools = ({
  refreshControl,
  paddingBottom,
  handleScroll,
  listHeaderHeight,
}: MarranitosPoolsProps) => {
  return (
    <AnimatedFlatList
      data={pools}
      renderItem={({ item }: { item: any }) => (
        <MarranitosPoolCard pool={item} testID={`PoolCard/${item.positionId}`} />
      )}
      keyExtractor={(item: any) => item.positionId}
      // onScroll={handleScroll}
      // Workaround iOS setting an incorrect automatic inset at the top
      scrollIndicatorInsets={{ top: 0.01 }}
      scrollEventThrottle={16}
      refreshControl={refreshControl}
      ListHeaderComponent={<View style={{ height: listHeaderHeight }} />}
      // ListFooterComponent={
      //   <Text style={styles.learnMore}>
      //     <Trans i18nKey="earnFlow.home.learnMore">
      //       <Text
      //         style={styles.learnMoreLink}
      //         onPress={onPressLearnMore}
      //         testID="LearnMoreCta"
      //       ></Text>
      //     </Trans>
      //   </Text>
      // }
      style={styles.sectionList}
      contentContainerStyle={[
        styles.sectionListContentContainer,
        { paddingBottom: Math.max(paddingBottom, Spacing.Regular16) },
      ]}
    />
  )
}

const styles = StyleSheet.create({
  sectionListContentContainer: {
    paddingHorizontal: Spacing.Regular16,
    paddingVertical: Spacing.Smallest8,
    gap: Spacing.Regular16,
    flexGrow: 1,
  },
  sectionList: {
    flex: 1,
  },
  // learnMore: {
  //   ...typeScale.bodySmall,
  //   color: Colors.black,
  //   textAlign: 'center',
  // },
  // learnMoreLink: {
  //   ...typeScale.bodySmall,
  //   fontWeight: '600',
  //   textDecorationLine: 'underline',
  // },
})

export default MarranitosPools
