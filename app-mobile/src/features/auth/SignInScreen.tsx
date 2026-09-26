import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { APP_NAME } from '@/config';
import {
  Button,
  FieldCard,
  FormScrollView,
  KeyboardScreen,
  ScreenFooter,
  ScreenTitle,
  SegmentedControl,
  Text,
  TopBar,
  screenStyles,
  useToast,
} from '@/design-system';
import { apiErrorMessage, auth } from '@/services';

type Mode = 'sign-in' | 'sign-up';

const MIN_PASSWORD_LENGTH = 8;

const COPY: Record<Mode, { title: string; subtitle: string; action: string; busy: string; hint: string; failure: string }> = {
  'sign-in': {
    title: 'Ciao, riprendiamo da dove eravamo',
    subtitle: 'Entra con email e password: brand, idee e piano sono dove li hai lasciati.',
    action: 'Accedi',
    busy: 'Accesso in corso…',
    hint: 'I dati stanno sull’account, non sul dispositivo: li ritrovi anche dal computer.',
    failure: 'Accesso non riuscito. Riprova.',
  },
  'sign-up': {
    title: 'Creiamo il tuo account',
    subtitle: 'Bastano email e password. Poi mi racconti per chi scrivo e costruiamo la presenza insieme.',
    action: 'Crea l’account',
    busy: 'Creo l’account…',
    hint: `Almeno ${MIN_PASSWORD_LENGTH} caratteri. Con la stessa email e password entri da qualsiasi dispositivo.`,
    failure: 'Non sono riuscito a creare l’account. Riprova.',
  },
};

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/** Accesso e registrazione in una schermata: quando la sessione si apre, le guardie delle route portano dentro. */
export function SignInScreen() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const copy = COPY[mode];

  const submit = useMutation({
    mutationFn: () => {
      if (!auth) throw new Error('Backend non configurato');
      return mode === 'sign-in'
        ? auth.signIn(email.trim(), password)
        : auth.signUp({ email: email.trim(), password, name: name.trim() || undefined });
    },
    onError: (error) => toast(apiErrorMessage(error, copy.failure)),
  });

  const reason = !looksLikeEmail(email)
    ? 'Scrivi un indirizzo email valido.'
    : password.length === 0
      ? 'Scrivi la password.'
      : mode === 'sign-up' && password.length < MIN_PASSWORD_LENGTH
        ? `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`
        : null;

  const send = () => {
    if (submit.isPending) return;
    if (reason) toast(reason);
    else submit.mutate();
  };

  return (
    <KeyboardScreen>
      <TopBar title={APP_NAME} />

      <FormScrollView contentContainerStyle={screenStyles.content}>
        <ScreenTitle title={copy.title} subtitle={copy.subtitle} />
        <SegmentedControl
          accessibilityLabel="Accedi o registrati"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'sign-in', label: 'Accedi' },
            { value: 'sign-up', label: 'Registrati' },
          ]}
        />

        <View style={styles.fields}>
          {mode === 'sign-up' && (
            <FieldCard
              label="Come ti chiami (facoltativo)"
              value={name}
              onChangeText={setName}
              placeholder="Es. Marco Sereni"
              autoComplete="name"
              textContentType="name"
            />
          )}
          <FieldCard
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="nome@esempio.it"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
          />
          <FieldCard
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            textContentType={mode === 'sign-in' ? 'password' : 'newPassword'}
            returnKeyType="go"
            onSubmitEditing={send}
          />
        </View>
        <Text variant="caption" style={screenStyles.groupLabel}>
          {copy.hint}
        </Text>
      </FormScrollView>

      <ScreenFooter>
        <Button
          size="lg"
          block
          disabled={reason !== null}
          busy={submit.isPending}
          onDisabledPress={send}
          onPress={send}>
          {submit.isPending ? copy.busy : copy.action}
        </Button>
      </ScreenFooter>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 10 },
});
