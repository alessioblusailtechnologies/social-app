import { useCallback, useEffect, useRef, useState } from 'react';
import { continueRender, delayRender, Img } from 'remotion';

import { Card, ImageElement, loadBrandFonts } from '@/templates';

import type { CardInput } from './Root';

/**
 * La card per lo scatto. Si disegna solo coi caratteri del brand già caricati, così il testo si adatta con le misure
 * vere; lo scatto parte quando la card dice di essere pronta: caratteri, foto (anche quelle dei template del brand, che
 * `Img` di Remotion non vede) e testi adattati.
 */
export function CardStill(props: CardInput) {
  const [handle] = useState(() => delayRender('Card del brand'));
  const [fontsReady, setFontsReady] = useState(false);
  const released = useRef(false);

  useEffect(() => {
    let alive = true;
    void loadBrandFonts(props.kit).then(() => {
      if (alive) setFontsReady(true);
    });
    return () => {
      alive = false;
    };
  }, [props.kit]);

  const onReady = useCallback(() => {
    if (released.current) return;
    released.current = true;
    continueRender(handle);
  }, [handle]);

  return <ImageElement.Provider value={Img}>{fontsReady ? <Card {...props} onReady={onReady} /> : null}</ImageElement.Provider>;
}
