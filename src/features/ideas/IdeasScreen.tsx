import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Chip,
  Dot,
  LinkButton,
  Panel,
  SegmentedControl,
  StepList,
  Text,
  TopBar,
  colors,
  layout,
  palette,
  screenStyles,
  useToast,
} from '@/design-system';
import type { Brand } from '@/domain/brand';
import { ideaPreferences, topScore, type Idea } from '@/domain/idea';
import { useGenerateIdeas, useIdeas, useSetIdeaStatus } from '@/services/queries';
import type { AiStep } from '@/services/types';

import { IdeaDeck, type IdeaDecision } from './IdeaDeck';
import { IdeaListItem } from './IdeaParts';
import { useIdeasView } from './store';

export function IdeasScreen({ brand }: { brand: Brand }) {
  const router = useRouter();
  const toast = useToast();
  const { view, setView, themeId, setThemeId } = useIdeasView();
  const ideasQuery = useIdeas(brand.id);
  const generate = useGenerateIdeas(brand.id);
  const setStatus = useSetIdeaStatus(brand.id);
  const autoRequested = useRef(false);
  const [lastDecision, setLastDecision] = useState<{ idea: Idea; decision: IdeaDecision } | null>(null);

  const ideas = ideasQuery.data ?? [];

  // Al primo accesso l'app propone subito un gruppo di idee leggendo il Brand DNA.
  useEffect(() => {
    if (!ideasQuery.isSuccess || ideas.length > 0 || autoRequested.current) return;
    autoRequested.current = true;
    generate.mutate(8, { onError: () => toast('Non riesco a proporre idee adesso. Riprova tra poco.') });
  }, [ideasQuery.isSuccess, ideas.length, generate, toast]);

  // Un filtro su un tema che non esiste più (brand cambiato, tema rimosso) si azzera.
  useEffect(() => {
    if (themeId && !brand.themes.some((theme) => theme.id === themeId)) setThemeId(null);
  }, [themeId, brand.themes, setThemeId]);

  const inTheme = (idea: Idea) => !themeId || idea.themeId === themeId;
  // Le proposte più vecchie in cima: un nuovo gruppo si accoda senza scavalcare la carta che stai guardando.
  const proposals = ideas
    .filter((idea) => idea.status === 'new' && inTheme(idea))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const saved = ideas
    .filter((idea) => idea.status === 'saved' && inTheme(idea))
    .sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''));
  const themeOf = (idea: Idea) => brand.themes.find((theme) => theme.id === idea.themeId) ?? null;

  const decide = (idea: Idea, decision: IdeaDecision) => {
    setStatus.mutate({ ideaId: idea.id, status: decision });
    setLastDecision({ idea, decision });
  };

  const undo = () => {
    if (!lastDecision) return;
    setStatus.mutate({ ideaId: lastDecision.idea.id, status: 'new' });
    setLastDecision(null);
  };

  const proposeMore = () =>
    generate.mutate(6, {
      onSuccess: (created) => toast(`${created.length} nuove proposte in fondo al mazzo.`),
      onError: () => toast('Non riesco a proporre idee adesso. Riprova tra poco.'),
    });

  const openIdea = (idea: Idea) => router.push({ pathname: '/idea/[id]', params: { id: idea.id } });

  const preferences = ideaPreferences(ideas);
  const favoriteTheme = brand.themes.find((theme) => theme.id === topScore(preferences.themeScores));
  const learningHint =
    preferences.decided >= 3
      ? `Hai tenuto ${preferences.saved} idee su ${preferences.decided}${favoriteTheme ? `, soprattutto su «${favoriteTheme.name}»` : ''}. Le prossime proposte ne tengono conto.`
      : 'Scorri a destra per salvare, a sinistra per scartare: imparo dalle tue scelte.';

  const firstLoad = ideasQuery.isPending || (generate.isPending && ideas.length === 0);

  return (
    <View style={screenStyles.screen}>
      <TopBar
        left={<Text variant="title">Idee</Text>}
        right={
          <Button size="sm" icon={<Plus size={14} color={palette.white} strokeWidth={2.5} />} onPress={() => router.push('/new-idea')}>
            Nuova idea
          </Button>
        }
      />

      <View style={styles.controls}>
        <SegmentedControl
          accessibilityLabel="Vista delle idee"
          value={view}
          onChange={setView}
          options={[
            { value: 'proposals', label: `Proposte · ${proposals.length}` },
            { value: 'saved', label: `Salvate · ${saved.length}` },
          ]}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <Chip size="sm" label="Tutti i temi" selected={!themeId} onPress={() => setThemeId(null)} />
          {brand.themes.map((theme) => (
            <Chip
              key={theme.id}
              size="sm"
              label={theme.name}
              selected={themeId === theme.id}
              leading={<Dot color={theme.color} size={8} />}
              onPress={() => setThemeId(themeId === theme.id ? null : theme.id)}
            />
          ))}
        </ScrollView>
      </View>

      {firstLoad ? (
        <View style={styles.padded}>
          <Generating steps={generate.steps} />
        </View>
      ) : view === 'proposals' ? (
        <View style={[styles.padded, styles.flex]}>
          {generate.isPending && proposals.length === 0 ? (
            <Generating steps={generate.steps} />
          ) : proposals.length === 0 ? (
            <EmptyState
              title={themeId ? 'Nessuna proposta su questo tema' : 'Hai visto tutte le proposte'}
              body="Te ne preparo altre dal tuo Brand DNA, oppure scrivi tu da dove partire."
              primary={{ label: 'Proponi altre idee', onPress: proposeMore, busy: generate.isPending }}
              secondary={{ label: 'Scrivi un’idea tua', onPress: () => router.push('/new-idea') }}
            />
          ) : (
            <>
              <IdeaDeck ideas={proposals} themes={brand.themes} onDecide={decide} onOpen={openIdea} />
              <View style={styles.deckFooter}>
                <Text variant="caption" align="center">
                  {learningHint}
                </Text>
                <View style={styles.links}>
                  {lastDecision && (
                    <LinkButton
                      tone="muted"
                      label={lastDecision.decision === 'saved' ? 'Annulla il salvataggio' : 'Recupera l’ultima scartata'}
                      onPress={undo}
                    />
                  )}
                  <LinkButton
                    label={generate.isPending ? 'Sto preparando altre idee…' : 'Proponi altre idee'}
                    onPress={() => !generate.isPending && proposeMore()}
                  />
                </View>
              </View>
            </>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.padded, styles.list]}>
          {saved.length === 0 ? (
            <EmptyState
              title={themeId ? 'Nessuna idea salvata su questo tema' : 'Nessuna idea salvata'}
              body="Scorri le proposte e tieni quelle che ti convincono, oppure scrivine una tu."
              primary={{ label: 'Guarda le proposte', onPress: () => setView('proposals') }}
              secondary={{ label: 'Scrivi un’idea tua', onPress: () => router.push('/new-idea') }}
            />
          ) : (
            saved.map((idea) => (
              <IdeaListItem key={idea.id} idea={idea} theme={themeOf(idea)} onPress={() => openIdea(idea)} />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Generating({ steps }: { steps: AiStep[] }) {
  return (
    <Panel gap={12} style={styles.generating}>
      <Text variant="strongSmall">Preparo le idee dal tuo Brand DNA</Text>
      <StepList steps={steps} waiting="Rileggo il profilo" />
    </Panel>
  );
}

interface EmptyAction {
  label: string;
  onPress: () => void;
  busy?: boolean;
}

function EmptyState({
  title,
  body,
  primary,
  secondary,
}: {
  title: string;
  body: string;
  primary: EmptyAction;
  secondary: EmptyAction;
}) {
  return (
    <Card>
      <View style={styles.empty}>
        <Text variant="heading">{title}</Text>
        <Text variant="body">{body}</Text>
        <Button block busy={primary.busy} onPress={primary.onPress}>
          {primary.busy ? 'Sto preparando le idee…' : primary.label}
        </Button>
        <Button block variant="ghost" onPress={secondary.onPress}>
          {secondary.label}
        </Button>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  controls: { gap: 10, paddingBottom: 12 },
  filters: { gap: 7, paddingHorizontal: layout.screenGutter },
  padded: { paddingHorizontal: layout.screenGutter, paddingBottom: 16 },
  list: { gap: 10 },
  generating: { borderRadius: 24 },
  deckFooter: { gap: 2, paddingTop: 8 },
  links: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', columnGap: 18 },
  empty: { gap: 10 },
});
