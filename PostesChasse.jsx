import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

const num = (p) => {
  const n = parseInt(p.numero, 10)
  return Number.isNaN(n) ? null : n
}

// Liste fixe des postes d'une chasse, placés sur une vraie carte (OpenStreetMap via Leaflet).
export default function PostesChasse({ chasseId, conseils, peutModifier }) {
  const [postes, setPostes] = useState([])
  const [selId, setSelId] = useState(null)
  const [ajout, setAjout] = useState(false)
  const [erreur, setErreur] = useState('')
  const [de, setDe] = useState('')
  const [a, setA] = useState('')
  const [conseilA, setConseilA] = useState('')
  const [conseilB, setConseilB] = useState('')

  const divRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const moiRef = useRef(null)
  const ajoutRef = useRef(false)
  const creerRef = useRef(null)
  const dejaCadre = useRef(false)

  const charger = useCallback(async () => {
    const { data, error } = await supabase.from('postes').select('*').eq('chasse_id', chasseId).eq('fixe', true)
    if (error) return setErreur(error.message)
    data.sort((x, y) => (num(x) ?? 9999) - (num(y) ?? 9999) || x.numero.localeCompare(y.numero))
    setPostes(data)
  }, [chasseId])

  useEffect(() => { charger() }, [charger])

  useEffect(() => { ajoutRef.current = ajout }, [ajout])

  // Création de la carte (une seule fois).
  useEffect(() => {
    const L = window.L
    if (!L) { setErreur('La carte n\'a pas pu se charger (vérifie ta connexion internet).'); return }
    const map = L.map(divRef.current).setView([50.5, 4.7], 8)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map)
    map.on('click', (e) => { if (ajoutRef.current && creerRef.current) creerRef.current(e.latlng) })
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  async function creerPoste(latlng) {
    setAjout(false)
    const max = postes.reduce((m, p) => Math.max(m, num(p) ?? 0), 0)
    const { data, error } = await supabase.from('postes').insert({
      chasse_id: chasseId,
      numero: String(max + 1),
      lat: latlng.lat,
      lng: latlng.lng,
      conseil_id: conseils.length === 1 ? conseils[0].id : null,
      fixe: true,
    }).select().single()
    if (error) return setErreur(error.message)
    setSelId(data.id)
    charger()
  }
  creerRef.current = creerPoste

  async function maj(id, patch) {
    setErreur('')
    const { error } = await supabase.from('postes').update(patch).eq('id', id)
    if (error) return setErreur(error.message)
    charger()
  }

  async function supprimer(id) {
    if (!window.confirm('Supprimer ce poste ?')) return
    const { error } = await supabase.from('postes').delete().eq('id', id)
    if (error) return setErreur(error.message)
    setSelId(null)
    charger()
  }

  // Dessin des marqueurs à chaque changement de la liste.
  useEffect(() => {
    const L = window.L
    const map = mapRef.current
    if (!L || !map) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
    const pts = []
    postes.forEach((p) => {
      if (p.lat == null || p.lng == null) return
      const el = document.createElement('div')
      el.className = 'pin' + (p.id === selId ? ' sel' : '')
      el.textContent = p.numero
      const marker = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: '', html: el, iconSize: [30, 30], iconAnchor: [15, 15] }),
        draggable: peutModifier,
      }).addTo(map)
      marker.on('click', () => setSelId(p.id))
      marker.on('dragend', () => {
        const ll = marker.getLatLng()
        maj(p.id, { lat: ll.lat, lng: ll.lng })
      })
      markersRef.current.push(marker)
      pts.push([p.lat, p.lng])
    })
    if (!dejaCadre.current && pts.length > 0) {
      map.fitBounds(pts, { padding: [30, 30], maxZoom: 16 })
      dejaCadre.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postes, selId, peutModifier])

  function seLocaliser() {
    setErreur('')
    if (!navigator.geolocation) return setErreur('La géolocalisation n\'est pas disponible sur cet appareil.')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const L = window.L
        const map = mapRef.current
        if (!L || !map) return
        const ll = [pos.coords.latitude, pos.coords.longitude]
        if (moiRef.current) moiRef.current.remove()
        moiRef.current = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 2, fillColor: '#2a6fdb', fillOpacity: 1 }).addTo(map)
        map.setView(ll, 16)
      },
      () => setErreur('Position impossible à obtenir : autorise la localisation pour ce site.'),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  async function appliquerPlage(e) {
    e.preventDefault()
    setErreur('')
    const d = parseInt(de, 10)
    const f = parseInt(a, 10)
    if (Number.isNaN(d) || Number.isNaN(f) || d > f) return setErreur('Indique une plage valide (de … à …).')
    if (!conseilA || !conseilB || conseilA === conseilB) return setErreur('Choisis deux conseils différents.')
    const dans = postes.filter((p) => num(p) !== null && num(p) >= d && num(p) <= f).map((p) => p.id)
    const hors = postes.filter((p) => num(p) !== null && (num(p) < d || num(p) > f)).map((p) => p.id)
    const r1 = dans.length ? await supabase.from('postes').update({ conseil_id: conseilA }).in('id', dans) : {}
    const r2 = hors.length ? await supabase.from('postes').update({ conseil_id: conseilB }).in('id', hors) : {}
    if (r1.error || r2.error) return setErreur((r1.error || r2.error).message)
    charger()
  }

  const nomConseil = (id) => conseils.find((c) => c.id === id)?.nom
  const poste = postes.find((p) => p.id === selId)

  return (
    <div>
      <h3 className="h3">Mes postes</h3>
      <div className="rangee" style={{ marginBottom: 8 }}>
        {peutModifier && (
          <button type="button" className="bouton-petit" onClick={() => setAjout(!ajout)}>
            {ajout ? 'Annuler' : '+ Poste'}
          </button>
        )}
        <button type="button" className="bouton-petit" onClick={seLocaliser}>📍 Me localiser</button>
      </div>
      {ajout && <p className="message info">Touche la carte à l'endroit du nouveau poste.</p>}
      <div ref={divRef} className={'carte-osm' + (ajout ? ' ajout' : '')} />
      <p className="message" style={{ marginTop: 4 }}>
        {postes.length} poste(s){peutModifier ? ' · glisse un numéro pour le déplacer' : ''}
      </p>

      {poste && (
        <PanneauPoste
          key={poste.id}
          poste={poste}
          conseils={conseils}
          peutModifier={peutModifier}
          maj={(patch) => maj(poste.id, patch)}
          supprimer={() => supprimer(poste.id)}
          fermer={() => setSelId(null)}
        />
      )}

      {peutModifier && conseils.length >= 2 && (
        <form onSubmit={appliquerPlage} className="bloc">
          <strong>Attribution rapide par plage</strong>
          <div className="rangee" style={{ marginTop: 6 }}>
            <span>Postes</span>
            <input type="number" min="0" value={de} onChange={(e) => setDe(e.target.value)} placeholder="de" />
            <span>à</span>
            <input type="number" min="0" value={a} onChange={(e) => setA(e.target.value)} placeholder="à" />
          </div>
          <div className="rangee" style={{ marginTop: 6 }}>
            <span>→</span>
            <select value={conseilA} onChange={(e) => setConseilA(e.target.value)}>
              <option value="">Conseil de la plage…</option>
              {conseils.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          <div className="rangee" style={{ marginTop: 6 }}>
            <span>Les autres →</span>
            <select value={conseilB} onChange={(e) => setConseilB(e.target.value)}>
              <option value="">Conseil des autres…</option>
              {conseils.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          <button type="submit" className="bouton-petit" style={{ marginTop: 8 }}>Appliquer</button>
        </form>
      )}

      <ul className="liste" style={{ marginTop: 8 }}>
        {postes.map((p) => (
          <li key={p.id}>
            <button type="button" className="ligne-bouton" onClick={() => {
              setSelId(p.id)
              if (p.lat != null && mapRef.current) mapRef.current.setView([p.lat, p.lng], Math.max(mapRef.current.getZoom(), 16))
            }}>
              <span>Poste {p.numero}{nomConseil(p.conseil_id) ? ` · ${nomConseil(p.conseil_id)}` : ''}</span>
              <span>›</span>
            </button>
          </li>
        ))}
      </ul>
      {erreur && <p className="message erreur">{erreur}</p>}
    </div>
  )
}

function PanneauPoste({ poste, conseils, peutModifier, maj, supprimer, fermer }) {
  const [numero, setNumero] = useState(poste.numero)
  const [contraintes, setContraintes] = useState(poste.contraintes ?? '')

  return (
    <div className="bloc">
      <div className="bloc-titre">
        <strong>Poste {poste.numero}</strong>
        <button type="button" className="lien-mini" style={{ color: 'var(--ink-soft)' }} onClick={fermer}>Fermer</button>
      </div>
      <div className="champ-groupe">
        <div className="champ">
          <label>Numéro</label>
          <input
            value={numero}
            disabled={!peutModifier}
            onChange={(e) => setNumero(e.target.value)}
            onBlur={() => { if (numero.trim() && numero !== poste.numero) maj({ numero: numero.trim() }) }}
          />
        </div>
        {conseils.length > 0 && (
          <div className="champ">
            <label>Conseil cynégétique</label>
            <select
              value={poste.conseil_id ?? ''}
              disabled={!peutModifier}
              onChange={(e) => maj({ conseil_id: e.target.value || null })}
              style={{ width: '100%' }}
            >
              <option value="">—</option>
              {conseils.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
        )}
        <div className="champ">
          <label>Contraintes (valables toute la saison)</label>
          <textarea
            rows="3"
            value={contraintes}
            disabled={!peutModifier}
            placeholder="Ex. tir à droite interdit, attention route à gauche"
            onChange={(e) => setContraintes(e.target.value)}
            onBlur={() => { if (contraintes !== (poste.contraintes ?? '')) maj({ contraintes }) }}
          />
        </div>
        {peutModifier && (
          <button type="button" className="lien-mini" style={{ textAlign: 'left' }} onClick={supprimer}>
            Supprimer ce poste
          </button>
        )}
      </div>
    </div>
  )
}
