import { ScrollView, View } from 'react-native';

import { APP_NAME } from '@/config';
import { Button, ScreenFooter, ScreenTitle, Text, TopBar, screenStyles } from '@/design-system';
import { apiErrorMessage } from '@/services';
import { endSession } from '@/services/http/session';

/**
 * Si è dentro ma il workspace non arriva: meglio dirlo che mandare all'onboarding un account
 * che i suoi brand li ha già.
 */
export function ServerUnavailable({ error, retrying, onRetry }: { error: unknown; retrying: boolean; onRetry: () => void }) {
  return (
    <View style={screenStyles.screen}>
      <TopBar title={APP_NAME} />
      <ScrollView contentContainerStyle={screenStyles.content}>
        <ScreenTitle
          title="Non riesco a caricare i tuoi dati"
          subtitle={apiErrorMessage(error, 'Il servizio non risponde. Riprova tra poco.')}
        />
        <Text variant="caption" style={screenStyles.groupLabel}>
          Brand, idee e piano restano sull’account: non si è perso niente.
        </Text>
      </ScrollView>
      <ScreenFooter>
        <Button size="lg" block busy={retrying} onPress={onRetry}>
          {retrying ? 'Riprovo…' : 'Riprova'}
        </Button>
        <Button variant="ghost" block onPress={endSession}>
          Esci
        </Button>
      </ScreenFooter>
    </View>
  );
}
