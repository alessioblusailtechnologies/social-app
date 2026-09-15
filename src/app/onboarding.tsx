import { useLocalSearchParams } from 'expo-router';

import { OnboardingFlow } from '@/features/onboarding/OnboardingFlow';

export default function OnboardingRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return <OnboardingFlow mode={mode === 'new' ? 'new' : 'first'} />;
}
