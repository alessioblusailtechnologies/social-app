import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { colors } from '@/design-system';
import { AppTabBar } from '@/features/navigation/AppTabBar';
import { useActiveBrand } from '@/services/queries';

export default function TabsLayout() {
  const { brand } = useActiveBrand();
  if (!brand) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.surfaceApp } }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="ideas" options={{ title: 'Idee' }} />
      <Tabs.Screen name="plan" options={{ title: 'Piano' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profilo' }} />
    </Tabs>
  );
}
