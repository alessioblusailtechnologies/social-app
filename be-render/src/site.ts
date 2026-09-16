import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundle } from '@remotion/bundler';

/**
 * Il sito Remotion con le composizioni. I template stanno fuori dal pacchetto, in `src/templates`
 * dell'app: `@` punta lì, e React resta quello di questo pacchetto (due copie romperebbero gli hook).
 */

/** La radice del pacchetto, sia da `src/` sia da `dist/`. */
export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const APP_SRC = path.resolve(PACKAGE_ROOT, '../src');
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
        alias: {
          ...(config.resolve?.alias as Record<string, string> | undefined),
          '@': APP_SRC,
          react: ownModule('react'),
          'react-dom': ownModule('react-dom'),
        },
      },
    }),
  });
}
