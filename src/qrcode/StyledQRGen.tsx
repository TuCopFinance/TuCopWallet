import React from 'react'
import QRCode from 'react-native-qrcode-svg'
import { SVG } from 'src/send/actions'

function StyledQRCode({
  value,
  size = 100,
  svgRef,
}: {
  value: string
  size: number
  svgRef: React.MutableRefObject<SVG>
}) {
  // QRs MUST render black-on-white per ISO/IEC 18004. The previous
  // Colors.primary80 (TuCop blue) branding rendered fine on our own
  // in-app scanner but failed on exchanges' older scanners and on
  // some Android camera apps where the reader assumes >70% contrast
  // between modules and background. Users on Reno / Redmi reported
  // exchanges refusing to accept the address by QR - the color WAS
  // the reason. Black + explicit white background restores full
  // scanner compatibility with zero visual downside (the container
  // frame keeps the brand identity around the code).
  return (
    <QRCode
      color="#000000"
      backgroundColor="#FFFFFF"
      value={value}
      size={size}
      getRef={(ref) => (svgRef.current = ref)}
    />
  )
}

export default React.memo(StyledQRCode)
