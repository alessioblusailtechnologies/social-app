import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ArrowUp } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import {
  Button,
  Chip,
  ChipGroup,
  IconButton,
  LinkButton,
  Panel,
  Sheet,
  StepList,
  SunkenInput,
  Text,
  colors,
  radii,
  useToast,
} from '@/design-system';
import type { Brand, ChannelId } from '@/domain/brand';
import { channelName } from '@/domain/catalog';
import type { Content } from '@/domain/content';
import {
  CARD_FIELD_LABELS,
  CARD_LIMITS,
  VISUAL_STEP_LABELS,
  brandKit,
  withDesignTemplates,
  imageRoles,
  templateSpec,
  toEdit,
  type CardField,
  type CardItem,
  type CardText,
  type VisualDesign,
  type VisualEdit,
  type VisualPage,
  type VisualStep,
} from '@/domain/visual';
import {
  useCreateVisual,
  useDesignVisual,
  useEditVisual,
  useProposeVisual,
  useRefreshVisual,
  useRegenerateImage,
  useUploadPhoto,
} from '@/services/queries';

import { CardView } from './CardView';

/** Oltre questa misura la foto non passa dal corpo della richiesta, né dallo storage del mock sul web. */
const PHOTO_LIMIT = 3_000_000;

type TextField = Exclude<CardField, 'items'>;

const FIELD_LIMITS: Record<TextField, number> = {
  kicker: CARD_LIMITS.kicker,
  headline: CARD_LIMITS.headline,
  body: CARD_LIMITS.body,
  value: CARD_LIMITS.value,
  author: CARD_LIMITS.author,
};

/** I passi che l'utente vede durante la creazione, fatti e da fare. */
function plannedSteps(design: VisualDesign): VisualStep[] {
  const roles = imageRoles(design);
  return [
    ...(roles.length > 0 && design.image.source === 'generated' ? (['image'] as const) : []),
    ...(roles.includes('cutout') ? (['cutout'] as const) : []),
    'render',
  ];
}

export interface VisualPanelProps {
  brand: Brand;
  content: Content;
  /** Il canale che l'utente sta guardando: decide il formato per cui si disegna. */
  channel: ChannelId;
  /** Approvato o pubblicato: si guarda e si scarica, non si modifica. */
  locked: boolean;
}

/**
 * Il visivo del contenuto, sotto il testo: la proposta che arriva con la bozza, la creazione
 * a passi e i ritocchi della card pronta. Niente parte senza che l'utente lo chieda.
 */
export function VisualPanel({ brand, content, channel, locked }: VisualPanelProps) {
  const toast = useToast();
  const editVisual = useEditVisual();
  const propose = useProposeVisual();
  const create = useCreateVisual();
  const regenerate = useRegenerateImage();
  const upload = useUploadPhoto();
  const refresh = useRefreshVisual();
  const draw = useDesignVisual();
  const [editing, setEditing] = useState<'text' | 'image' | null>(null);
  const [description, setDescription] = useState('');
  /** Aperto dal tap su «Disegna la card» quando i canali sono più d'uno: per quale formato? */
  const [asking, setAsking] = useState(false);
  const [instruction, setInstruction] = useState('');

  const design = content.visual.design;
  if (content.format === 'video') return null;

  if (!design) {
    if (locked) return null;
    return (
      <Panel label="Visivo" gap={10}>
        <Text variant="body" color={colors.textTitle}>
          Questa bozza è nata prima dei visivi. Ti propongo una card fatta con i suoi testi, nei colori del brand.
        </Text>
        <Button
          size="sm"
          variant="secondary"
          busy={propose.isPending}
          onPress={() => propose.mutate(content.id, { onError: () => toast('Non riesco a proporre il visivo. Riprova.') })}>
          Proponi il visivo
        </Button>
      </Panel>
    );
  }

  const kit = withDesignTemplates(brandKit(brand), design);
  const cover = design.pages[0];
  const spec = templateSpec(cover.templateId);
  // Il layout è quello disegnato per questa card. Non ci sono layout fra cui scegliere: per
  // cambiarlo si chiede un altro disegno.
  const coverTemplate = cover.custom ? kit.line.templates.find((template) => template.id === cover.custom) : undefined;
  const layoutName = coverTemplate?.name ?? spec.name;
  const roles = imageRoles(design);
  const usesImage = roles.length > 0;
  const pagesLabel = design.pages.length > 1 ? ` · ${design.pages.length} slide` : '';

  const apply = (patch: Partial<VisualEdit>, done?: string) =>
    editVisual.mutate(
      { content, edit: { ...toEdit(design), ...patch } },
      {
        onSuccess: () => {
          if (done) toast(done);
        },
        onError: () => toast('Modifica non salvata. Riprova.'),
      },
    );

  const startCreation = () => create.mutate(content.id, { onError: () => toast('Non riesco a creare il visivo. Riprova.') });

  /** Disegna la card da capo. Canali vuoti = deve reggere in tutti i formati del contenuto. */
  const startDesign = (channels: ChannelId[]) => {
    setAsking(false);
    const asked = instruction.trim();
    setInstruction('');
    draw.mutate(
      { contentId: content.id, channels, ...(asked && { instruction: asked }) },
      { onError: () => toast('Non riesco a disegnare la card. Riprova.') },
    );
  };

  /** Coi canali multipli si chiede: un layout per il verticale in quadrato raramente regge. */
  const askOrDesign = () => (content.channels.length > 1 ? setAsking(true) : startDesign([]));

  /**
   * La barra del disegno, come in «Come appare»: si dice come la si vuole e la freccia disegna.
   * È l'unico modo di cambiare il layout, perché il layout lo scrive l'AI: non ci sono alternative
   * pronte fra cui scegliere.
   */
  const drawBar = (
    <View style={styles.askRow}>
      <SunkenInput
        style={styles.flex}
        value={instruction}
        onChangeText={setInstruction}
        placeholder={design.templates?.length ? 'Cosa cambio? es. titolo più grande' : 'Come la vuoi? es. senza foto, titolo grande'}
        returnKeyType="send"
        onSubmitEditing={askOrDesign}
      />
      <IconButton
        icon={ArrowUp}
        variant="solid"
        size={40}
        iconSize={18}
        accessibilityLabel={design.templates?.length ? 'Ridisegna la card' : 'Disegna la card'}
        onPress={askOrDesign}
      />
    </View>
  );

  /** La domanda dei formati: sale dal basso, si risponde e si chiude. */
  const channelSheet = (
    <Sheet
      visible={asking}
      onClose={() => setAsking(false)}
      title="Per quali formati?"
      hint="Lo stesso layout esce nei formati dei canali che scegli: più ne metti, più deve reggere.">
      <Button block variant="secondary" onPress={() => startDesign([channel])}>
        {`Solo ${channelName(channel)}`}
      </Button>
      <Button block onPress={() => startDesign([])}>
        {`Tutti e ${content.channels.length} i canali`}
      </Button>
    </Sheet>
  );

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, base64: true, exif: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    const dataUri = asset.base64 ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}` : asset.uri;
    if (!dataUri.startsWith('data:')) {
      toast('Non riesco a leggere la foto. Prova con un’altra.');
      return;
    }
    if (dataUri.length > PHOTO_LIMIT) {
      toast('La foto è troppo pesante: scegline una più leggera.');
      return;
    }
    upload.mutate(
      { contentId: content.id, dataUri },
      {
        onSuccess: () => toast(roles.includes('cutout') ? 'Foto caricata: la scontorno quando crei il visivo.' : 'Foto caricata.'),
        onError: () => toast('Foto non caricata. Riprova.'),
      },
    );
  };

  const download = () => {
    for (const render of design.renders) void Linking.openURL(render.file.url);
  };

  if (locked) {
    return (
      <Panel label="Visivo" gap={6}>
        <Text variant="strongSmall">{design.status === 'ready' ? `${layoutName}${pagesLabel}` : 'Nessun visivo creato'}</Text>
        {design.renders.length > 0 && <LinkButton label="Scarica le immagini" onPress={download} />}
      </Panel>
    );
  }

  if (editing === 'text') {
    return (
      <CardTextEditor
        design={design}
        busy={editVisual.isPending}
        onCancel={() => setEditing(null)}
        onSave={(pages) =>
          editVisual.mutate(
            { content, edit: { ...toEdit(design), pages } },
            {
              onSuccess: () => {
                setEditing(null);
                toast('Testi della card aggiornati.');
              },
              onError: () => toast('Testi non salvati. Riprova.'),
            },
          )
        }
      />
    );
  }

  // Mentre l'AI disegna i passi arrivano dallo stream: si vede cosa sta facendo, non uno skeleton.
  if (draw.isPending) {
    return (
      <Panel label="Visivo" gap={10}>
        <StepList steps={draw.steps} waiting="Guardo le card che hai approvato" />
      </Panel>
    );
  }

  if (design.status === 'creating') {
    // Qui i passi arrivano dal polling, non da uno stream: si mostra quello che è già successo.
    const steps = plannedSteps(design);
    const current = design.step ? steps.indexOf(design.step) : -1;
    return (
      <Panel label="Visivo" gap={10}>
        <StepList
          steps={steps
            .slice(0, current < 0 ? steps.length : current + 1)
            .map((step, i) => ({ id: step, label: VISUAL_STEP_LABELS[step], status: i < current ? ('done' as const) : ('running' as const) }))}
          waiting="Preparo il visivo"
        />
        <Text variant="caption">Intanto puoi ritoccare il testo.</Text>
      </Panel>
    );
  }

  if (design.status === 'ready') {
    return (
      <Panel label="Visivo" gap={12}>
        {channelSheet}
        {design.nextPages && (
          <View style={styles.notice}>
            <Text variant="strongSmall">Il testo è cambiato</Text>
            <Text variant="caption">La card ha ancora i testi della bozza di prima.</Text>
            <LinkButton
              label={refresh.isPending ? 'Aggiorno…' : 'Aggiorna il visivo'}
              onPress={() =>
                refresh.mutate(content.id, {
                  onSuccess: () => toast('Card aggiornata con i testi nuovi.'),
                  onError: () => toast('Non riesco ad aggiornare il visivo. Riprova.'),
                })
              }
            />
          </View>
        )}

        <View style={styles.row}>
          <Text variant="strongSmall" style={styles.flex} numberOfLines={1}>
            {layoutName}
            {pagesLabel}
          </Text>
          <LinkButton label="Modifica i testi" onPress={() => setEditing('text')} />
        </View>

        {usesImage && (
          <View style={styles.links}>
            {design.image.source === 'generated' && (
              <LinkButton
                label={regenerate.isPending ? 'Rifaccio la foto…' : 'Rifai la foto'}
                onPress={() => regenerate.mutate(content.id, { onError: () => toast('Non riesco a rifare la foto. Riprova.') })}
              />
            )}
            <LinkButton label="Usa una tua foto" onPress={pickPhoto} />
          </View>
        )}

        {drawBar}

        <View style={styles.links}>
          <LinkButton label="Torna alla proposta" tone="muted" onPress={() => apply({ reopen: true })} />
          {design.renders.length > 0 && <LinkButton label="Scarica le immagini" onPress={download} />}
        </View>
      </Panel>
    );
  }

  // Proposta, o creazione non riuscita.
  const uploaded = design.image.source === 'upload' && design.image.photo;
  const explanation = !usesImage
    ? 'Compongo la card con i colori e i caratteri del brand.'
    : uploaded
      ? roles.includes('cutout')
        ? 'Scontorno la tua foto e compongo la card.'
        : 'Compongo la card con la tua foto.'
      : roles.includes('cutout')
        ? 'Genero la foto, scontorno il soggetto e compongo la card.'
        : 'Genero la foto e la metto nella card, con i colori e i caratteri del brand.';

  return (
    <Panel label="Visivo" gap={12}>
      {channelSheet}

      {/* La card com'è, disegnata dal vivo: non c'è motivo di mostrarne uno schizzo. */}
      <View style={styles.proposal}>
        <CardView
          kit={kit}
          page={cover}
          pageIndex={0}
          pageCount={design.pages.length}
          photoUrl={design.image.photo?.url || null}
          cutoutUrl={null}
          aspect="4:5"
          width={72}
        />
        <View style={[styles.flex, styles.stack]}>
          <Text variant="strongSmall">
            {layoutName}
            {pagesLabel}
          </Text>
          <Text variant="body" color={colors.textTitle} numberOfLines={3}>
            {cover.text.headline || cover.text.body || 'Solo la foto, con la firma del brand.'}
          </Text>
          <View style={styles.links}>
            <LinkButton label="Modifica i testi" onPress={() => setEditing('text')} />
          </View>
        </View>
      </View>

      {usesImage && (
        <View style={[styles.section, styles.divider]}>
          <Text variant="label">{roles.includes('cutout') ? 'Soggetto da scontornare' : 'Foto'}</Text>
          {uploaded ? (
            <View style={styles.row}>
              <Image source={{ uri: design.image.photo?.url }} contentFit="cover" style={styles.thumb} accessibilityLabel="La tua foto" />
              <View style={[styles.flex, styles.stack]}>
                <Text variant="strongSmall">La tua foto</Text>
                <View style={styles.links}>
                  <LinkButton label="Cambiala" onPress={pickPhoto} />
                  <LinkButton label="Torna alla foto generata" tone="muted" onPress={() => apply({ source: 'generated' })} />
                </View>
              </View>
            </View>
          ) : editing === 'image' ? (
            <>
              <SunkenInput
                multiline
                minHeight={80}
                value={description}
                onChangeText={setDescription}
                maxLength={CARD_LIMITS.description}
                autoFocus
                accessibilityLabel="Cosa si vede nella foto"
              />
              <Text variant="caption">Descrivi cosa si vede, non lo stile: quello lo prendo dal brand. Niente scritte.</Text>
              <View style={styles.actions}>
                <Button size="sm" variant="ghost" onPress={() => setEditing(null)}>
                  Annulla
                </Button>
                <Button
                  size="sm"
                  disabled={!description.trim()}
                  onPress={() => {
                    apply({ description });
                    setEditing(null);
                  }}>
                  Salva
                </Button>
              </View>
            </>
          ) : (
            <>
              <Text variant="body" color={colors.textTitle}>
                {design.image.description || 'Nessuna descrizione: scrivi cosa vuoi vedere.'}
              </Text>
              {design.image.photo && <Text variant="caption">La foto c’è già: la riuso.</Text>}
              <View style={styles.links}>
                <LinkButton
                  label="Modifica"
                  onPress={() => {
                    setDescription(design.image.description);
                    setEditing('image');
                  }}
                />
                <LinkButton label="Usa una tua foto" onPress={pickPhoto} />
              </View>
            </>
          )}
        </View>
      )}

      {design.status === 'failed' && (
        <Text variant="caption" color={colors.warning}>
          {design.error ?? 'La creazione non è riuscita.'}
        </Text>
      )}

      {drawBar}

      <Button
        block
        busy={create.isPending || upload.isPending}
        disabled={editing === 'image' || (usesImage && !uploaded && !design.image.photo && !design.image.description.trim())}
        onDisabledPress={() => toast(editing === 'image' ? 'Salva prima la descrizione.' : 'Scrivi cosa si vede nella foto, o usa una tua foto.')}
        onPress={startCreation}>
        {design.status === 'failed' ? 'Riprova a creare il visivo' : 'Crea il visivo'}
      </Button>
      <Text variant="caption" align="center">
        {explanation}
      </Text>
    </Panel>
  );
}

function CardTextEditor({
  design,
  busy,
  onCancel,
  onSave,
}: {
  design: VisualDesign;
  busy: boolean;
  onCancel: () => void;
  onSave: (pages: VisualPage[]) => void;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pages, setPages] = useState(design.pages);
  const page = pages[pageIndex];
  const spec = templateSpec(page.templateId);
  const { items } = page.text;
  const maxItems = spec.items?.max ?? CARD_LIMITS.items;

  const update = (text: Partial<CardText>) =>
    setPages((all) => all.map((candidate, i) => (i === pageIndex ? { ...candidate, text: { ...candidate.text, ...text } } : candidate)));
  const setItem = (index: number, patch: Partial<CardItem>) =>
    update({ items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });

  return (
    <Panel label="Testi della card" gap={12}>
      {pages.length > 1 && (
        <ChipGroup>
          {pages.map((_, i) => (
            <Chip
              key={i}
              size="sm"
              label={i === 0 ? 'Copertina' : i === pages.length - 1 ? 'Chiusura' : `Slide ${i + 1}`}
              selected={i === pageIndex}
              onPress={() => setPageIndex(i)}
            />
          ))}
        </ChipGroup>
      )}

      {spec.fields.length === 0 && <Text variant="caption">Questo layout non ha testi: il messaggio sta nella didascalia.</Text>}

      {spec.fields.map((field) =>
        field === 'items' ? (
          <View key="items" style={styles.field}>
            <Text variant="label">{CARD_FIELD_LABELS.items}</Text>
            {items.map((item, i) => (
              <View key={i} style={styles.item}>
                {spec.items?.titled && (
                  <SunkenInput
                    value={item.title}
                    onChangeText={(title) => setItem(i, { title })}
                    maxLength={CARD_LIMITS.itemTitle}
                    placeholder={`Titolo del passo ${i + 1}`}
                    accessibilityLabel={`Titolo del passo ${i + 1}`}
                  />
                )}
                <SunkenInput
                  value={item.body}
                  onChangeText={(body) => setItem(i, { body })}
                  maxLength={CARD_LIMITS.itemBody}
                  placeholder={`Punto ${i + 1}`}
                  accessibilityLabel={`Punto ${i + 1}`}
                />
                <LinkButton label="Togli" tone="muted" onPress={() => update({ items: items.filter((_, j) => j !== i) })} />
              </View>
            ))}
            {items.length < maxItems && (
              <LinkButton label="Aggiungi un punto" onPress={() => update({ items: [...items, { title: '', body: '' }] })} />
            )}
          </View>
        ) : (
          <View key={field} style={styles.field}>
            <Text variant="label">{CARD_FIELD_LABELS[field]}</Text>
            <SunkenInput
              value={page.text[field]}
              onChangeText={(value) => update({ [field]: value } as Partial<CardText>)}
              maxLength={FIELD_LIMITS[field]}
              multiline={field === 'headline' || field === 'body'}
              minHeight={64}
              accessibilityLabel={CARD_FIELD_LABELS[field]}
            />
          </View>
        ),
      )}

      <Text variant="caption">Se togli un testo che il layout richiede, passo al layout più adatto a quelli che restano.</Text>
      <View style={styles.actions}>
        <Button size="sm" variant="ghost" onPress={onCancel}>
          Annulla
        </Button>
        <Button size="sm" busy={busy} onPress={() => onSave(pages)}>
          Salva i testi
        </Button>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  askRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stack: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  links: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 18 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  proposal: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  section: { gap: 6 },
  divider: { borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: 12 },
  notice: { gap: 2, padding: 12, borderRadius: radii.md, backgroundColor: colors.surfaceSunken },
  thumb: { width: 48, height: 60, borderRadius: radii.sm },
  field: { gap: 6 },
  item: { gap: 4 },
});
