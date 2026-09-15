import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { Dot, Panel, Text, colors } from '@/design-system';
import { WorkInProgress } from '@/features/wip/WorkInProgress';
import { useActiveBrand, useIdeas } from '@/services/queries';

/** Il contenuto di un'uscita (lo Studio semplificato): per ora un segnaposto con l'idea di partenza. */
export default function CreateScreen() {
  const router = useRouter();
  const { ideaId } = useLocalSearchParams<{ ideaId?: string }>();
  const { brand } = useActiveBrand();
  const { data: ideas } = useIdeas(brand?.id);
  const idea = ideaId ? ideas?.find((candidate) => candidate.id === ideaId) : undefined;
  const theme = brand?.themes.find((candidate) => candidate.id === idea?.themeId);

  return (
    <WorkInProgress
      section="Contenuto"
      title="Il contenuto"
      description="Qui l’AI prepara la bozza a partire dall’idea: la ritocchi, la approvi e parte all’orario del piano."
      upcoming={[
        'Testo adattato a ogni canale dell’uscita',
        'Immagini generate con la tua identità visiva',
        'Struttura video a scene e approvazione',
      ]}
      seed={73}
      onClose={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
      {idea && (
        <Panel label="Punto di partenza" gap={8}>
          <Text variant="bodyLarge" color={colors.textTitle}>
            {idea.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {theme && <Dot color={theme.color} size={8} />}
            <Text variant="caption">
              {idea.angleLabel}
              {theme ? ` · ${theme.name}` : ''}
            </Text>
          </View>
        </Panel>
      )}
    </WorkInProgress>
  );
}
