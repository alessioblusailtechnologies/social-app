const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/** Una cartella del progetto, tutta: il percorso assoluto, così non prende le omonime dentro `node_modules`. */
const folder = (name) => {
  const root = path.join(__dirname, name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${root}([\\\\/].*)?$`);
};

// Metro sorveglia e fa l'impronta di ogni file che vede. Qui dentro non c'è niente dell'app, e c'è molto che cambia
// di continuo: i backend coi loro node_modules, le cartelle di lavoro dell'agente (progetti Remotion, clip, montaggi),
// il sito, e le build native con i loro intermedi e l'APK. Guardarle lo tiene occupato per ore.
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList) ? defaultBlockList : defaultBlockList ? [defaultBlockList] : []),
  folder('be-node'),
  folder('be-agent'),
  folder('be-render'),
  folder('website'),
  folder('android'),
  folder('ios'),
];

module.exports = config;
