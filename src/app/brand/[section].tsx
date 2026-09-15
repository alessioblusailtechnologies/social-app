import { Redirect, useLocalSearchParams } from 'expo-router';

import { isSectionKey } from '@/domain/brand';
import { SectionEditScreen } from '@/features/profile/SectionEditScreen';
import { useActiveBrand } from '@/services/queries';

/** Modifica di una sezione del Brand DNA: fuori dalle tab, così il piede con "Salva" resta libero. */
export default function SectionRoute() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const { brand } = useActiveBrand();
  if (!brand) return <Redirect href="/onboarding" />;
  if (!isSectionKey(section)) return <Redirect href="/profile" />;
  return <SectionEditScreen key={`${brand.id}-${section}`} brand={brand} sectionKey={section} />;
}
