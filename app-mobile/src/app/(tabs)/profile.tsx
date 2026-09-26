import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { useActiveBrand } from '@/services/queries';

export default function ProfileRoute() {
  const { brand, brands } = useActiveBrand();
  // Senza brand il layout delle tab rimanda già all'onboarding.
  if (!brand) return null;
  return <ProfileScreen brand={brand} brandCount={brands.length} />;
}
