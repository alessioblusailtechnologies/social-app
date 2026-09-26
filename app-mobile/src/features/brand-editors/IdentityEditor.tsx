import { Keyboard, StyleSheet, View } from 'react-native';

import { AgentStage, Badge, Button, FieldCard, Panel, Text, colors, useToast } from '@/design-system';
import type { BrandKind, Identity } from '@shared/domain/brand';
import { normalizeSite } from '@shared/lib/site';
import { apiErrorMessage } from '@/services';
import { useProfileJob, useReadWebsite } from '@/services/queries';
import type { WebsiteInsights } from '@shared/services/types';

import type { EditorProps } from './types';

type TextField = 'name' | 'role' | 'company' | 'sector';

const FIELDS: Record<BrandKind, { key: TextField; label: string; placeholder: string }[]> = {
  person: [
    { key: 'name', label: 'Nome e cognome', placeholder: 'Marco Sereni' },
    { key: 'role', label: 'Ruolo', placeholder: 'Founder' },
    { key: 'company', label: 'Azienda', placeholder: 'Nodo' },
  ],
  company: [
    { key: 'name', label: 'Nome dell’azienda', placeholder: 'Forno Rinaldi' },
    { key: 'sector', label: 'Settore', placeholder: 'Panificio artigianale' },
  ],
  client: [
    { key: 'name', label: 'Nome del cliente', placeholder: 'Studio Verdi' },
    { key: 'sector', label: 'Settore', placeholder: 'Architettura d’interni' },
  ],
};

const PITCH: Record<BrandKind, { label: string; placeholder: string }> = {
  person: {
    label: 'In una frase, cosa fai',
    placeholder: 'Es. metto l’AI nei processi noiosi delle PMI italiane, partendo da dove il dolore è misurabile',
  },
  company: {
    label: 'In una frase, cosa fate',
    placeholder: 'Es. pane a lievitazione naturale con grani del territorio, consegnato ogni mattina a bar e ristoranti',
  },
  client: {
    label: 'In una frase, cosa fa il cliente',
    placeholder: 'Es. progetta case piccole che sembrano grandi, con budget chiari fin dal primo incontro',
  },
};

const SITE_PLACEHOLDER: Record<BrandKind, string> = {
  person: 'nodo.it',
  company: 'fornorinaldi.it',
  client: 'studioverdi.it',
};

export function IdentityEditor({ value, onChange, context }: EditorProps<Identity>) {
  const toast = useToast();
  const readWebsite = useReadWebsite();
  /**
   * Una lettura può essere partita prima e non essersi ancora conclusa: il lavoro è sul server,
   * quindi tornando qui (o riaprendo l'app) si ritrova dov'era invece di essere persa.
   */
  const applyInsights = (insights: WebsiteInsights) => {
    context.onInsights?.(insights);
    toast('Ho letto il sito: temi, pubblico e palette sono già proposti nei prossimi passi.');
  };
  const resumed = useProfileJob<WebsiteInsights>(
    'website',
    applyInsights,
    Boolean(context.onInsights) && !readWebsite.isPending,
  );
  const reading = readWebsite.isPending || resumed.resuming;
  const readingSteps = readWebsite.isPending ? readWebsite.steps : resumed.steps;
  const site = normalizeSite(value.site);
  const alreadyRead = context.insights?.site === site;
  const canRead = Boolean(context.onInsights) && site.includes('.') && !alreadyRead;
  const pitchFromSite = Boolean(context.insights?.pitch) && value.pitch === context.insights?.pitch;

  const read = () => {
    // Giù la tastiera: si devono vedere i passi della lettura.
    Keyboard.dismiss();
    readWebsite.mutate(
      { site: value.site, identity: value },
      {
        onSuccess: applyInsights,
        onError: (error) => toast(apiErrorMessage(error, 'Non riesco a leggere il sito. Riprova tra poco.')),
      },
    );
  };

  return (
    <View style={styles.column}>
      {FIELDS[value.kind].map((field) => (
        <FieldCard
          key={field.key}
          label={field.label}
          value={value[field.key]}
          placeholder={field.placeholder}
          autoCapitalize={field.key === 'name' ? 'words' : 'sentences'}
          onChangeText={(text) => onChange({ ...value, [field.key]: text } as Identity)}
        />
      ))}

      <FieldCard
        label="Sito"
        value={value.site}
        placeholder={SITE_PLACEHOLDER[value.kind]}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(text) => onChange({ ...value, site: text })}
        action={
          canRead ? (
            <Button size="sm" variant="secondary" busy={reading} onPress={read}>
              {reading ? 'Leggo…' : 'Leggi'}
            </Button>
          ) : undefined
        }
      />

      {reading && (
        <Panel gap={12}>
          <Text variant="strongSmall">Sto leggendo {site}</Text>
          <AgentStage steps={readingSteps} waiting="Mi collego al sito" />
        </Panel>
      )}
      {alreadyRead && context.insights && !reading && (
        <Panel gap={8}>
          <Badge tone="mint" size="sm">
            Sito letto
          </Badge>
          <Text variant="body" color={colors.textTitle}>
            {context.insights.summary}
          </Text>
        </Panel>
      )}

      <FieldCard
        label={PITCH[value.kind].label}
        value={value.pitch}
        placeholder={reading ? 'La scrivo io appena finisco di leggere il sito…' : PITCH[value.kind].placeholder}
        hint={pitchFromSite ? 'L’ho scritta leggendo il sito: cambiala come vuoi.' : undefined}
        multiline
        onChangeText={(text) => onChange({ ...value, pitch: text })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 10 },
});
