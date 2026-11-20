// Los modelos .onnx viajan dentro de la app como recursos (assets).
const { getDefaultConfig } = require('expo/metro-config')
const config = getDefaultConfig(__dirname)
config.resolver.assetExts.push('onnx')
module.exports = config
