import { Minus, Plus } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AgentStage,
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
import type { BrandKind, Identity, Positioning } from '@shared/domain/brand';
import { AUDIENCES, GOALS } from '@shared/domain/catalog';
import { normalizeSite } from '@shared/lib/site';
import { usePositioningIdeas, type PositioningSource } from '@/services/queries';
import type { WebsiteInsights } from '@shared/services/types';

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

const WHAT_YOU_DO: Record<BrandKind, string> = { person: 'cosa fai', company: 'cosa fate', client: 'cosa fa' };

const toggle = (list: string[], item: string) =>
  list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];

/** Una frase vera su cosa fa: sotto queste parole non basta per proporre qualcosa su misura. */
const MIN_PITCH_WORDS = 6;

/**
 * Da cosa l'AI propone obiettivi e pubblico: la lettura del sito, se è andata, o una frase su cosa fa
 * abbastanza lunga. Senza nessuna delle due restano le proposte standard (null).
 */
export function positioningSource(identity: Identity, insights: WebsiteInsights | null): PositioningSource | null {
  const site = insights?.pitch && insights.site === normalizeSite(identity.site) ? insights : null;
  const words = identity.pitch.trim().split(/\s+/).filter(Boolean).length;
  if (!site && words < MIN_PITCH_WORDS) return null;
  const { kind, role, company, sector, pitch } = identity;
  return { key: JSON.stringify([kind, role, company, sector, pitch.trim(), site?.site ?? '']), site };
}

export function PositioningEditor({ value, onChange, context }: EditorProps<Positioning>) {
  const { identity } = context.draft;
  const { kind } = identity;
  const { onPositioningIdeas } = context;
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState('');

  // Solo in onboarding: nel Profilo le scelte ci sono già e restano le proposte standard.
  const source = onPositioningIdeas ? positioningSource(identity, context.insights) : null;
  const stored = source && context.positioningIdeas?.key === source.key ? context.positioningIdeas.ideas : null;
  const generated = usePositioningIdeas(identity, stored ? null : source);
  const ideas = stored ?? generated.data ?? null;
  const loading = source !== null && ideas === null && !generated.isError;

  const sourceKey = source?.key;
  useEffect(() => {
    if (sourceKey && generated.data && !stored) onPositioningIdeas?.(sourceKey, generated.data);
  }, [sourceKey, generated.data, stored, onPositioningIdeas]);

  const goals = [...new Set([...(ideas?.goals ?? GOALS[kind]), ...value.goals])];
  const audiences = [
    ...new Set([...(ideas?.audiences ?? [...AUDIENCES[kind], ...(context.insights?.audiences ?? [])]), ...value.audiences]),
  ];
  const note = !onPositioningIdeas
    ? null
    : ideas
      ? source?.site
        ? `Proposti leggendo ${source.site.site}: tocca per scegliere o togliere.`
        : 'Proposti da quello che hai scritto: tocca per scegliere o togliere.'
      : generated.isError
        ? 'Non sono riuscito a preparare proposte su misura: ecco le più comuni.'
        : `Proposte comuni: se nel passo prima scrivi ${WHAT_YOU_DO[kind]} o mi fai leggere il sito, le preparo su misura.`;

  if (loading) {
    return (
      <View style={styles.column}>
        <Panel gap={12}>
          <Text variant="strongSmall">Preparo obiettivi e pubblico su misura</Text>
          <AgentStage steps={generated.steps} waiting="Rileggo quello che so del brand" />
        </Panel>
        <Frequency value={value} onChange={onChange} />
      </View>
    );
  }

  const addAudience = () => {
    const label = custom.trim();
    if (!label) return;
    if (!value.audiences.includes(label)) onChange({ ...value, audiences: [...value.audiences, label] });
    setCustom('');
    setAdding(false);
  };

  return (
    <View style={styles.column}>
      {note && (
        <Text variant="caption" style={screenStyles.groupLabel}>
          {note}
        </Text>
      )}
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

      <Frequency value={value} onChange={onChange} />
    </View>
  );
}

function Frequency({ value, onChange }: Pick<EditorProps<Positioning>, 'value' | 'onChange'>) {
  const perWeek = value.postsPerWeek;
  return (
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
