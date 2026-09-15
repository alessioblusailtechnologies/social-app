import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  CheckboxMark,
  Chip,
  ChipGroup,
  IconButton,
  Panel,
  PatternGrid,
  ProgressSegments,
  RadioMark,
  ScreenTitle,
  ShapeTile,
  SkeletonLines,
  StackedBar,
  StatusDot,
  Switch,
  Text,
  TopBar,
  WeightBar,
  palette,
  radii,
  screenStyles,
  typography,
  useToast,
  type BadgeTone,
  type ButtonVariant,
  type ShapeKind,
  type TypographyVariant,
} from '@/design-system';

const VARIANTS: ButtonVariant[] = ['primary', 'accent', 'secondary', 'ghost'];
const TONES: BadgeTone[] = ['navy', 'coral', 'lime', 'mint', 'yellow', 'neutral'];
const KINDS: ShapeKind[] = ['circle', 'half', 'quarter', 'leaf', 'donut', 'dot', 'solid'];
const SHAPE_COLORS = [palette.orange500, palette.navy700, palette.lime400, palette.mint400];

/** Catalogo dei componenti, per confrontarli con il mock HTML. */
export default function DesignSystemScreen() {
  const router = useRouter();
  const toast = useToast();
  const [seed, setSeed] = useState(19);
  const [selected, setSelected] = useState(true);
  const [switchOn, setSwitchOn] = useState(true);

  return (
    <View style={screenStyles.screen}>
      <TopBar
        left={
          <IconButton
            icon={ChevronLeft}
            accessibilityLabel="Indietro"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        }
        title="Modulo · catalogo"
      />
      <ScrollView contentContainerStyle={[screenStyles.content, styles.content]}>
        <ScreenTitle
          title="Design system"
          subtitle="Token e componenti portati dal mock HTML. Il seed 19 riproduce la composizione dell'onboarding."
        />

        <Card media={<PatternGrid columns={6} rows={3} seed={seed} />} mediaHeight={160}>
          <View style={styles.row}>
            <Text variant="heading" style={styles.flex}>
              PatternGrid · seed {seed}
            </Text>
            <Button size="sm" variant="secondary" onPress={() => setSeed((current) => current + 1)}>
              Altro seed
            </Button>
          </View>
        </Card>

        <Panel label="Colori">
          <View style={styles.wrap}>
            {Object.entries(palette).map(([name, value]) => (
              <View key={name} style={styles.swatchItem}>
                <View style={[styles.swatch, { backgroundColor: value }]} />
                <Text variant="caption">{name}</Text>
              </View>
            ))}
          </View>
        </Panel>

        <Panel label="Tipografia">
          {(Object.keys(typography) as TypographyVariant[]).map((variant) => (
            <Text key={variant} variant={variant}>
              {variant} · Costruiamo la presenza
            </Text>
          ))}
        </Panel>

        <Panel label="Bottoni">
          {VARIANTS.map((variant) => (
            <Button key={variant} variant={variant} block>
              {variant}
            </Button>
          ))}
          <View style={styles.inverse}>
            <Button variant="inverse" block>
              inverse
            </Button>
          </View>
          <View style={styles.row}>
            <Button size="sm">Piccolo</Button>
            <Button size="md">Medio</Button>
          </View>
          <Button size="lg" block disabled onDisabledPress={() => toast('Disabilitato, ma spiega perché.')}>
            Disabilitato
          </Button>
        </Panel>

        <Panel label="Badge">
          <View style={styles.wrap}>
            {TONES.map((tone) => (
              <Badge key={tone} tone={tone}>
                {tone}
              </Badge>
            ))}
            <Badge outline>outline</Badge>
          </View>
        </Panel>

        <Panel label="Controlli">
          <ChipGroup>
            <Chip label="Selezionabile" selected={selected} onPress={() => setSelected(!selected)} />
            <Chip label="Rimovibile" size="sm" onRemove={() => toast('Rimosso.')} />
            <Chip label="Statico" size="sm" />
          </ChipGroup>
          <View style={styles.row}>
            <Switch value={switchOn} onValueChange={setSwitchOn} accessibilityLabel="Interruttore di esempio" />
            <RadioMark selected />
            <RadioMark selected={false} />
            <CheckboxMark checked />
            <CheckboxMark checked={false} />
            <StatusDot tone="complete" />
            <StatusDot tone="partial" />
            <StatusDot tone="missing" />
          </View>
        </Panel>

        <Panel label="Avanzamento">
          <ProgressSegments count={8} current={3} />
          <View style={styles.row}>
            <WeightBar weight={40} color={palette.orange500} />
          </View>
          <StackedBar
            segments={[
              { value: 40, color: palette.navy700 },
              { value: 30, color: palette.orange500 },
              { value: 20, color: palette.lime400 },
              { value: 10, color: palette.mint400 },
            ]}
          />
          <SkeletonLines widths={[90, 60]} />
        </Panel>

        <Panel label="Moduli">
          <View style={styles.wrap}>
            {KINDS.map((kind, i) => (
              <ShapeTile key={kind} kind={kind} color={SHAPE_COLORS[i % SHAPE_COLORS.length]} ground={palette.grey100} size={48} />
            ))}
          </View>
        </Panel>

        <Button block onPress={() => toast('Questo è un toast: resta a schermo 3,6 secondi.')}>
          Mostra un toast
        </Button>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 48 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatchItem: { alignItems: 'center', gap: 4, width: 72 },
  swatch: { width: 40, height: 40, borderRadius: radii.md, borderWidth: 1, borderColor: palette.grey100 },
  inverse: { backgroundColor: palette.navy700, borderRadius: radii.lg, padding: 12 },
});
