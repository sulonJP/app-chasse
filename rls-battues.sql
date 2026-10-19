-- Battues réutilisables pour toute la saison : rattachées à la chasse (et non à une journée)

alter table battues add column if not exists chasse_id uuid references chasses(id) on delete cascade;
alter table battues alter column journee_id drop not null;

alter table battues enable row level security;
create policy "Voir les battues" on battues for select using (est_membre(chasse_id));
create policy "Ajouter une battue" on battues for insert with check (est_organisateur(chasse_id));
create policy "Modifier une battue" on battues for update
  using (est_organisateur(chasse_id)) with check (est_organisateur(chasse_id));
create policy "Supprimer une battue" on battues for delete using (est_organisateur(chasse_id));

-- Supprime les postes d'essai créés avant ce changement (sans battue)
delete from postes where battue_id is null;
