import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

const PALETTE = ['#d64545', '#2f6fd6', '#d98e00', '#8a4fd6', '#12908e', '#d6559a']
function clair(hex) {
  const n = parseInt(hex.slice(1), 16)
  const m = (c) => Math.round(c + (255 - c) * 0.62)
  return `rgb(${m((n >> 16) & 255)},${m((n >> 8) & 255)},${m(n & 255)})`
}

const num = (p) => {
  const n = parseInt(p.numero, 10)
  return Number.isNaN(n) ? null : n
}

// Liste fixe des postes d'une chasse, placés sur une vraie carte (OpenStreetMap via Leaflet).
export default function PostesChasse({ battue, chasseId, conseils, peutModifier, majBattue, zoneVoisine }) {
  const [postes, setPostes] = useState([])
  const [selId, setSelId] = useState(null)
  const [ajout, setAjout] = useState(false)
  const [trace, setTrace] = useState(null) // points de la zone en cours de tracé (ou null)
  const [erreur, setErreur] = useState('')
  const [de, setDe] = useState('')
  const [a, setA] = useState('')
  const [conseilA, setConseilA] = useState('')
  const [conseilB, setConseilB] = useState('')
  const [recherche, setRecherche] = useState('')
  const [parkings, setParkings] = useState([])
  const [dessertes, setDessertes] = useState([])
  const [selPark, setSelPark] = useState(null)
  const [ajoutPark, setAjoutPark] = useState(false)

  const divRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const moiRef = useRef(null)
  const ajoutRef = useRef(false)
  const ajoutParkRef = useRef(false)
  const creerParkRef = useRef(null)
  const markersParkRef = useRef([])
  const traceRef = useRef(null)
  const zoneRef = useRef(null)
  const apercuRef = useRef(null)
  const creerRef = useRef(null)
  const dejaCadre = useRef(false)

  const charger = useCallback(async () => {
    const { data, error } = await supabase.from('postes').select('*').eq('chasse_id', chasseId).eq('battue_id', battue.id)
    if (error) return setErreur(error.message)
    data.sort((x, y) => (num(x) ?? 9999) - (num(y) ?? 9999) || x.numero.localeCompare(y.numero))
    setPostes(data)
  }, [chasseId, battue.id])

  useEffect(() => { charger() }, [charger])

  const chargerParkings = useCallback(async () => {
    const { data, error } = await supabase.from('parkings').select('*').eq('battue_id', battue.id).order('nom')
    if (error) return setErreur(error.message)
    setParkings(data)
    if (data.length === 0) return setDessertes([])
    const r = await supabase.from('parking_postes_desservis').select('*').in('parking_id', data.map((k) => k.id))
    if (r.error) return setErreur(r.error.message)
    setDessertes(r.data)
  }, [battue.id])

  useEffect(() => { chargerParkings() }, [chargerParkings])

  useEffect(() => { ajoutRef.current = ajout }, [ajout])
  useEffect(() => { ajoutParkRef.current = ajoutPark }, [ajoutPark])
  useEffect(() => { traceRef.current = trace }, [trace])

  // Création de la carte (une seule fois).
  useEffect(() => {
    const L = window.L
    if (!L) { setErreur('La carte n\'a pas pu se charger (vérifie ta connexion internet).'); return }
    const map = L.map(divRef.current).setView([50.5, 4.7], 8)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map)
    map.on('click', (e) => {
      if (ajoutRef.current && creerRef.current) creerRef.current(e.latlng)
      else if (ajoutParkRef.current && creerParkRef.current) creerParkRef.current(e.latlng)
      else if (traceRef.current) setTrace((t) => (t ? [...t, [e.latlng.lat, e.latlng.lng]] : t))
    })
    mapRef.current = map
    // La carte s'est parfois créée avant que son cadre ait sa taille finale : on la remesure.
    const t1 = setTimeout(() => map.invalidateSize(), 100)
    const t2 = setTimeout(() => map.invalidateSize(), 600)
    // Nouvelle battue sans zone : on commence là où se trouvent les autres battues.
    if (!battue.zone_geojson && zoneVoisine) {
      try { map.fitBounds(L.geoJSON(zoneVoisine).getBounds(), { padding: [20, 20], maxZoom: 15 }) } catch (e) { /* ignore */ }
    }
    return () => { clearTimeout(t1); clearTimeout(t2); map.remove(); mapRef.current = null }
  }, [])

  async function creerPoste(latlng) {
    // On garde le mode « ajout » actif (pour enchaîner les postes) et on ne recadre plus la carte.
    dejaCadre.current = true
    const max = postes.reduce((m, p) => Math.max(m, num(p) ?? 0), 0)
    const { data, error } = await supabase.from('postes').insert({
      chasse_id: chasseId,
      battue_id: battue.id,
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

  async function creerParking(latlng) {
    dejaCadre.current = true
    setAjoutPark(false)
    const { data, error } = await supabase.from('parkings').insert({
      battue_id: battue.id,
      nom: `Parking ${parkings.length + 1}`,
      lat: latlng.lat,
      lng: latlng.lng,
      couleur: PALETTE[parkings.length % PALETTE.length],
    }).select().single()
    if (error) return setErreur(error.message)
    setSelId(null)
    setSelPark(data.id)
    chargerParkings()
  }
  creerParkRef.current = creerParking

  async function majParking(id, patch) {
    setErreur('')
    const { error } = await supabase.from('parkings').update(patch).eq('id', id)
    if (error) return setErreur(error.message)
    chargerParkings()
  }

  async function supprimerParking(id) {
    if (!window.confirm('Supprimer ce parking ?')) return
    const { error } = await supabase.from('parkings').delete().eq('id', id)
    if (error) return setErreur(error.message)
    setSelPark(null)
    chargerParkings()
  }

  // Un poste n'est desservi que par un seul parking : on retire l'ancienne desserte avant d'ajouter la nouvelle.
  async function basculerDesserte(parkingId, posteId, actif) {
    setErreur('')
    let r = await supabase.from('parking_postes_desservis').delete().eq('poste_id', posteId)
    if (r.error) return setErreur(r.error.message)
    if (actif) {
      r = await supabase.from('parking_postes_desservis').insert({ parking_id: parkingId, poste_id: posteId })
      if (r.error) return setErreur(r.error.message)
    }
    chargerParkings()
  }

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

  // Zone de la battue (polygone enregistré).
  useEffect(() => {
    const L = window.L
    const map = mapRef.current
    if (!L || !map) return
    if (zoneRef.current) { zoneRef.current.remove(); zoneRef.current = null }
    let zone = battue.zone_geojson
    if (typeof zone === 'string') { try { zone = JSON.parse(zone) } catch (e) { zone = null } }
    if (zone) {
      try {
        zoneRef.current = L.geoJSON(zone, { style: { color: '#3f5a35', weight: 2, fillColor: '#5b7a4d', fillOpacity: 0.15 }, interactive: false }).addTo(map)
        if (!dejaCadre.current) {
          map.fitBounds(zoneRef.current.getBounds(), { padding: [40, 40], maxZoom: 17 })
          dejaCadre.current = true
        }
      } catch (e) {
        setErreur('Zone illisible : retrace-la.')
      }
    }
  }, [battue.zone_geojson])

  // Aperçu de la zone en cours de tracé.
  useEffect(() => {
    const L = window.L
    const map = mapRef.current
    if (!L || !map) return
    if (apercuRef.current) { apercuRef.current.remove(); apercuRef.current = null }
    if (trace && trace.length > 0) {
      const g = L.layerGroup()
      L.polygon(trace, { color: '#c1502e', weight: 2, dashArray: '5 5', fillOpacity: 0.1, interactive: false }).addTo(g)
      trace.forEach((pt) => L.circleMarker(pt, { radius: 4, color: '#c1502e', fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(g))
      g.addTo(map)
      apercuRef.current = g
    }
  }, [trace])

  function validerZone() {
    if (!trace || trace.length < 3) return setErreur('Place au moins 3 points pour fermer la zone.')
    const ring = trace.map(([lat, lng]) => [lng, lat])
    ring.push(ring[0])
    dejaCadre.current = true // on reste sur la vue actuelle, sans zoomer
    majBattue({ zone_geojson: { type: 'Polygon', coordinates: [ring] } })
    setTrace(null)
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
      if (p.id !== selId) {
        const d = dessertes.find((x) => x.poste_id === p.id)
        const k = d && parkings.find((x) => x.id === d.parking_id)
        if (k?.couleur) { el.style.background = clair(k.couleur); el.style.borderColor = k.couleur; el.style.color = '#222' }
      }
      const marker = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: '', html: el, iconSize: [30, 30], iconAnchor: [15, 15] }),
        draggable: peutModifier,
      }).addTo(map)
      marker.on('click', () => { setSelPark(null); setSelId(p.id) })
      marker.on('dragend', () => {
        const ll = marker.getLatLng()
        maj(p.id, { lat: ll.lat, lng: ll.lng })
      })
      markersRef.current.push(marker)
      pts.push([p.lat, p.lng])
    })
    if (!dejaCadre.current && pts.length > 0) {
      map.fitBounds(pts, { padding: [40, 40], maxZoom: 17 })
      dejaCadre.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postes, selId, peutModifier, parkings, dessertes])

  // Marqueurs des parkings (carrés avec un P, couleur propre à chaque parking).
  useEffect(() => {
    const L = window.L
    const map = mapRef.current
    if (!L || !map) return
    markersParkRef.current.forEach((m) => m.remove())
    markersParkRef.current = []
    parkings.forEach((k) => {
      if (k.lat == null || k.lng == null) return
      const el = document.createElement('div')
      el.className = 'pin parking-pin' + (k.id === selPark ? ' sel' : '')
      el.textContent = 'P'
      if (k.id !== selPark && k.couleur) { el.style.background = k.couleur }
      const marker = L.marker([k.lat, k.lng], {
        icon: L.divIcon({ className: '', html: el, iconSize: [30, 30], iconAnchor: [15, 15] }),
        draggable: peutModifier,
        zIndexOffset: 500,
      }).addTo(map)
      marker.on('click', () => { setSelId(null); setSelPark(k.id) })
      marker.on('dragend', () => {
        const ll = marker.getLatLng()
        majParking(k.id, { lat: ll.lat, lng: ll.lng })
      })
      markersParkRef.current.push(marker)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkings, selPark, peutModifier])

  function recentrer() {
    const map = mapRef.current
    if (!map) return
    map.invalidateSize()
    if (zoneRef.current) map.fitBounds(zoneRef.current.getBounds(), { padding: [40, 40], maxZoom: 17 })
    else if (markersRef.current.length) map.fitBounds(markersRef.current.map((m) => m.getLatLng()), { padding: [40, 40], maxZoom: 17 })
  }

  async function chercherLieu(e) {
    e.preventDefault()
    setErreur('')
    if (!recherche.trim()) return
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(recherche.trim()))
      const d = await r.json()
      if (!d.length) return setErreur('Lieu introuvable.')
      mapRef.current.setView([parseFloat(d[0].lat), parseFloat(d[0].lon)], 14)
    } catch (err) {
      setErreur('Recherche impossible pour le moment.')
    }
  }

  function seLocaliser() {
    setErreur('')
    if (!navigator.geolocation) return setErreur('La géolocalisation n\'est pas disponible sur cet appareil.')
    const afficher = (pos) => {
      const L = window.L
      const map = mapRef.current
      if (!L || !map) return
      const ll = [pos.coords.latitude, pos.coords.longitude]
      if (moiRef.current) moiRef.current.remove()
      moiRef.current = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 2, fillColor: '#2a6fdb', fillOpacity: 1 }).addTo(map)
      map.setView(ll, 16)
    }
    const echec = (err) => {
      if (err.code === 1) setErreur('Localisation refusée : autorise-la pour ce site dans les réglages du navigateur (et de l\'appareil), puis recharge la page.')
      else if (err.code === 3) setErreur('La localisation prend trop de temps : réessaie, de préférence à l\'extérieur.')
      else setErreur('Position indisponible sur cet appareil (' + (err.message || 'inconnue') + '). Sur un ordinateur sans GPS, c\'est fréquent : essaie sur ton téléphone.')
    }
    // 1er essai précis (GPS), puis 2e essai moins précis (Wi-Fi/réseau) si ça échoue.
    navigator.geolocation.getCurrentPosition(
      afficher,
      (err) => {
        if (err.code === 1) return echec(err)
        navigator.geolocation.getCurrentPosition(afficher, echec, { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 })
      },
      { enableHighAccuracy: true, timeout: 10000 },
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
      <h3 className="h3">Postes de cette battue</h3>
      <form onSubmit={chercherLieu} className="rangee" style={{ marginBottom: 8 }}>
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher un village, une adresse…" />
        <button type="submit" className="bouton-petit">🔍</button>
      </form>
      <div className="rangee" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
        {peutModifier && (
          <button type="button" className="bouton-petit" onClick={() => { setTrace(null); setAjoutPark(false); setAjout(!ajout) }}>
            {ajout ? 'Terminé' : '+ Poste'}
          </button>
        )}
        {peutModifier && (
          <button type="button" className="bouton-petit" onClick={() => { setTrace(null); setAjout(false); setAjoutPark(!ajoutPark) }}>
            {ajoutPark ? 'Annuler' : '+ Parking'}
          </button>
        )}
        {peutModifier && !trace && (
          <button type="button" className="bouton-petit" onClick={() => { setAjout(false); setAjoutPark(false); setTrace([]) }}>
            ✏️ {battue.zone_geojson ? 'Retracer la zone' : 'Tracer la zone'}
          </button>
        )}
        {peutModifier && trace && (
          <>
            <button type="button" className="bouton-petit" onClick={validerZone}>Valider la zone</button>
            <button type="button" className="lien-mini" onClick={() => setTrace(null)}>Annuler</button>
          </>
        )}
        <button type="button" className="bouton-petit" onClick={seLocaliser}>📍 Me localiser</button>
        <button type="button" className="bouton-petit" onClick={recentrer}>⤢ Recentrer</button>
      </div>
      {trace && <p className="message info">Touche la carte pour poser les coins de la zone ({trace.length} point(s)), puis « Valider la zone ».</p>}
      {ajoutPark && <p className="message info">Touche la carte à l'emplacement du parking.</p>}
      {ajout && <p className="message info">Touche la carte pour placer chaque poste (numérotés à la suite). Appuie sur « Terminé » quand tu as fini.</p>}
      <div ref={divRef} className={'carte-osm' + (ajout || ajoutPark || trace ? ' ajout' : '')} />
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

      {parkings.find((k) => k.id === selPark) && (
        <PanneauParking
          key={selPark}
          parking={parkings.find((k) => k.id === selPark)}
          postes={postes}
          dessertes={dessertes}
          peutModifier={peutModifier}
          majParking={(patch) => majParking(selPark, patch)}
          basculer={(posteId, actif) => basculerDesserte(selPark, posteId, actif)}
          supprimer={() => supprimerParking(selPark)}
          fermer={() => setSelPark(null)}
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
        {parkings.map((k) => (
          <li key={k.id}>
            <button type="button" className="ligne-bouton" style={{ borderLeft: `6px solid ${k.couleur || '#999'}` }} onClick={() => {
              setSelId(null); setSelPark(k.id)
              if (k.lat != null && mapRef.current) mapRef.current.setView([k.lat, k.lng], Math.max(mapRef.current.getZoom(), 16))
            }}>
              <span>🅿️ {k.nom} · {dessertes.filter((d) => d.parking_id === k.id).length} poste(s)</span>
              <span>›</span>
            </button>
          </li>
        ))}
        {postes.map((p) => (
          <li key={p.id}>
            <button type="button" className="ligne-bouton" onClick={() => {
              setSelPark(null); setSelId(p.id)
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

function PanneauParking({ parking, postes, dessertes, peutModifier, majParking, basculer, supprimer, fermer }) {
  const [nom, setNom] = useState(parking.nom)
  const miens = new Set(dessertes.filter((d) => d.parking_id === parking.id).map((d) => d.poste_id))
  const autre = (posteId) => dessertes.find((d) => d.poste_id === posteId && d.parking_id !== parking.id)

  return (
    <div className="bloc" style={{ borderLeft: `6px solid ${parking.couleur || '#999'}` }}>
      <div className="bloc-titre">
        <strong>{parking.nom}</strong>
        <button type="button" className="lien-mini" style={{ color: 'var(--ink-soft)' }} onClick={fermer}>Fermer</button>
      </div>
      <div className="champ-groupe">
        <div className="champ">
          <label>Nom du parking</label>
          <input
            value={nom}
            disabled={!peutModifier}
            onChange={(e) => setNom(e.target.value)}
            onBlur={() => { if (nom.trim() && nom !== parking.nom) majParking({ nom: nom.trim() }) }}
          />
        </div>
        <div className="champ">
          <label>Postes desservis par ce parking</label>
          {postes.length === 0 && <p className="message">Place d'abord des postes sur la carte.</p>}
          <div className="cases-postes">
            {postes.map((p) => (
              <label key={p.id} className="case" style={{ opacity: autre(p.id) ? 0.55 : 1 }}>
                <input
                  type="checkbox"
                  disabled={!peutModifier}
                  checked={miens.has(p.id)}
                  onChange={(e) => basculer(p.id, e.target.checked)}
                />
                {p.numero}
              </label>
            ))}
          </div>
          <p className="message">Un poste n'a qu'un parking : cocher un poste déjà pris le déplace ici.</p>
        </div>
        {peutModifier && (
          <button type="button" className="lien-mini" style={{ textAlign: 'left' }} onClick={supprimer}>
            Supprimer ce parking
          </button>
        )}
      </div>
    </div>
  )
}
