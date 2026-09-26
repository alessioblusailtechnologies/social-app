-- Presenza: le tabelle dell'app nel progetto Supabase condiviso con Velia.
--
-- Tutto sta nello schema dedicato `presenza`: niente in `public`, niente in
-- comune con `velia`. Due ruoli:
--  - `presenza_app` è l'utente con cui si collega il BE ed è proprietario delle
--    sole tabelle di Presenza. La password la imposta `tools/set-app-password.mjs`,
--    fuori dal repository;
--  - `presenza_user` è il ruolo senza login che il BE assume dentro ogni
--    transazione fatta per conto di un utente: lì valgono le policy RLS.
--
-- Il ruolo condiviso `authenticated` non riceve niente: lo schema non è esposto
-- dalla Data API e l'unica strada verso queste righe è il BE.

do $$
begin
  if not exists (select from pg_roles where rolname = 'presenza_app') then
    create role presenza_app login;
  end if;
  if not exists (select from pg_roles where rolname = 'presenza_user') then
    create role presenza_user nologin;
  end if;
end $$;

-- Chi applica le migrazioni deve poter assegnare le tabelle al ruolo dell'app.
grant presenza_app to postgres;
-- Il BE entra in `presenza_user` con `set local role`, senza ereditarne i privilegi fuori da lì.
grant presenza_user to presenza_app with inherit false, set true;

create schema if not exists presenza authorization presenza_app;

-- ---------------------------------------------------------------------------
-- Registro delle migrazioni di Presenza (quello di Supabase è di Velia)
-- ---------------------------------------------------------------------------

create table presenza.schema_migrations (
  version text primary key,
  name text not null,
  applied_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Funzioni di appoggio
-- ---------------------------------------------------------------------------

-- L'account della transazione: il BE mette i claim del JWT dove li mette PostgREST.
-- Letti qui e non con `auth.uid()`, così `presenza_user` non dipende dallo schema `auth`.
create function presenza.current_account_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
$$;

create function presenza.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account e brand
-- ---------------------------------------------------------------------------

-- Il profilo Presenza di un utente di Supabase Auth. Lo crea la registrazione:
-- gli utenti di Velia dello stesso progetto non ne hanno uno finché non si registrano.
create table presenza.accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null default '',
  active_brand_id uuid,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger accounts_updated_at
  before update on presenza.accounts
  for each row execute function presenza.touch_updated_at();

-- Le sezioni del Brand DNA restano documenti: il FE le modifica una alla volta, intere.
create table presenza.brands (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references presenza.accounts (id) on delete cascade,
  identity jsonb not null,
  positioning jsonb not null,
  channels jsonb not null,
  themes jsonb not null,
  voice jsonb not null,
  visual jsonb not null,
  -- "references" è una parola riservata di SQL.
  refs jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Le chiavi composte con l'account impediscono di agganciare righe di un altro account.
  unique (id, account_id)
);

create index brands_account on presenza.brands (account_id, created_at);

create trigger brands_updated_at
  before update on presenza.brands
  for each row execute function presenza.touch_updated_at();

alter table presenza.accounts
  add constraint accounts_active_brand foreign key (active_brand_id, id)
  references presenza.brands (id, account_id) on delete set null (active_brand_id);

-- ---------------------------------------------------------------------------
-- Idee, uscite del piano, contenuti
-- ---------------------------------------------------------------------------

create table presenza.ideas (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  account_id uuid not null,
  title text not null,
  angle_label text not null,
  angle text not null,
  rationale text not null,
  theme_id text,
  signal jsonb not null,
  source jsonb,
  formats text[] not null,
  channels text[] not null,
  status text not null default 'new' check (status in ('new', 'saved', 'discarded')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (brand_id, account_id) references presenza.brands (id, account_id) on delete cascade,
  unique (id, account_id)
);

create index ideas_brand on presenza.ideas (brand_id, created_at desc);

create table presenza.slots (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  account_id uuid not null,
  publish_date date not null,
  publish_time text not null check (publish_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  channels text[] not null,
  theme_id text,
  idea_id uuid,
  content_title text,
  status text not null check (status in ('empty', 'toPrepare', 'toApprove', 'scheduled', 'published')),
  origin text not null check (origin in ('session', 'manual', 'idea')),
  created_at timestamptz not null default now(),
  foreign key (brand_id, account_id) references presenza.brands (id, account_id) on delete cascade,
  foreign key (idea_id, account_id) references presenza.ideas (id, account_id) on delete set null (idea_id),
  unique (id, account_id)
);

create index slots_brand on presenza.slots (brand_id, publish_date, publish_time);

create table presenza.contents (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  account_id uuid not null,
  slot_id uuid,
  idea_id uuid,
  brief jsonb,
  title text not null,
  theme_id text,
  channels text[] not null,
  format text not null check (format in ('post', 'carousel', 'video', 'article')),
  variants jsonb not null,
  visual jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  revision integer not null default 0,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (brand_id, account_id) references presenza.brands (id, account_id) on delete cascade,
  foreign key (slot_id, account_id) references presenza.slots (id, account_id) on delete set null (slot_id),
  foreign key (idea_id, account_id) references presenza.ideas (id, account_id) on delete set null (idea_id)
);

-- Un'uscita ha al massimo un contenuto.
create unique index contents_slot on presenza.contents (slot_id) where slot_id is not null;
create index contents_brand on presenza.contents (brand_id, updated_at desc);

create trigger contents_updated_at
  before update on presenza.contents
  for each row execute function presenza.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Consumi dell'AI: li scrive solo il BE, per account e per operazione
-- ---------------------------------------------------------------------------

create table presenza.ai_usage (
  id bigint generated always as identity primary key,
  account_id uuid references presenza.accounts (id) on delete set null,
  brand_id uuid,
  task text not null,
  model text not null,
  outcome text not null check (outcome in ('ok', 'error')),
  error text,
  duration_ms integer not null,
  turns integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create index ai_usage_account on presenza.ai_usage (account_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: dentro `presenza_user` ogni account vede e tocca solo le sue righe
-- ---------------------------------------------------------------------------

alter table presenza.schema_migrations enable row level security;
alter table presenza.accounts enable row level security;
alter table presenza.brands enable row level security;
alter table presenza.ideas enable row level security;
alter table presenza.slots enable row level security;
alter table presenza.contents enable row level security;
alter table presenza.ai_usage enable row level security;

create policy accounts_own on presenza.accounts
  for all to presenza_user
  using (id = presenza.current_account_id())
  with check (id = presenza.current_account_id());

create policy brands_own on presenza.brands
  for all to presenza_user
  using (account_id = presenza.current_account_id())
  with check (account_id = presenza.current_account_id());

create policy ideas_own on presenza.ideas
  for all to presenza_user
  using (account_id = presenza.current_account_id())
  with check (account_id = presenza.current_account_id());

create policy slots_own on presenza.slots
  for all to presenza_user
  using (account_id = presenza.current_account_id())
  with check (account_id = presenza.current_account_id());

create policy contents_own on presenza.contents
  for all to presenza_user
  using (account_id = presenza.current_account_id())
  with check (account_id = presenza.current_account_id());

-- Registro e consumi: nessuna policy, quindi niente righe per `presenza_user`.

grant usage on schema presenza to presenza_user;
-- L'account nasce e sparisce dal lato sistema (registrazione, cancellazione in Auth).
grant select, update on presenza.accounts to presenza_user;
grant select, insert, update, delete on presenza.brands, presenza.ideas, presenza.slots, presenza.contents
  to presenza_user;

-- ---------------------------------------------------------------------------
-- Tutto a `presenza_app`
-- ---------------------------------------------------------------------------

alter function presenza.current_account_id() owner to presenza_app;
alter function presenza.touch_updated_at() owner to presenza_app;
alter table presenza.schema_migrations owner to presenza_app;
alter table presenza.accounts owner to presenza_app;
alter table presenza.brands owner to presenza_app;
alter table presenza.ideas owner to presenza_app;
alter table presenza.slots owner to presenza_app;
alter table presenza.contents owner to presenza_app;
alter table presenza.ai_usage owner to presenza_app;
