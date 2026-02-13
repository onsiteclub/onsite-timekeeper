const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Web shim for react-native-maps (native-only module)
const mapShimPath = path.resolve(__dirname, 'react-native-maps-web-shim.js');

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Replace react-native-maps with a web-compatible shim on web
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return {
      filePath: mapShimPath,
      type: 'sourceFile',
    };
  }

  // Default resolution
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
