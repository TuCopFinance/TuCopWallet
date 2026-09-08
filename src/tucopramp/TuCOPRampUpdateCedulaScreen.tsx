import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import DownArrowIcon from 'src/icons/navigation/DownArrowIcon'
import { navigateBack } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useDispatch, useSelector } from 'src/redux/hooks'
import { PickerModal } from 'src/tucopramp/PickerModal'
import { fetchUserProfile, submitCedulaUpdate } from 'src/tucopramp/saga'
import {
  ALL_DOCUMENT_TYPES,
  DocumentType,
  MAX_DOCUMENT_LENGTH,
  getDocumentAutoCapitalize,
  getDocumentKeyboardType,
  isValidDocument,
  sanitizeDocument,
} from 'src/tucopramp/validation'
import {
  cedulaUpdateErrorCodeSelector,
  cedulaUpdateStatusSelector,
  userProfileSelector,
} from 'src/tucopramp/selectors'
import { cedulaUpdateReset } from 'src/tucopramp/slice'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

type Props = NativeStackScreenProps<StackParamList, Screens.TuCOPRampUpdateCedulaScreen>

// Settings-side screen for cedula self-correction.
//
// Backend rejects PATCH /v1/p2p/users/cedula with 409 cedula_locked_by_active_order
// while any non-terminal order references the current cedula. This screen does not
// preflight active-order state (avoids a listOrders round-trip on mount); the
// server-side rejection is authoritative and surfaced via cedulaUpdateFailed
// with a specific, translated error message. Users see the reason and can go
// resolve the order first.
//
// Reason field is required by the backend (audit trail): 1-500 characters. The
// UI enforces a minimum of 1 char + a hard cap at 500.
const REASON_MAX_LENGTH = 500

function TuCOPRampUpdateCedulaScreen(_props: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()

  const status = useSelector(cedulaUpdateStatusSelector)
  const errorCode = useSelector(cedulaUpdateErrorCodeSelector)
  const profile = useSelector(userProfileSelector)

  const [newCedula, setNewCedula] = useState('')
  const [reason, setReason] = useState('')
  // Default to the profile's current type when it comes back from getMe,
  // so switching to CE just requires re-typing the number (not re-picking
  // the same type they already had).
  const [newDocumentType, setNewDocumentType] = useState<DocumentType>('CC')
  const [docTypePickerOpen, setDocTypePickerOpen] = useState<boolean>(false)

  // Refresh profile on mount so cedula_last_4 is current, and reset the flow
  // slice so any prior error/success state does not linger.
  useEffect(() => {
    dispatch(fetchUserProfile())
    return () => {
      dispatch(cedulaUpdateReset())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Seed the picker with the profile's current document_type once the getMe
  // response lands. If the user has never had a type set (pre-migration
  // account or fresh install), profile.document_type is undefined; stay
  // on the 'CC' default.
  useEffect(() => {
    if (profile?.document_type) {
      setNewDocumentType(profile.document_type as DocumentType)
    }
  }, [profile?.document_type])

  const cedulaValid = isValidDocument(newDocumentType, newCedula)
  const reasonValid = reason.trim().length > 0 && reason.length <= REASON_MAX_LENGTH
  const formValid = cedulaValid && reasonValid && status !== 'updating'

  const documentTypeOptions = useMemo(
    () =>
      ALL_DOCUMENT_TYPES.map((v) => ({
        value: v,
        label: t(`tucopramp.documentType.${v}`),
      })),
    [t]
  )

  const onSubmit = () => {
    if (!formValid) return
    dispatch(
      submitCedulaUpdate({
        new_cedula: newCedula,
        new_document_type: newDocumentType,
        reason: reason.trim(),
      })
    )
  }

  const onDone = () => {
    dispatch(cedulaUpdateReset())
    navigateBack()
  }

  const onEditAgain = () => {
    dispatch(cedulaUpdateReset())
    setNewCedula('')
    setReason('')
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('tucopramp.settings.updateCedula.title')}</Text>
        <Text style={styles.subtitle}>{t('tucopramp.settings.updateCedula.subtitle')}</Text>

        {!!profile?.cedula_last_4 && (
          <View style={styles.currentBlock}>
            <Text style={styles.label}>{t('tucopramp.settings.updateCedula.currentLabel')}</Text>
            <Text style={styles.currentValue}>
              {profile.document_type ?? 'CC'} ••••{profile.cedula_last_4}
            </Text>
          </View>
        )}

        <Text style={styles.warning}>
          {t('tucopramp.settings.updateCedula.activeOrderWarning')}
        </Text>

        {status === 'success' ? (
          <View>
            <Text style={styles.successHeading}>
              {t('tucopramp.settings.updateCedula.successHeading')}
            </Text>
            <Text style={styles.successBody}>
              {t('tucopramp.settings.updateCedula.successBody')}
            </Text>
            <Button
              text={t('tucopramp.settings.updateCedula.doneCta')}
              onPress={onDone}
              type={BtnTypes.PRIMARY}
              size={BtnSizes.FULL}
              testID="tucopramp-update-cedula-done"
            />
          </View>
        ) : (
          <View>
            <Text style={styles.label}>{t('tucopramp.documentTypeLabel')}</Text>
            <TouchableOpacity
              style={styles.pickerTouchable}
              onPress={() => setDocTypePickerOpen(true)}
              testID="tucopramp-cedula-update-doc-type-picker"
              accessibilityRole="button"
              disabled={status === 'updating'}
            >
              <Text style={styles.pickerValue}>
                {t(`tucopramp.documentType.${newDocumentType}`)}
              </Text>
              <DownArrowIcon color={Colors.accent} strokeWidth={2} />
            </TouchableOpacity>

            <Text style={styles.label}>{t('tucopramp.settings.updateCedula.newCedulaLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('tucopramp.settings.updateCedula.newCedulaPlaceholder') ?? ''}
              keyboardType={getDocumentKeyboardType(newDocumentType)}
              autoCapitalize={getDocumentAutoCapitalize(newDocumentType)}
              autoCorrect={false}
              maxLength={MAX_DOCUMENT_LENGTH}
              value={newCedula}
              onChangeText={(v) => setNewCedula(sanitizeDocument(newDocumentType, v))}
              editable={status !== 'updating'}
              testID="tucopramp-update-cedula-new"
            />
            {newCedula.length > 0 && !cedulaValid && (
              <Text style={styles.helperError}>
                {t(`tucopramp.documentInvalid.${newDocumentType}`)}
              </Text>
            )}

            <Text style={styles.label}>{t('tucopramp.settings.updateCedula.reasonLabel')}</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder={t('tucopramp.settings.updateCedula.reasonPlaceholder') ?? ''}
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={REASON_MAX_LENGTH}
              editable={status !== 'updating'}
              testID="tucopramp-update-cedula-reason"
            />
            <Text style={styles.helper}>
              {reason.length} / {REASON_MAX_LENGTH}
            </Text>

            {status === 'error' && !!errorCode && (
              <View style={styles.errorBlock}>
                <Text style={styles.errorHeading}>
                  {t('tucopramp.settings.updateCedula.errorHeading')}
                </Text>
                <Text style={styles.errorBody}>
                  {t(`tucopramp.errors.${errorCode}`, {
                    defaultValue: t('tucopramp.errors.unknown'),
                  })}
                </Text>
                <Button
                  text={t('tucopramp.settings.updateCedula.tryAgainCta')}
                  onPress={onEditAgain}
                  type={BtnTypes.SECONDARY}
                  size={BtnSizes.FULL}
                  testID="tucopramp-update-cedula-try-again"
                />
              </View>
            )}

            {status === 'updating' ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={styles.loadingText}>
                  {t('tucopramp.settings.updateCedula.updating')}
                </Text>
              </View>
            ) : (
              <Button
                text={t('tucopramp.settings.updateCedula.submitCta')}
                onPress={onSubmit}
                disabled={!formValid}
                type={BtnTypes.PRIMARY}
                size={BtnSizes.FULL}
                testID="tucopramp-update-cedula-submit"
              />
            )}
          </View>
        )}
      </ScrollView>

      <PickerModal<DocumentType>
        visible={docTypePickerOpen}
        title={t('tucopramp.documentTypePickerTitle')}
        options={documentTypeOptions}
        selectedValue={newDocumentType}
        testIdPrefix="tucopramp-cedula-update-doc-type-option"
        onClose={() => setDocTypePickerOpen(false)}
        onSelect={(v) => {
          setNewDocumentType(v)
          setNewCedula(sanitizeDocument(v, newCedula))
        }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  content: {
    padding: Spacing.Thick24,
  },
  title: {
    ...typeScale.titleMedium,
    color: Colors.black,
    marginBottom: Spacing.Smallest8,
  },
  subtitle: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginBottom: Spacing.Regular16,
  },
  currentBlock: {
    backgroundColor: Colors.gray1,
    padding: Spacing.Regular16,
    borderRadius: 12,
    marginBottom: Spacing.Regular16,
  },
  currentValue: {
    ...typeScale.bodyLarge,
    color: Colors.black,
    marginTop: Spacing.Smallest8,
  },
  warning: {
    ...typeScale.bodySmall,
    color: Colors.warningDark,
    backgroundColor: Colors.warningLight,
    padding: Spacing.Regular16,
    borderRadius: 8,
    marginBottom: Spacing.Regular16,
  },
  label: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginTop: Spacing.Regular16,
    marginBottom: Spacing.Smallest8,
  },
  input: {
    ...typeScale.bodyMedium,
    color: Colors.black,
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: 8,
    paddingHorizontal: Spacing.Regular16,
    paddingVertical: Spacing.Smallest8,
  },
  reasonInput: {
    ...typeScale.bodyMedium,
    color: Colors.black,
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: 8,
    paddingHorizontal: Spacing.Regular16,
    paddingVertical: Spacing.Smallest8,
    minHeight: 96,
    textAlignVertical: 'top',
  },
  helper: {
    ...typeScale.labelSmall,
    color: Colors.gray4,
    marginTop: Spacing.Tiny4,
    textAlign: 'right',
  },
  helperError: {
    ...typeScale.bodySmall,
    color: Colors.errorDark,
    marginTop: Spacing.Smallest8,
  },
  pickerTouchable: {
    padding: Spacing.Small12,
    borderColor: Colors.gray2,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  pickerValue: {
    ...typeScale.bodyMedium,
    color: Colors.black,
    flexShrink: 1,
  },
  errorBlock: {
    backgroundColor: Colors.errorLight,
    padding: Spacing.Regular16,
    borderRadius: 8,
    marginTop: Spacing.Regular16,
    marginBottom: Spacing.Regular16,
  },
  errorHeading: {
    ...typeScale.labelMedium,
    color: Colors.errorDark,
    marginBottom: Spacing.Smallest8,
  },
  errorBody: {
    ...typeScale.bodySmall,
    color: Colors.errorDark,
    marginBottom: Spacing.Regular16,
  },
  successHeading: {
    ...typeScale.titleSmall,
    color: Colors.successDark,
    marginTop: Spacing.Regular16,
    marginBottom: Spacing.Smallest8,
  },
  successBody: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginBottom: Spacing.Thick24,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.Regular16,
  },
  loadingText: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
    marginLeft: Spacing.Smallest8,
  },
})

export default TuCOPRampUpdateCedulaScreen
