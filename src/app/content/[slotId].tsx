import { Redirect, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { screenStyles } from '@/design-system';
import { ContentScreen } from '@/features/content/ContentScreen';
import { useActiveBrand, usePlan, useSlotContent } from '@/services/queries';

/** Il contenuto di un'uscita del piano. */
export default function SlotContentRoute() {
  const { slotId } = useLocalSearchParams<{ slotId: string }>();
  const { brand } = useActiveBrand();
  const { data: slots, isPending } = usePlan(brand?.id);
  const contentQuery = useSlotContent(slotId);

  if (!brand) return <Redirect href="/onboarding" />;
  if (isPending) return <View style={screenStyles.screen} />;
  const slot = slots?.find((candidate) => candidate.id === slotId);
  if (!slot) return <Redirect href="/plan" />;
  return (
    <ContentScreen
      key={slot.id}
      brand={brand}
      slot={slot}
      content={contentQuery.data ?? null}
      loading={contentQuery.isPending}
    />
  );
}
