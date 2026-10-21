import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const entier = (t) => {
  const n = parseInt(t, 10)
  return Number.isNaN(n) ? null : n
}

// Attribution des postes d'une battue pour une journée, à partir du numéro tiré au rond.
export default function AffectationBattue({ journee, jb, battue, parts, nomDe, peutModifier, rechargerJb }) {
  const [postes, setPostes] = useState([])
  const [off, setOff] = useState([])
  const [affs, setAffs] = useState([])
  const [decalage, setDecalage] = useState(String(jb.decalage ?? 0))
  const [erreur, setErreur] = useState('')
  const [info, setInfo] = useState('')

  const charger = useCallback(async () => {
    const p = await supabase.from('postes').select('*').eq('battue_id', battue.id)
    const o = await supabase.from('journee_postes_off').select('*').eq('journee_id', journee.id)
    const a = await supabase.from('journee_affectations').select('*').eq('journee_id', journee.id).eq('battue_id', battue.id)
    const err = p.error || o.error || a.error
    if (err) return setErreur(err.message)
    p.data.sort((x, y) => (entier(x.numero) ?? 9999) - (entier(y.numero) ?? 9999) || x.numero.localeCompare(y.numero))
    setPostes(p.data); setOff(o.data.map((x) => x.poste_id)); setAffs(a.data)
  }, [battue.id, journee.id])

  useEffect(() => { charger() }, [charger])

  const actifs = postes.filter((p) => !off.includes(p.id))
  const affDe = (posteId) => affs.find((a) => a.poste_id === posteId)

  async function basculerPoste(p, actif) {
    setErreur(''); setInfo('')
    let r
    if (actif) r = await supabase.from('journee_postes_off').delete().eq('journee_id', journee.id).eq('poste_id', p.id)
    else r = await supabase.from('journee_postes_off').insert({ journee_id: journee.id, poste_id: p.id })
    if (r.error) return setErreur(r.error.message)
    charger()
  }

  async function majDecalage() {
    const v = parseInt(decalage, 10) || 0
    if (v === (jb.decalage ?? 0)) return
    const { error } = await supabase.from('journee_battues').update({ decalage: v }).eq('id', jb.id)
    if (error) return setErreur(error.message)
    rechargerJb()
  }

  async function calculer() {
    setErreur(''); setInfo('')
    const M = actifs.length
    if (M === 0) return setErreur('Cette battue n\'a aucun poste actif.')
    if (affs.length > 0 && !window.confirm('Recalculer remplace les attributions actuelles de cette battue. Continuer ?')) return
    const dec = parseInt(decalage, 10) || 0
    const candidats = parts
      .filter((p) => p.present && entier(p.numero_tire) !== null)
      .sort((x, y) => entier(x.numero_tire) - entier(y.numero_tire))
    const pris = new Set()
    const lignes = []
    candidats.forEach((p) => {
      const n = entier(p.numero_tire)
      let k = (((n - 1 + dec) % M) + M) % M
      let essais = 0
      while (pris.has(k) && essais < M) { k = (k + 1) % M; essais += 1 }
      if (pris.has(k)) return // plus de poste libre
      pris.add(k)
      lignes.push({ journee_id: journee.id, battue_id: battue.id, poste_id: actifs[k].id, participant_id: p.id })
    })
    let r = await supabase.from('journee_affectations').delete().eq('journee_id', journee.id).eq('battue_id', battue.id)
    if (r.error) return setErreur(r.error.message)
    if (lignes.length) {
      r = await supabase.from('journee_affectations').insert(lignes)
      if (r.error) return setErreur(r.error.message)
    }
    const sans = candidats.length - lignes.length
    setInfo(`${lignes.length} chasseur(s) placé(s)` + (sans > 0 ? ` — ${sans} sans poste libre` : ''))
    charger()
  }

  async function choisir(poste, participantId) {
    setErreur(''); setInfo('')
    let r = await supabase.from('journee_affectations').delete().eq('journee_id', journee.id).eq('poste_id', poste.id)
    if (r.error) return setErreur(r.error.message)
    if (participantId) {
      r = await supabase.from('journee_affectations').delete().eq('journee_id', journee.id).eq('battue_id', battue.id).eq('participant_id', participantId)
      if (r.error) return setErreur(r.error.message)
      r = await supabase.from('journee_affectations').insert({ journee_id: journee.id, battue_id: battue.id, poste_id: poste.id, participant_id: participantId })
      if (r.error) return setErreur(r.error.message)
    }
    charger()
  }

  const placesIds = new Set(affs.map((a) => a.participant_id))
  const sansPoste = parts.filter((p) => p.present && !placesIds.has(p.id))
  const titre = [battue.numero && `N° ${battue.numero}`, battue.nom].filter(Boolean).join(' — ')

  return (
    <div className="bloc">
      <strong>Battue {titre}</strong>
      {postes.length === 0 && <p className="message">Cette battue n'a pas encore de postes.</p>}

      {peutModifier && postes.length > 0 && (
        <>
          <div className="rangee" style={{ margin: '8px 0' }}>
            <span style={{ fontSize: '0.85rem' }}>Décalage du numéro tiré :</span>
            <input
              type="number"
              style={{ maxWidth: 80, flex: 'none' }}
              value={decalage}
              onChange={(e) => setDecalage(e.target.value)}
              onBlur={majDecalage}
            />
          </div>
          <p className="message">
            0 = le numéro tiré est le numéro du poste. +3 = le chasseur n°6 va au 9ᵉ poste. Après le dernier poste, on repart du premier.
          </p>
          <div className="cases-postes" style={{ margin: '8px 0' }}>
            {postes.map((p) => (
              <label key={p.id} className="case">
                <input type="checkbox" checked={!off.includes(p.id)} onChange={(e) => basculerPoste(p, e.target.checked)} />
                {p.numero}
              </label>
            ))}
          </div>
          <p className="message">Décoche les postes non utilisés aujourd'hui ({actifs.length} actif(s)).</p>
          <button type="button" className="bouton-petit" onClick={calculer}>Calculer les postes</button>
        </>
      )}

      <ul className="liste" style={{ marginTop: 10 }}>
        {actifs.map((p) => {
          const a = affDe(p.id)
          const occupant = a && parts.find((x) => x.id === a.participant_id)
          return (
            <li key={p.id} className="quota">
              <span>Poste {p.numero}</span>
              {peutModifier ? (
                <select
                  value={a?.participant_id ?? ''}
                  onChange={(e) => choisir(p, e.target.value)}
                  style={{ maxWidth: 190, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, padding: 6, color: 'var(--ink)' }}
                >
                  <option value="">—</option>
                  {parts.map((x) => <option key={x.id} value={x.id}>{nomDe(x)}{x.numero_tire ? ` (n°${x.numero_tire})` : ''}</option>)}
                </select>
              ) : (
                <span>{occupant ? nomDe(occupant) : '—'}</span>
              )}
            </li>
          )
        })}
      </ul>
      {sansPoste.length > 0 && (
        <p className="message erreur">Sans poste : {sansPoste.map(nomDe).join(', ')}</p>
      )}
      {info && <p className="message info">{info}</p>}
      {erreur && <p className="message erreur">{erreur}</p>}
    </div>
  )
}
