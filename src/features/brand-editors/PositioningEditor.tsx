import { Minus, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Chip,
  ChipGroup,
  IconButton,
  LinkButton,
  Panel,
  SunkenInput,
  Text,
  screenStyles,
} from '@/design-system';
import type { BrandKind, Positioning } from '@/domain/brand';
import { AUDIENCES, GOALS } from '@/domain/catalog';

import type { EditorProps } from './types';

const GOAL_LABEL: Record<BrandKind, string> = {
  person: 'Perché pubblichi',
  company: 'Perché pubblicate',
  client: 'Perché pubblica',
};

const AUDIENCE_LABEL: Record<BrandKind, string> = {
  person: 'Chi vuoi raggiungere',
  company: 'Chi volete raggiungere',
  client: 'Chi vuole raggiungere',
};

function frequencyNote(perWeek: number): string {
  if (perWeek <= 2) return 'Ritmo leggero: una sessione ogni tre settimane';
  if (perWeek <= 4) return 'Ritmo consigliato: una sessione ogni due settimane';
  return 'Ritmo alto: serve una sessione a settimana';
}

const toggle = (list: string[], item: string) =>
  list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];

export function PositioningEditor({ value, onChange, context }: EditorProps<Positioning>) {
  const kind = context.draft.identity.kind;
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState('');

  const goals = [...new Set([...GOALS[kind], ...value.goals])];
  const audiences = [...new Set([...AUDIENCES[kind], ...(context.insights?.audiences ?? []), ...value.audiences])];
  const perWeek = value.postsPerWeek;

  const addAudience = () => {
    const label = custom.trim();
    if (!label) return;
    if (!value.audiences.includes(label)) onChange({ ...value, audiences: [...value.audiences, label] });
    setCustom('');
    setAdding(false);
  };

  return (
    <View style={styles.column}>
      <View style={styles.group}>
        <Text variant="label" style={screenStyles.groupLabel}>
          {GOAL_LABEL[kind]}
        </Text>
        <ChipGroup>
          {goals.map((goal) => (
            <Chip
              key={goal}
              label={goal}
              selected={value.goals.includes(goal)}
              onPress={() => onChange({ ...value, goals: toggle(value.goals, goal) })}
            />
          ))}
        </ChipGroup>
      </View>

      <View style={styles.group}>
        <Text variant="label" style={screenStyles.groupLabel}>
          {AUDIENCE_LABEL[kind]}
        </Text>
        <ChipGroup>
          {audiences.map((audience) => (
            <Chip
              key={audience}
              label={audience}
              selected={value.audiences.includes(audience)}
              onPress={() => onChange({ ...value, audiences: toggle(value.audiences, audience) })}
            />
          ))}
        </ChipGroup>
        {adding ? (
          <View style={styles.addRow}>
            <SunkenInput
              style={styles.flex}
              value={custom}
              onChangeText={setCustom}
              placeholder="Es. Responsabili acquisti"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={addAudience}
              accessibilityLabel="Nuovo pubblico"
            />
            <Button size="sm" disabled={!custom.trim()} onPress={addAudience}>
              Aggiungi
            </Button>
          </View>
        ) : (
          <LinkButton label="Aggiungi un pubblico" onPress={() => setAdding(true)} />
        )}
      </View>

      <Panel label="Quanto vuoi pubblicare">
        <View style={styles.stepper}>
          <IconButton
            icon={Minus}
            variant="outline"
            size={44}
            accessibilityLabel="Meno uscite"
            disabled={perWeek <= 1}
            onPress={() => onChange({ ...value, postsPerWeek: Math.max(1, perWeek - 1) })}
          />
          <View style={styles.stepperValue}>
            <Text variant="title" align="center">
              {perWeek} {perWeek === 1 ? 'volta' : 'volte'} a settimana
            </Text>
            <Text variant="caption" align="center">
              {frequencyNote(perWeek)}
            </Text>
          </View>
          <IconButton
            icon={Plus}
            variant="outline"
            size={44}
            accessibilityLabel="Più uscite"
            disabled={perWeek >= 7}
            onPress={() => onChange({ ...value, postsPerWeek: Math.min(7, perWeek + 1) })}
          />
        </View>
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 14 },
  group: { gap: 8 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperValue: { flex: 1, alignItems: 'center', gap: 2 },
});
