import React from 'react'
import QRCode from 'react-native-qrcode-svg'
import { SVG } from 'src/send/actions'
import Colors from 'src/styles/colors'

function StyledQRCode({
  value,
  size = 100,
  svgRef,
}: {
  value: string
  size: number
  svgRef: React.MutableRefObject<SVG>
}) {
  return (
    <QRCode
      color={Colors.primary80}
      value={value}
      size={size}
      getRef={(ref) => (svgRef.current = ref)}
    />
  )
}

export default React.memo(StyledQRCode)
