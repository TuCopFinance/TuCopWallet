// Bottom-sheet picker used by all TuCOPRamp screens (bank, account type,
// document type). Extracted from TuCOPRampOfframpFlow.tsx on 2026-09-08 so
// the new document-type picker can be reused across offramp + onramp +
// UpdateCedulaScreen without duplicating the search-and-select JSX three
// times. Behaviour is unchanged from the inline version.
//
// Native Modal so the sheet escapes the parent ScrollView's z-index layer.
// Works around a known RN iOS gotcha where src/components/Dropdown
// (position:absolute + zIndex) is overlapped by sibling form fields inside
// a ScrollView.

import React, { useEffect, useMemo, useState } from 'react'
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

export interface PickerModalProps<T extends string> {
  visible: boolean
  title: string
  options: { value: T; label: string }[]
  selectedValue: T | undefined
  testIdPrefix: string
  onClose(): void
  onSelect(value: T): void
  // Opt-in search input above the list. Case-insensitive substring match
  // against `label` AND `value` so users who know the code (`bancolombia`)
  // and users who know the display name (`Bancolombia`) both land on the
  // same row. Default false so small pickers stay uncluttered.
  searchable?: boolean
  searchPlaceholder?: string
  noResultsText?: string
}

export function PickerModal<T extends string>({
  visible,
  title,
  options,
  selectedValue,
  testIdPrefix,
  onClose,
  onSelect,
  searchable = false,
  searchPlaceholder,
  noResultsText,
}: PickerModalProps<T>) {
  const [query, setQuery] = useState('')

  // Reset the search input every time the modal reopens so a stale filter
  // does not shadow options on a subsequent open.
  useEffect(() => {
    if (visible) setQuery('')
  }, [visible])

  const filteredOptions = useMemo(() => {
    if (!searchable) return options
    const q = query.trim().toLowerCase()
    if (q.length === 0) return options
    return options.filter(
      (opt) => opt.label.toLowerCase().includes(q) || String(opt.value).toLowerCase().includes(q)
    )
  }, [options, query, searchable])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.pickerBackdrop} />
      </TouchableWithoutFeedback>
      <View style={styles.pickerSheet}>
        <View style={styles.pickerHandle} />
        <Text style={styles.pickerTitle}>{title}</Text>
        {searchable && (
          <View style={styles.pickerSearchRow}>
            <TextInput
              style={styles.pickerSearchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder ?? ''}
              placeholderTextColor={Colors.gray3}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              testID={`${testIdPrefix}-search`}
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => setQuery('')}
                style={styles.pickerSearchClear}
                testID={`${testIdPrefix}-search-clear`}
              >
                <Text style={styles.pickerSearchClearText}>×</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
          {filteredOptions.length === 0 ? (
            <View style={styles.pickerEmpty}>
              <Text style={styles.pickerEmptyText}>{noResultsText ?? ''}</Text>
            </View>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = opt.value === selectedValue
              return (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={styles.pickerRow}
                  onPress={() => {
                    onSelect(opt.value)
                    onClose()
                  }}
                  testID={`${testIdPrefix}-${opt.value}`}
                >
                  <Text style={[styles.pickerRowText, isSelected && styles.pickerRowTextSelected]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              )
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  pickerSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '75%',
    backgroundColor: Colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: Spacing.Small12,
    paddingBottom: Spacing.Thick24,
    paddingHorizontal: Spacing.Regular16,
  },
  pickerHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray2,
    marginBottom: Spacing.Regular16,
  },
  pickerTitle: {
    ...typeScale.titleSmall,
    color: Colors.black,
    marginBottom: Spacing.Regular16,
  },
  pickerList: {
    flexGrow: 0,
  },
  pickerSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: 8,
    paddingHorizontal: Spacing.Regular16,
    marginBottom: Spacing.Regular16,
  },
  pickerSearchInput: {
    flex: 1,
    ...typeScale.bodyMedium,
    color: Colors.black,
    paddingVertical: Spacing.Small12,
  },
  pickerSearchClear: {
    paddingHorizontal: Spacing.Smallest8,
    paddingVertical: Spacing.Tiny4,
  },
  pickerSearchClearText: {
    fontSize: 24,
    lineHeight: 24,
    color: Colors.gray4,
  },
  pickerEmpty: {
    paddingVertical: Spacing.Thick24,
    alignItems: 'center',
  },
  pickerEmptyText: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    textAlign: 'center',
  },
  pickerRow: {
    paddingVertical: Spacing.Small12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray1,
  },
  pickerRowText: {
    ...typeScale.bodyMedium,
    color: Colors.black,
  },
  pickerRowTextSelected: {
    color: Colors.accent,
    fontWeight: '600',
  },
})
