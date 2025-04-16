import React, { useState } from 'react'
import {
  StyleSheet,
  TextInput,
  View,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
  Text,
} from 'react-native'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
// Import MaterialIcons from react-native-vector-icons
import MaterialIcons from 'react-native-vector-icons/MaterialIcons'

interface PasswordInputProps {
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  containerStyle?: StyleProp<ViewStyle>
  testID?: string
}

const PasswordInput = ({
  value,
  onChangeText,
  placeholder = 'Password',
  containerStyle,
  testID,
}: PasswordInputProps) => {
  const [showPassword, setShowPassword] = useState(false)

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword)
  }

  return (
    <View style={[styles.container, containerStyle]} testID={testID}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.gray3}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity onPress={togglePasswordVisibility} style={styles.iconContainer}>
        <MaterialIcons
          name={showPassword ? 'visibility-off' : 'visibility'}
          size={20}
          color={Colors.gray3}
          testID={`${testID}-toggle-visibility`}
        />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: 8,
    backgroundColor: Colors.white,
  },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: Spacing.Regular16,
    ...typeScale.bodyMedium,
    color: Colors.black,
  },
  iconContainer: {
    padding: Spacing.Regular16,
  },
})

export default PasswordInput
