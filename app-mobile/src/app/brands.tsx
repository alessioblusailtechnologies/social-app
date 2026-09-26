import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  IconButton,
  PressableScale,
  RadioMark,
  ScreenTitle,
  Text,
  TopBar,
  colors,
  radii,
  screenStyles,
  useToast,
} from '@/design-system';
import { kindLabel } from '@shared/domain/catalog';
import { BrandAvatar } from '@/features/brand-editors';
import { useOnboardingStore } from '@/features/onboarding/store';
import { useActiveBrand, useSetActiveBrand } from '@/services/queries';

export default function BrandsScreen() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { brand: active, brands } = useActiveBrand();
  const setActive = useSetActiveBrand();
  const resetOnboarding = useOnboardingStore((state) => state.reset);

  return (
    <View style={screenStyles.screen}>
      {/* Su iOS la modale è un foglio che non arriva sotto la status bar. */}
      <TopBar
        safeArea={Platform.OS !== 'ios'}
        title="I tuoi brand"
        right={<IconButton icon={X} accessibilityLabel="Chiudi" onPress={() => router.back()} />}
      />
      <ScrollView contentContainerStyle={[screenStyles.content, { paddingBottom: insets.bottom + 24 }]}>
        <ScreenTitle
          title="Per chi lavori adesso"
          subtitle="Ogni brand ha il suo profilo, la sua voce e i suoi canali: le proposte non si mescolano."
        />
        <View style={styles.list} accessibilityRole="radiogroup">
          {brands.map((brand) => {
            const selected = brand.id === active?.id;
            return (
              <PressableScale
                key={brand.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${brand.identity.name}, ${kindLabel(brand.identity.kind)}`}
                disabled={setActive.isPending}
                onPress={() =>
                  selected
                    ? router.back()
                    : setActive.mutate(brand.id, {
                        onSuccess: () => {
                          toast(`Ora lavori su ${brand.identity.name}.`);
                          router.back();
                        },
                      })
                }
                style={[styles.row, selected && styles.rowSelected]}>
                <BrandAvatar brand={brand} size={44} />
                <View style={styles.texts}>
                  <Text variant="strong">{brand.identity.name}</Text>
                  <Text variant="caption">{kindLabel(brand.identity.kind)}</Text>
                </View>
                <RadioMark selected={selected} />
              </PressableScale>
            );
          })}
        </View>
        <Button
          variant="secondary"
          block
          onPress={() => {
            // Un brand nuovo parte da una bozza vuota: niente di un onboarding lasciato a metà per un altro brand.
            resetOnboarding();
            router.replace({ pathname: '/onboarding', params: { mode: 'new' } });
          }}>
          Aggiungi un brand
        </Button>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceCard,
  },
  rowSelected: { borderColor: colors.borderStrong },
  texts: { flex: 1, minWidth: 0, gap: 2 },
});
