-- Gestion des membres d'une chasse (organisateurs et chasseurs habituels)

create or replace function liste_membres(p_chasse uuid)
returns table (user_id uuid, prenom text, nom text, email text, role text, est_principal boolean)
language sql security definer as $$
  select m.user_id, p.prenom::text, p.nom::text,
         case when public.est_organisateur(p_chasse) then p.email::text else null end,
         m.role::text, m.est_principal
  from public.chasse_membres m
  join public.profiles p on p.id = m.user_id
  where m.chasse_id = p_chasse and public.est_membre(p_chasse)
  order by m.role, p.nom
$$;

create or replace function ajouter_membre(p_chasse uuid, p_email text, p_role text)
returns text language plpgsql security definer as $$
declare cible uuid;
begin
  if not public.est_organisateur(p_chasse) then
    raise exception 'Reserve aux organisateurs';
  end if;
  if p_role = 'organisateur' and not exists (
    select 1 from public.chasse_membres
    where chasse_id = p_chasse and user_id = auth.uid() and est_principal) then
    raise exception 'Seul l organisateur principal peut ajouter un organisateur';
  end if;
  select id into cible from public.profiles where lower(email) = lower(trim(p_email));
  if cible is null then
    raise exception 'Aucun compte avec cet email : la personne doit d abord creer son compte dans l app';
  end if;
  insert into public.chasse_membres (chasse_id, user_id, role)
    values (p_chasse, cible, p_role) on conflict do nothing;
  return 'ok';
end; $$;

create or replace function retirer_membre(p_chasse uuid, p_user uuid, p_role text)
returns text language plpgsql security definer as $$
begin
  if not public.est_organisateur(p_chasse) then
    raise exception 'Reserve aux organisateurs';
  end if;
  if p_role = 'organisateur' and not exists (
    select 1 from public.chasse_membres
    where chasse_id = p_chasse and user_id = auth.uid() and est_principal) then
    raise exception 'Seul l organisateur principal peut retirer un organisateur';
  end if;
  delete from public.chasse_membres
    where chasse_id = p_chasse and user_id = p_user and role = p_role and not est_principal;
  return 'ok';
end; $$;
