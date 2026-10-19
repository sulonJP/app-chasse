import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import PostesChasse from './PostesChasse'

// Battues réutilisables pour toute la saison ; chacune a sa zone et ses postes.
export default function BattuesChasse({ chasseId, conseils, peutModifier }) {
  const [battues, setBattues] = useState([])
  const [selId, setSelId] = useState(null)
  const [numero, setNumero] = useState('')
  const [nom, setNom] = useState('')
  const [erreur, setErreur] = useState('')

  const charger = useCallback(async () => {
    const { data, error } = await supabase.from('battues').select('*').eq('chasse_id', chasseId).order('created_at')
    if (error) return setErreur(error.message)
    setBattues(data)
  }, [chasseId])

  useEffect(() => { charger() }, [charger])

  async function creer(e) {
    e.preventDefault()
    setErreur('')
    if (!nom.trim() && !numero.trim()) return setErreur('Indique un nom et/ou un numéro.')
    const { data, error } = await supabase.from('battues')
      .insert({ chasse_id: chasseId, nom: nom.trim() || null, numero: numero.trim() || null })
      .select().single()
    if (error) return setErreur(error.message)
    setNom(''); setNumero('')
    await charger()
    setSelId(data.id)
  }

  async function majBattue(id, patch) {
    setErreur('')
    const { error } = await supabase.from('battues').update(patch).eq('id', id)
    if (error) return setErreur(error.message)
    charger()
  }

  async function supprimer(id) {
    if (!window.confirm('Supprimer cette battue et tous ses postes ?')) return
    const { error } = await supabase.from('battues').delete().eq('id', id)
    if (error) return setErreur(error.message)
    setSelId(null)
    charger()
  }

  const titre = (b) => [b.numero && `N° ${b.numero}`, b.nom].filter(Boolean).join(' — ')
  const sel = battues.find((b) => b.id === selId)

  if (sel) {
    return (
      <div>
        <button type="button" className="lien" style={{ textAlign: 'left', margin: 0 }} onClick={() => setSelId(null)}>
          ‹ Mes battues
        </button>
        <h3 className="h3">{titre(sel)}</h3>
        <PostesChasse
          key={sel.id}
          battue={sel}
          chasseId={chasseId}
          conseils={conseils}
          peutModifier={peutModifier}
          majBattue={(patch) => majBattue(sel.id, patch)}
        />
        {peutModifier && (
          <button type="button" className="lien-mini" style={{ marginTop: 12 }} onClick={() => supprimer(sel.id)}>
            Supprimer cette battue
          </button>
        )}
        {erreur && <p className="message erreur">{erreur}</p>}
      </div>
    )
  }

  return (
    <div>
      <h3 className="h3">Mes battues</h3>
      <p className="message">Réutilisables toute la saison : chacune a sa zone et ses postes.</p>
      {battues.length === 0 && <p className="message">Aucune battue pour l'instant.</p>}
      <ul className="liste">
        {battues.map((b) => (
          <li key={b.id}>
            <button type="button" className="ligne-bouton" onClick={() => setSelId(b.id)}>
              <span>{titre(b)}</span><span>›</span>
            </button>
          </li>
        ))}
      </ul>
      {peutModifier && (
        <form onSubmit={creer} className="champ-groupe" style={{ marginTop: 10 }}>
          <div className="rangee">
            <input style={{ flex: '0 0 70px' }} value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="N°" />
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom (ex. Le Grand Bois)" />
            <button type="submit" className="bouton-petit">+ Battue</button>
          </div>
        </form>
      )}
      {erreur && <p className="message erreur">{erreur}</p>}
    </div>
  )
}
