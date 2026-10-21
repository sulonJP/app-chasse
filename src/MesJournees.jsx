import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

const formatDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })

function clair(hex) {
  const n = parseInt(hex.slice(1), 16)
  const m = (c) => Math.round(c + (255 - c) * 0.62)
  return `rgb(${m((n >> 16) & 255)},${m((n >> 8) & 255)},${m(n & 255)})`
}

// Distance (m) et cap (°) entre deux points GPS.
function distance(a, b) {
  const R = 6371000
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
function cap(a, b) {
  const rad = (x) => (x * Math.PI) / 180
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat))
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}
const POINTS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest']
const FLECHES = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️']
function texteVers(pos, cible, nom) {
  if (!pos) return null
  const d = distance(pos, cible)
  const i = Math.round(cap(pos, cible) / 45) % 8
  const dist = d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`
  return `${FLECHES[i]} ${nom} : ${dist} vers le ${POINTS[i]}`
}

// Liste de « mes journées » (celles où je suis inscrit).
export default function MesJournees({ userId, chasses }) {
  const [liste, setListe] = useState([])
  const [sel, setSel] = useState(null)

  const charger = useCallback(async () => {
    const p = await supabase.from('journee_participants').select('*').eq('user_id', userId)
    if (p.error || !p.data.length) return setListe([])
    const j = await supabase.from('journees').select('*').in('id', p.data.map((x) => x.journee_id)).order('date', { ascending: false })
    if (j.error) return
    setListe(j.data.map((journee) => ({ journee, part: p.data.find((x) => x.journee_id === journee.id) })))
  }, [userId])

  useEffect(() => { charger() }, [charger])

  if (sel) {
    return (
      <VueJournee
        journee={sel.journee}
        part={sel.part}
        chasseNom={chasses.find((c) => c.id === sel.journee.chasse_id)?.nom}
        retour={() => setSel(null)}
      />
    )
  }
  if (liste.length === 0) return null

  return (
    <div style={{ marginBottom: 16 }}>
      <h2 className="h2">Mes journées</h2>
      <ul className="liste">
        {liste.slice(0, 8).map((x) => (
          <li key={x.journee.id}>
            <button type="button" className="ligne-bouton" onClick={() => setSel(x)}>
              <span>
                {formatDate(x.journee.date)}
                <small style={{ display: 'block', opacity: 0.7 }}>{chasses.find((c) => c.id === x.journee.chasse_id)?.nom}</small>
              </span>
              <span>›</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function VueJournee({ journee, part, chasseNom, retour }) {
  const [blocs, setBlocs] = useState([])
  const [pos, setPos] = useState(null)
  const [suivi, setSuivi] = useState(false)
  const [erreur, setErreur] = useState('')
  const [chargee, setChargee] = useState(false)
  const watchRef = useRef(null)

  const charger = useCallback(async () => {
    const jb = await supabase.from('journee_battues').select('*').eq('journee_id', journee.id).order('ordre')
    if (jb.error) return setErreur(jb.error.message)
    const battues = jb.data.length ? (await supabase.from('battues').select('*').in('id', jb.data.map((x) => x.battue_id))).data : []
    const affs = (await supabase.from('journee_affectations').select('*').eq('journee_id', journee.id).eq('participant_id', part.id)).data || []
    const postes = affs.length ? (await supabase.from('postes').select('*').in('id', affs.map((a) => a.poste_id))).data : []
    const dess = postes.length ? (await supabase.from('parking_postes_desservis').select('*').in('poste_id', postes.map((p) => p.id))).data : []
    const parkings = dess.length ? (await supabase.from('parkings').select('*').in('id', dess.map((d) => d.parking_id))).data : []
    const cids = [...new Set(postes.map((p) => p.conseil_id).filter(Boolean))]
    const conseils = cids.length ? (await supabase.from('conseils_cynegetiques').select('*').in('id', cids)).data : []
    setBlocs(jb.data.map((x) => {
      const battue = battues.find((b) => b.id === x.battue_id)
      const aff = affs.find((a) => a.battue_id === x.battue_id)
      const poste = aff && postes.find((p) => p.id === aff.poste_id)
      const d = poste && dess.find((y) => y.poste_id === poste.id)
      return {
        id: x.id,
        battue,
        poste,
        parking: d && parkings.find((k) => k.id === d.parking_id),
        conseil: poste && conseils.find((c) => c.id === poste.conseil_id),
      }
    }).filter((x) => x.battue))
    setChargee(true)
  }, [journee.id, part.id])

  useEffect(() => { charger() }, [charger])
  useEffect(() => () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current) }, [])

  function activerPosition() {
    setErreur('')
    if (!navigator.geolocation) return setErreur('La localisation n\'est pas disponible sur cet appareil.')
    if (watchRef.current != null) return
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => { setSuivi(true); setPos({ lat: p.coords.latitude, lng: p.coords.longitude }) },
      (err) => setErreur(err.code === 1 ? 'Localisation refusée : autorise-la pour ce site dans les réglages.' : 'Position indisponible pour le moment.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
  }

  return (
    <div>
      <button type="button" className="lien" style={{ textAlign: 'left', margin: 0 }} onClick={retour}>‹ Mes journées</button>
      <h2 className="h2">{formatDate(journee.date)}</h2>
      {chasseNom && <p className="message">{chasseNom}</p>}
      <div className="rangee" style={{ margin: '8px 0' }}>
        <button type="button" className="bouton-petit" onClick={activerPosition}>{suivi ? '📍 Position active' : '📍 Activer ma position'}</button>
        <button type="button" className="bouton-petit" onClick={charger}>↻ Actualiser</button>
      </div>
      {chargee && blocs.length === 0 && <p className="message">Aucune battue n'est encore prévue pour cette journée.</p>}
      {blocs.map((b) => (
        <div key={b.id} className="bloc">
          <strong>Battue {[b.battue.numero && `N° ${b.battue.numero}`, b.battue.nom].filter(Boolean).join(' — ')}</strong>
          {b.poste ? (
            <>
              <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: '6px 0' }}>Poste {b.poste.numero}</p>
              {b.conseil && <p className="message">{b.conseil.nom}</p>}
              {b.poste.contraintes && (
                <p style={{ margin: '6px 0', padding: 8, border: '1px solid var(--warn)', borderRadius: 8, fontSize: '0.9rem' }}>
                  ⚠️ {b.poste.contraintes}
                </p>
              )}
              {b.parking && <p style={{ margin: '6px 0' }}>🅿️ <strong>{b.parking.nom}</strong></p>}
              {!b.parking && <p className="message">Aucun parking indiqué pour ce poste.</p>}
              {b.parking?.lat != null && pos && <p className="message">{texteVers(pos, { lat: b.parking.lat, lng: b.parking.lng }, 'Parking')}</p>}
              {b.poste.lat != null && pos && <p className="message">{texteVers(pos, { lat: b.poste.lat, lng: b.poste.lng }, 'Poste')}</p>}
              <CarteChasseur zone={b.battue.zone_geojson} poste={b.poste} parking={b.parking} pos={pos} />
            </>
          ) : (
            <p className="message">Ton poste n'est pas encore attribué : vois avec l'organisateur après le rond.</p>
          )}
        </div>
      ))}
      {erreur && <p className="message erreur">{erreur}</p>}
    </div>
  )
}

function CarteChasseur({ zone, poste, parking, pos }) {
  const divRef = useRef(null)
  const mapRef = useRef(null)
  const fixesRef = useRef(null)
  const moiRef = useRef(null)

  useEffect(() => {
    const L = window.L
    if (!L || !divRef.current) return
    const map = L.map(divRef.current).setView([50.5, 4.7], 8)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map)
    fixesRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const t = setTimeout(() => map.invalidateSize(), 200)
    return () => { clearTimeout(t); map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const L = window.L
    const map = mapRef.current
    if (!L || !map) return
    fixesRef.current.clearLayers()
    const pts = []
    let z = zone
    if (typeof z === 'string') { try { z = JSON.parse(z) } catch (e) { z = null } }
    if (z) {
      try {
        const g = L.geoJSON(z, { style: { color: '#3f5a35', weight: 2, fillColor: '#5b7a4d', fillOpacity: 0.12 }, interactive: false }).addTo(fixesRef.current)
        pts.push(g.getBounds().getSouthWest(), g.getBounds().getNorthEast())
      } catch (e) { /* ignore */ }
    }
    if (parking?.lat != null) {
      const el = document.createElement('div')
      el.className = 'pin parking-pin'
      el.textContent = 'P'
      if (parking.couleur) el.style.background = parking.couleur
      L.marker([parking.lat, parking.lng], { icon: L.divIcon({ className: '', html: el, iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(fixesRef.current)
      pts.push([parking.lat, parking.lng])
    }
    if (poste?.lat != null) {
      const el = document.createElement('div')
      el.className = 'pin'
      el.textContent = poste.numero
      if (parking?.couleur) { el.style.background = clair(parking.couleur); el.style.borderColor = parking.couleur; el.style.color = '#222' }
      L.marker([poste.lat, poste.lng], { icon: L.divIcon({ className: '', html: el, iconSize: [30, 30], iconAnchor: [15, 15] }), zIndexOffset: 800 }).addTo(fixesRef.current)
      pts.push([poste.lat, poste.lng])
    }
    if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 17 })
  }, [zone, poste, parking])

  useEffect(() => {
    const L = window.L
    const map = mapRef.current
    if (!L || !map || !pos) return
    if (moiRef.current) moiRef.current.setLatLng([pos.lat, pos.lng])
    else moiRef.current = L.circleMarker([pos.lat, pos.lng], { radius: 8, color: '#fff', weight: 2, fillColor: '#2a6fdb', fillOpacity: 1 }).addTo(map)
  }, [pos])

  return <div ref={divRef} className="carte-osm" style={{ height: 260, marginTop: 8 }} />
}
