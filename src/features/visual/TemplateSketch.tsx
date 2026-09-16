import { StyleSheet, View } from 'react-native';

import { accentOn, inkOn, templateSpec, type BrandKit, type SketchBlock, type TemplateId } from '@/domain/visual';

/** Lo schizzo di un layout nei colori del brand: la miniatura della proposta, prima di creare. */
export function TemplateSketch({ templateId, kit, width = 64 }: { templateId: TemplateId; kit: BrandKit; width?: number }) {
  const spec = templateSpec(templateId);
  const height = width * 1.25;
  const background = spec.ground === 'ground' ? kit.colors.ground : kit.colors.primary;
  const ink = inkOn(background, kit);

  const tone = (block: SketchBlock) => {
    switch (block.tone) {
      case 'image':
        return { backgroundColor: kit.colors.secondary, opacity: 0.55 };
      case 'accent':
        return { backgroundColor: accentOn(background, kit) };
      case 'soft':
        return { backgroundColor: ink, opacity: 0.35 };
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
