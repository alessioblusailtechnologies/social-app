import { Keyboard, StyleSheet, View } from 'react-native';

import { Badge, Button, FieldCard, Panel, SkeletonLines, StepList, Text, colors, useToast } from '@/design-system';
import type { BrandKind, Identity } from '@/domain/brand';
import { normalizeSite } from '@/lib/site';
import { apiErrorMessage } from '@/services';
import { useReadWebsite } from '@/services/queries';

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
        onSuccess: (insights) => {
          context.onInsights?.(insights);
          toast('Ho letto il sito: temi, pubblico e palette sono già proposti nei prossimi passi.');
        },
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
            <Button size="sm" variant="secondary" busy={readWebsite.isPending} onPress={read}>
              {readWebsite.isPending ? 'Leggo…' : 'Leggi'}
            </Button>
          ) : undefined
        }
      />

      {readWebsite.isPending && (
        <Panel gap={12}>
          <Text variant="strongSmall">Sto leggendo {site}</Text>
          {readWebsite.steps.length > 0 ? <StepList steps={readWebsite.steps} /> : <SkeletonLines widths={[88, 64]} />}
        </Panel>
      )}
      {alreadyRead && context.insights && !readWebsite.isPending && (
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
        placeholder={readWebsite.isPending ? 'La scrivo io appena finisco di leggere il sito…' : PITCH[value.kind].placeholder}
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
