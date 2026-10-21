import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

const aujourdhui = () => new Date().toISOString().slice(0, 10)
const codeAleatoire = () => 'J' + Math.random().toString(36).slice(2, 8).toUpperCase() + Date.now().toString(36).toUpperCase()
const formatDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export default function JourneesChasse({ chasseId, peutModifier }) {
  const [journees, setJournees] = useState([])
  const [selId, setSelId] = useState(null)
  const [date, setDate] = useState(aujourdhui())
  const [chapeau, setChapeau] = useState('')
  const [erreur, setErreur] = useState('')

  const charger = useCallback(async () => {
    const { data, error } = await supabase.from('journees').select('*').eq('chasse_id', chasseId).order('date', { ascending: false })
    if (error) return setErreur(error.message)
    setJournees(data)
  }, [chasseId])

  useEffect(() => { charger() }, [charger])

  async function creer(e) {
    e.preventDefault()
    setErreur('')
    const { data, error } = await supabase.from('journees')
      .insert({ chasse_id: chasseId, date, montant_chapeau: Number(chapeau) || 0, code_qr: codeAleatoire() })
      .select().single()
    if (error) return setErreur(error.message)
    setChapeau('')
    await charger()
    setSelId(data.id)
  }

  const sel = journees.find((j) => j.id === selId)
  if (sel) {
    return <DetailJournee journee={sel} chasseId={chasseId} peutModifier={peutModifier} retour={() => { setSelId(null); charger() }} recharger={charger} />
  }

  return (
    <div>
      <h3 className="h3">Journées de chasse</h3>
      {journees.length === 0 && <p className="message">Aucune journée pour l'instant.</p>}
      <ul className="liste">
        {journees.map((j) => (
          <li key={j.id}>
            <button type="button" className="ligne-bouton" onClick={() => setSelId(j.id)}>
              <span>{formatDate(j.date)}</span><span>›</span>
            </button>
          </li>
        ))}
      </ul>
      {peutModifier && (
        <form onSubmit={creer} className="champ-groupe" style={{ marginTop: 10 }}>
          <div className="champ">
            <label>Date de la journée</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="rangee">
            <input type="number" min="0" step="0.5" value={chapeau} onChange={(e) => setChapeau(e.target.value)} placeholder="Chapeau (€)" />
            <button type="submit" className="bouton-petit">+ Journée</button>
          </div>
        </form>
      )}
      {erreur && <p className="message erreur">{erreur}</p>}
    </div>
  )
}

function DetailJournee({ journee, chasseId, peutModifier, retour, recharger }) {
  const [battues, setBattues] = useState([])
  const [duJour, setDuJour] = useState([])
  const [membres, setMembres] = useState([])
  const [parts, setParts] = useState([])
  const [erreur, setErreur] = useState('')
  const [chapeau, setChapeau] = useState(String(journee.montant_chapeau ?? 0))
  const qrRef = useRef(null)
  const texteQr = window.location.origin + '/?journee=' + journee.code_qr

  const charger = useCallback(async () => {
    const b = await supabase.from('battues').select('*').eq('chasse_id', chasseId).order('created_at')
    const jb = await supabase.from('journee_battues').select('*').eq('journee_id', journee.id)
    const m = await supabase.rpc('liste_membres', { p_chasse: chasseId })
    const p = await supabase.from('journee_participants').select('*').eq('journee_id', journee.id)
    const err = b.error || jb.error || m.error || p.error
    if (err) return setErreur(err.message)
    setBattues(b.data); setDuJour(jb.data); setMembres(m.data); setParts(p.data)
  }, [chasseId, journee.id])

  useEffect(() => { charger() }, [charger])

  useEffect(() => {
    if (!qrRef.current || !window.QRCode) return
    qrRef.current.innerHTML = ''
    new window.QRCode(qrRef.current, { text: texteQr, width: 200, height: 200 })
  }, [texteQr])

  async function basculerBattue(b, actif) {
    setErreur('')
    let r
    if (actif) {
      const ordre = duJour.reduce((m, x) => Math.max(m, x.ordre), 0) + 1
      r = await supabase.from('journee_battues').insert({ journee_id: journee.id, battue_id: b.id, ordre })
    } else {
      r = await supabase.from('journee_battues').delete().eq('journee_id', journee.id).eq('battue_id', b.id)
    }
    if (r.error) return setErreur(r.error.message)
    charger()
  }

  async function majChapeau() {
    const v = Number(chapeau) || 0
    if (v === Number(journee.montant_chapeau)) return
    const { error } = await supabase.from('journees').update({ montant_chapeau: v }).eq('id', journee.id)
    if (error) return setErreur(error.message)
    recharger()
  }

  async function majPart(userId, patch) {
    setErreur('')
    const { error } = await supabase.from('journee_participants')
      .upsert({ journee_id: journee.id, user_id: userId, ...patch }, { onConflict: 'journee_id,user_id' })
    if (error) return setErreur(error.message)
    charger()
  }

  async function supprimerJournee() {
    if (!window.confirm('Supprimer cette journée ?')) return
    const { error } = await supabase.from('journees').delete().eq('id', journee.id)
    if (error) return setErreur(error.message)
    retour()
  }

  // Un même utilisateur peut être organisateur ET chasseur : une seule ligne.
  const uniques = []
  membres.forEach((m) => { if (!uniques.find((x) => x.user_id === m.user_id)) uniques.push(m) })
  const partDe = (id) => parts.find((p) => p.user_id === id)
  // Seuls ceux qui ont rejoint (ou été ajoutés) cette journée figurent dans le rond.
  const personnes = uniques.filter((m) => partDe(m.user_id))
  const absents = uniques.filter((m) => !partDe(m.user_id))

  async function retirerDeLaJournee(userId) {
    setErreur('')
    const { error } = await supabase.from('journee_participants').delete().eq('journee_id', journee.id).eq('user_id', userId)
    if (error) return setErreur(error.message)
    charger()
  }
  const presents = parts.filter((p) => p.present).length
  const payes = parts.filter((p) => p.chapeau_paye).length
  const montant = Number(journee.montant_chapeau) || 0

  return (
    <div>
      <button type="button" className="lien" style={{ textAlign: 'left', margin: 0 }} onClick={retour}>‹ Journées</button>
      <h3 className="h3">{formatDate(journee.date)}</h3>

      <div className="bloc" style={{ textAlign: 'center' }}>
        <strong>QR du matin</strong>
        <div ref={qrRef} style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }} />
        <p className="message">Code de secours : <strong>{journee.code_qr}</strong></p>
        <p className="message">Les chasseurs scannent ce QR avec l'appareil photo de leur téléphone : l'app s'ouvre et ils rejoignent la journée (après connexion).</p>
      </div>

      {peutModifier && (
        <div className="champ">
          <label>Montant du chapeau (€)</label>
          <input type="number" min="0" step="0.5" value={chapeau} onChange={(e) => setChapeau(e.target.value)} onBlur={majChapeau} />
        </div>
      )}

      <h3 className="h3">Battues de la journée</h3>
      {battues.length === 0 && <p className="message">Crée d'abord des battues dans « Mes battues ».</p>}
      <div className="cases-postes">
        {battues.map((b) => (
          <label key={b.id} className="case">
            <input
              type="checkbox"
              disabled={!peutModifier}
              checked={duJour.some((x) => x.battue_id === b.id)}
              onChange={(e) => basculerBattue(b, e.target.checked)}
            />
            {[b.numero && `N° ${b.numero}`, b.nom].filter(Boolean).join(' — ')}
          </label>
        ))}
      </div>

      <h3 className="h3">Le rond et le chapeau</h3>
      <p className="message">{presents} présent(s) · chapeau payé : {payes} × {montant} € = {payes * montant} €</p>
      <ul className="liste">
        {personnes.map((m) => {
          const p = partDe(m.user_id)
          return (
            <li key={m.user_id} className="quota" style={{ flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 140px' }}>{m.prenom} {m.nom}</span>
              <label className="case">
                <input type="checkbox" disabled={!peutModifier} checked={!!p?.present} onChange={(e) => majPart(m.user_id, { present: e.target.checked })} />
                Présent
              </label>
              <label className="case">
                <input type="checkbox" disabled={!peutModifier} checked={!!p?.chapeau_paye} onChange={(e) => majPart(m.user_id, { chapeau_paye: e.target.checked })} />
                Chapeau
              </label>
              <NumeroTire valeur={p?.numero_tire ?? ''} disabled={!peutModifier} enregistrer={(v) => majPart(m.user_id, { numero_tire: v || null })} />
              {peutModifier && <button type="button" className="lien-mini" onClick={() => retirerDeLaJournee(m.user_id)}>Retirer</button>}
            </li>
          )
        })}
      </ul>
      {peutModifier && absents.length > 0 && (
        <div className="bloc">
          <strong>Ajouter à cette journée</strong>
          <p className="message">Les habituels ne sont pas inscrits d'office : ajoute ceux qui chassent aujourd'hui.</p>
          <ul className="liste">
            {absents.map((m) => (
              <li key={m.user_id} className="quota">
                <span>{m.prenom} {m.nom}{m.role === 'chasseur' && !m.habituel ? ' (invité)' : ''}</span>
                <button type="button" className="bouton-petit" onClick={() => majPart(m.user_id, {})}>+ Ajouter</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {peutModifier && (
        <button type="button" className="lien-mini" style={{ marginTop: 12 }} onClick={supprimerJournee}>Supprimer cette journée</button>
      )}
      {erreur && <p className="message erreur">{erreur}</p>}
    </div>
  )
}

function NumeroTire({ valeur, disabled, enregistrer }) {
  const [v, setV] = useState(valeur)
  useEffect(() => { setV(valeur) }, [valeur])
  return (
    <input
      style={{ width: 70, flex: 'none' }}
      value={v}
      disabled={disabled}
      placeholder="N° tiré"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== valeur) enregistrer(v.trim()) }}
    />
  )
}
