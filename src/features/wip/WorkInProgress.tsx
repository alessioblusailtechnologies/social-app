import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { APP_NAME } from '@/config';
import {
  Badge,
  Card,
  Dot,
  IconButton,
  PatternGrid,
  ScreenTitle,
  Text,
  TopBar,
  colors,
  palette,
  screenStyles,
} from '@/design-system';

const DOT_COLORS = [palette.orange500, palette.navy700, palette.lime400, palette.mint400];

export interface WorkInProgressProps {
  /** Nome breve nella barra in alto, es. "Idee". */
  section: string;
  title: string;
  description: string;
  /** Cosa arriverà in questa sezione. */
  upcoming: string[];
  seed: number;
  /** Presente quando la schermata è una modale. */
  onClose?: () => void;
  /** Contenuto contestuale sopra la card, es. l'idea da cui si parte. */
  children?: ReactNode;
}

export function WorkInProgress({ section, title, description, upcoming, seed, onClose, children }: WorkInProgressProps) {
  return (
    <View style={screenStyles.screen}>
      <TopBar
        title={`${APP_NAME} · ${section}`}
        safeArea={!onClose || Platform.OS !== 'ios'}
        right={onClose ? <IconButton icon={X} accessibilityLabel="Chiudi" onPress={onClose} /> : undefined}
      />
      <ScrollView contentContainerStyle={screenStyles.content}>
        <ScreenTitle title={title} subtitle={description} />
        {children}
        <Card media={<PatternGrid columns={6} rows={3} seed={seed} />} mediaHeight={140}>
          <View style={styles.body}>
            <Badge tone="yellow">Work in progress</Badge>
            <Text variant="heading">Ci stiamo lavorando</Text>
            <Text variant="body">
              Questa sezione arriva nei prossimi rilasci. Parte dal Brand DNA che costruisci nel Profilo: più è preciso,
              meglio funzionerà.
            </Text>
            <View style={styles.list}>
              {upcoming.map((item, i) => (
                <View key={item} style={styles.row}>
                  <Dot color={DOT_COLORS[i % DOT_COLORS.length]} square={i % 2 === 0} />
                  <Text variant="body" color={colors.textTitle} style={styles.itemText}>
                    {item}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10 },
  list: { gap: 7, paddingTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemText: { flex: 1, lineHeight: 18 },
});
