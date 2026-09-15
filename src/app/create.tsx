import { useRouter, type Href } from 'expo-router';
import { CalendarDays, ChevronRight, Lightbulb, PenLine, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, PressableScale, Text, colors, layout, motion, palette, radii } from '@/design-system';

const OPTIONS: { title: string; meta: string; icon: LucideIcon; href: Href }[] = [
  {
    title: 'Nuova idea',
    meta: 'Da una frase, un link o un documento: tre spunti da tenere o mettere nel piano.',
    icon: Lightbulb,
    href: '/new-idea',
  },
  {
    title: 'Nuova pianificazione',
    meta: 'Riempi le prossime settimane con le idee salvate, bilanciate sui temi.',
    icon: CalendarDays,
    href: '/plan-session',
  },
  {
    title: 'Nuovo contenuto',
    meta: 'Scrivi direttamente un post: bozza per ogni canale, poi scegli quando pubblicarlo.',
    icon: PenLine,
    href: '/new-content',
  },
];

/** Il foglio del + al centro della bottom bar: da qui si parte in tre modi diversi. */
export default function CreateSheet() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={styles.root}>
      <Animated.View entering={FadeIn.duration(motion.base)} style={styles.scrim}>
        <Pressable accessibilityRole="button" accessibilityLabel="Chiudi" onPress={close} style={styles.fill} />
      </Animated.View>
      <Animated.View
        entering={FadeInDown.duration(motion.slow)}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={styles.handle} />
        <Text variant="label">Crea</Text>
        <Text variant="title">Da dove partiamo?</Text>
        <View style={styles.options}>
          {OPTIONS.map(({ title, meta, icon: Icon, href }) => (
            <PressableScale
              key={title}
              accessibilityRole="button"
              accessibilityLabel={`${title}. ${meta}`}
              onPress={() => router.replace(href)}
              style={styles.option}>
              <View style={styles.icon}>
                <Icon size={20} color={colors.textTitle} strokeWidth={2} />
              </View>
              <View style={styles.texts}>
                <Text variant="strong">{title}</Text>
                <Text variant="caption">{meta}</Text>
              </View>
              <ChevronRight size={18} color={palette.grey300} />
            </PressableScale>
          ))}
        </View>
        <Button variant="ghost" block onPress={close}>
          Annulla
        </Button>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  fill: { flex: 1 },
  sheet: {
    gap: 10,
    paddingTop: 10,
    paddingHorizontal: layout.screenGutter,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    backgroundColor: colors.surfaceApp,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: palette.grey300,
    marginBottom: 6,
  },
  options: { gap: 10, paddingTop: 6 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceCard,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  texts: { flex: 1, minWidth: 0, gap: 3 },
});
