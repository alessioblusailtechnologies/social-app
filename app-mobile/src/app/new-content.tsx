import { Redirect } from 'expo-router';

import { NewContentScreen } from '@/features/content/NewContentScreen';
import { useActiveBrand } from '@/services/queries';

export default function NewContentRoute() {
  const { brand } = useActiveBrand();
  if (!brand) return <Redirect href="/onboarding" />;
  return <NewContentScreen key={brand.id} brand={brand} />;
}
