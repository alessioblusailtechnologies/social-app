const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Il backend (be-node) ha i suoi node_modules e non finisce nell'app: Metro non deve né guardarlo né risolverlo.
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList) ? defaultBlockList : defaultBlockList ? [defaultBlockList] : []),
  /(^|[\\/])be-node([\\/].*)?$/,
];

module.exports = config;
