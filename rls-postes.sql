-- Postes : position GPS + règles de sécurité

alter table postes add column if not exists lat double precision;
alter table postes add column if not exists lng double precision;

alter table postes enable row level security;
create policy "Voir les postes" on postes for select using (est_membre(chasse_id));
create policy "Ajouter un poste" on postes for insert with check (est_organisateur(chasse_id));
create policy "Modifier un poste" on postes for update
  using (est_organisateur(chasse_id)) with check (est_organisateur(chasse_id));
create policy "Supprimer un poste" on postes for delete using (est_organisateur(chasse_id));
