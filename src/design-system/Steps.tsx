import { Check, X } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Text } from './Text';
import { colors, motion, palette, radii } from './tokens';

export interface StepItem {
  id: string;
  label: string;
  detail?: string;
  status: 'running' | 'done' | 'failed';
}

const MARK = 18;

function StepMark({ status }: { status: StepItem['status'] }) {
  if (status === 'running') {
    return (
      <View style={styles.mark}>
        <ActivityIndicator size="small" color={colors.actionPrimary} style={styles.spinner} />
      </View>
    );
  }
  const failed = status === 'failed';
  return (
    <View style={[styles.mark, styles.round, failed ? styles.failed : styles.done]}>
      {failed ? (
        <X size={11} color={colors.warning} strokeWidth={3} />
      ) : (
        <Check size={11} color={colors.actionPrimary} strokeWidth={3} />
      )}
    </View>
  );
}

/**
 * I passi di un lavoro dell'AI mentre succede: quelli fatti, quello in corso, quelli non riusciti. Prima che arrivi il
 * primo passo si vede `waiting` come passo in corso, così non serve uno skeleton.
 */
export function StepList({ steps, waiting = 'Mi preparo' }: { steps: StepItem[]; waiting?: string }) {
  const shown: StepItem[] = steps.length > 0 ? steps : [{ id: 'waiting', label: waiting, status: 'running' }];
  return (
    <View style={styles.list} accessibilityLiveRegion="polite">
      {shown.map((step) => {
        const running = step.status === 'running';
        return (
          <Animated.View key={step.id} entering={FadeIn.duration(motion.base)} style={styles.row}>
            <StepMark status={step.status} />
            <View style={styles.texts}>
              <Text variant="strongSmall" color={running ? colors.textTitle : colors.textBody}>
                {step.label}
              </Text>
              {step.detail ? (
                <Text variant="caption" numberOfLines={1}>
                  {step.detail}
                </Text>
              ) : null}
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  mark: { width: MARK, height: MARK, alignItems: 'center', justifyContent: 'center' },
  spinner: { transform: [{ scale: 0.8 }] },
  round: { borderRadius: radii.pill },
  done: { backgroundColor: colors.statusComplete },
  failed: { backgroundColor: palette.grey100 },
  texts: { flex: 1, minWidth: 0, gap: 1 },
});
