const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Il codice condiviso con i backend (dominio, template delle card, passi dell'AI) sta fuori dall'app, in ../shared.
// Metro lo deve guardare, e quando un file di lì importa un pacchetto (React) lo cerca nei node_modules dell'app:
// sopra shared/ non ce ne sono.
const shared = path.resolve(__dirname, '../shared');
const appSrc = path.resolve(__dirname, 'src');
config.watchFolders = [...(config.watchFolders ?? []), shared];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

/** Gli alias del tsconfig, risolti qui: in app.json `experiments.tsconfigPaths` è spento (vedi sotto). */
function alias(name) {
  if (name.startsWith('@shared/')) return path.join(shared, name.slice('@shared/'.length));
  if (name.startsWith('@/assets/')) return path.join(__dirname, 'assets', name.slice('@/assets/'.length));
  if (name.startsWith('@/')) return path.join(appSrc, name.slice('@/'.length));
  return null;
}

// Un pacchetto importato da shared/ si cerca come se l'import partisse dall'app. Salendo da shared/ Metro troverebbe
// prima qualunque node_modules sopra il repo (su questa macchina ce n'è uno nella home, con un altro React): due copie
// di React rompono gli hook. Gli alias li risolviamo noi perché quelli di Expo leggono i `paths` del tsconfig, che
// servono a TypeScript anche per trovare i tipi di React dai file di shared/.
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const next = upstream ?? context.resolveRequest;
  const aliased = alias(moduleName);
  if (aliased) return next(context, aliased, platform);
  const fromShared = context.originModulePath.startsWith(shared + path.sep);
  if (fromShared && !moduleName.startsWith('.') && !path.isAbsolute(moduleName)) {
    return next({ ...context, originModulePath: path.join(appSrc, 'shared-import.ts') }, moduleName, platform);
  }
  return next(context, moduleName, platform);
};

/** Una cartella dell'app, tutta: il percorso assoluto, così non prende le omonime dentro `node_modules`. */
const folder = (name) => {
  const root = path.join(__dirname, name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${root}([\\\\/].*)?$`);
};

// Metro sorveglia e fa l'impronta di ogni file che vede: le build native, con i loro intermedi e l'APK, lo terrebbero
// occupato per ore.
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList) ? defaultBlockList : defaultBlockList ? [defaultBlockList] : []),
  folder('android'),
  folder('ios'),
];

module.exports = config;
