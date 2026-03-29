import React from 'react'
import { goldIconVariantSelector } from 'src/gold/selectors'
import GoldBarIcon from 'src/icons/tokens/GoldBarIcon'
import GoldVaultIcon from 'src/icons/tokens/GoldVaultIcon'
import { useSelector } from 'src/redux/hooks'

interface Props {
  size?: number
  testID?: string
}

/**
 * A wrapper component that renders the user's preferred gold icon variant.
 * The icon variant is persisted in Redux and can be toggled in GoldHome screen.
 */
export default function GoldIconSelector({ size = 40, testID }: Props) {
  const iconVariant = useSelector(goldIconVariantSelector)

  if (iconVariant === 'vault') {
    return <GoldVaultIcon size={size} testID={testID} />
  }

  return <GoldBarIcon size={size} testID={testID} />
}
