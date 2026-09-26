import { IdeasScreen } from '@/features/ideas/IdeasScreen';
import { useActiveBrand } from '@/services/queries';

export default function IdeasRoute() {
  const { brand } = useActiveBrand();
  if (!brand) return null;
  // La chiave riparte da zero quando cambi brand: nuove proposte, nuovi filtri.
  return <IdeasScreen key={brand.id} brand={brand} />;
}
