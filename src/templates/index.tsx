import { ASPECT_SIZES } from '@/domain/visual';

import { FontsContext, useFontsKey } from './fonts';
import { LAYOUTS } from './layouts';
import { bodyFont } from './parts';
import type { CardProps } from './types';

/**
 * Le card del brand in React DOM, senza React Native: le disegna l'app dentro un componente DOM
 * di Expo e il servizio di render con Remotion, per il PNG. Vedi docs/piano-visivi.md.
 */

export { loadBrandFonts } from './fonts';
export { ImageElement } from './parts';
export type { CardProps } from './types';

/** Una card a grandezza vera: 1080 px di larghezza, l'altezza del formato. */
export function Card(props: CardProps) {
  const fonts = useFontsKey(props.kit);
  const { width, height } = ASPECT_SIZES[props.aspect];
  const Layout = LAYOUTS[props.page.templateId] ?? LAYOUTS.statement;
  return (
    <FontsContext.Provider value={fonts}>
      <div
        lang="it"
        style={{
          ...bodyFont(props.kit),
          position: 'relative',
          width,
          height,
          overflow: 'hidden',
          boxSizing: 'border-box',
          WebkitFontSmoothing: 'antialiased',
          textRendering: 'optimizeLegibility',
        }}>
        <Layout {...props} />
      </div>
    </FontsContext.Provider>
  );
}
