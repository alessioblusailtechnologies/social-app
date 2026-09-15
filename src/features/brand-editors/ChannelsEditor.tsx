import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, PressableScale, Text, colors, radii, screenStyles, useToast } from '@/design-system';
import { isConnected, type ChannelId, type Channels, type ChannelState } from '@/domain/brand';
import { CHANNELS, channelName } from '@/domain/catalog';
import { useConnectChannel } from '@/services/queries';

import { ChannelMark } from './BrandVisuals';
import type { EditorProps } from './types';

export function ChannelsEditor({ value, onChange, context }: EditorProps<Channels>) {
  const toast = useToast();
  const connect = useConnectChannel();
  const [connecting, setConnecting] = useState<ChannelId | null>(null);

  // Il collegamento è asincrono: al ritorno si parte dallo stato più recente, non da quello del tocco.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });

  const update = (id: ChannelId, state: Partial<ChannelState>) =>
    onChange({ ...latest.current, [id]: { ...latest.current[id], ...state } });

  const startConnect = (id: ChannelId) => {
    setConnecting(id);
    connect.mutate(
      { channel: id, identity: context.draft.identity },
      {
        onSuccess: ({ handle }) => {
          update(id, { selected: true, handle });
          toast(`${channelName(id)} collegato.`);
        },
        onError: () => toast(`Non riesco a collegare ${channelName(id)}. Riprova.`),
        onSettled: () => setConnecting(null),
      },
    );
  };

  return (
    <View style={styles.column}>
      {CHANNELS.map(({ id, name }) => {
        const state = value[id];
        const connected = isConnected(state);
        const status = connected
          ? `Collegato come ${state.handle}`
          : connecting === id
            ? 'Ti porto alla pagina di accesso…'
            : state.selected
              ? 'Scelto · da collegare per pubblicare'
              : 'Tocca per sceglierlo';

        return (
          <PressableScale
            key={id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: state.selected }}
            accessibilityLabel={`${name}. ${status}`}
            onPress={() => update(id, state.selected ? { selected: false, handle: null } : { selected: true })}
            style={[styles.card, state.selected && styles.cardSelected]}>
            <ChannelMark channel={id} active={state.selected} />
            <View style={styles.texts}>
              <Text variant="strong">{name}</Text>
              <Text variant="caption" color={connected ? colors.textTitle : colors.textBody}>
                {status}
              </Text>
            </View>
            {connected ? (
              <Button
                size="sm"
                variant="ghost"
                onPress={() => {
                  update(id, { handle: null });
                  toast(`${name} scollegato.`);
                }}>
                Scollega
              </Button>
            ) : (
              <Button size="sm" busy={connecting !== null} onPress={() => startConnect(id)}>
                {connecting === id ? 'Collego…' : 'Collega'}
              </Button>
            )}
          </PressableScale>
        );
      })}
      <Text variant="caption" style={[screenStyles.groupLabel, styles.note]}>
        Scegline almeno uno. Collegarli serve solo per pubblicare: puoi farlo adesso o dal Profilo.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  cardSelected: { borderColor: colors.borderStrong },
  texts: { flex: 1, minWidth: 0, gap: 3 },
  note: { paddingTop: 4 },
});
