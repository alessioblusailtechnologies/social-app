import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './Text';
import { colors, motion, radii, shadows } from '@shared/design-system/tokens';

type ShowToast = (message: string) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

const DURATION = 3600;

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const show: ShowToast = (message) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message });
    if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(message);
    timer.current = setTimeout(() => setToast(null), DURATION);
  };

  return (
    <ToastContext value={show}>
      {children}
      <View style={[styles.host, { bottom: insets.bottom + 100 }]}>
        {toast && (
          <Animated.View
            key={toast.id}
            entering={FadeIn.duration(motion.base)}
            exiting={FadeOut.duration(motion.base)}
            accessibilityLiveRegion="polite"
            style={styles.toast}>
            <Text variant="body" color={colors.textOnDark} style={styles.text}>
              {toast.message}
            </Text>
          </Animated.View>
        )}
      </View>
    </ToastContext>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 80,
    pointerEvents: 'none',
  },
  toast: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    boxShadow: shadows.toast,
  },
  text: { lineHeight: 17 },
});
