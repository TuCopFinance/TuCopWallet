import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

interface Props {
  info: string
  label?: string
}

/**
 * Collapsible debug info panel rendered only in dev builds. Hidden by default;
 * tap the toggle row to expand. Use anywhere a screen wants to surface ad-hoc
 * diagnostic data without pushing it in the user's face.
 */
export default function DebugInfoPanel({ info, label = 'Debug Info' }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (!__DEV__ || !info) {
    return null
  }

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => setExpanded((prev) => !prev)}
        accessibilityRole="button"
        style={styles.toggle}
      >
        <Text style={styles.toggleText}>
          {expanded ? 'v ' : '> '}
          {label}
        </Text>
      </Pressable>
      {expanded && (
        <View style={styles.body}>
          <Text style={styles.text} selectable>
            {info}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    marginTop: Spacing.Regular16,
  },
  toggle: {
    paddingVertical: Spacing.Smallest8,
  },
  toggleText: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
  },
  body: {
    backgroundColor: Colors.gray1,
    borderRadius: 8,
    padding: Spacing.Regular16,
    marginTop: Spacing.Smallest8,
  },
  text: {
    ...typeScale.bodyXSmall,
    fontFamily: 'monospace',
    color: Colors.gray6,
  },
})
