'use dom';

import type { DOMProps } from 'expo/dom';
import { useEffect } from 'react';

import { ASPECT_SIZES } from '@shared/domain/visual';
import { Card, type CardProps } from '@shared/templates';

/**
 * La card vera dentro l'app: sul web è un componente React DOM, sul telefono una WebView.
 * È lo stesso codice che il servizio di render usa per il PNG, scalato sulla larghezza data.
 */
export default function VisualCanvas({ width, dom: _dom, ...card }: CardProps & { width: number; dom?: DOMProps }) {
  useEffect(() => {
    // Nella WebView il documento è tutto nostro: niente margini né fondo bianco attorno alla card.
    if (process.env.EXPO_OS !== 'web') {
      document.body.style.margin = '0';
      document.body.style.background = 'transparent';
    }
  }, []);

  const size = ASPECT_SIZES[card.aspect];
  const scale = width / size.width;
  return (
    <div style={{ position: 'relative', width, height: Math.round(size.height * scale), overflow: 'hidden' }}>
      <div style={{ width: size.width, height: size.height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <Card {...card} />
      </div>
    </div>
  );
}
