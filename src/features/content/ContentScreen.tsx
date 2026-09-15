import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Chip,
  ChipGroup,
  IconButton,
  LinkButton,
  Panel,
  ScreenFooter,
  SegmentedControl,
  SkeletonLines,
  SunkenInput,
  Text,
  TopBar,
  colors,
  screenStyles,
  useToast,
} from '@/design-system';
import { currentVoiceCard, isConnected, type Brand, type ChannelId } from '@/domain/brand';
import { channelName } from '@/domain/catalog';
import { CHANNEL_LIMITS, checkVoice, REWRITE_INSTRUCTIONS } from '@/domain/content';
import { FORMAT_LABELS, type IdeaFormat } from '@/domain/idea';
import { SLOT_STATUS_LABELS, type PlanSlot } from '@/domain/plan';
import { ChannelMark } from '@/features/brand-editors';
import { SLOT_TONES } from '@/features/plan/PlanParts';
import { formatWeekdayLong, formatWeekdayShort } from '@/lib/dates';
import {
  useApproveContent,
  useEditVariant,
  useIdeas,
  usePrepareContent,
  useReopenContent,
  useRewriteVariant,
  useSlotContent,
} from '@/services/queries';

import { PostPreview, ScenesPanel, VoicePanel } from './ContentParts';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function ContentScreen({ brand, slot }: { brand: Brand; slot: PlanSlot }) {
  const router = useRouter();
  const toast = useToast();
  const { data: ideas = [] } = useIdeas(brand.id);
  const contentQuery = useSlotContent(slot.id);
  const prepare = usePrepareContent(brand.id);
  const approve = useApproveContent(brand.id);
  const reopen = useReopenContent(brand.id);
  const editVariant = useEditVariant();
  const rewrite = useRewriteVariant();

  const [channel, setChannel] = useState<ChannelId>(slot.channels[0]);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState('');

  const idea = ideas.find((candidate) => candidate.id === slot.ideaId) ?? null;
  const content = contentQuery.data ?? null;
  const variant = content?.variants.find((candidate) => candidate.channel === channel) ?? content?.variants[0] ?? null;
  const format: IdeaFormat = content?.format ?? idea?.formats[0] ?? 'post';
  const published = slot.status === 'published';
  const approved = content?.status === 'approved';
  const locked = approved || published;
  const when = `${formatWeekdayShort(slot.date)} alle ${slot.time}`;
  const unconnected = slot.channels.filter((candidate) => !isConnected(brand.channels[candidate]));
  const missing = content ? slot.channels.filter((candidate) => !content.variants.some((v) => v.channel === candidate)) : [];
  const text = editing ? draftText : (variant?.text ?? '');
  const check = checkVoice(text, currentVoiceCard(brand.voice), variant ? CHANNEL_LIMITS[variant.channel] : undefined);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/plan'));

  const runPrepare = (nextFormat?: IdeaFormat) =>
    prepare.mutate(
      { slotId: slot.id, format: nextFormat },
      {
        onSuccess: ({ content: prepared }) => {
          setEditing(false);
          toast(prepared.revision > 0 ? 'Bozza rifatta.' : 'Bozza pronta: rivedila e approvala.');
        },
        onError: () => toast('Non riesco a preparare la bozza. Riprova.'),
      },
    );

  const saveEdit = () => {
    if (!content || !variant) return;
    editVariant.mutate(
      { contentId: content.id, channel: variant.channel, text: draftText.trim() },
      {
        onSuccess: () => {
          setEditing(false);
          toast('Testo aggiornato.');
        },
        onError: () => toast('Modifica non salvata. Riprova.'),
      },
    );
  };

  const approveContent = () => {
    if (!content) return;
    approve.mutate(content.id, {
      onSuccess: () => {
        const names = unconnected.map(channelName).join(' e ');
        toast(
          unconnected.length > 0
            ? `Programmata per ${when}. ${names} non è collegato: all’orario ti ricordo di pubblicarla a mano.`
            : `Programmata per ${when}.`,
        );
        close();
      },
      onError: () => toast('Approvazione non riuscita. Riprova.'),
    });
  };

  const channelNames = slot.channels.map(channelName).join(' e ');

  return (
    <KeyboardAvoidingView style={screenStyles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopBar
        left={<IconButton icon={ChevronLeft} accessibilityLabel="Indietro" onPress={close} />}
        title="Contenuto"
        right={
          <Badge tone={SLOT_TONES[slot.status]} size="sm">
            {SLOT_STATUS_LABELS[slot.status]}
          </Badge>
        }
      />

      <ScrollView contentContainerStyle={screenStyles.content} keyboardShouldPersistTaps="handled">
        <Panel gap={10}>
          <View style={styles.row}>
            <Text variant="strongSmall" style={styles.flex}>
              {capitalize(formatWeekdayLong(slot.date))} · {slot.time}
            </Text>
            <View style={styles.marks}>
              {slot.channels.map((candidate) => (
                <ChannelMark key={candidate} channel={candidate} active size={24} />
              ))}
            </View>
          </View>
          {idea ? (
            <View style={styles.idea}>
              <Text variant="label">Dall’idea</Text>
              <Text variant="strong">{idea.title}</Text>
              <LinkButton
                label="Apri l’idea"
                onPress={() => router.push({ pathname: '/idea/[id]', params: { id: idea.id } })}
              />
            </View>
          ) : (
            <Text variant="body">Questa uscita non ha ancora un’idea: sceglila dal piano.</Text>
          )}
        </Panel>

        {(contentQuery.isPending || prepare.isPending) && (
          <Panel gap={12}>
            <Text variant="strongSmall">
              {prepare.isPending ? `Sto scrivendo per ${channelNames}` : 'Carico la bozza'}
            </Text>
            <SkeletonLines widths={[96, 88, 100, 72, 60]} />
          </Panel>
        )}

        {!contentQuery.isPending && !prepare.isPending && !content && idea && (
          <Panel label="Da preparare" gap={10}>
            <Text variant="body" color={colors.textTitle}>
              Scrivo il testo per {channelNames} seguendo la tua scheda voce e preparo il visivo del formato.
            </Text>
            {idea.formats.length > 1 && (
              <Text variant="caption">
                Formato: {FORMAT_LABELS[format]}. Potrai cambiarlo dopo.
              </Text>
            )}
          </Panel>
        )}

        {content && variant && !prepare.isPending && (
          <>
            {slot.channels.length > 1 && (
              <SegmentedControl
                accessibilityLabel="Canale"
                value={channel}
                onChange={(next) => {
                  setEditing(false);
                  setChannel(next);
                }}
                options={slot.channels.map((candidate) => ({ value: candidate, label: channelName(candidate) }))}
              />
            )}

            {missing.length > 0 && !locked && (
              <Panel gap={6}>
                <Text variant="caption" color={colors.textTitle}>
                  La bozza non include {missing.map(channelName).join(' e ')}: rifalla per aggiungerli.
                </Text>
                <LinkButton label="Rifai la bozza" onPress={() => runPrepare()} />
              </Panel>
            )}

            {editing ? (
              <Panel label={`Testo per ${channelName(variant.channel)}`} gap={10}>
                <SunkenInput
                  multiline
                  minHeight={220}
                  value={draftText}
                  onChangeText={setDraftText}
                  autoFocus
                  accessibilityLabel={`Testo per ${channelName(variant.channel)}`}
                />
                <Text
                  variant="caption"
                  color={draftText.length > CHANNEL_LIMITS[variant.channel] ? colors.warning : colors.textBody}>
                  {draftText.length}/{CHANNEL_LIMITS[variant.channel]} caratteri
                </Text>
                <View style={styles.actions}>
                  <Button size="sm" variant="ghost" onPress={() => setEditing(false)}>
                    Annulla
                  </Button>
                  <Button size="sm" busy={editVariant.isPending} disabled={!draftText.trim()} onPress={saveEdit}>
                    Salva il testo
                  </Button>
                </View>
              </Panel>
            ) : (
              <PostPreview brand={brand} variant={variant} format={content.format} visual={content.visual} when={when} />
            )}

            {!locked && !editing && (
              <Panel label="Ritocca" gap={10}>
                <ChipGroup>
                  {REWRITE_INSTRUCTIONS.map((instruction) => (
                    <Chip
                      key={instruction}
                      size="sm"
                      label={instruction}
                      onPress={() =>
                        !rewrite.isPending &&
                        rewrite.mutate(
                          { contentId: content.id, channel: variant.channel, instruction },
                          {
                            onSuccess: () => toast(`Riscritto: ${instruction.toLowerCase()}.`),
                            onError: () => toast('Riscrittura non riuscita. Riprova.'),
                          },
                        )
                      }
                    />
                  ))}
                </ChipGroup>
                <View style={styles.links}>
                  <LinkButton
                    label="Modifica il testo a mano"
                    onPress={() => {
                      setDraftText(variant.text);
                      setEditing(true);
                    }}
                  />
                  {rewrite.isPending && <Text variant="caption">Riscrivo…</Text>}
                </View>
              </Panel>
            )}

            <VoicePanel check={check} />

            {content.format === 'video' && <ScenesPanel scenes={content.visual.scenes} />}

            {!locked && idea && idea.formats.length > 1 && (
              <Panel label="Formato" gap={8}>
                <ChipGroup>
                  {idea.formats.map((candidate) => (
                    <Chip
                      key={candidate}
                      size="sm"
                      label={FORMAT_LABELS[candidate]}
                      selected={candidate === content.format}
                      onPress={() => candidate !== content.format && runPrepare(candidate)}
                    />
                  ))}
                </ChipGroup>
                <Text variant="caption">Cambiare formato rifà la bozza.</Text>
              </Panel>
            )}

            {locked && (
              <Panel label={published ? 'Pubblicata' : 'Programmata'} gap={6}>
                <Text variant="body" color={colors.textTitle}>
                  {published ? `Uscita ${when} su ${channelNames}.` : `Esce ${when} su ${channelNames}.`}
                </Text>
                {!published && unconnected.length > 0 && (
                  <Text variant="caption">
                    {unconnected.map(channelName).join(' e ')} non è collegato: all’orario ti ricordo di pubblicarla a mano.
                  </Text>
                )}
              </Panel>
            )}
          </>
        )}
      </ScrollView>

      {!published && idea && !contentQuery.isPending && (
        <ScreenFooter>
          {!content && (
            <Button size="lg" block busy={prepare.isPending} onPress={() => runPrepare()}>
              {prepare.isPending ? 'Sto preparando la bozza…' : 'Prepara la bozza'}
            </Button>
          )}
          {content && !approved && (
            <>
              <Button
                size="lg"
                block
                variant="accent"
                disabled={editing || prepare.isPending}
                busy={approve.isPending}
                onDisabledPress={() => toast(editing ? 'Salva prima il testo.' : 'Aspetta che la bozza sia pronta.')}
                onPress={approveContent}>
                {approve.isPending ? 'Programmo…' : 'Approva e programma'}
              </Button>
              <Button variant="ghost" block busy={prepare.isPending} onPress={() => runPrepare()}>
                Rifai la bozza
              </Button>
            </>
          )}
          {content && approved && (
            <Button
              size="lg"
              block
              variant="secondary"
              busy={reopen.isPending}
              onPress={() =>
                reopen.mutate(content.id, {
                  onSuccess: () => toast('Di nuovo in bozza: approvala quando è pronta.'),
                  onError: () => toast('Non riesco a riaprire la bozza. Riprova.'),
                })
              }>
              Riapri la bozza
            </Button>
          )}
        </ScreenFooter>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marks: { flexDirection: 'row', gap: 4 },
  idea: { gap: 4, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  links: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 18 },
});
