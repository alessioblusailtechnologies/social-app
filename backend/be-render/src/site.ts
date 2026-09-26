import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundle } from '@remotion/bundler';

/**
 * Il sito Remotion con le composizioni. I template stanno fuori dal pacchetto, in `shared/templates`:
 * `@shared` punta lì, e React resta quello di questo pacchetto (due copie romperebbero gli hook). Anche gli altri
 * pacchetti che il codice condiviso importa si cercano qui: sopra `shared/` non ci sono node_modules.
 */

/** La radice del pacchetto, sia da `src/` sia da `dist/`. */
export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SHARED = path.resolve(PACKAGE_ROOT, '../../shared');
const ownModule = (name: string) => path.resolve(PACKAGE_ROOT, 'node_modules', name);

export function bundleSite(outDir?: string): Promise<string> {
  return bundle({
    entryPoint: path.join(PACKAGE_ROOT, 'src/remotion/index.ts'),
    rootDir: PACKAGE_ROOT,
    outDir,
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        modules: [...(config.resolve?.modules ?? ['node_modules']), path.join(PACKAGE_ROOT, 'node_modules')],
        alias: {
          ...(config.resolve?.alias as Record<string, string> | undefined),
          '@shared': SHARED,
          react: ownModule('react'),
          'react-dom': ownModule('react-dom'),
        },
      },
    }),
  });
}
