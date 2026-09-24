const { AndroidConfig, withAndroidManifest } = require('@expo/config-plugins');

/**
 * Lascia passare il traffico in chiaro anche fuori dal debug.
 *
 * Da Android 9 l'HTTP è bloccato per default nelle build di release, e il backend di sviluppo
 * risponde su `http://<ip>:3011`: senza questo permesso l'APK installato non lo raggiunge e
 * ogni chiamata fallisce con un errore di rete.
 *
 * Vale finché il backend sta su HTTP: messo dietro HTTPS, questo plugin va tolto.
 */
module.exports = function withCleartext(config) {
  return withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.$['android:usesCleartextTraffic'] = 'true';
    return mod;
  });
};
