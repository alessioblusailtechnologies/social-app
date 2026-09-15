import { WorkInProgress } from '@/features/wip/WorkInProgress';

export default function HomeScreen() {
  return (
    <WorkInProgress
      section="Home"
      title="La tua giornata"
      description="Cosa esce oggi, cosa aspetta la tua approvazione e cosa manca al piano della settimana."
      upcoming={[
        'Contenuti in coda e prossime uscite',
        'Promemoria per approvazioni e scene da girare',
        'Equilibrio dei temi rispetto ai pesi scelti',
      ]}
      seed={23}
    />
  );
}
