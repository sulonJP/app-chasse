import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import BattuesChasse from './BattuesChasse'

const SAISON = '2026-2027'

// Liste officielle du gros gibier (Wallonie), par espèce et catégorie précise.
const GROUPES = [
  ['Cervidés', ['Grand cerf', 'Petit cerf', 'Biche', 'Bichette', 'Faon de cerf']],
  ['Chevreuils', ['Brocard', 'Chèvre', 'Chevrette', 'Chevrillard', 'Faon de chevreuil']],
  ['Daims', ['Daim', 'Daine', 'Faon de daim']],
  ['Mouflons', ['Bélier', 'Brebis', 'Agneau']],
  ['Sangliers', ['Verrat', 'Laie', 'Bête de compagnie', 'Bête rousse', 'Marcassin']],
]
const GIBIERS = [`${GROUPES[0][0]} (tous)`]

export default function GererChasse({ userId }) {
  const [chasses, setChasses] = useState([])
  const [choisie, setChoisie] = useState(null)
  const [nom, setNom] = useState('')
  const [erreur, setErreur] = useState('')

  const charger = useCallback(async () => {
    const { data, error } = await supabase.from('chasses').select('*').order('created_at')
    if (error) return setErreur(error.message)
    setChasses(data)
  }, [])

  useEffect(() => { charger() }, [charger])

  async function creer(e) {
    e.preventDefault()
    setErreur('')
    if (!nom.trim()) return
    const { data, error } = await supabase.rpc('creer_chasse', { p_nom: nom.trim() })
    if (error) return setErreur(error.message)
    setNom('')
    await charger()
    setChoisie(data)
  }

  if (choisie) {
    const chasse = chasses.find((c) => c.id === choisie)
    return (
      <DetailChasse
        chasse={chasse}
        userId={userId}
        retour={() => { setChoisie(null); charger() }}
      />
    )
  }

  return (
    <div>
      <h2 className="h2">Mes chasses</h2>
      {chasses.length === 0 && <p className="message">Aucune chasse pour l'instant.</p>}
      <ul className="liste">
        {chasses.map((c) => (
          <li key={c.id}>
            <button type="button" className="ligne-bouton" onClick={() => setChoisie(c.id)}>
              {c.nom} <span>›</span>
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={creer} className="champ-groupe" style={{ marginTop: 16 }}>
        <div className="champ">
          <label>Nouvelle chasse</label>
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. Chasse de la Haute Fagne" />
        </div>
        <button type="submit" className="bouton-principal">Créer la chasse</button>
        {erreur && <p className="message erreur">{erreur}</p>}
      </form>
    </div>
  )
}

function DetailChasse({ chasse, userId, retour }) {
  const [conseils, setConseils] = useState([])
  const [quotas, setQuotas] = useState([])
  const [nomConseil, setNomConseil] = useState('')
  const [erreur, setErreur] = useState('')
  const [estOrg, setEstOrg] = useState(false)

  useEffect(() => {
    supabase.from('chasse_membres').select('role').eq('chasse_id', chasse.id).eq('user_id', userId)
      .then(({ data }) => setEstOrg(!!data?.some((m) => m.role === 'organisateur')))
  }, [chasse.id, userId])

  const charger = useCallback(async () => {
    const c = await supabase.from('conseils_cynegetiques').select('*').eq('chasse_id', chasse.id).order('nom')
    if (c.error) return setErreur(c.error.message)
    setConseils(c.data)
    const ids = c.data.map((x) => x.id)
    if (ids.length === 0) return setQuotas([])
    const q = await supabase.from('quotas').select('*').in('conseil_id', ids).eq('saison', SAISON).order('gibier')
    if (q.error) return setErreur(q.error.message)
    setQuotas(q.data)
  }, [chasse.id])

  useEffect(() => { charger() }, [charger])

  async function ajouterConseil(e) {
    e.preventDefault()
    setErreur('')
    if (!nomConseil.trim()) return
    const { error } = await supabase.from('conseils_cynegetiques').insert({ chasse_id: chasse.id, nom: nomConseil.trim() })
    if (error) return setErreur(error.message)
    setNomConseil('')
    charger()
  }

  async function supprimerConseil(id) {
    if (!window.confirm('Supprimer ce conseil et ses quotas ?')) return
    const { error } = await supabase.from('conseils_cynegetiques').delete().eq('id', id)
    if (error) return setErreur(error.message)
    charger()
  }

  return (
    <div>
      <button type="button" className="lien" style={{ textAlign: 'left', margin: 0 }} onClick={retour}>
        ‹ Mes chasses
      </button>
      <h2 className="h2">{chasse.nom}</h2>
      <p className="message">Saison {SAISON}</p>

      <Membres chasseId={chasse.id} userId={userId} />

      <h3 className="h3">Conseils cynégétiques</h3>
      {conseils.length === 0 && <p className="message">Aucun conseil. Ajoute-en un ci-dessous.</p>}
      {conseils.map((c) => (
        <BlocConseil
          key={c.id}
          conseil={c}
          quotas={quotas.filter((q) => q.conseil_id === c.id)}
          recharger={charger}
          supprimer={() => supprimerConseil(c.id)}
          setErreur={setErreur}
        />
      ))}
      <form onSubmit={ajouterConseil} className="rangee">
        <input value={nomConseil} onChange={(e) => setNomConseil(e.target.value)} placeholder="Ex. Conseil Cynégétique Est" />
        <button type="submit" className="bouton-petit">+ Conseil</button>
      </form>
      <BattuesChasse chasseId={chasse.id} conseils={conseils} peutModifier={estOrg} />
      {erreur && <p className="message erreur">{erreur}</p>}
    </div>
  )
}

function BlocConseil({ conseil, quotas, recharger, supprimer, setErreur }) {
  const [gibier, setGibier] = useState(GIBIERS[0])
  const [autre, setAutre] = useState('')
  const [illimite, setIllimite] = useState(false)
  const [limite, setLimite] = useState('')

  async function ajouterQuota(e) {
    e.preventDefault()
    setErreur('')
    const nomGibier = gibier === '__autre' ? autre.trim() : gibier
    if (!nomGibier) return
    if (!illimite && (limite === '' || Number(limite) < 0)) return setErreur('Indique une limite (ou coche « illimité »).')
    const { error } = await supabase.from('quotas').insert({
      conseil_id: conseil.id,
      saison: SAISON,
      gibier: nomGibier,
      illimite,
      limite: illimite ? null : Number(limite),
    })
    if (error) {
      return setErreur(error.message.includes('duplicate') ? 'Ce gibier a déjà un quota pour ce conseil.' : error.message)
    }
    setAutre(''); setLimite(''); setIllimite(false)
    recharger()
  }

  async function supprimerQuota(id) {
    const { error } = await supabase.from('quotas').delete().eq('id', id)
    if (error) return setErreur(error.message)
    recharger()
  }

  return (
    <div className="bloc">
      <div className="bloc-titre">
        <strong>{conseil.nom}</strong>
        <button type="button" className="lien-mini" onClick={supprimer}>Supprimer</button>
      </div>
      {quotas.length === 0 && <p className="message">Aucun quota.</p>}
      <ul className="liste">
        {quotas.map((q) => (
          <li key={q.id} className="quota">
            <span>{q.gibier}</span>
            <span>{q.illimite ? 'Illimité' : `${q.tires} / ${q.limite}`}</span>
            <button type="button" className="lien-mini" onClick={() => supprimerQuota(q.id)}>✕</button>
          </li>
        ))}
      </ul>
      <form onSubmit={ajouterQuota} className="champ-groupe">
        <div className="rangee">
          <select value={gibier} onChange={(e) => setGibier(e.target.value)}>
            {GROUPES.map(([titre, liste]) => (
              <optgroup key={titre} label={titre}>
                <option value={`${titre} (tous)`}>{titre} — tous (sans détail)</option>
                {liste.map((g) => <option key={g}>{g}</option>)}
              </optgroup>
            ))}
            <option value="__autre">Autre…</option>
          </select>
          {gibier === '__autre' && (
            <input value={autre} onChange={(e) => setAutre(e.target.value)} placeholder="Catégorie précise" />
          )}
        </div>
        <div className="rangee">
          <label className="case">
            <input type="checkbox" checked={illimite} onChange={(e) => setIllimite(e.target.checked)} /> Illimité
          </label>
          {!illimite && (
            <input type="number" min="0" value={limite} onChange={(e) => setLimite(e.target.value)} placeholder="Limite" />
          )}
          <button type="submit" className="bouton-petit">+ Quota</button>
        </div>
      </form>
    </div>
  )
}

function Membres({ chasseId, userId }) {
  const [membres, setMembres] = useState([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('chasseur')
  const [erreur, setErreur] = useState('')
  const [info, setInfo] = useState('')

  const charger = useCallback(async () => {
    const { data, error } = await supabase.rpc('liste_membres', { p_chasse: chasseId })
    if (error) return setErreur(error.message)
    setMembres(data)
  }, [chasseId])

  useEffect(() => { charger() }, [charger])

  const moi = membres.find((m) => m.user_id === userId && m.role === 'organisateur')
  const estOrganisateur = !!moi
  const estPrincipal = !!moi?.est_principal

  async function ajouter(e) {
    e.preventDefault()
    setErreur(''); setInfo('')
    if (!email.trim()) return
    const { error } = await supabase.rpc('ajouter_membre', { p_chasse: chasseId, p_email: email.trim(), p_role: role })
    if (error) return setErreur(error.message)
    setEmail('')
    setInfo('Ajouté ✓')
    charger()
  }

  async function retirer(m) {
    if (!window.confirm(`Retirer ${m.prenom} ${m.nom} ?`)) return
    setErreur(''); setInfo('')
    const { error } = await supabase.rpc('retirer_membre', { p_chasse: chasseId, p_user: m.user_id, p_role: m.role })
    if (error) return setErreur(error.message)
    charger()
  }

  const peutRetirer = (m) => estOrganisateur && !m.est_principal && (m.role === 'chasseur' || estPrincipal)

  const groupe = (titre, r) => (
    <>
      <h3 className="h3">{titre}</h3>
      <ul className="liste">
        {membres.filter((m) => m.role === r).map((m) => (
          <li key={m.user_id + m.role} className="quota">
            <span>
              {m.prenom} {m.nom}{m.est_principal ? ' ★ principal' : ''}
              {m.email && <small style={{ display: 'block', opacity: 0.7 }}>{m.email}</small>}
            </span>
            {peutRetirer(m) && (
              <button type="button" className="lien-mini" onClick={() => retirer(m)}>Retirer</button>
            )}
          </li>
        ))}
      </ul>
    </>
  )

  return (
    <div>
      {groupe('Organisateurs', 'organisateur')}
      {groupe('Chasseurs habituels', 'chasseur')}
      {estOrganisateur && (
        <form onSubmit={ajouter} className="champ-groupe" style={{ marginTop: 10 }}>
          <div className="rangee">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email de la personne" />
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="chasseur">Chasseur</option>
              {estPrincipal && <option value="organisateur">Organisateur</option>}
            </select>
            <button type="submit" className="bouton-petit">+ Ajouter</button>
          </div>
          <p className="message">La personne doit d'abord avoir créé son compte dans l'app.</p>
        </form>
      )}
      {info && <p className="message info">{info}</p>}
      {erreur && <p className="message erreur">{erreur}</p>}
    </div>
  )
}
