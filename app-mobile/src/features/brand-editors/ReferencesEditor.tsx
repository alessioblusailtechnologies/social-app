import { X } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Chip,
  ChipGroup,
  IconButton,
  Panel,
  SunkenInput,
  Text,
  colors,
  useToast,
} from '@/design-system';
import type { References } from '@shared/domain/brand';
import { formatDay, parseItalianDate } from '@shared/lib/dates';
import { createId } from '@shared/lib/id';

import type { EditorProps } from './types';

export function ReferencesEditor({ value, onChange, context }: EditorProps<References>) {
  const toast = useToast();
  const [profileDraft, setProfileDraft] = useState('');
  const [addingDate, setAddingDate] = useState(false);
  const [dateLabel, setDateLabel] = useState('');
  const [dateText, setDateText] = useState('');
  const kind = context.draft.identity.kind;

  const addProfile = () => {
    const profile = profileDraft.trim();
    if (!profile) {
      toast('Incolla un link o una @.');
      return;
    }
    if (!value.profiles.includes(profile)) onChange({ ...value, profiles: [...value.profiles, profile] });
    setProfileDraft('');
  };

  const addMilestone = () => {
    const label = dateLabel.trim();
    const date = parseItalianDate(dateText);
    if (!label) {
      toast('Scrivi cosa è successo.');
      return;
    }
    if (!date) {
      toast('Scrivi la data come 03/10/2024.');
      return;
    }
    const milestones = [...value.milestones, { id: createId('milestone'), label, date }].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    onChange({ ...value, milestones });
    setDateLabel('');
    setDateText('');
    setAddingDate(false);
  };

  return (
    <View style={styles.column}>
      <Panel label={kind === 'person' ? 'Chi scrive come vorresti scrivere' : 'Profili da cui imparare'}>
        <View style={styles.inputRow}>
          <SunkenInput
            style={styles.flex}
            value={profileDraft}
            onChangeText={setProfileDraft}
            placeholder="linkedin.com/in/… oppure @nome"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={addProfile}
            accessibilityLabel="Profilo di riferimento"
          />
          <Button size="sm" onPress={addProfile}>
            Aggiungi
          </Button>
        </View>
        {value.profiles.length > 0 && (
          <ChipGroup>
            {value.profiles.map((profile) => (
              <Chip
                key={profile}
                label={profile}
                size="sm"
                onRemove={() => onChange({ ...value, profiles: value.profiles.filter((entry) => entry !== profile) })}
              />
            ))}
          </ChipGroup>
        )}
        <Text variant="caption">Non li imito: li uso per capire quali strutture funzionano nel tuo settore.</Text>
      </Panel>

      <Panel label="Fonti dei segnali">
        <ChipGroup>
          {value.sources.map((source, index) => (
            <Chip
              key={source.label}
              label={source.label}
              selected={source.enabled}
              onPress={() =>
                onChange({
                  ...value,
                  sources: value.sources.map((entry, i) => (i === index ? { ...entry, enabled: !entry.enabled } : entry)),
                })
              }
            />
          ))}
        </ChipGroup>
      </Panel>

      <Panel label="Le date che contano" gap={0}>
        {value.milestones.map((milestone) => (
          <View key={milestone.id} style={styles.milestoneRow}>
            <View style={styles.flex}>
              <Text variant="strongSmall">{milestone.label}</Text>
              <Text variant="caption">{formatDay(milestone.date)}</Text>
            </View>
            <IconButton
              icon={X}
              variant="ghost"
              size={36}
              iconSize={16}
              accessibilityLabel={`Rimuovi ${milestone.label}`}
              onPress={() => onChange({ ...value, milestones: value.milestones.filter((m) => m.id !== milestone.id) })}
            />
          </View>
        ))}
        {addingDate ? (
          <View style={styles.dateForm}>
            <SunkenInput
              value={dateLabel}
              onChangeText={setDateLabel}
              placeholder="Cosa è successo, es. primo cliente"
              autoFocus
              accessibilityLabel="Descrizione della data"
            />
            <SunkenInput
              value={dateText}
              onChangeText={setDateText}
              placeholder="GG/MM/AAAA"
              keyboardType="numbers-and-punctuation"
              returnKeyType="done"
              onSubmitEditing={addMilestone}
              accessibilityLabel="Data, nel formato giorno, mese, anno"
            />
            <View style={styles.actions}>
              <Button size="sm" variant="ghost" onPress={() => setAddingDate(false)}>
                Annulla
              </Button>
              <Button size="sm" onPress={addMilestone}>
                Aggiungi
              </Button>
            </View>
          </View>
        ) : (
          <Button variant="ghost" block onPress={() => setAddingDate(true)} style={styles.addDate}>
            Aggiungi una data
          </Button>
        )}
        <Text variant="caption" style={styles.dateNote}>
          Anniversari, lanci e traguardi diventano segnali «ricorrenza» per le idee.
        </Text>
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 12 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingVertical: 8,
    marginTop: 2,
  },
  dateForm: { gap: 8, paddingTop: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  addDate: { marginTop: 8 },
  dateNote: { marginTop: 8 },
});
