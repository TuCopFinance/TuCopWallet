import * as React from 'react'
import Svg, { Path } from 'react-native-svg'
import colors from 'src/styles/colors'

interface Props {
  color?: string
  testID?: string
  size?: number
}

function Manage({ color = colors.accent, testID = 'Manage', size = 20 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none" testID={testID}>
      <Path
        d="M14.7917 16.875C13.9167 16.875 13.1771 16.5729 12.573 15.9688C11.9688 15.3646 11.6667 14.625 11.6667 13.75C11.6667 12.875 11.9688 12.1354 12.573 11.5312C13.1771 10.9271 13.9167 10.625 14.7917 10.625C15.6667 10.625 16.4063 10.9271 17.0105 11.5312C17.6146 12.1354 17.9167 12.875 17.9167 13.75C17.9167 14.625 17.6146 15.3646 17.0105 15.9688C16.4063 16.5729 15.6667 16.875 14.7917 16.875ZM14.7917 15.2083C15.1945 15.2083 15.5382 15.066 15.823 14.7812C16.1077 14.4965 16.25 14.1528 16.25 13.75C16.25 13.3472 16.1077 13.0035 15.823 12.7188C15.5382 12.434 15.1945 12.2917 14.7917 12.2917C14.3889 12.2917 14.0452 12.434 13.7605 12.7188C13.4757 13.0035 13.3334 13.3472 13.3334 13.75C13.3334 14.1528 13.4757 14.4965 13.7605 14.7812C14.0452 15.066 14.3889 15.2083 14.7917 15.2083ZM3.33337 14.5833V12.9167H10V14.5833H3.33337ZM5.20837 9.375C4.33337 9.375 3.59379 9.07292 2.98962 8.46875C2.38546 7.86458 2.08337 7.125 2.08337 6.25C2.08337 5.375 2.38546 4.63542 2.98962 4.03125C3.59379 3.42708 4.33337 3.125 5.20837 3.125C6.08337 3.125 6.82296 3.42708 7.42712 4.03125C8.03129 4.63542 8.33337 5.375 8.33337 6.25C8.33337 7.125 8.03129 7.86458 7.42712 8.46875C6.82296 9.07292 6.08337 9.375 5.20837 9.375ZM5.20837 7.70833C5.61115 7.70833 5.9549 7.56597 6.23962 7.28125C6.52435 6.99653 6.66671 6.65278 6.66671 6.25C6.66671 5.84722 6.52435 5.50347 6.23962 5.21875C5.9549 4.93403 5.61115 4.79167 5.20837 4.79167C4.8056 4.79167 4.46185 4.93403 4.17712 5.21875C3.8924 5.50347 3.75004 5.84722 3.75004 6.25C3.75004 6.65278 3.8924 6.99653 4.17712 7.28125C4.46185 7.56597 4.8056 7.70833 5.20837 7.70833ZM10 7.08333V5.41667H16.6667V7.08333H10Z"
        fill={color}
      />
    </Svg>
  )
}

export default React.memo(Manage)