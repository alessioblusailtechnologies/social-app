import { Still, type CalculateMetadataFunction } from 'remotion';

import { PALETTE_PRESETS } from '@/domain/catalog';
import { ASPECT_SIZES, brandKit, emptyCardText } from '@/domain/visual';
import type { CardProps } from '@/templates';

import { CardStill } from './CardStill';

/** Le props della card come tipo con indice, come le vuole Remotion. */
export type CardInput = { [K in keyof CardProps]: CardProps[K] };

/** La misura dello scatto viene dal formato chiesto. */
const calculateMetadata: CalculateMetadataFunction<CardInput> = ({ props }) => {
  const size = ASPECT_SIZES[props.aspect] ?? ASPECT_SIZES['4:5'];
  return { width: size.width, height: size.height, props };
};

/** Solo per aprire la composizione a mano: il servizio passa sempre le sue props. */
const SAMPLE: CardInput = {
  kit: brandKit({
    identity: { name: 'Presenza' },
    visual: { logoUri: null, palette: PALETTE_PRESETS[0], imageStyle: 'flat-geometric', typography: 'inter', signature: false },
  }),
  page: { templateId: 'statement', text: { ...emptyCardText(), kicker: 'Anteprima', headline: 'Le card del brand, in PNG' } },
  pageIndex: 0,
  pageCount: 1,
  photoUrl: null,
  cutoutUrl: null,
  aspect: '4:5',
};

export function Root() {
  return (
    <Still
      id="card"
      component={CardStill}
      width={ASPECT_SIZES['4:5'].width}
      height={ASPECT_SIZES['4:5'].height}
      defaultProps={SAMPLE}
      calculateMetadata={calculateMetadata}
    />
  );
}
