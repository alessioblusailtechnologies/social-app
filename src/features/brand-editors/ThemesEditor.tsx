import { Minus, Plus, X } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import {
  Dot,
  IconButton,
  LinkButton,
  Panel,
  SkeletonLines,
  Text,
  WeightBar,
  colors,
  fontFamily,
  screenStyles,
  useToast,
} from '@/design-system';
import type { Theme } from '@/domain/brand';
import {
  addTheme,
  createThemes,
  MAX_THEMES,
  removeTheme,
  setThemeWeight,
  totalWeight,
  WEIGHT_STEP,
} from '@/domain/themes';
import { useSuggestThemes } from '@/services/queries';

import type { EditorProps } from './types';

export function ThemesEditor({ value, onChange, context }: EditorProps<Theme[]>) {
  const toast = useToast();
  const suggest = useSuggestThemes();
  const requested = useRef(false);
  const { identity } = context.draft;

  // Senza temi (nessun sito letto) li propongo a partire dalla frase su cosa fa il brand.
  useEffect(() => {
    if (value.length > 0 || requested.current) return;
    requested.current = true;
    suggest.mutate(identity, {
      onSuccess: (names) => onChange(createThemes(names)),
      onError: () => toast('Non riesco a proporre i temi: aggiungili a mano.'),
    });
  }, [value.length, identity, suggest, onChange, toast]);

  if (value.length === 0) {
    return (
      <Panel gap={12}>
        {suggest.isError ? (
          <>
            <Text variant="strongSmall">Nessun tema per ora</Text>
            <LinkButton label="Aggiungi un tema" onPress={() => onChange(addTheme(value))} />
          </>
        ) : (
          <>
            <Text variant="strongSmall">Sto proponendo i temi a partire da quello che fai</Text>
            <SkeletonLines widths={[80, 64, 72, 50]} />
          </>
        )}
      </Panel>
    );
  }

  const total = totalWeight(value);
  const rename = (index: number, name: string) =>
    onChange(value.map((theme, i) => (i === index ? { ...theme, name } : theme)));

  return (
    <View style={styles.column}>
      {context.insights && (
        <Text variant="caption" style={screenStyles.groupLabel}>
          Proposti leggendo {context.insights.site}. Rinominali come vuoi.
        </Text>
      )}

      {value.map((theme, index) => (
        <Panel key={theme.id} gap={10}>
          <View style={styles.headerRow}>
            <Dot color={theme.color} />
            <TextInput
              value={theme.name}
              onChangeText={(name) => rename(index, name)}
              placeholder="Nome del tema"
              placeholderTextColor={colors.textBody}
              accessibilityLabel={`Nome del tema ${index + 1}`}
              style={styles.nameInput}
            />
            <Text variant="value">{theme.weight}%</Text>
            {value.length > 1 && (
              <IconButton
                icon={X}
                variant="ghost"
                size={32}
                iconSize={16}
                accessibilityLabel={`Rimuovi ${theme.name || 'il tema'}`}
                onPress={() => onChange(removeTheme(value, index))}
              />
            )}
          </View>
          <View style={styles.weightRow}>
            <IconButton
              icon={Minus}
              variant="outline"
              size={36}
              width={44}
              accessibilityLabel={`Meno spazio a ${theme.name || 'questo tema'}`}
              disabled={value.length === 1 || theme.weight === 0}
              onPress={() => onChange(setThemeWeight(value, index, theme.weight - WEIGHT_STEP))}
            />
            <WeightBar weight={theme.weight} color={theme.color} />
            <IconButton
              icon={Plus}
              variant="outline"
              size={36}
              width={44}
              accessibilityLabel={`Più spazio a ${theme.name || 'questo tema'}`}
              disabled={value.length === 1 || theme.weight === 100}
              onPress={() => onChange(setThemeWeight(value, index, theme.weight + WEIGHT_STEP))}
            />
          </View>
        </Panel>
      ))}

      <View style={styles.footerRow}>
        <Text variant="caption" color={total === 100 ? colors.textBody : colors.warning} style={styles.flex}>
          {total === 100 ? 'La somma resta 100: gli altri temi si adattano.' : `Somma ${total}%: sistemala prima di continuare.`}
        </Text>
        {value.length < MAX_THEMES && <LinkButton label="Aggiungi un tema" onPress={() => onChange(addTheme(value))} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nameInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 28,
    padding: 0,
    fontFamily: fontFamily.semibold,
    fontSize: 13,
    color: colors.textTitle,
    outlineWidth: 0,
  },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 },
  flex: { flex: 1 },
});
