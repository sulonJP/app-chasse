-- ============================================================
-- Sécurité des tables : chasses, membres, conseils, quotas
-- À coller dans Supabase > SQL Editor > Run
-- ============================================================

-- Fonctions d'aide (security definer = évite les boucles de règles)
create or replace function est_membre(p_chasse uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from chasse_membres where chasse_id = p_chasse and user_id = auth.uid());
$$;

create or replace function est_organisateur(p_chasse uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from chasse_membres
                 where chasse_id = p_chasse and user_id = auth.uid() and role = 'organisateur');
$$;

-- Création d'une chasse : la chasse + toi comme organisateur principal, en une fois
create or replace function creer_chasse(p_nom text)
returns uuid language plpgsql security definer set search_path = public as $$
declare nouvelle uuid;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  insert into chasses (nom) values (p_nom) returning id into nouvelle;
  insert into chasse_membres (chasse_id, user_id, role, est_principal)
    values (nouvelle, auth.uid(), 'organisateur', true);
  return nouvelle;
end; $$;

-- CHASSES
alter table chasses enable row level security;
create policy "Voir mes chasses" on chasses for select using (est_membre(id));
create policy "Modifier ma chasse" on chasses for update
  using (est_organisateur(id)) with check (est_organisateur(id));
create policy "Supprimer ma chasse" on chasses for delete using (est_organisateur(id));

-- MEMBRES
alter table chasse_membres enable row level security;
create policy "Voir les membres de mes chasses" on chasse_membres for select
  using (est_membre(chasse_id));

-- CONSEILS
alter table conseils_cynegetiques enable row level security;
create policy "Voir les conseils" on conseils_cynegetiques for select using (est_membre(chasse_id));
create policy "Ajouter un conseil" on conseils_cynegetiques for insert with check (est_organisateur(chasse_id));
create policy "Modifier un conseil" on conseils_cynegetiques for update
  using (est_organisateur(chasse_id)) with check (est_organisateur(chasse_id));
create policy "Supprimer un conseil" on conseils_cynegetiques for delete using (est_organisateur(chasse_id));

-- QUOTAS (via le conseil)
alter table quotas enable row level security;
create policy "Voir les quotas" on quotas for select using (
  exists (select 1 from conseils_cynegetiques c where c.id = conseil_id and est_membre(c.chasse_id)));
create policy "Ajouter un quota" on quotas for insert with check (
  exists (select 1 from conseils_cynegetiques c where c.id = conseil_id and est_organisateur(c.chasse_id)));
create policy "Modifier un quota" on quotas for update
  using (exists (select 1 from conseils_cynegetiques c where c.id = conseil_id and est_organisateur(c.chasse_id)))
  with check (exists (select 1 from conseils_cynegetiques c where c.id = conseil_id and est_organisateur(c.chasse_id)));
create policy "Supprimer un quota" on quotas for delete using (
  exists (select 1 from conseils_cynegetiques c where c.id = conseil_id and est_organisateur(c.chasse_id)));
