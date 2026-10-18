# App Chasse — squelette (authentification + Supabase)

Premier squelette fonctionnel de l'app : une page de connexion/inscription
branchée sur la vraie base de données Supabase, pour valider que tout
communique correctement avant de construire les écrans réels (battues,
postes, quotas...).

## Déployer sans utiliser le Terminal (recommandé, Mac ancien)

Tout se fait dans le navigateur, aucune installation nécessaire sur ton Mac.

### 1. Mettre le code sur GitHub

1. Crée un compte gratuit sur https://github.com (si tu n'en as pas déjà un).
2. Clique sur le "+" en haut à droite → "New repository".
3. Nomme-le par ex. `app-chasse`, laisse-le "Private" si tu préfères, clique
   "Create repository".
4. Sur la page du nouveau dépôt vide, clique sur le lien "uploading an
   existing file".
5. Ouvre le dossier de ce projet sur ton Mac (celui que tu viens de
   télécharger et décompresser), sélectionne TOUS les fichiers et dossiers
   à l'intérieur (pas le dossier lui-même, son contenu), et dépose-les dans
   la zone de GitHub.
6. En bas de page, clique "Commit changes".

### 2. Déployer sur Vercel

1. Va sur https://vercel.com et crée un compte gratuit avec "Continue with
   GitHub" (le plus simple, ça relie directement les deux).
2. Clique "Add New..." → "Project".
3. Choisis le dépôt `app-chasse` que tu viens de créer → "Import".
4. Vercel détecte automatiquement qu'il s'agit d'un projet Vite — laisse
   les réglages par défaut.
5. Avant de cliquer "Deploy", ouvre la section "Environment Variables" et
   ajoute ces deux lignes :
   - `VITE_SUPABASE_URL` → `https://bmveqsaujqtffploevup.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` → (ta clé "anon public", celle qui commence
     par `eyJ...`)
6. Clique "Deploy". Après 1-2 minutes, Vercel te donne une adresse du type
   `https://app-chasse-xxxx.vercel.app` — c'est ton app, en ligne, avec une
   vraie adresse HTTPS (utile plus tard pour la caméra/GPS).

### Mettre à jour l'app plus tard

Quand je te donnerai de nouveaux fichiers (nouveaux écrans, corrections),
il suffira de les re-déposer dans GitHub (section "Add file" → "Upload
files" sur le dépôt) — Vercel redéploie automatiquement à chaque mise à
jour du dépôt.

## Sécurité de la base de données

Les règles de sécurité (Row Level Security) sont activées : chaque
utilisateur ne voit que ses données et ses chasses. Les scripts sont dans
`rls-chasses.sql` (à exécuter dans Supabase > SQL Editor).

## Développer en local (optionnel, si le Terminal fonctionne bien un jour)

```
npm install
cp .env.example .env   # puis complète .env avec ta clé anon
npm run dev
```
