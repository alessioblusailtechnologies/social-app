import { useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { CalendarDays, House, Lightbulb, Plus, UserRound, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { PressableScale, Text, colors, layout, palette, radii } from '@/design-system';

const ICONS: Record<string, LucideIcon> = {
  index: House,
  ideas: Lightbulb,
  plan: CalendarDays,
  profile: UserRound,
};

/** Bottom bar: due tab, il più al centro (unico accento della schermata), altre due tab. */
export function AppTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const router = useRouter();
  const half = Math.ceil(state.routes.length / 2);

  const renderTab = (index: number) => {
    const route = state.routes[index];
    const focused = state.index === index;
    const label = descriptors[route.key].options.title ?? route.name;
    const Icon = ICONS[route.name] ?? House;
    const color = focused ? colors.textTitle : colors.textBody;

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    };

    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        onPress={onPress}
        style={styles.tab}>
        <Icon size={22} color={color} strokeWidth={focused ? 2.25 : 2} />
        <Text variant="caption" weight={focused ? 'semibold' : 'medium'} color={color} style={styles.label}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
      {state.routes.slice(0, half).map((_, i) => renderTab(i))}
      <View style={styles.center}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Crea: nuova idea, pianificazione o contenuto"
          onPress={() => router.push('/create')}
          style={styles.plus}>
          <Plus size={24} color={palette.white} strokeWidth={2.5} />
        </PressableScale>
      </View>
      {state.routes.slice(half).map((_, i) => renderTab(half + i))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderTopWidth: 1,
    borderTopColor: palette.grey300,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: layout.hitMin + 4,
  },
  label: { fontSize: 10, lineHeight: 13 },
  center: { flex: 1, alignItems: 'center' },
  plus: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.actionAccent,
  },
});
