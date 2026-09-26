-- Visivi dei contenuti: la coda dei lavori e il bucket dei file. Vedi docs/piano-visivi.md.
--
-- Lo stato che l'app vede (passo in corso, errore) sta nel contenuto, in `visual.design`:
-- questa tabella serve solo a chi esegue i lavori.
--  - l'API mette in coda dentro la transazione dell'utente, come `presenza_user`: una policy
--    gli lascia inserire e vedere solo le righe del proprio account, niente modifiche;
--  - il runner, nel processo dell'API, prende e chiude i lavori col ruolo proprietario
--    `presenza_app`, che la RLS non ferma.

create table presenza.visual_jobs (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references presenza.contents (id) on delete cascade,
  account_id uuid not null references presenza.accounts (id) on delete cascade,
  brand_id uuid not null references presenza.brands (id) on delete cascade,
  -- `create`: foto, scontorno e PNG; `render`: solo i PNG di una card già pronta.
  kind text not null check (kind in ('create', 'render')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

-- Al massimo un lavoro attivo per contenuto e tipo: una seconda richiesta non ne accoda un altro.
create unique index visual_jobs_active on presenza.visual_jobs (content_id, kind)
  where status in ('queued', 'running');

create index visual_jobs_queue on presenza.visual_jobs (created_at) where status = 'queued';

alter table presenza.visual_jobs enable row level security;

create policy visual_jobs_insert_own on presenza.visual_jobs
  for insert to presenza_user
  with check (account_id = presenza.current_account_id());

-- Serve a `insert … on conflict do nothing`, che guarda le righe attive dello stesso contenuto.
create policy visual_jobs_select_own on presenza.visual_jobs
  for select to presenza_user
  using (account_id = presenza.current_account_id());

grant select, insert on presenza.visual_jobs to presenza_user;

alter table presenza.visual_jobs owner to presenza_app;

-- ---------------------------------------------------------------------------
-- File dei visivi: foto generate e caricate, scontorni, PNG
-- ---------------------------------------------------------------------------

-- Privato: nel contenuto resta il percorso, l'API firma gli indirizzi quando lo restituisce.
-- Ci scrive solo il BE, con la service role key.
insert into storage.buckets (id, name, public)
values ('presenza-media', 'presenza-media', false)
on conflict (id) do nothing;
