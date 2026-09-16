import path from 'node:path';

import { bundleSite, PACKAGE_ROOT } from './site';

/** Costruisce il sito una volta, al build: in produzione il server parte con `RENDER_SERVE_URL=build/site`. */
const outDir = path.join(PACKAGE_ROOT, 'build/site');
await bundleSite(outDir);
console.log(`Sito Remotion pronto in ${outDir}`);
