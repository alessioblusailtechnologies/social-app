const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Il backend (be-node), il servizio di render (be-render) e il sito (website) hanno i loro node_modules
// e non finiscono nell'app: Metro non deve né guardarli né risolverli.
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList) ? defaultBlockList : defaultBlockList ? [defaultBlockList] : []),
  /(^|[\\/])(be-(node|render)|website)([\\/].*)?$/,
];

module.exports = config;
