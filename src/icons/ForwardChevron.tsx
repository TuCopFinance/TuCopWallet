import * as React from 'react'
import colors from 'src/styles/colors'
import Svg, { Path } from 'svgs'

interface Props {
  height: number
  color: string
}

function ForwardChevron({ color, height }: Props) {
  return (
    <Svg width={height / 2} height={height} viewBox="0 0 14 27" fill="none">
      <Path
        d="M13.7099 14.2385L1.70421 26.7071C1.30403 27.1089 0.676985 27.095 0.290137 26.6794C-0.0833726 26.2777 -0.0833726 25.6404 0.290137 25.2386L11.5888 13.5042L0.290137 1.76985C-0.0967122 1.36808 -0.0967122 0.703093 0.290137 0.301326C0.676985 -0.100442 1.31736 -0.100442 1.70421 0.301326L13.7099 12.77C14.0967 13.1717 14.0967 13.8367 13.7099 14.2385Z"
        fill={color}
      />
    </Svg>
  )
}

ForwardChevron.defaultProps = {
  height: 16,
  color: colors.black,
}

export default ForwardChevron
