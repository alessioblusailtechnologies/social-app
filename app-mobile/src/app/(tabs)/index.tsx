import { HomeScreen } from '@/features/home/HomeScreen';
import { useActiveBrand } from '@/services/queries';

export default function HomeRoute() {
  const { brand } = useActiveBrand();
  if (!brand) return null;
  return <HomeScreen key={brand.id} brand={brand} />;
}
