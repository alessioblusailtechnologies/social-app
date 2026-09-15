import { PlanScreen } from '@/features/plan/PlanScreen';
import { useActiveBrand } from '@/services/queries';

export default function PlanRoute() {
  const { brand } = useActiveBrand();
  if (!brand) return null;
  return <PlanScreen key={brand.id} brand={brand} />;
}
