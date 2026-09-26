import { Redirect } from 'expo-router';

import { NewIdeaScreen } from '@/features/ideas/NewIdeaScreen';
import { useActiveBrand } from '@/services/queries';

export default function NewIdeaRoute() {
  const { brand } = useActiveBrand();
  if (!brand) return <Redirect href="/onboarding" />;
  return <NewIdeaScreen key={brand.id} brand={brand} />;
}
