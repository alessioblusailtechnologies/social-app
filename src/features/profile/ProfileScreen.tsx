import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_URL, APP_NAME, DEMO_MODE } from '@/config';
import {
  Badge,
  Button,
  Card,
  Panel,
  PressableScale,
  StatusDot,
  Text,
  colors,
  palette,
  radii,
  screenStyles,
  useToast,
} from '@/design-system';
import type { Brand, SectionKey } from '@/domain/brand';
import { kindLabel } from '@/domain/catalog';
import { completeness, SECTION_KEYS, sectionCopy, sectionHint } from '@/domain/sections';
import { BrandAvatar } from '@/features/brand-editors';
import { useOnboardingStore } from '@/features/onboarding/store';
import { auth } from '@/services';
import { useSessionStore } from '@/services/http/session';
import { useResetDemo } from '@/services/queries';

import { SectionPreview } from './SectionPreview';

const STATUS_COLORS = {
  complete: colors.statusComplete,
  partial: colors.statusPartial,
  missing: colors.statusMissing,
};

export function ProfileScreen({ brand, brandCount }: { brand: Brand; brandCount: number }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { percent, statuses } = completeness(brand);
  const pending = statuses.filter(({ status }) => status !== 'complete');
  const { kind, role, company, sector, pitch } = brand.identity;
  const subline = kind === 'person' ? [role, company].filter(Boolean).join(' · ') : sector;

  const openSection = (key: SectionKey) => router.push({ pathname: '/brand/[section]', params: { section: key } });

  return (
    <ScrollView
      style={screenStyles.screen}
      contentContainerStyle={[screenStyles.content, { paddingTop: insets.top + 12, paddingBottom: 32 }]}>
      <View style={styles.topRow}>
        <Text variant="label" style={styles.flex}>
          {APP_NAME} · Profilo
        </Text>
        <Button size="sm" variant="secondary" onPress={() => router.push('/brands')}>
          {brandCount > 1 ? 'Cambia brand' : 'I tuoi brand'}
        </Button>
      </View>

      <Card>
        <View style={styles.hero}>
          <View style={styles.heroRow}>
            <BrandAvatar brand={brand} size={56} />
            <View style={styles.heroText}>
              <Badge tone="neutral" size="sm">
                {kindLabel(kind)}
              </Badge>
              <Text variant="title">{brand.identity.name}</Text>
              {subline ? <Text variant="caption">{subline}</Text> : null}
            </View>
          </View>
          {pitch ? <Text variant="body">{pitch}</Text> : null}
        </View>
      </Card>

      <Panel label="Completezza" action={<Text variant="value">{percent}%</Text>} gap={12}>
        <View style={styles.segments}>
          {statuses.map(({ key, status }) => (
            <View key={key} style={[styles.segment, { backgroundColor: STATUS_COLORS[status] }]} />
          ))}
        </View>
        {pending.length === 0 ? (
          <Text variant="body">Profilo completo. Più è preciso, meno correzioni farai dopo.</Text>
        ) : (
          pending.slice(0, 2).map(({ key, status }) => (
            <PressableScale
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`Completa ${sectionCopy(key, kind).name}`}
              onPress={() => openSection(key)}
              style={styles.hintRow}>
              <StatusDot tone={status} size={10} />
              <View style={styles.flex}>
                <Text variant="strongSmall">{sectionCopy(key, kind).name}</Text>
                <Text variant="caption">{sectionHint(key, status)}</Text>
              </View>
              <ChevronRight size={16} color={palette.grey300} />
            </PressableScale>
          ))
        )}
      </Panel>

      <Text variant="label" style={[screenStyles.groupLabel, styles.groupLabel]}>
        Brand DNA
      </Text>
      {SECTION_KEYS.map((key) => (
        <SectionPreview
          key={key}
          sectionKey={key}
          brand={brand}
          status={statuses.find((entry) => entry.key === key)?.status ?? 'missing'}
          onPress={() => openSection(key)}
        />
      ))}

      {API_URL !== null && <AccountPanel />}
      {DEMO_MODE && <DemoPanel />}
    </ScrollView>
  );
}

function AccountPanel() {
  const account = useSessionStore((state) => state.account);

  return (
    <Panel label="Account" gap={8}>
      {account ? (
        <Text variant="body" numberOfLines={1}>
          {account.name ? `${account.name} · ${account.email}` : account.email}
        </Text>
      ) : null}
      <Button variant="ghost" block onPress={() => auth?.signOut()}>
        Esci
      </Button>
    </Panel>
  );
}

function DemoPanel() {
  const router = useRouter();
  const toast = useToast();
  const resetDemo = useResetDemo();
  const resetOnboarding = useOnboardingStore((state) => state.reset);
  const [confirming, setConfirming] = useState(false);

  // Azione distruttiva senza finestre di dialogo: il secondo tocco conferma, entro pochi secondi.
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const reset = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    resetDemo.mutate(undefined, {
      onSuccess: () => {
        resetOnboarding();
        toast('Dati azzerati: si riparte dall’onboarding.');
      },
    });
  };

  return (
    <Panel label="Demo" gap={8}>
      <Text variant="caption">
        {API_URL === null
          ? 'Tutti i dati sono simulati e restano su questo dispositivo.'
          : 'I dati stanno sul tuo account: azzerarli elimina brand, idee, piano e contenuti.'}
      </Text>
      <Button variant="ghost" block onPress={() => router.push('/design-system')}>
        Catalogo del design system
      </Button>
      <Button variant={confirming ? 'secondary' : 'ghost'} block busy={resetDemo.isPending} onPress={reset}>
        {confirming ? 'Tocca di nuovo per azzerare tutto' : 'Azzera i dati della demo'}
      </Button>
    </Panel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36, marginBottom: 4 },
  hero: { gap: 12 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroText: { flex: 1, minWidth: 0, gap: 4 },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 6, borderRadius: radii.pill },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: 10,
  },
  groupLabel: { paddingTop: 6, marginBottom: -4 },
});
