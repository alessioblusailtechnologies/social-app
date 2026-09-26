import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import {
  AgentStage,
  FormScrollView,
  ProgressSegments,
  ScreenTitle,
  TopBar,
  screenStyles,
  useToast,
} from '@/design-system';
import type { ChannelId } from '@shared/domain/brand';
import { channelName } from '@shared/domain/catalog';
import { stageAspect } from '@shared/domain/visual';
import { useActiveBrand, useCreateContentFromIdea, useIdeas, useSetIdeaStatus } from '@/services/queries';

/**
 * La bozza mentre nasce: si arriva qui appena si chiede di scrivere, così i passi dell'AI si vedono
 * già nel primo passo del contenuto. Quando la bozza c'è, questa schermata lascia il posto alla sua.
 */
export default function WritingRoute() {
  const { ideaId, channels } = useLocalSearchParams<{ ideaId: string; channels?: string }>();
  const toast = useToast();
  const { brand } = useActiveBrand();
  const { data: ideas = [] } = useIdeas(brand?.id);
  const create = useCreateContentFromIdea(brand?.id ?? '');
  const setStatus = useSetIdeaStatus(brand?.id ?? '');
  const started = useRef(false);

  const idea = ideas.find((candidate) => candidate.id === ideaId) ?? null;
  const wanted = (channels?.split(',').filter(Boolean) ?? []) as ChannelId[];
  const names = (wanted.length > 0 ? wanted : (idea?.channels ?? [])).map(channelName).join(' e ');

  useEffect(() => {
    if (!brand || !ideaId || started.current) return;
    started.current = true;
    create.mutate(
      { ideaId, channels: wanted.length > 0 ? wanted : undefined },
      {
        onSuccess: (content) => {
          if (idea && idea.status !== 'saved') setStatus.mutate({ ideaId, status: 'saved' });
          router.replace({ pathname: '/draft/[contentId]', params: { contentId: content.id } });
        },
        onError: () => {
          toast('Non riesco a preparare la bozza. Riprova.');
          if (router.canGoBack()) router.back();
        },
      },
    );
    // Parte una volta sola, all'apertura: le dipendenze cambiano a ogni render ma la richiesta è già in volo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!brand) return <Redirect href="/onboarding" />;
  if (!ideaId) return <Redirect href="/ideas" />;

  return (
    <View style={screenStyles.screen}>
      <TopBar title="Passo 1 di 4 · Testo">
        <ProgressSegments count={4} current={0} />
      </TopBar>
      <FormScrollView contentContainerStyle={screenStyles.content}>
        <ScreenTitle
          title="Il testo"
          subtitle={names ? `Scrivo per ${names} seguendo la tua scheda voce.` : 'Scrivo seguendo la tua scheda voce.'}
        />
        <AgentStage steps={create.steps} waiting="Rileggo il profilo" aspect={stageAspect(idea?.formats[0] ?? 'post')} />
      </FormScrollView>
    </View>
  );
}
