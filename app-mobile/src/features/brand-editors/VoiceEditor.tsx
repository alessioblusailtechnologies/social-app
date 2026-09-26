import { ChevronRight, ClipboardPaste, History, Mic, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Dot,
  LinkButton,
  Panel,
  PressableScale,
  SkeletonLines,
  SunkenInput,
  Text,
  colors,
  palette,
  radii,
  screenStyles,
  useToast,
} from '@/design-system';
import { currentVoiceCard, isConnected, type Voice, type VoiceCard } from '@shared/domain/brand';
import { CHANNELS } from '@shared/domain/catalog';
import { formatTimestamp } from '@shared/lib/dates';
import { apiErrorMessage } from '@/services';
import { useAnalyzeVoice } from '@/services/queries';
import type { VoiceSample } from '@shared/services/types';

import type { EditorProps } from './types';

const VOICE_ROWS = [
  { key: 'register', label: 'Registro' },
  { key: 'rhythm', label: 'Ritmo' },
  { key: 'lexicon', label: 'Lessico ammesso' },
  { key: 'avoid', label: 'Da evitare' },
] as const;

type InputMode = 'paste' | 'recording' | null;

export function VoiceEditor({ value, onChange, context }: EditorProps<Voice>) {
  const toast = useToast();
  const analyze = useAnalyzeVoice();
  const card = currentVoiceCard(value);
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState<InputMode>(null);
  const [texts, setTexts] = useState('');
  const [editing, setEditing] = useState(false);
  const { identity, channels } = context.draft;
  const connectedChannel = CHANNELS.find(({ id }) => isConnected(channels[id]));

  const appendCard = (content: Omit<VoiceCard, 'version' | 'createdAt'>) => {
    const version = (card?.version ?? 0) + 1;
    onChange({ cards: [...value.cards, { ...content, version, createdAt: new Date().toISOString() }] });
    return version;
  };

  const run = (sample: VoiceSample) => {
    setInput(null);
    analyze.mutate(
      { sample, identity },
      {
        onSuccess: (analysis) => {
          const version = appendCard(analysis);
          setAdding(false);
          setTexts('');
          toast(`Scheda voce v${version} pronta.`);
        },
        onError: (error) => toast(apiErrorMessage(error, 'Analisi non riuscita. Riprova.')),
      },
    );
  };

  if (analyze.isPending) {
    return (
      <Panel gap={12} style={styles.bigPanel}>
        <Text variant="strongSmall">
          {analyze.variables?.sample.source === 'recording' ? 'Sto ascoltando la registrazione' : 'Sto leggendo i tuoi testi'}
        </Text>
        <SkeletonLines />
      </Panel>
    );
  }

  if (input === 'paste') {
    return (
      <Panel label="Incolla i tuoi testi" gap={12} style={styles.bigPanel}>
        <SunkenInput
          multiline
          minHeight={160}
          value={texts}
          onChangeText={setTexts}
          placeholder="Incolla qui i post, separati da una riga vuota."
          autoFocus
          accessibilityLabel="Testi da analizzare"
        />
        <Text variant="caption">
          Più testi leggo, meno correzioni farai dopo. Con tre ci siamo, con dieci si sente la differenza.
        </Text>
        <View style={styles.actions}>
          <Button size="sm" variant="ghost" onPress={() => setInput(null)}>
            Annulla
          </Button>
          <Button
            size="sm"
            disabled={texts.trim().length < 40}
            onDisabledPress={() => toast('Incolla almeno qualche riga scritta da te.')}
            onPress={() => run({ source: 'pasted', texts })}>
            Analizza
          </Button>
        </View>
      </Panel>
    );
  }

  if (input === 'recording') {
    return <RecordingPanel onCancel={() => setInput(null)} onStop={() => run({ source: 'recording' })} />;
  }

  if (card && !adding) {
    const editRow = (key: (typeof VOICE_ROWS)[number]['key'], text: string) =>
      onChange({ cards: [...value.cards.slice(0, -1), { ...card, [key]: text }] });
    const previous = value.cards.slice(0, -1).reverse();

    return (
      <View style={styles.column}>
        <Panel gap={10} style={styles.bigPanel}>
          <View style={styles.cardHeader}>
            <Badge tone="mint" size="sm">{`Scheda voce v${card.version}`}</Badge>
            <Text variant="caption" numberOfLines={1} style={styles.flex}>
              da {card.sourceLabel}
            </Text>
            <LinkButton label={editing ? 'Fatto' : 'Correggi'} onPress={() => setEditing(!editing)} />
          </View>
          {VOICE_ROWS.map(({ key, label }) => (
            <View key={key} style={styles.voiceRow}>
              <Text variant="label">{label}</Text>
              {editing ? (
                <SunkenInput
                  multiline
                  minHeight={64}
                  value={card[key]}
                  onChangeText={(text) => editRow(key, text)}
                  accessibilityLabel={label}
                />
              ) : (
                <Text variant="body" color={colors.textTitle} style={styles.rowText}>
                  {card[key]}
                </Text>
              )}
            </View>
          ))}
          <Button
            variant="ghost"
            block
            onPress={() => {
              setEditing(false);
              setAdding(true);
            }}>
            Aggiungi altri testi
          </Button>
        </Panel>

        {previous.length > 0 && (
          <Panel label="Versioni precedenti" gap={0}>
            {previous.map((older) => (
              <View key={`${older.version}-${older.createdAt}`} style={styles.historyRow}>
                <View style={styles.flex}>
                  <Text variant="strongSmall">
                    v{older.version} · {formatTimestamp(older.createdAt)}
                  </Text>
                  <Text variant="caption">da {older.sourceLabel}</Text>
                </View>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    const { version: _version, createdAt: _createdAt, ...content } = older;
                    toast(`Ripristinata come v${appendCard(content)}.`);
                  }}>
                  Ripristina
                </Button>
              </View>
            ))}
          </Panel>
        )}
      </View>
    );
  }

  const sources: { key: string; title: string; meta: string; icon: LucideIcon; disabled?: boolean; onPress: () => void }[] = [
    {
      key: 'paste',
      title: 'Incolla qualche testo',
      meta: 'Il modo più veloce: copia da LinkedIn, dal sito o dalle note',
      icon: ClipboardPaste,
      onPress: () => setInput('paste'),
    },
    {
      key: 'history',
      title: connectedChannel ? `Leggi lo storico di ${connectedChannel.name}` : 'Leggi lo storico di un canale',
      meta: connectedChannel
        ? `Leggo gli ultimi post pubblicati da ${channels[connectedChannel.id].handle}`
        : 'Serve un canale collegato',
      icon: History,
      disabled: !connectedChannel,
      onPress: () => connectedChannel && run({ source: 'history', channel: connectedChannel.id }),
    },
    {
      key: 'recording',
      title: 'Registra un minuto di voce',
      meta: 'Racconta com’è andata la settimana: trascrivo e ne ricavo il ritmo',
      icon: Mic,
      onPress: () => setInput('recording'),
    },
  ];

  return (
    <View style={styles.column}>
      {sources.map(({ key, title, meta, icon: Icon, disabled = false, onPress }) => (
        <PressableScale
          key={key}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          accessibilityLabel={`${title}. ${meta}`}
          disabled={disabled}
          onPress={onPress}
          style={styles.source}>
          <View style={styles.sourceIcon}>
            <Icon size={18} color={disabled ? colors.textDisabled : colors.textTitle} strokeWidth={2} />
          </View>
          <View style={styles.flex}>
            <Text variant="strong" color={disabled ? colors.textBody : colors.textTitle}>
              {title}
            </Text>
            <Text variant="caption">{meta}</Text>
          </View>
          <ChevronRight size={18} color={palette.grey300} />
        </PressableScale>
      ))}
      <Text variant="caption" style={screenStyles.groupLabel}>
        {card
          ? 'La nuova scheda prende il posto di quella in uso; le precedenti restano nello storico.'
          : 'Più testi reali leggo, meno correzioni farai dopo. Con tre testi ci siamo, con dieci si sente la differenza.'}
      </Text>
      {card && (
        <Button variant="ghost" block onPress={() => setAdding(false)}>
          Torna alla scheda in uso
        </Button>
      )}
    </View>
  );
}

function RecordingPanel({ onCancel, onStop }: { onCancel: () => void; onStop: () => void }) {
  const [seconds, setSeconds] = useState(0);
  const stopped = useRef(false);

  const stop = () => {
    if (stopped.current) return;
    stopped.current = true;
    onStop();
  };

  useEffect(() => {
    const timer = setInterval(() => setSeconds((current) => Math.min(60, current + 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (seconds >= 60) stop();
  });

  return (
    <Panel label="Registrazione" gap={12} style={styles.bigPanel}>
      <View style={styles.recordRow}>
        <Dot color={palette.orange500} size={12} />
        <Text variant="display">{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</Text>
      </View>
      <Text variant="caption">
        Registrazione simulata. Racconta com’è andata la settimana come lo diresti a un collega: trascrivo e ne ricavo il
        ritmo.
      </Text>
      <View style={styles.actions}>
        <Button size="sm" variant="ghost" onPress={onCancel}>
          Annulla
        </Button>
        <Button size="sm" disabled={seconds < 3} onPress={stop}>
          Ferma e analizza
        </Button>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  column: { gap: 10 },
  flex: { flex: 1, minWidth: 0, gap: 3 },
  bigPanel: { borderRadius: radii.card },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voiceRow: { gap: 4, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: 9 },
  rowText: { lineHeight: 19 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingVertical: 8,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.xl,
    padding: 16,
  },
  sourceIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
