import { Redirect } from 'expo-router';

import { PlanSessionScreen } from '@/features/plan/PlanSessionScreen';
import { useActiveBrand } from '@/services/queries';

export default function PlanSessionRoute() {
  const { brand } = useActiveBrand();
  if (!brand) return <Redirect href="/onboarding" />;
  return <PlanSessionScreen key={brand.id} brand={brand} />;
}
