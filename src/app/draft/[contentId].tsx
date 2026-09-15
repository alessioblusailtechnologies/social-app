import { Redirect, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { screenStyles } from '@/design-system';
import { ContentScreen } from '@/features/content/ContentScreen';
import { useActiveBrand, useContent, usePlan } from '@/services/queries';

/** Un contenuto creato direttamente: resta qui finché non viene programmato, poi segue la sua uscita. */
export default function DraftContentRoute() {
  const { contentId } = useLocalSearchParams<{ contentId: string }>();
  const { brand } = useActiveBrand();
  const contentQuery = useContent(contentId);
  const { data: slots = [] } = usePlan(brand?.id);

  if (!brand) return <Redirect href="/onboarding" />;
  if (contentQuery.isPending) return <View style={screenStyles.screen} />;
  const content = contentQuery.data;
  if (!content) return <Redirect href="/plan" />;
  const slot = slots.find((candidate) => candidate.id === content.slotId) ?? null;
  return <ContentScreen key={content.id} brand={brand} slot={slot} content={content} loading={false} />;
}
