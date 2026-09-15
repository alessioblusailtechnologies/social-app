import { Redirect, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { screenStyles } from '@/design-system';
import { IdeaDetailScreen } from '@/features/ideas/IdeaDetailScreen';
import { useActiveBrand, useIdeas } from '@/services/queries';

export default function IdeaRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { brand } = useActiveBrand();
  const { data: ideas, isPending } = useIdeas(brand?.id);

  if (!brand) return <Redirect href="/onboarding" />;
  if (isPending) return <View style={screenStyles.screen} />;
  const idea = ideas?.find((candidate) => candidate.id === id);
  if (!idea) return <Redirect href="/ideas" />;
  return <IdeaDetailScreen brand={brand} idea={idea} />;
}
