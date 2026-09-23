-- I lavori dell'AI: ogni generazione lunga vive qui, non dentro una richiesta HTTP.
--
-- Prima una generazione era la risposta di una POST: se il telefono andava in standby o si
-- cambiava pagina, la connessione cadeva e il risultato si perdeva (il server intanto finiva
-- il lavoro e lo scriveva nel vuoto). Adesso la rotta accoda e risponde con l'id; il runner
-- esegue; l'app rilegge il lavoro finché è in corso e si riattacca quando vuole.
--
-- Come per `visual_jobs`: l'API accoda dentro la transazione dell'utente (la policy lascia
-- inserire e vedere solo le righe del proprio account), il runner prende e chiude i lavori
-- col ruolo proprietario `presenza_app`, che la RLS non ferma.

create table presenza.jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references presenza.accounts (id) on delete cascade,
  -- Nullo durante l'onboarding: il sito si legge prima che il brand esista.
  brand_id uuid references presenza.brands (id) on delete cascade,
  -- Quale generazione: il runner ha una funzione per ognuna (`src/jobs/kinds.ts`).
  kind text not null,
  -- Su cosa lavora (contenuto, uscita, brand): serve all'app per ritrovare un lavoro aperto
  -- quando riapre la schermata. Nullo per le generazioni dell'onboarding, che non hanno ancora
  -- un oggetto: lì basta il tipo, perché i lavori sono già solo quelli dell'account.
  ref uuid,
  -- Il corpo della richiesta, già validato dallo schema del tipo: il runner lo rilegge.
  input jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'canceled')),
  -- I passi dell'AI man mano, gli stessi che prima viaggiavano in SSE.
  steps jsonb not null default '[]'::jsonb,
  result jsonb,
  error jsonb,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index jobs_queue on presenza.jobs (created_at) where status = 'queued';

-- «C'è un lavoro aperto per questo?»: è la domanda che l'app fa ogni volta che apre una schermata,
-- per tipo (l'onboarding) o per oggetto (un contenuto, un'uscita, un brand).
create index jobs_open on presenza.jobs (account_id, kind, created_at desc) where status in ('queued', 'running');
create index jobs_open_ref on presenza.jobs (account_id, ref, created_at desc) where status in ('queued', 'running');

alter table presenza.jobs enable row level security;

create policy jobs_insert_own on presenza.jobs
  for insert to presenza_user
  with check (account_id = presenza.current_account_id());

create policy jobs_select_own on presenza.jobs
  for select to presenza_user
  using (account_id = presenza.current_account_id());

-- L'unica modifica che l'utente può fare è fermare un proprio lavoro; il resto lo scrive il runner.
create policy jobs_cancel_own on presenza.jobs
  for update to presenza_user
  using (account_id = presenza.current_account_id())
  with check (account_id = presenza.current_account_id());

grant select, insert on presenza.jobs to presenza_user;
-- Solo lo stato: passi, risultato ed errore li scrive il runner, e un utente non può fingerli.
grant update (status) on presenza.jobs to presenza_user;

alter table presenza.jobs owner to presenza_app;
