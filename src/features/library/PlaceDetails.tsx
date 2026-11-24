import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Building2, Bus, CarFront, Check, CheckCircle2, Compass, ExternalLink, Factory, Flag, Gift, Hotel, MapPin, Move, Pencil, Plane, Shield, ShoppingBag, Star, Trees, TrainFront, Utensils, Waves, X } from 'lucide-react';
import type { Place } from '../../domain/types';
import { atlasRepository, ConflictError } from '../../db/repository';
import {
  saveLocal,
  useMapStore,
  usePersistenceStore,
  useUiStore,
  useUserStore,
} from '../../stores/atlas';
import { finishNoteSave, reconcileNoteDraft, type NoteDraft } from './note-draft';
import { getResearchForPlace } from '../street-leonida/leonida-research';
import RegionalResearch from './RegionalResearch';
import DossierPanel from '../dossier/DossierPanel';
import { getDossierForPlace, getDossierById } from '../dossier/registry';
import { suggestDossierConnections, suggestVehicleConnections, type VehicleConnection } from './place-connections';
import MapArchiveRecord from './MapArchiveRecord';

export default function PlaceDetails({ place, found, onToggleFound }: { place: Place; found: boolean; onToggleFound: (placeId: string) => void }) {
  const favorite = useUserStore((s) => s.favorites.some((f) => f.placeId === place.id));
  const savedNote = useUserStore((s) => s.notes.find((n) => n.placeId === place.id)?.text ?? '');
  const savedRevision = useUserStore(
    (s) => s.notes.find((n) => n.placeId === place.id)?.updatedAt ?? null,
  );
  const collections = useUserStore((s) => s.collections);
  const ready = usePersistenceStore((s) => s.ready);
  const [draft, setDraft] = useState<NoteDraft>({
    text: savedNote,
    revision: savedRevision,
    dirty: false,
    conflict: false,
  });
  const [noteSaved, setNoteSaved] = useState(false);
  const saving = useRef(false);
  const [noteBusy, setNoteBusy] = useState(false);
  useEffect(() => {
    if (!saving.current)
      setDraft((current) => reconcileNoteDraft(current, savedNote, savedRevision));
  }, [savedNote, savedRevision]);
  const [copied, setCopied] = useState(false);
  const [coordinatesCopied, setCoordinatesCopied] = useState(false);
  async function copyCoordinates() { if (!place.position) return; const value = `${place.position.x.toFixed(2)}, ${place.position.y.toFixed(2)}`; try { await navigator.clipboard.writeText(value); setCoordinatesCopied(true); window.setTimeout(() => setCoordinatesCopied(false), 1600); } catch { setCoordinatesCopied(false); } }
  const isPersonal = place.evidence === 'personal';
  const tagText = place.tags.join(' ').toLowerCase();
  const MarkerIcon = /vehicle|car|truck|garage|hangar|kamacho/.test(tagText) ? CarFront
    : /collect|treasure|hidden|unique|egg|weapon|item/.test(tagText) ? Gift
      : /mission|story|event|activity/.test(tagText) ? Flag
        : /airport|airstrip|airbase|plane/.test(tagText) ? Plane
          : /train|rail|metro/.test(tagText) ? TrainFront
            : /bus|transportation/.test(tagText) ? Bus
              : /hotel|lodging/.test(tagText) ? Hotel
                : /government|police|jail|criminal/.test(tagText) ? Shield
                  : /industrial|construction|infrastructure/.test(tagText) ? Factory
                    : /marina|harbor|water|lake|river/.test(tagText) ? Waves
          : /nature|wildlife|swamp|fish|hunt/.test(tagText) ? Trees
            : /restaurant|food|bar|drink/.test(tagText) ? Utensils
              : /store|shop|business|retail/.test(tagText) ? ShoppingBag
            : /building|landmark|office|property/.test(tagText) ? Building2
              : place.category === 'region' ? Compass
                : place.category === 'nature' ? Trees
                  : place.category === 'transport' ? Bus
                    : place.category === 'business' ? Building2 : MapPin;
  const research = getResearchForPlace(place);
  const activeDossier = getDossierForPlace(place.id);
  const [showDossier, setShowDossier] = useState(false);
  const [relatedDossier, setRelatedDossier] = useState<ReturnType<typeof getDossierById> | null>(null);
  const [vehicleRecords, setVehicleRecords] = useState<VehicleConnection[]>([]);
  useEffect(() => { let active = true; fetch(`${import.meta.env.BASE_URL}assets/leonida-database/catalogs/vehicles.json`).then((r) => { if (!r.ok) throw new Error('vehicle data unavailable'); return r.json(); }).then((data: { vehicles?: VehicleConnection[] }) => { if (active && Array.isArray(data.vehicles)) setVehicleRecords(data.vehicles); }).catch(() => { if (active) setVehicleRecords([]); }); return () => { active = false; }; }, []);
  const linkedDossiers = useMemo(() => suggestDossierConnections(place), [place.id, place.title, place.description, place.region, place.tags.join('|')]);
  const linkedVehicles = useMemo(() => suggestVehicleConnections(place, vehicleRecords), [place.id, place.title, place.description, place.region, place.tags.join('|'), vehicleRecords]);
  useEffect(() => {
    setShowDossier(false);
  }, [place.id]);
  async function saveNote() {
    if (saving.current || !draft.dirty || draft.conflict) return;
    saving.current = true;
    setNoteBusy(true);
    const captured = draft;
    let conflict = false;
    const ok = await saveLocal(async () => {
      try {
        await atlasRepository.saveNote(place.id, captured.text, captured.revision);
      } catch (error) {
        conflict = error instanceof ConflictError;
        throw error;
      }
    });
    saving.current = false;
    setNoteBusy(false);
    if (ok) {
      const persisted = useUserStore.getState().notes.find((n) => n.placeId === place.id);
      setDraft((current) =>
        finishNoteSave(current, captured, {
          text: persisted?.text ?? '',
          revision: persisted?.updatedAt ?? null,
        }),
      );
      setNoteSaved((persisted?.text ?? '') === (captured.text.trim() ? captured.text : ''));
    } else if (conflict) setDraft((current) => ({ ...current, conflict: true }));
  }
  async function addToCollection(id: string) {
    const collection = collections.find((c) => c.id === id);
    if (!collection) return;
    await saveLocal(() => atlasRepository.addCollectionPlace(collection.id, place.id));
  }
  async function share() {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('marker', place.id);
    try {
      await navigator.clipboard.writeText(url.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <aside className="detail-panel" aria-label="Place details">
      <header className="panel-heading">
        <span className="eyebrow">{isPersonal ? 'PERSONAL PLACE' : 'PLACE DETAILS'}</span>
        {activeDossier && (
          <button
            className="button"
            onClick={() => {
              setRelatedDossier(null);
              setShowDossier(true);
            }}
          >
            OPEN DOSSIER
          </button>
        )}
        <button
          className="icon-button"
          aria-label="Close place details"
          onClick={() => useMapStore.getState().select(null)}
        >
          <X size={20} />
        </button>
      </header>
      <div className="detail-scroll" style={{ display: showDossier ? "none" : undefined }}>
        <div className="place-title">
          <span className="place-title-icon"><MarkerIcon size={25} aria-hidden="true" /></span>
          <h2>{place.title}</h2>
        </div>
        <p className="evidence-label">
          {isPersonal
            ? 'Personal marker · on this device'
            : !place.position
              ? 'No mapped position'
              : place.evidence === 'uncertain'
                ? 'Uncertain entry · approximate placement'
                : 'Community placement · approximate'}
        </p>
        <div className="place-action-row" aria-label="Marker actions">
          <button
            disabled={!ready}
            className={`button ${favorite ? 'selected' : ''}`}
            onClick={() => void saveLocal(() => atlasRepository.toggleFavorite(place.id))}
          >
            <Star size={16} fill={favorite ? 'currentColor' : 'none'} />
            {favorite ? 'Saved' : 'Favorite'}
          </button>
          <button className={`button ${found ? 'selected' : ''}`} onClick={() => onToggleFound(place.id)}>
            <CheckCircle2 size={16} />
            {found ? 'Found' : 'Mark as found'}
          </button>
          <button className="button" disabled={!place.position} onClick={() => void copyCoordinates()}>
            <MapPin size={16} />
            {coordinatesCopied ? 'Copied' : 'Coordinates'}
          </button>
        </div>
        {place.description && <p className="description">{place.description}</p>}
        <MapArchiveRecord place={place} />
        {place.research && (
          <section className="research-profile">
            <div className="research-profile-heading">
              <span>RESEARCH PROFILE</span>
              <span className="research-provider">FULLSWEEP</span>
            </div>
            {!place.research.inGameNameIdentified && (
              <p className="research-caveat">
                Reference identification only. This is not a confirmed in-game name.
              </p>
            )}
            <dl className="research-meta">
              <div><dt>Reference</dt><dd>{place.research.referenceName}</dd></div>
              {place.research.reliability && <div><dt>Reliability</dt><dd>{place.research.reliability}</dd></div>}
              {place.research.evidenceSource && <div><dt>Evidence</dt><dd>{place.research.evidenceSource}</dd></div>}
              {place.research.foundBy && <div><dt>Contributor</dt><dd>{place.research.foundBy}</dd></div>}
              {place.research.character && <div><dt>Character</dt><dd>{place.research.character}</dd></div>}
              {place.research.activity !== undefined && <div><dt>Activity</dt><dd>{place.research.activity}</dd></div>}
              {place.research.region && <div><dt>Source region</dt><dd>{place.research.region}</dd></div>}
              {place.research.referenceCategory && <div><dt>Reference type</dt><dd>{place.research.referenceCategory}</dd></div>}
              {place.research.realWorldAddress && <div><dt>Real-world reference</dt><dd>{place.research.realWorldAddress}</dd></div>}
            </dl>
            <p className="research-attribution">{place.research.attribution}</p>
            <a className="source-link research-source-link" href={place.research.sourceUrl} target="_blank" rel="noreferrer">
              View FullSweep source ?
            </a>
          </section>
        )}
        <section className="place-connections" aria-label="Connected catalog records">
          <div className="connections-heading"><strong>CATALOG CONNECTIONS</strong><span>linked records only</span></div>
          {place.research?.character && <div className="connection-exact"><span>Research reference character</span><strong>{place.research.character}</strong></div>}
          {linkedDossiers.length > 0 && <div className="connection-group"><h3>People / dossiers <span>{linkedDossiers.length}</span></h3>{linkedDossiers.map((entry) => <button className="connection-row" key={entry.id} onClick={() => { setRelatedDossier(entry); setShowDossier(true); }}><span className="connection-type">{entry.category}</span><span className="connection-name">{entry.name}</span><span className="connection-open">OPEN ›</span></button>)}</div>}
          {linkedVehicles.length > 0 && <div className="connection-group"><h3>Vehicles <span>{linkedVehicles.length}</span></h3>{linkedVehicles.map((vehicle) => <div className="connection-row connection-static" key={vehicle.id}><span className="connection-type">{vehicle.vehicleClass || 'Vehicle'}</span><span className="connection-name">{vehicle.name}{vehicle.manufacturer ? ` · ${vehicle.manufacturer}` : ''}</span></div>)}</div>}
          {linkedDossiers.some((entry) => entry.category === 'mission') && <div className="connection-group"><h3>Missions</h3>{linkedDossiers.filter((entry) => entry.category === 'mission').map((entry) => <button className="connection-row" key={entry.id} onClick={() => { setRelatedDossier(entry); setShowDossier(true); }}><span className="connection-name">{entry.name}</span><span className="connection-open">OPEN ›</span></button>)}</div>}
          {linkedDossiers.some((entry) => entry.category === 'collectible') && <div className="connection-group"><h3>Collectibles</h3>{linkedDossiers.filter((entry) => entry.category === 'collectible').map((entry) => <button className="connection-row" key={entry.id} onClick={() => { setRelatedDossier(entry); setShowDossier(true); }}><span className="connection-name">{entry.name}</span><span className="connection-open">OPEN ›</span></button>)}</div>}
          {!linkedDossiers.length && !linkedVehicles.length && !place.research?.character && <p className="connection-empty">No verified mission, character, or vehicle links are recorded for this place yet.</p>}
        </section>
        <dl className="place-meta">
          <div>
            <dt>Category</dt>
            <dd>{place.category}</dd>
          </div>
          {place.region && (
            <div>
              <dt>Region</dt>
              <dd>{place.region}</dd>
            </div>
          )}
          {place.position && (
            <div>
              <dt>Game coordinates</dt>
              <dd>
                {place.position.x.toFixed(1)}, {place.position.y.toFixed(1)}
              </dd>
            </div>
          )}
        </dl>
        {place.tags.length > 0 && <p className="tags">{place.tags.join(' · ')}</p>}
        {place.source.url && (
          <a className="source-link" href={place.source.url} target="_blank" rel="noreferrer">
            {place.source.title}
            <ExternalLink size={13} />
          </a>
        )}
        {research && <RegionalResearch region={research.region.slug} />}
        <section className="detail-section">
          <label htmlFor="place-note">Notes</label>
          <textarea
            id="place-note"
            rows={5}
            maxLength={100000}
            value={draft.text}
            disabled={!ready}
            placeholder="Add notes about this place…"
            onChange={(e) => {
              const text = e.currentTarget.value;
              setDraft((current) => ({ ...current, text, dirty: true }));
              setNoteSaved(false);
            }}
            onBlur={() => {
              if (draft.dirty && ready) void saveNote();
            }}
          />
          <div className="row-between">
            <small>{draft.text.length.toLocaleString()} / 100,000</small>
            <button
              className="text-button"
              disabled={!ready || noteBusy || draft.conflict}
              onClick={() => void saveNote()}
            >
              {noteBusy ? (
                'Saving…'
              ) : noteSaved ? (
                <>
                  <Check size={14} />
                  Saved
                </>
              ) : (
                'Save note'
              )}
            </button>
          </div>
          {draft.conflict && (
            <div className="inline-error" role="alert">
              This note changed elsewhere or could not be saved. Your draft is preserved here. Copy
              it before loading the latest saved note.
              <button
                className="text-button"
                onClick={() => {
                  setDraft({
                    text: savedNote,
                    revision: savedRevision,
                    dirty: false,
                    conflict: false,
                  });
                  setNoteSaved(false);
                }}
              >
                Load saved note
              </button>
            </div>
          )}
        </section>
        <section className="detail-section">
          <label htmlFor="place-collection">Add to collection</label>
          <select
            id="place-collection"
            disabled={!ready || collections.length === 0}
            value=""
            onChange={(e) => void addToCollection(e.target.value)}
          >
            <option value="">
              {collections.length ? 'Select a collection…' : 'Create a collection in Saved'}
            </option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {collections
            .filter((c) => c.placeIds.includes(place.id))
            .map((c) => (
              <div className="membership" key={c.id}>
                <Bookmark size={14} />
                {c.name}
                <button
                  className="icon-button"
                  aria-label={`Remove from ${c.name}`}
                  onClick={() =>
                    void saveLocal(() => atlasRepository.removeCollectionPlace(c.id, place.id))
                  }
                >
                  <X size={14} />
                </button>
              </div>
            ))}
        </section>
        {isPersonal ? (
          <div className="button-row">
            <button
              className="button"
              disabled={!ready}
              onClick={() => useUiStore.getState().setEditorOpen(true)}
            >
              <Pencil size={16} />
              Edit marker
            </button>
            <button
              className="button"
              disabled={!ready}
              onClick={() => {
                useMapStore.getState().setEditor('move');
                useUiStore.getState().setSidebar(false);
              }}
            >
              <Move size={16} />
              Move
            </button>
          </div>
        ) : (
          <button className="text-button" onClick={() => void share()}>
            {copied ? 'Link copied' : 'Copy place link'}
          </button>
        )}
      </div>
      {showDossier && (relatedDossier || activeDossier) && (
        <div style={{ position: "absolute", inset: 0, zIndex: 1000 }}>
          <DossierPanel
            entry={relatedDossier || activeDossier!}
            onClose={() => {
              setShowDossier(false);
              setRelatedDossier(null);
            }}
            onRelatedSelect={(id) => {
              const next = getDossierById(id);
              if (next) setRelatedDossier(next);
            }}
          />
        </div>
      )}
    </aside>
  );
}
