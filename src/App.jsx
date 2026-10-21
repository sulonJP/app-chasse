import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import GererChasse from './GererChasse'
import './App.css'

// Le QR de la journée ouvre l'app avec « ?journee=CODE » : on garde le code pendant la connexion.
try {
  const codeJournee = new URLSearchParams(window.location.search).get('journee')
  if (codeJournee) {
    localStorage.setItem('codeJournee', codeJournee)
    window.history.replaceState({}, '', window.location.pathname)
  }
} catch (e) { /* ignore */ }

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [chargement, setChargement] = useState(true)

  // Récupère la session au chargement, et reste à l'écoute des changements
  // (connexion, déconnexion, rafraîchissement du token).
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setChargement(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Une fois connecté, va chercher (ou constate l'absence de) la fiche profil.
  useEffect(() => {
    if (!session) {
      setProfile(null)
      return
    }
    let annule = false
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (annule) return
        if (error) {
          console.error('Erreur de lecture du profil :', error)
        }
        setProfile(data ?? null)
      })
    return () => { annule = true }
  }, [session])

  if (chargement) {
    return <CentreEcran><p>Chargement…</p></CentreEcran>
  }

  if (!session) {
    return <CentreEcran><FormulaireAuth /></CentreEcran>
  }

  if (!profile) {
    return (
      <CentreEcran>
        <FormulaireProfil
          userId={session.user.id}
          email={session.user.email}
          onCree={setProfile}
        />
      </CentreEcran>
    )
  }

  return (
    <CentreEcran large>
      <EcranConnecte profile={profile} userId={session.user.id} />
    </CentreEcran>
  )
}

function CentreEcran({ children, large }) {
  return (
    <div className="centre-ecran">
      <div className={large ? 'carte large' : 'carte'}>{children}</div>
    </div>
  )
}

function FormulaireAuth() {
  const [mode, setMode] = useState('connexion') // 'connexion' | 'inscription'
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState('')
  const [info, setInfo] = useState('')
  const [envoi, setEnvoi] = useState(false)

  async function valider(e) {
    e.preventDefault()
    setErreur('')
    setInfo('')
    setEnvoi(true)
    try {
      if (mode === 'inscription') {
        const { error } = await supabase.auth.signUp({ email, password: motDePasse })
        if (error) throw error
        setInfo('Compte créé ✓ Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.')
        setMode('connexion')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse })
        if (error) throw error
      }
    } catch (err) {
      setErreur(traduireErreur(err.message))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <>
      <h1 className="titre">🦌 App Chasse</h1>
      <p className="sous-titre">
        {mode === 'connexion' ? 'Connecte-toi à ton compte' : 'Crée ton compte'}
      </p>

      <form onSubmit={valider} className="champ-groupe">
        <div className="champ">
          <label>Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div className="champ">
          <label>Mot de passe</label>
          <input
            type="password"
            required
            minLength={6}
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
          />
        </div>

        {erreur && <p className="message erreur">{erreur}</p>}
        {info && <p className="message info">{info}</p>}

        <button type="submit" className="bouton-principal" disabled={envoi}>
          {envoi ? 'Patiente…' : mode === 'connexion' ? 'Se connecter' : "S'inscrire"}
        </button>
      </form>

      <button
        type="button"
        className="lien"
        onClick={() => { setMode(mode === 'connexion' ? 'inscription' : 'connexion'); setErreur(''); setInfo('') }}
      >
        {mode === 'connexion' ? "Pas encore de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
      </button>
    </>
  )
}

function FormulaireProfil({ userId, email, onCree }) {
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  async function valider(e) {
    e.preventDefault()
    setErreur('')
    setEnvoi(true)
    const { data, error } = await supabase
      .from('profiles')
      .insert({ id: userId, prenom, nom, email })
      .select()
      .single()
    setEnvoi(false)
    if (error) {
      setErreur(traduireErreur(error.message))
      return
    }
    onCree(data)
  }

  return (
    <>
      <h1 className="titre">Complète ton profil</h1>
      <p className="sous-titre">Dernière étape avant de commencer</p>

      <form onSubmit={valider} className="champ-groupe">
        <div className="champ">
          <label>Prénom</label>
          <input required value={prenom} onChange={(e) => setPrenom(e.target.value)} />
        </div>
        <div className="champ">
          <label>Nom</label>
          <input required value={nom} onChange={(e) => setNom(e.target.value)} />
        </div>

        {erreur && <p className="message erreur">{erreur}</p>}

        <button type="submit" className="bouton-principal" disabled={envoi}>
          {envoi ? 'Patiente…' : 'Valider'}
        </button>
      </form>
    </>
  )
}

function EcranConnecte({ profile, userId }) {
  async function seDeconnecter() {
    await supabase.auth.signOut()
  }

  return (
    <>
      <div className="rangee" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <p className="message info" style={{ margin: 0 }}>
          Connecté : {profile.prenom} {profile.nom}
        </p>
        <button type="button" className="lien-mini" style={{ color: 'var(--ink-soft)', textDecoration: 'underline' }} onClick={seDeconnecter}>
          Se déconnecter
        </button>
      </div>
      <GererChasse userId={userId} />
      <button type="button" className="lien" onClick={seDeconnecter}>
        Se déconnecter
      </button>
    </>
  )
}

// Rend quelques messages d'erreur Supabase courants plus lisibles en français.
function traduireErreur(message) {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Email ou mot de passe incorrect.'
  if (m.includes('user already registered')) return 'Un compte existe déjà avec cet email.'
  if (m.includes('password should be at least')) return 'Le mot de passe doit faire au moins 6 caractères.'
  if (m.includes('email not confirmed')) return "Confirme d'abord ton adresse email (lien reçu par mail)."
  return message
}
