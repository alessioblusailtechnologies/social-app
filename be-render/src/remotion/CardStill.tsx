import { useEffect, useState } from 'react';
import { continueRender, delayRender, Img } from 'remotion';

import { Card, ImageElement, loadBrandFonts } from '@/templates';

import type { CardInput } from './Root';

/**
 * La card per lo scatto. Si disegna solo coi caratteri del brand già caricati, così il testo si
 * adatta con le misure vere; `Img` di Remotion tiene fermo lo scatto finché ogni immagine non c'è.
 */
export function CardStill(props: CardInput) {
  const [handle] = useState(() => delayRender('Caratteri del brand'));
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadBrandFonts(props.kit).then(() => {
      if (alive) setFontsReady(true);
    });
    return () => {
      alive = false;
    };
  }, [props.kit]);

  useEffect(() => {
    if (!fontsReady) return;
    // Due fotogrammi: il primo disegna, il secondo lascia finire l'adattamento del testo.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => continueRender(handle));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [fontsReady, handle]);

  return <ImageElement.Provider value={Img}>{fontsReady ? <Card {...props} /> : null}</ImageElement.Provider>;
}
