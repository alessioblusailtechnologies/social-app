import { X } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import {
  Dot,
  IconButton,
  LinkButton,
  Panel,
  SegmentedControl,
  SkeletonLines,
  Text,
  colors,
  fontFamily,
  screenStyles,
  useToast,
} from '@/design-system';
import type { Theme } from '@shared/domain/brand';
import {
  addTheme,
  createThemes,
  MAX_THEMES,
  removeTheme,
  setThemeLevel,
  THEME_LEVELS,
  themeLevel,
} from '@shared/domain/themes';
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

  const rename = (index: number, name: string) =>
    onChange(value.map((theme, i) => (i === index ? { ...theme, name } : theme)));

  return (
    <View style={styles.column}>
      {context.insights && (
        <Text variant="caption" style={screenStyles.groupLabel}>
          Proposti leggendo {context.insights.site}, dal più importante. Rinominali e scegli quanto spesso usarli.
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
          <SegmentedControl
            accessibilityLabel={`Quanto spesso esce ${theme.name || 'questo tema'}`}
            options={THEME_LEVELS}
            value={themeLevel(theme)}
            onChange={(level) => onChange(setThemeLevel(value, index, level))}
          />
        </Panel>
      ))}

      <View style={styles.footerRow}>
        <Text variant="caption" style={styles.flex}>
          Nel piano escono più spesso i temi «Spesso», meno quelli «Di rado».
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
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 },
  flex: { flex: 1 },
});
