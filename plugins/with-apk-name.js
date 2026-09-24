const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Il file che esce dalla build porta il nome dell'app: `moonbrand-release.apk` invece del
 * generico `app-release.apk`. Il nome lo prende dallo slug, così resta uno solo da cambiare.
 *
 * Vive come plugin e non come modifica a mano di `android/`, perché quella cartella la rigenera
 * `expo prebuild` e una modifica a mano sparirebbe al primo giro.
 */
module.exports = function withApkName(config, options = {}) {
  const name = options.name ?? config.slug ?? 'app';
  return withAppBuildGradle(config, (gradle) => {
    if (gradle.modResults.language !== 'groovy') return gradle;
    if (gradle.modResults.contents.includes('archivesName')) return gradle;
    gradle.modResults.contents += `\n// Il file della build porta il nome dell'app.\nbase {\n    archivesName = "${name}"\n}\n`;
    return gradle;
  });
};
