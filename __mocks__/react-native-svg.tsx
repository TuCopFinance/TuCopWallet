import React from 'react'

function createComponent(name: string) {
  const Component = ({ children, ...props }: any) => {
    return React.createElement(name.toLowerCase(), props, children)
  }
  Component.displayName = name
  return Component
}

// Base components (from original react-native-svg-mock)
const Svg = createComponent('Svg')
const Circle = createComponent('Circle')
const Ellipse = createComponent('Ellipse')
const G = createComponent('G')
const Text = createComponent('Text')
const TextPath = createComponent('TextPath')
const TSpan = createComponent('TSpan')
const Path = createComponent('Path')
const Polygon = createComponent('Polygon')
const Polyline = createComponent('Polyline')
const Line = createComponent('Line')
const Rect = createComponent('Rect')
const Use = createComponent('Use')
const Image = createComponent('Image')
const SymbolSvg = createComponent('Symbol')
const Defs = createComponent('Defs')
const LinearGradient = createComponent('LinearGradient')
const RadialGradient = createComponent('RadialGradient')
const Stop = createComponent('Stop')
const ClipPath = createComponent('ClipPath')

// Missing components that cause "got: undefined" errors
const Filter = createComponent('Filter')
const FeGaussianBlur = createComponent('FeGaussianBlur')
const Mask = createComponent('Mask')
const ForeignObject = createComponent('ForeignObject')
const Marker = createComponent('Marker')
const Pattern = createComponent('Pattern')
const FeBlend = createComponent('FeBlend')
const FeColorMatrix = createComponent('FeColorMatrix')
const FeComponentTransfer = createComponent('FeComponentTransfer')
const FeComposite = createComponent('FeComposite')
const FeConvolveMatrix = createComponent('FeConvolveMatrix')
const FeDiffuseLighting = createComponent('FeDiffuseLighting')
const FeDisplacementMap = createComponent('FeDisplacementMap')
const FeDistantLight = createComponent('FeDistantLight')
const FeDropShadow = createComponent('FeDropShadow')
const FeFlood = createComponent('FeFlood')
const FeImage = createComponent('FeImage')
const FeMerge = createComponent('FeMerge')
const FeMergeNode = createComponent('FeMergeNode')
const FeMorphology = createComponent('FeMorphology')
const FeOffset = createComponent('FeOffset')
const FePointLight = createComponent('FePointLight')
const FeSpecularLighting = createComponent('FeSpecularLighting')
const FeSpotLight = createComponent('FeSpotLight')
const FeTile = createComponent('FeTile')
const FeTurbulence = createComponent('FeTurbulence')

export {
  Svg,
  Circle,
  Ellipse,
  G,
  Text,
  TextPath,
  TSpan,
  Path,
  Polygon,
  Polyline,
  Line,
  Rect,
  Use,
  Image,
  SymbolSvg as Symbol,
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  ClipPath,
  Filter,
  FeGaussianBlur,
  Mask,
  ForeignObject,
  Marker,
  Pattern,
  FeBlend,
  FeColorMatrix,
  FeComponentTransfer,
  FeComposite,
  FeConvolveMatrix,
  FeDiffuseLighting,
  FeDisplacementMap,
  FeDistantLight,
  FeDropShadow,
  FeFlood,
  FeImage,
  FeMerge,
  FeMergeNode,
  FeMorphology,
  FeOffset,
  FePointLight,
  FeSpecularLighting,
  FeSpotLight,
  FeTile,
  FeTurbulence,
}

export default Svg
