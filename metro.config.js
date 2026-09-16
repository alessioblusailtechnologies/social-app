const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Il backend (be-node) e il servizio di render (be-render) hanno i loro node_modules e non finiscono
// nell'app: Metro non deve né guardarli né risolverli.
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList) ? defaultBlockList : defaultBlockList ? [defaultBlockList] : []),
  /(^|[\\/])be-(node|render)([\\/].*)?$/,
];

module.exports = config;
