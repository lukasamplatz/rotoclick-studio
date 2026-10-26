-- =====================================================================
--  RotoClick Studio — database (Supabase / PostgreSQL)
--  Eseguire UNA volta in Supabase: SQL Editor → incolla tutto → Run.
--
--  Principio: le tabelle non sono leggibili direttamente dal browser
--  (RLS attiva, nessuna policy). Tutto passa da funzioni (RPC) che
--  controllano chi sta chiamando: laboratorio, rivenditore, agente, admin.
--  Il server non riceve mai scansioni né casi: solo il conteggio degli export.
-- =====================================================================

-- ---------- Impostazioni (una sola riga) ----------------------------
create table if not exists impostazioni (
  id                int primary key default 1 check (id = 1),
  prezzo_caso       numeric(8,2) not null default 2.00,   -- prezzo al laboratorio per export oltre i casi inclusi
  quota_rivenditore numeric(8,2) not null default 1.00,   -- parte del rivenditore (Dentag fattura la differenza)
  casi_per_kit      int          not null default 10,     -- casi inclusi per ogni codice kit
  key_clinic_conta  boolean      not null default true,   -- anche l'export Key Clinic conta come caso
  aggiornato_il     timestamptz  not null default now()
);
insert into impostazioni (id) values (1) on conflict do nothing;

-- ---------- Rivenditori ---------------------------------------------
create table if not exists rivenditori (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  piva       text,
  email      text,
  paese      text default 'IT',
  is_dentag  boolean not null default false,   -- Dentag stessa: vendite dirette e agenti (incassa i 2 € interi)
  attivo     boolean not null default true,
  note       text,
  creato_il  timestamptz not null default now()
);
create unique index if not exists rivenditori_un_solo_dentag on rivenditori (is_dentag) where is_dentag;
insert into rivenditori (nome, paese, is_dentag)
  select 'Dentag Italia S.r.l.', 'IT', true
  where not exists (select 1 from rivenditori where is_dentag);

-- ---------- Accessi al back-end (admin, rivenditori, agenti) ---------
-- Un invito abilita un'email: quando quella persona si registra riceve il ruolo.
create table if not exists inviti (
  email          text primary key,                 -- sempre minuscola
  ruolo          text not null check (ruolo in ('admin','rivenditore','agente')),
  rivenditore_id uuid references rivenditori(id),
  nome           text,
  creato_il      timestamptz not null default now()
);

create table if not exists profili (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  email          text not null,
  ruolo          text not null check (ruolo in ('admin','rivenditore','agente','laboratorio','disabilitato')),
  rivenditore_id uuid references rivenditori(id),
  nome           text,
  creato_il      timestamptz not null default now()
);

-- ---------- Laboratori (clienti che usano il tool) -------------------
create table if not exists laboratori (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references auth.users(id) on delete set null,
  ragione_sociale text not null,
  piva            text,
  email           text not null,
  rivenditore_id  uuid references rivenditori(id),        -- fissato dal PRIMO codice inserito
  agente_id       uuid references profili(user_id) on delete set null,
  collegato_il    timestamptz,
  casi_gratuiti   int not null default 0,
  bloccato        boolean not null default false,
  creato_il       timestamptz not null default now()
);

-- ---------- Codici dei kit (voucher) ---------------------------------
create table if not exists codici (
  codice          text primary key,                        -- normalizzato: solo A-Z 0-9, maiuscolo
  codice_stampato text not null,                           -- come appare sull'etichetta
  tipo            text not null check (tipo in ('K-LAB','K-CLINIC')),
  rivenditore_id  uuid references rivenditori(id),         -- senza rivenditore il codice non funziona
  agente_id       uuid references profili(user_id) on delete set null,
  lotto           text,
  stato           text not null default 'disponibile' check (stato in ('disponibile','usato','revocato')),
  laboratorio_id  uuid references laboratori(id),
  usato_il        timestamptz,
  creato_il       timestamptz not null default now()
);

create table if not exists tentativi_voucher (
  id             bigint generated always as identity primary key,
  laboratorio_id uuid,
  ok             boolean not null,
  il             timestamptz not null default now()
);

-- ---------- Export (l'unica cosa che il server registra) -------------
create table if not exists exports (
  id                bigint generated always as identity primary key,
  laboratorio_id    uuid not null references laboratori(id),
  rivenditore_id    uuid not null references rivenditori(id),   -- chi fattura questo export
  agente_id         uuid,
  tipo              text not null check (tipo in ('modelli','key-clinic')),
  gratuito          boolean not null,
  prezzo            numeric(8,2) not null,
  quota_rivenditore numeric(8,2) not null,
  quota_dentag      numeric(8,2) not null,
  confermato_il     timestamptz not null default now(),
  mese              date not null,                               -- 1° giorno del mese (ora di Roma)
  stornato          boolean not null default false,
  stornato_il       timestamptz,
  nota_storno       text
);
create index if not exists exports_mese_idx on exports (mese, rivenditore_id);
create index if not exists exports_lab_idx  on exports (laboratorio_id, mese);

create table if not exists mesi_chiusi (
  mese      date primary key,
  chiuso_il timestamptz not null default now(),
  chiuso_da uuid
);

-- Nessun accesso diretto alle tabelle dal browser
alter table impostazioni      enable row level security;
alter table rivenditori       enable row level security;
alter table inviti            enable row level security;
alter table profili           enable row level security;
alter table laboratori        enable row level security;
alter table codici            enable row level security;
alter table tentativi_voucher enable row level security;
alter table exports           enable row level security;
alter table mesi_chiusi       enable row level security;

-- =====================================================================
--  Funzioni di supporto (interne)
-- =====================================================================
create or replace function _mese(t timestamptz) returns date
language sql stable set search_path = public as $$
  select date_trunc('month', t at time zone 'Europe/Rome')::date
$$;

create or replace function _norm_codice(c text) returns text
language sql immutable set search_path = public as $$
  select upper(regexp_replace(coalesce(c,''), '[^A-Za-z0-9]', '', 'g'))
$$;

create or replace function _dentag_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from rivenditori where is_dentag limit 1
$$;

create or replace function _me() returns profili
language sql stable security definer set search_path = public as $$
  select * from profili where user_id = auth.uid()
$$;

create or replace function _err(msg text) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('ok', false, 'errore', msg)
$$;

-- Nuovo utente: se l'email ha un invito diventa admin/rivenditore/agente,
-- altrimenti è un laboratorio.
create or replace function _nuovo_utente() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv  inviti;
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  em   text  := lower(new.email);
begin
  select * into inv from inviti where email = em;
  if found then
    insert into profili (user_id, email, ruolo, rivenditore_id, nome)
    values (new.id, em, inv.ruolo,
            coalesce(inv.rivenditore_id, case when inv.ruolo in ('admin','agente') then _dentag_id() end),
            inv.nome);
    delete from inviti where email = em;
  else
    insert into profili (user_id, email, ruolo, nome)
    values (new.id, em, 'laboratorio', nullif(trim(meta->>'ragione_sociale'), ''));
    insert into laboratori (user_id, ragione_sociale, piva, email)
    values (new.id,
            coalesce(nullif(trim(meta->>'ragione_sociale'), ''), em),
            nullif(trim(meta->>'piva'), ''),
            em);
  end if;
  return new;
end $$;

drop trigger if exists rc_nuovo_utente on auth.users;
create trigger rc_nuovo_utente after insert on auth.users
  for each row execute function _nuovo_utente();

-- =====================================================================
--  Tutti gli utenti
-- =====================================================================
create or replace function mio_profilo() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p profili; r rivenditori; i impostazioni;
begin
  p := _me();
  if p.user_id is null then return _err('Non autenticato'); end if;
  select * into r from rivenditori where id = p.rivenditore_id;
  select * into i from impostazioni where id = 1;
  return jsonb_build_object(
    'ok', true, 'ruolo', p.ruolo, 'email', p.email, 'nome', p.nome,
    'rivenditore', case when r.id is null then null else
       jsonb_build_object('id', r.id, 'nome', r.nome, 'is_dentag', r.is_dentag) end,
    'impostazioni', jsonb_build_object('prezzo_caso', i.prezzo_caso, 'quota_rivenditore', i.quota_rivenditore,
                                       'casi_per_kit', i.casi_per_kit, 'key_clinic_conta', i.key_clinic_conta),
    'mese_corrente', _mese(now()));
end $$;

-- =====================================================================
--  Laboratorio (dal tool)
-- =====================================================================
create or replace function stato_laboratorio() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p profili; l laboratori; r rivenditori; i impostazioni;
begin
  p := _me();
  if p.user_id is null then return _err('Non autenticato'); end if;
  if p.ruolo <> 'laboratorio' then
    return jsonb_build_object('ok', true, 'ruolo', p.ruolo, 'email', p.email);
  end if;
  select * into l from laboratori where user_id = p.user_id;
  select * into r from rivenditori where id = l.rivenditore_id;
  select * into i from impostazioni where id = 1;
  return jsonb_build_object(
    'ok', true, 'ruolo', 'laboratorio', 'email', l.email,
    'ragione_sociale', l.ragione_sociale, 'piva', l.piva,
    'collegato', l.rivenditore_id is not null,
    'rivenditore', r.nome, 'rivenditore_email', r.email,
    'casi_gratuiti', l.casi_gratuiti, 'bloccato', l.bloccato,
    'prezzo_caso', i.prezzo_caso, 'key_clinic_conta', i.key_clinic_conta,
    'codici', coalesce((select jsonb_agg(jsonb_build_object('codice', c.codice_stampato, 'tipo', c.tipo, 'usato_il', c.usato_il)
                                         order by c.usato_il)
                        from codici c where c.laboratorio_id = l.id), '[]'::jsonb),
    'export_mese', (select count(*) from exports e where e.laboratorio_id = l.id and e.mese = _mese(now())
                      and not e.gratuito and not e.stornato));
end $$;

create or replace function riscatta_voucher(p_codice text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l laboratori; c codici; r rivenditori; i impostazioni;
  n text := _norm_codice(p_codice);
  falliti int;
  nuovo_collegamento boolean := false;
  msg_non_valido constant text :=
    'Codice non valido. RotoClick Studio funziona solo con kit originali acquistati presso un rivenditore autorizzato.';
begin
  select * into l from laboratori where user_id = auth.uid() for update;
  if not found then return _err('Solo un account laboratorio può inserire un codice kit.'); end if;

  select count(*) into falliti from tentativi_voucher
   where laboratorio_id = l.id and not ok and il > now() - interval '1 hour';
  if falliti >= 10 then return _err('Troppi tentativi non riusciti. Riprova tra un''ora.'); end if;

  select * into c from codici where codice = n for update;
  if not found or c.stato = 'revocato' or c.rivenditore_id is null then
    insert into tentativi_voucher (laboratorio_id, ok) values (l.id, false);
    return _err(msg_non_valido);
  end if;
  if c.stato = 'usato' then
    insert into tentativi_voucher (laboratorio_id, ok) values (l.id, false);
    return _err('Questo codice è già stato utilizzato.');
  end if;
  select * into r from rivenditori where id = c.rivenditore_id;
  if not r.attivo then
    insert into tentativi_voucher (laboratorio_id, ok) values (l.id, false);
    return _err(msg_non_valido);
  end if;

  select * into i from impostazioni where id = 1;
  update codici set stato = 'usato', laboratorio_id = l.id, usato_il = now() where codice = n;

  if l.rivenditore_id is null then          -- il primo codice decide il rivenditore
    update laboratori set rivenditore_id = c.rivenditore_id, agente_id = c.agente_id, collegato_il = now()
     where id = l.id;
    nuovo_collegamento := true;
  end if;
  update laboratori set casi_gratuiti = casi_gratuiti + i.casi_per_kit where id = l.id
  returning * into l;
  insert into tentativi_voucher (laboratorio_id, ok) values (l.id, true);

  return jsonb_build_object('ok', true, 'tipo', c.tipo, 'casi_aggiunti', i.casi_per_kit,
    'casi_gratuiti', l.casi_gratuiti, 'nuovo_collegamento', nuovo_collegamento,
    'rivenditore', (select nome from rivenditori where id = l.rivenditore_id));
end $$;

-- Chiamata DOPO che il laboratorio ha confermato il pop-up, PRIMA del download.
create or replace function registra_export(p_tipo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l laboratori; r rivenditori; i impostazioni;
  v_grat boolean; v_prezzo numeric(8,2) := 0; v_qr numeric(8,2) := 0; v_id bigint;
begin
  if p_tipo not in ('modelli','key-clinic') then return _err('Tipo di export sconosciuto'); end if;
  select * into l from laboratori where user_id = auth.uid() for update;
  if not found then return _err('Solo un account laboratorio può esportare.'); end if;
  if l.rivenditore_id is null then
    return _err('Inserisci il codice del tuo kit RotoClick per sbloccare l''export.');
  end if;
  select * into r from rivenditori where id = l.rivenditore_id;
  if l.bloccato then
    return _err('Export non disponibile. Contatta ' || r.nome || '.');
  end if;
  select * into i from impostazioni where id = 1;

  if p_tipo = 'key-clinic' and not i.key_clinic_conta then
    v_grat := true;
  elsif l.casi_gratuiti > 0 then
    v_grat := true;
    update laboratori set casi_gratuiti = casi_gratuiti - 1 where id = l.id returning * into l;
  else
    v_grat := false;
    v_prezzo := i.prezzo_caso;
    v_qr := case when r.is_dentag then 0 else least(i.quota_rivenditore, i.prezzo_caso) end;
  end if;

  insert into exports (laboratorio_id, rivenditore_id, agente_id, tipo, gratuito, prezzo,
                       quota_rivenditore, quota_dentag, mese)
  values (l.id, r.id, l.agente_id, p_tipo, v_grat, v_prezzo, v_qr, v_prezzo - v_qr, _mese(now()))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'gratuito', v_grat, 'prezzo', v_prezzo,
                            'casi_gratuiti', l.casi_gratuiti, 'rivenditore', r.nome);
end $$;

-- =====================================================================
--  Elenchi (filtrati in base al ruolo di chi chiama)
-- =====================================================================
create or replace function lista_export(p_mese date default null, p_rivenditore uuid default null,
                                        p_laboratorio uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p profili := _me(); v_lab uuid;
begin
  if p.user_id is null then return _err('Non autenticato'); end if;
  if p.ruolo = 'laboratorio' then select id into v_lab from laboratori where user_id = p.user_id; end if;
  if p.ruolo not in ('admin','rivenditore','agente','laboratorio') then return _err('Accesso non consentito'); end if;
  return jsonb_build_object('ok', true, 'righe', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'confermato_il', e.confermato_il, 'mese', e.mese, 'tipo', e.tipo,
      'gratuito', e.gratuito, 'prezzo', e.prezzo, 'quota_rivenditore', e.quota_rivenditore,
      'quota_dentag', e.quota_dentag, 'stornato', e.stornato, 'nota_storno', e.nota_storno,
      'laboratorio_id', e.laboratorio_id, 'laboratorio', l.ragione_sociale, 'piva', l.piva,
      'rivenditore_id', e.rivenditore_id, 'rivenditore', r.nome,
      'agente', a.nome) order by e.confermato_il desc)
    from exports e
    join laboratori l on l.id = e.laboratorio_id
    join rivenditori r on r.id = e.rivenditore_id
    left join profili a on a.user_id = e.agente_id
    where (p_mese is null or e.mese = p_mese)
      and (p_laboratorio is null or e.laboratorio_id = p_laboratorio)
      and case p.ruolo
            when 'admin'       then (p_rivenditore is null or e.rivenditore_id = p_rivenditore)
            when 'rivenditore' then e.rivenditore_id = p.rivenditore_id
            when 'agente'      then e.agente_id = p.user_id
            when 'laboratorio' then e.laboratorio_id = v_lab
          end), '[]'::jsonb));
end $$;

-- Riepilogo per laboratorio di un mese: base per le fatture ai clienti.
create or replace function riepilogo_laboratori(p_mese date, p_rivenditore uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p profili := _me(); v_riv uuid;
begin
  if p.ruolo not in ('admin','rivenditore','agente') then return _err('Accesso non consentito'); end if;
  v_riv := case when p.ruolo = 'admin' then coalesce(p_rivenditore, _dentag_id()) else p.rivenditore_id end;
  return jsonb_build_object('ok', true, 'mese', p_mese,
    'chiuso', exists(select 1 from mesi_chiusi where mese = p_mese),
    'rivenditore', (select jsonb_build_object('id', id, 'nome', nome, 'is_dentag', is_dentag) from rivenditori where id = v_riv),
    'righe', coalesce((
      select jsonb_agg(x order by x->>'laboratorio') from (
        select jsonb_build_object(
          'laboratorio_id', l.id, 'laboratorio', l.ragione_sociale, 'piva', l.piva, 'email', l.email,
          'agente', (select nome from profili where user_id = l.agente_id),
          'casi_pagati', count(*) filter (where not e.gratuito),
          'casi_gratuiti', count(*) filter (where e.gratuito),
          'totale_cliente', coalesce(sum(e.prezzo), 0),
          'quota_rivenditore', coalesce(sum(e.quota_rivenditore), 0),
          'quota_dentag', coalesce(sum(e.quota_dentag), 0)) as x
        from exports e join laboratori l on l.id = e.laboratorio_id
        where e.mese = p_mese and not e.stornato and e.rivenditore_id = v_riv
          and (p.ruolo <> 'agente' or e.agente_id = p.user_id)
        group by l.id) t), '[]'::jsonb));
end $$;

-- Riepilogo per rivenditore (solo Dentag): quanto fatturare a ciascuno.
create or replace function riepilogo_rivenditori(p_mese date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p profili := _me();
begin
  if p.ruolo <> 'admin' then return _err('Accesso non consentito'); end if;
  return jsonb_build_object('ok', true, 'mese', p_mese,
    'chiuso', exists(select 1 from mesi_chiusi where mese = p_mese),
    'righe', coalesce((
      select jsonb_agg(x order by (x->>'is_dentag')::boolean desc, x->>'rivenditore') from (
        select jsonb_build_object(
          'rivenditore_id', r.id, 'rivenditore', r.nome, 'is_dentag', r.is_dentag, 'piva', r.piva,
          'laboratori', count(distinct e.laboratorio_id),
          'casi_pagati', count(e.id) filter (where not e.gratuito),
          'casi_gratuiti', count(e.id) filter (where e.gratuito),
          'totale_clienti', coalesce(sum(e.prezzo), 0),
          'quota_rivenditore', coalesce(sum(e.quota_rivenditore), 0),
          'da_fatturare', case when r.is_dentag then 0 else coalesce(sum(e.quota_dentag), 0) end) as x
        from rivenditori r
        join exports e on e.rivenditore_id = r.id and e.mese = p_mese and not e.stornato
        group by r.id) t), '[]'::jsonb));
end $$;

create or replace function lista_laboratori(p_rivenditore uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p profili := _me(); m date := _mese(now());
begin
  if p.ruolo not in ('admin','rivenditore','agente') then return _err('Accesso non consentito'); end if;
  return jsonb_build_object('ok', true, 'righe', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id, 'ragione_sociale', l.ragione_sociale, 'piva', l.piva, 'email', l.email,
      'rivenditore_id', l.rivenditore_id, 'rivenditore', r.nome,
      'agente_id', l.agente_id, 'agente', a.nome,
      'creato_il', l.creato_il, 'collegato_il', l.collegato_il,
      'nuovo', l.collegato_il > now() - interval '14 days',
      'casi_gratuiti', l.casi_gratuiti, 'bloccato', l.bloccato,
      'kit', (select count(*) from codici c where c.laboratorio_id = l.id),
      'pagati_mese', (select count(*) from exports e where e.laboratorio_id = l.id and e.mese = m
                        and not e.gratuito and not e.stornato),
      'pagati_totale', (select count(*) from exports e where e.laboratorio_id = l.id
                        and not e.gratuito and not e.stornato))
      order by l.collegato_il desc nulls last, l.creato_il desc)
    from laboratori l
    left join rivenditori r on r.id = l.rivenditore_id
    left join profili a on a.user_id = l.agente_id
    where case p.ruolo
            when 'admin'       then (p_rivenditore is null or l.rivenditore_id = p_rivenditore)
            when 'rivenditore' then l.rivenditore_id = p.rivenditore_id
            when 'agente'      then l.agente_id = p.user_id
          end), '[]'::jsonb));
end $$;

create or replace function lista_codici(p_rivenditore uuid default null, p_stato text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p profili := _me();
begin
  if p.ruolo not in ('admin','rivenditore','agente') then return _err('Accesso non consentito'); end if;
  return jsonb_build_object('ok', true, 'righe', coalesce((
    select jsonb_agg(jsonb_build_object(
      'codice', c.codice, 'codice_stampato', c.codice_stampato, 'tipo', c.tipo, 'lotto', c.lotto,
      'stato', c.stato, 'rivenditore_id', c.rivenditore_id, 'rivenditore', r.nome,
      'agente', a.nome, 'laboratorio', l.ragione_sociale, 'usato_il', c.usato_il, 'creato_il', c.creato_il)
      order by c.creato_il desc, c.codice)
    from codici c
    left join rivenditori r on r.id = c.rivenditore_id
    left join profili a on a.user_id = c.agente_id
    left join laboratori l on l.id = c.laboratorio_id
    where (p_stato is null or c.stato = p_stato)
      and case p.ruolo
            when 'admin'       then (p_rivenditore is null or c.rivenditore_id = p_rivenditore)
            when 'rivenditore' then c.rivenditore_id = p.rivenditore_id
            when 'agente'      then c.agente_id = p.user_id
          end), '[]'::jsonb));
end $$;

create or replace function blocca_laboratorio(p_lab uuid, p_bloccato boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profili := _me(); l laboratori;
begin
  select * into l from laboratori where id = p_lab;
  if not found then return _err('Laboratorio non trovato'); end if;
  if not (p.ruolo = 'admin' or (p.ruolo = 'rivenditore' and l.rivenditore_id = p.rivenditore_id)) then
    return _err('Accesso non consentito');
  end if;
  update laboratori set bloccato = p_bloccato where id = p_lab;
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
--  Solo Dentag (admin)
-- =====================================================================
create or replace function _solo_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ruolo = 'admin' from profili where user_id = auth.uid()), false)
$$;

create or replace function admin_rivenditori() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not _solo_admin() then return _err('Accesso non consentito'); end if;
  return jsonb_build_object('ok', true, 'righe', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'nome', r.nome, 'piva', r.piva, 'email', r.email, 'paese', r.paese,
      'is_dentag', r.is_dentag, 'attivo', r.attivo, 'note', r.note,
      'laboratori', (select count(*) from laboratori l where l.rivenditore_id = r.id),
      'codici_disponibili', (select count(*) from codici c where c.rivenditore_id = r.id and c.stato = 'disponibile'),
      'codici_usati', (select count(*) from codici c where c.rivenditore_id = r.id and c.stato = 'usato'),
      'utenti', (select count(*) from profili u where u.rivenditore_id = r.id and u.ruolo in ('rivenditore','agente','admin')))
      order by r.is_dentag desc, r.nome)
    from rivenditori r), '[]'::jsonb));
end $$;

create or replace function admin_salva_rivenditore(p_id uuid, p_nome text, p_piva text, p_email text,
                                                   p_paese text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not _solo_admin() then return _err('Accesso non consentito'); end if;
  if coalesce(trim(p_nome), '') = '' then return _err('Il nome è obbligatorio'); end if;
  if p_id is null then
    insert into rivenditori (nome, piva, email, paese, note)
    values (trim(p_nome), nullif(trim(p_piva),''), nullif(lower(trim(p_email)),''), coalesce(nullif(trim(p_paese),''),'IT'), nullif(trim(p_note),''))
    returning id into v_id;
  else
    update rivenditori set nome = trim(p_nome), piva = nullif(trim(p_piva),''), email = nullif(lower(trim(p_email)),''),
           paese = coalesce(nullif(trim(p_paese),''),'IT'), note = nullif(trim(p_note),'')
     where id = p_id returning id into v_id;
    if v_id is null then return _err('Rivenditore non trovato'); end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Disattivare un rivenditore: i suoi codici non usati vengono revocati e i suoi
-- laboratori passano a Dentag (gli export già fatti restano a lui).
create or replace function admin_stato_rivenditore(p_id uuid, p_attivo boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r rivenditori; n_cod int := 0; n_lab int := 0;
begin
  if not _solo_admin() then return _err('Accesso non consentito'); end if;
  select * into r from rivenditori where id = p_id;
  if not found then return _err('Rivenditore non trovato'); end if;
  if r.is_dentag and not p_attivo then return _err('Dentag non può essere disattivata'); end if;
  update rivenditori set attivo = p_attivo where id = p_id;
  if not p_attivo then
    update codici set stato = 'revocato' where rivenditore_id = p_id and stato = 'disponibile';
    get diagnostics n_cod = row_count;
    update laboratori set rivenditore_id = _dentag_id(), agente_id = null where rivenditore_id = p_id;
    get diagnostics n_lab = row_count;
  end if;
  return jsonb_build_object('ok', true, 'codici_revocati', n_cod, 'laboratori_spostati', n_lab);
end $$;

create or replace function admin_utenti() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not _solo_admin() then return _err('Accesso non consentito'); end if;
  return jsonb_build_object('ok', true,
    'utenti', coalesce((select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'email', p.email, 'nome', p.nome,
                         'ruolo', p.ruolo, 'rivenditore', r.nome, 'rivenditore_id', p.rivenditore_id) order by r.nome, p.email)
                        from profili p left join rivenditori r on r.id = p.rivenditore_id
                        where p.ruolo in ('admin','rivenditore','agente','disabilitato')), '[]'::jsonb),
    'inviti', coalesce((select jsonb_agg(jsonb_build_object('email', i.email, 'nome', i.nome, 'ruolo', i.ruolo,
                         'rivenditore', r.nome, 'creato_il', i.creato_il) order by i.creato_il desc)
                        from inviti i left join rivenditori r on r.id = i.rivenditore_id), '[]'::jsonb));
end $$;

create or replace function admin_invita(p_email text, p_ruolo text, p_rivenditore uuid, p_nome text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare em text := lower(trim(p_email)); v_riv uuid; esiste profili;
begin
  if not _solo_admin() then return _err('Accesso non consentito'); end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return _err('Email non valida'); end if;
  if p_ruolo not in ('admin','rivenditore') then return _err('Ruolo non valido'); end if;
  v_riv := case when p_ruolo = 'rivenditore' then p_rivenditore else coalesce(p_rivenditore, _dentag_id()) end;
  if p_ruolo = 'rivenditore' and v_riv is null then return _err('Scegli il rivenditore'); end if;

  select * into esiste from profili where email = em;
  if found then
    if esiste.ruolo = 'laboratorio' then
      return _err('Questa email è già registrata come laboratorio. Usa un''altra email per l''accesso al back-end.');
    end if;
    update profili set ruolo = p_ruolo, rivenditore_id = v_riv, nome = coalesce(nullif(trim(p_nome),''), nome)
     where user_id = esiste.user_id;
    return jsonb_build_object('ok', true, 'aggiornato', true);
  end if;
  insert into inviti (email, ruolo, rivenditore_id, nome) values (em, p_ruolo, v_riv, nullif(trim(p_nome),''))
  on conflict (email) do update set ruolo = excluded.ruolo, rivenditore_id = excluded.rivenditore_id, nome = excluded.nome;
  return jsonb_build_object('ok', true, 'invitato', true);
end $$;

create or replace function admin_disabilita_accesso(p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare em text := lower(trim(p_email));
begin
  if not _solo_admin() then return _err('Accesso non consentito'); end if;
  if em = (select email from profili where user_id = auth.uid()) then return _err('Non puoi disabilitare te stesso'); end if;
  delete from inviti where email = em;
  update profili set ruolo = 'disabilitato' where email = em and ruolo in ('admin','rivenditore','agente');
  return jsonb_build_object('ok', true);
end $$;

-- Codici casuali, stampati come RK-XXXX-XXXX (alfabeto senza 0/O e 1/I).
create or replace function _nuovo_codice() returns text
language plpgsql volatile set search_path = public as $$
declare alfa constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea; s text := ''; k int;
begin
  b := decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex');
  for k in 0..7 loop
    s := s || substr(alfa, (get_byte(b, k * 3) % 32) + 1, 1);
  end loop;
  return 'RK-' || substr(s, 1, 4) || '-' || substr(s, 5, 4);
end $$;

create or replace function admin_genera_codici(p_n int, p_tipo text, p_rivenditore uuid,
                                               p_agente uuid default null, p_lotto text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k int := 0; c text; out text[] := '{}';
begin
  if not _solo_admin() then return _err('Accesso non consentito'); end if;
  if p_n is null or p_n < 1 or p_n > 1000 then return _err('Da 1 a 1000 codici per volta'); end if;
  if p_tipo not in ('K-LAB','K-CLINIC') then return _err('Tipo non valido'); end if;
  if p_rivenditore is not null and not exists (select 1 from rivenditori where id = p_rivenditore and attivo) then
    return _err('Rivenditore non valido o disattivato');
  end if;
  while k < p_n loop
    c := _nuovo_codice();
    begin
      insert into codici (codice, codice_stampato, tipo, rivenditore_id, agente_id, lotto)
      values (_norm_codice(c), c, p_tipo, p_rivenditore, p_agente, nullif(trim(p_lotto),''));
      out := out || c; k := k + 1;
    exception when unique_violation then null;   -- doppione: si rigenera
    end;
  end loop;
  return jsonb_build_object('ok', true, 'codici', to_jsonb(out));
end $$;

-- Importa codici già stampati sui kit esistenti.
create or replace function admin_importa_codici(p_codici text[], p_tipo text, p_rivenditore uuid,
                                                p_agente uuid default null, p_lotto text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c text; n_ok int := 0; dup text[] := '{}'; corti text[] := '{}';
begin
  if not _solo_admin() then return _err('Accesso non consentito'); end if;
  if p_tipo not in ('K-LAB','K-CLINIC') then return _err('Tipo non valido'); end if;
  foreach c in array coalesce(p_codici, '{}') loop
    c := trim(c);
    continue when c = '';
    if length(_norm_codice(c)) < 6 then corti := corti || c; continue; end if;
    begin
      insert into codici (codice, codice_stampato, tipo, rivenditore_id, agente_id, lotto)
      values (_norm_codice(c), c, p_tipo, p_rivenditore, p_agente, nullif(trim(p_lotto),''));
      n_ok := n_ok + 1;
    exception when unique_violation then dup := dup || c;
    end;
  end loop;
  return jsonb_build_object('ok', true, 'importati', n_ok, 'doppioni', to_jsonb(dup), 'troppo_corti', to_jsonb(corti));
end $$;

-- Assegna (o riassegna) codici ancora disponibili a un rivenditore/agente.
create or replace function admin_assegna_codici(p_codici text[], p_rivenditore uuid, p_agente uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not _solo_admin() then return _err('Accesso non consentito'); end if;
  if p_rivenditore is not null and not exists (select 1 from rivenditori where id = p_rivenditore and attivo) then
    return _err('Rivenditore non valido o disattivato');
  end if;
  update codici set rivenditore_id = p_rivenditore, agente_id = p_agente
   where codice in (select _norm_codice(x) from unnest(p_codici) x) and stato = 'disponibile';
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'aggiornati', n);
end $$;

create or replace function admin_revoca_codici(p_codici text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not _solo_admin() then return _err('Accesso non consentito'); end if;
  update codici set stato = 'revocato'
   where codice in (select _norm_codice(x) from unnest(p_codici) x) and stato = 'disponibile';
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'revocati', n);
end $$;

create or replace function admin_agenti() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not _solo_admin() then return _err('Accesso non consentito'); end if;
  return jsonb_build_object('ok', true, 'righe', coalesce((
    select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'nome', coalesce(p.nome, p.email), 'email', p.email,
                                        'rivenditore_id', p.rivenditore_id) order by p.nome)
    from profili p where p.ruolo = 'agente'), '[]'::jsonb));
end $$;

-- Sposta un laboratorio: gli export futuri vanno al nuovo rivenditore.
create or replace function admin_sposta_laboratorio(p_lab uuid, p_rivenditore uuid, p_agente uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not _solo_admin() then return _err('Accesso non consentito'); end if;
  if not exists (select 1 from rivenditori where id = p_rivenditore and attivo) then
    return _err('Rivenditore non valido o disattivato');
  end if;
  update laboratori set rivenditore_id = p_rivenditore, agente_id = p_agente,
         collegato_il = coalesce(collegato_il, now())
   where id = p_lab;
  if not found then return _err('Laboratorio non trovato'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_storna_export(p_id bigint, p_nota text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e exports;
begin
  if not _solo_admin() then return _err('Accesso non consentito'); end if;
  select * into e from exports where id = p_id for update;
  if not found then return _err('Export non trovato'); end if;
  if e.stornato then return _err('Export già stornato'); end if;
  if exists (select 1 from mesi_chiusi where mese = e.mese) then
    return _err('Il mese è già chiuso: correggi con una nota di credito.');
  end if;
  update exports set stornato = true, stornato_il = now(), nota_storno = nullif(trim(p_nota),'') where id = p_id;
  if e.gratuito then   -- un caso incluso stornato torna disponibile
    update laboratori set casi_gratuiti = casi_gratuiti + 1 where id = e.laboratorio_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_chiudi_mese(p_mese date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', p_mese)::date;
begin
  if not _solo_admin() then return _err('Accesso non consentito'); end if;
  if m >= _mese(now()) then return _err('Si può chiudere solo un mese già finito.'); end if;
  insert into mesi_chiusi (mese, chiuso_da) values (m, auth.uid()) on conflict do nothing;
  return jsonb_build_object('ok', true, 'mese', m);
end $$;

create or replace function admin_salva_impostazioni(p_prezzo numeric, p_quota numeric, p_casi int, p_kc boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not _solo_admin() then return _err('Accesso non consentito'); end if;
  if p_prezzo < 0 or p_quota < 0 or p_quota > p_prezzo then return _err('La quota rivenditore deve stare tra 0 e il prezzo'); end if;
  if p_casi < 0 or p_casi > 1000 then return _err('Casi per kit non validi'); end if;
  update impostazioni set prezzo_caso = p_prezzo, quota_rivenditore = p_quota, casi_per_kit = p_casi,
         key_clinic_conta = p_kc, aggiornato_il = now() where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
--  Permessi: solo utenti autenticati, solo tramite le funzioni pubbliche
-- =====================================================================
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function
  mio_profilo(), stato_laboratorio(), riscatta_voucher(text), registra_export(text),
  lista_export(date, uuid, uuid), riepilogo_laboratori(date, uuid), riepilogo_rivenditori(date),
  lista_laboratori(uuid), lista_codici(uuid, text), blocca_laboratorio(uuid, boolean),
  admin_rivenditori(), admin_salva_rivenditore(uuid, text, text, text, text, text),
  admin_stato_rivenditore(uuid, boolean), admin_utenti(), admin_invita(text, text, uuid, text),
  admin_disabilita_accesso(text), admin_genera_codici(int, text, uuid, uuid, text),
  admin_importa_codici(text[], text, uuid, uuid, text), admin_assegna_codici(text[], uuid, uuid),
  admin_revoca_codici(text[]), admin_agenti(), admin_sposta_laboratorio(uuid, uuid, uuid),
  admin_storna_export(bigint, text), admin_chiudi_mese(date),
  admin_salva_impostazioni(numeric, numeric, int, boolean)
to authenticated;
