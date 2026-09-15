import { Redirect, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { screenStyles } from '@/design-system';
import { SlotDetailScreen } from '@/features/plan/SlotDetailScreen';
import { useActiveBrand, usePlan } from '@/services/queries';

export default function SlotRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { brand } = useActiveBrand();
  const { data: slots, isPending } = usePlan(brand?.id);

  if (!brand) return <Redirect href="/onboarding" />;
  if (isPending) return <View style={screenStyles.screen} />;
  const slot = slots?.find((candidate) => candidate.id === id);
  if (!slot) return <Redirect href="/plan" />;
  return <SlotDetailScreen brand={brand} slot={slot} />;
}
