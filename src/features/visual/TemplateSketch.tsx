import { StyleSheet, View } from 'react-native';

import { templateSpec, type BrandKit, type SketchBlock, type TemplateId } from '@/domain/visual';

/** Lo schizzo di un layout nei colori della linea: la miniatura della proposta, prima di creare. */
export function TemplateSketch({ templateId, kit, width = 64 }: { templateId: TemplateId; kit: BrandKit; width?: number }) {
  const spec = templateSpec(templateId);
  const height = width * 1.25;
  const { ground: background, ink, soft, accent, muted } = kit.line.tones;

  const tone = (block: SketchBlock) => {
    switch (block.tone) {
      case 'image':
        return { backgroundColor: muted, opacity: 0.6 };
      case 'accent':
        return { backgroundColor: accent };
      case 'soft':
        return { backgroundColor: soft, opacity: 0.5 };
      default:
        return { backgroundColor: ink };
    }
  };

  return (
    <View style={[styles.sketch, { width, height, backgroundColor: background }]} accessible={false}>
      {spec.sketch.map((block, i) => (
        <View
          key={i}
          style={[
            styles.block,
            {
              left: block.x * width,
              top: block.y * height,
              width: block.w * width,
              height: block.h * height,
              borderRadius: block.tone === 'image' ? 0 : Math.min(3, (block.h * height) / 2),
            },
            tone(block),
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sketch: { borderRadius: 8, overflow: 'hidden' },
  block: { position: 'absolute' },
});
