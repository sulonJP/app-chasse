import { createClient } from '@supabase/supabase-js'

// Ces deux valeurs viennent des variables d'environnement définies lors du
// déploiement (jamais écrites en dur ici). Voir le fichier .env.example.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Message clair si les variables d'environnement n'ont pas été configurées
  // (ex. oubliées lors du déploiement sur Vercel).
  console.error(
    'VITE_SUPABASE_URL et/ou VITE_SUPABASE_ANON_KEY ne sont pas définies. ' +
    'Vérifie les variables d\'environnement du déploiement.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
