import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Chip,
  ChipGroup,
  Dot,
  IconButton,
  LinkButton,
  Panel,
  ScreenFooter,
  Text,
  TopBar,
  colors,
  radii,
  screenStyles,
  useToast,
} from '@/design-system';
import type { Brand } from '@/domain/brand';
import { channelName } from '@/domain/catalog';
import { FORMAT_LABELS, type Idea, type IdeaStatus } from '@/domain/idea';
import { ChannelMark } from '@/features/brand-editors';
import { formatWeekdayLong, formatWeekdayShort } from '@/lib/dates';
import {
  useAddIdeaToPlan,
  useContentDrafts,
  useCreateContentFromIdea,
  usePlan,
  useSetIdeaStatus,
} from '@/services/queries';

import { IdeaSignal } from './IdeaParts';

const STATUS_BADGE: Record<IdeaStatus, { label: string; tone: 'neutral' | 'mint' | 'yellow' }> = {
  new: { label: 'Proposta', tone: 'yellow' },
  saved: { label: 'Salvata', tone: 'mint' },
  discarded: { label: 'Scartata', tone: 'neutral' },
};

function formatSize(bytes: number): string {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

export function IdeaDetailScreen({ brand, idea }: { brand: Brand; idea: Idea }) {
  const router = useRouter();
  const toast = useToast();
  const setStatus = useSetIdeaStatus(brand.id);
  const { data: slots = [] } = usePlan(brand.id);
  const { data: drafts = [] } = useContentDrafts(brand.id);
  const addToPlan = useAddIdeaToPlan(brand.id);
  const createContent = useCreateContentFromIdea(brand.id);
  const plannedSlot = slots.find((slot) => slot.ideaId === idea.id);
  /** Una bozza già scritta da questa idea e non ancora programmata. */
  const draft = drafts.find((candidate) => candidate.ideaId === idea.id);
  const theme = brand.themes.find((candidate) => candidate.id === idea.themeId) ?? null;
  const badge = STATUS_BADGE[idea.status];

  const close = () => (router.canGoBack() ? router.back() : router.replace('/ideas'));
  const change = (status: IdeaStatus, message: string) => {
    setStatus.mutate({ ideaId: idea.id, status });
    toast(message);
  };

  return (
    <View style={screenStyles.screen}>
      <TopBar
        left={<IconButton icon={ChevronLeft} accessibilityLabel="Indietro" onPress={close} />}
        title="Idea"
        right={
          <Badge tone={badge.tone} size="sm">
            {badge.label}
          </Badge>
        }
      />
      <ScrollView contentContainerStyle={screenStyles.content}>
        <Card>
          <View style={styles.stack}>
            <IdeaSignal idea={idea} />
            <Text variant="title">{idea.title}</Text>
            <View style={styles.angle}>
              <Text variant="label">{idea.angleLabel}</Text>
              <Text variant="bodyLarge" color={colors.textTitle}>
                {idea.angle}
              </Text>
            </View>
          </View>
        </Card>

        <Panel label="Perché adesso">
          <Text variant="body" color={colors.textTitle}>
            {idea.rationale}
          </Text>
        </Panel>

        <Panel label="Da dove nasce">
          {idea.source === null && (
            <Text variant="body" color={colors.textTitle}>
              Proposta dall’app leggendo il tuo Brand DNA. Segnale: {idea.signal.label}.
            </Text>
          )}
          {idea.source?.kind === 'prompt' && (
            <View style={styles.quote}>
              <Text variant="body" color={colors.textTitle}>
                «{idea.source.text}»
              </Text>
            </View>
          )}
          {idea.source?.kind === 'link' && (
            <>
              <Text variant="strongSmall" numberOfLines={2}>
                {idea.source.url}
              </Text>
              {idea.source.note ? <Text variant="caption">Nota: {idea.source.note}</Text> : null}
              <LinkButton
                label="Apri il link"
                onPress={() => {
                  if (idea.source?.kind !== 'link') return;
                  const url = /^https?:\/\//i.test(idea.source.url) ? idea.source.url : `https://${idea.source.url}`;
                  Linking.openURL(url).catch(() => toast('Non riesco ad aprire il link.'));
                }}
              />
            </>
          )}
          {idea.source?.kind === 'document' && (
            <>
              <Text variant="strongSmall">{idea.source.name}</Text>
              {idea.source.size ? <Text variant="caption">{formatSize(idea.source.size)}</Text> : null}
              {idea.source.note ? <Text variant="caption">Nota: {idea.source.note}</Text> : null}
            </>
          )}
        </Panel>

        <Panel label="Formati e canali">
          <ChipGroup>
            {idea.formats.map((format) => (
              <Chip key={format} size="sm" label={FORMAT_LABELS[format]} />
            ))}
          </ChipGroup>
          {idea.channels.length > 0 && (
            <View style={styles.row}>
              {idea.channels.map((channel) => (
                <ChannelMark key={channel} channel={channel} active size={30} />
              ))}
              <Text variant="caption" style={styles.flex}>
                {idea.channels.map(channelName).join(' · ')}
              </Text>
            </View>
          )}
        </Panel>

        {theme && (
          <Panel label="Tema">
            <View style={styles.row}>
              <Dot color={theme.color} />
              <Text variant="strongSmall" style={styles.flex}>
                {theme.name}
              </Text>
              <Text variant="strongSmall">{theme.weight}% del piano</Text>
            </View>
          </Panel>
        )}
      </ScrollView>

      <ScreenFooter>
        {plannedSlot ? (
          <Button
            size="lg"
            block
            variant="secondary"
            onPress={() => router.push({ pathname: '/content/[slotId]', params: { slotId: plannedSlot.id } })}>
            {`Nel piano · ${formatWeekdayShort(plannedSlot.date)} alle ${plannedSlot.time}`}
          </Button>
        ) : draft ? (
          <Button
            size="lg"
            block
            onPress={() => router.push({ pathname: '/draft/[contentId]', params: { contentId: draft.id } })}>
            Apri la bozza
          </Button>
        ) : (
          <>
            <Button
              size="lg"
              block
              busy={createContent.isPending}
              disabled={addToPlan.isPending}
              onPress={() =>
                createContent.mutate(idea.id, {
                  onSuccess: (content) => {
                    if (idea.status !== 'saved') setStatus.mutate({ ideaId: idea.id, status: 'saved' });
                    router.push({ pathname: '/draft/[contentId]', params: { contentId: content.id } });
                  },
                  onError: () => toast('Non riesco a preparare la bozza. Riprova.'),
                })
              }>
              {createContent.isPending ? 'Sto scrivendo la bozza…' : 'Genera contenuto'}
            </Button>
            <Button
              block
              variant="secondary"
              busy={addToPlan.isPending}
              disabled={createContent.isPending}
              onPress={() =>
                addToPlan.mutate(idea.id, {
                  onSuccess: (slot) => {
                    if (idea.status !== 'saved') setStatus.mutate({ ideaId: idea.id, status: 'saved' });
                    toast(`Nel piano: ${formatWeekdayLong(slot.date)} alle ${slot.time}.`);
                    router.push({ pathname: '/content/[slotId]', params: { slotId: slot.id } });
                  },
                  onError: () => toast('Non riesco ad aggiungerla al piano. Riprova.'),
                })
              }>
              {addToPlan.isPending ? 'Cerco il giorno giusto…' : 'Aggiungi al piano'}
            </Button>
          </>
        )}
        <View style={styles.secondary}>
          {idea.status === 'new' && (
            <>
              <Button
                variant="ghost"
                style={styles.flex}
                onPress={() => {
                  change('discarded', 'Idea scartata.');
                  close();
                }}>
                Scarta
              </Button>
              <Button variant="ghost" style={styles.flex} onPress={() => change('saved', 'Idea salvata.')}>
                Salva
              </Button>
            </>
          )}
          {idea.status === 'saved' && !plannedSlot && !draft && (
            <Button
              variant="ghost"
              block
              onPress={() => {
                change('discarded', 'Tolta dalle salvate.');
                close();
              }}>
              Togli dalle salvate
            </Button>
          )}
          {idea.status === 'discarded' && (
            <Button variant="secondary" block onPress={() => change('saved', 'Idea recuperata e salvata.')}>
              Recupera e salva
            </Button>
          )}
        </View>
      </ScreenFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  stack: { gap: 12 },
  angle: { gap: 6, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: 12 },
  quote: { backgroundColor: colors.surfaceSunken, borderRadius: radii.md, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secondary: { flexDirection: 'row', gap: 8 },
});
