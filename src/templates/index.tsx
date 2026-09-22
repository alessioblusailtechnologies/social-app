import { useEffect } from 'react';

import { ASPECT_SIZES } from '@/domain/visual';

import { CustomCard } from './custom';
import { FontsContext, useFontsKey } from './fonts';
import { LAYOUTS } from './layouts';
import { faceStyle } from './parts';
import type { CardProps } from './types';

/**
 * Le card del brand in React DOM, senza React Native: le disegna l'app dentro un componente DOM
 * di Expo e il servizio di render con Remotion, per il PNG. Se il brand ha i suoi template (scritti dal direttore
 * artistico) e la pagina ne nomina uno, la card è quella; altrimenti uno dei layout del motore. Vedi
 * docs/piano-visivi.md.
 */

export { loadBrandFonts } from './fonts';
export { ImageElement } from './parts';
export type { CardProps } from './types';

/** Una card a grandezza vera: 1080 px di larghezza, l'altezza del formato, il fondo della linea sotto ogni tavola. */
export function Card(props: CardProps) {
  const fonts = useFontsKey(props.kit);
  const { width, height } = ASPECT_SIZES[props.aspect];
  const custom = props.page.custom ? props.kit.line.templates.find((template) => template.id === props.page.custom) : undefined;
  const Layout = LAYOUTS[props.page.templateId] ?? LAYOUTS.statement;
  const { onReady } = props;

  // I layout del motore sono pronti coi caratteri: due fotogrammi, e il testo si è adattato.
  useEffect(() => {
    if (custom || !onReady || !fonts.endsWith('|pronti')) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => onReady());
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [custom, onReady, fonts]);

  return (
    <FontsContext.Provider value={fonts}>
      <div
        lang="it"
        style={{
          ...faceStyle(props.kit.line.text),
          position: 'relative',
          width,
          height,
          overflow: 'hidden',
          boxSizing: 'border-box',
          background: props.kit.line.tones.ground,
          color: props.kit.line.tones.ink,
          WebkitFontSmoothing: 'antialiased',
          textRendering: 'optimizeLegibility',
        }}>
        {custom ? (
          <CustomCard template={custom} card={props} onReady={fonts.endsWith('|pronti') ? onReady : undefined} />
        ) : (
          <Layout {...props} />
        )}
      </div>
    </FontsContext.Provider>
  );
}
