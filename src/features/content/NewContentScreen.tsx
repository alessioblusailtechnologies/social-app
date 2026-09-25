import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Platform } from 'react-native';

import {
  AgentStage,
  Button,
  Chip,
  ChipGroup,
  FormScrollView,
  IconButton,
  KeyboardScreen,
  Panel,
  ScreenFooter,
  ScreenTitle,
  Text,
  TopBar,
  screenStyles,
  useToast,
} from '@/design-system';
import type { Brand, ChannelId } from '@/domain/brand';
import { channelName } from '@/domain/catalog';
import { FORMAT_LABELS, type IdeaFormat } from '@/domain/idea';
import { selectedChannels } from '@/domain/plan';
import { stageAspect } from '@/domain/visual';
import { EMPTY_SOURCE, SOURCE_REASONS, SourceFields, sourceFromState, type SourceState } from '@/features/ideas/SourceFields';
import { useCreateContent } from '@/services/queries';

const FORMATS = Object.keys(FORMAT_LABELS) as IdeaFormat[];

/** Un contenuto senza passare da idea e piano: fonte, canali, formato, bozza. */
export function NewContentScreen({ brand }: { brand: Brand }) {
  const router = useRouter();
  const toast = useToast();
  const create = useCreateContent(brand.id);
  const [source, setSource] = useState<SourceState>(EMPTY_SOURCE);
  const [channels, setChannels] = useState<ChannelId[]>(() => selectedChannels(brand));
  const [format, setFormat] = useState<IdeaFormat>('post');

  const request = sourceFromState(source);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const toggleChannel = (channel: ChannelId) => {
    if (!channels.includes(channel)) {
      setChannels([...channels, channel]);
      return;
    }
    if (channels.length === 1) {
      toast('Serve almeno un canale.');
      return;
    }
    setChannels(channels.filter((entry) => entry !== channel));
  };

  const submit = () => {
    if (!request) return;
    create.mutate(
      { source: request, channels, format },
      {
        onSuccess: (content) => router.replace({ pathname: '/draft/[contentId]', params: { contentId: content.id } }),
        onError: () => toast('Non riesco a preparare la bozza. Riprova.'),
      },
    );
  };

  return (
    <KeyboardScreen>
      <TopBar
        safeArea={Platform.OS !== 'ios'}
        title="Nuovo contenuto"
        right={<IconButton icon={X} accessibilityLabel="Chiudi" onPress={close} />}
      />

      <FormScrollView contentContainerStyle={screenStyles.content}>
        {create.isPending ? (
          <>
            <ScreenTitle title="Un attimo" subtitle="Scelgo il taglio, lo lego ai temi del profilo e scrivo seguendo la tua voce." />
            <AgentStage steps={create.steps} waiting="Rileggo il profilo" aspect={stageAspect(format)} />
          </>
        ) : (
          <>
            <ScreenTitle
              title="Cosa vuoi pubblicare?"
              subtitle="Scrivilo come lo diresti a un collega, oppure parti da un link o da un documento. Preparo la bozza per ogni canale."
            />
            <SourceFields
              value={source}
              onChange={setSource}
              promptLabel="Di cosa vuoi parlare"
              promptPlaceholder="Es. abbiamo chiuso il trimestre con 3 clienti nuovi: racconta come ci siamo arrivati"
            />
            <Panel label="Canali">
              <ChipGroup>
                {selectedChannels(brand).map((channel) => (
                  <Chip
                    key={channel}
                    label={channelName(channel)}
                    selected={channels.includes(channel)}
                    onPress={() => toggleChannel(channel)}
                  />
                ))}
              </ChipGroup>
            </Panel>
            <Panel label="Formato">
              <ChipGroup>
                {FORMATS.map((candidate) => (
                  <Chip
                    key={candidate}
                    label={FORMAT_LABELS[candidate]}
                    selected={candidate === format}
                    onPress={() => setFormat(candidate)}
                  />
                ))}
              </ChipGroup>
              <Text variant="caption">Quando la bozza è pronta scegli se programmarla o pubblicarla subito.</Text>
            </Panel>
          </>
        )}
      </FormScrollView>

      <ScreenFooter>
        <Button
          size="lg"
          block
          disabled={!request}
          busy={create.isPending}
          onDisabledPress={() => toast(SOURCE_REASONS[source.mode])}
          onPress={submit}>
          {create.isPending ? 'Sto scrivendo…' : 'Prepara la bozza'}
        </Button>
      </ScreenFooter>
    </KeyboardScreen>
  );
}
