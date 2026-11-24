import { useMemo, useState } from 'react';
import type { Category, PersonalMarker, Position } from '../../domain/types';
import { atlasRepository, ConflictError } from '../../db/repository';
import { markerToPlace } from '../../data/catalogue';
import { saveLocal, useDomainStore, useMapStore, useUiStore, useUserStore } from '../../stores/atlas';
import { Modal } from '../../app/Modal';
import { CATEGORIES } from '../../app/Sidebar';

export default function MarkerEditor({
  position,
  onClose,
}: {
  position: Position | null;
  onClose: () => void;
}) {
  const selectedId = useMapStore((s) => s.selectedId);
  const mode = useMapStore((s) => s.editorMode);
  const publicPlaces = useDomainStore((s) => s.places);
  const localMarkers = useUserStore((s) => s.markers);
  const existing = useUserStore((s) => s.markers.find((marker) => marker.id === selectedId));
  const [marker] = useState(mode === 'create' ? undefined : existing);
  const [title, setTitle] = useState(marker?.title ?? '');
  const [description, setDescription] = useState(marker?.description ?? '');
  const [category, setCategory] = useState<Category>(marker?.category ?? 'personal');
  const [icon, setIcon] = useState<PersonalMarker['icon']>(marker?.icon ?? 'pin');
  const [x, setX] = useState(String(position?.x ?? marker?.position.x ?? 0));
  const [y, setY] = useState(String(position?.y ?? marker?.position.y ?? 0));
  const [error, setError] = useState('');
  const [duplicateReview, setDuplicateReview] = useState(false);
  const [allowNearbyDuplicate, setAllowNearbyDuplicate] = useState(false);
  const nearbyPlaces = useMemo(() => {
    const px = Number(x);
    const py = Number(y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return [];
    return [...publicPlaces, ...localMarkers.map(markerToPlace)]
      .filter((place) => place.id !== marker?.id && place.position)
      .map((place) => ({
        place,
        distance: Math.hypot(place.position!.x - px, place.position!.y - py),
      }))
      .filter(({ distance }) => distance <= 120)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4);
  }, [x, y, publicPlaces, localMarkers, marker?.id]);
  const [noteUpdatedAt] = useState(
    () => useUserStore.getState().notes.find((note) => note.placeId === selectedId)?.updatedAt ?? null,
  );
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save(saveSeparate = false) {
    const coords = { x: Number(x), y: Number(y) };
    if (
      !title.trim() ||
      !x.trim() ||
      !y.trim() ||
      !Number.isFinite(coords.x) ||
      !Number.isFinite(coords.y) ||
      coords.x < -16000 ||
      coords.x > 4000 ||
      coords.y < -8000 ||
      coords.y > 12000
    ) {
      setError('Enter a title and coordinates within the map: X −16000 to 4000; Y −8000 to 12000.');
      return;
    }
    if (nearbyPlaces.length > 0 && !allowNearbyDuplicate && !saveSeparate) {
      setDuplicateReview(true);
      setError('There are existing map entries within 120 map units. Review them before adding another marker.');
      return;
    }
    const now = new Date().toISOString();
    const next: PersonalMarker = {
      id: marker?.id ?? `custom:${crypto.randomUUID()}`,
      title: title.trim(),
      description: description.trim(),
      category,
      icon,
      position: coords,
      createdAt: marker?.createdAt ?? now,
      updatedAt: now,
    };
    setBusy(true);
    let conflict = false;
    const ok = await saveLocal(async () => {
      try {
        await atlasRepository.saveMarker(next, marker?.updatedAt ?? null);
      } catch (error) {
        conflict = error instanceof ConflictError;
        throw error;
      }
    });
    setBusy(false);
    if (ok) {
      useMapStore.getState().select(markerToPlace(next));
      useUiStore.getState().resetFilters();
      onClose();
    } else
      setError(
        conflict
          ? 'This marker changed elsewhere. Copy your draft, close this form and reopen the current marker before saving again.'
          : 'Marker could not be saved. Your draft is still here; retry after fixing local storage.',
      );
  }
  async function remove() {
    if (!marker || !deleting) return;
    setBusy(true);
    let conflict = false;
    const ok = await saveLocal(async () => {
      try {
        await atlasRepository.deleteMarker(marker.id, marker.updatedAt, noteUpdatedAt);
      } catch (error) {
        conflict = error instanceof ConflictError;
        throw error;
      }
    });
    setBusy(false);
    if (ok) {
      useMapStore.getState().select(null);
      onClose();
    } else {
      setDeleting(false);
      setError(
        conflict
          ? 'The marker or its note changed elsewhere. Close and reopen this marker before deleting.'
          : 'Could not delete this marker. Check local storage and retry.',
      );
    }
  }
  return (
    <Modal title={marker ? 'Edit personal marker' : 'New personal marker'} onClose={onClose}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className="panel-intro">
          This marker is yours. It is stored locally and does not change the public map.
        </p>
        <label htmlFor="marker-title">Title</label>
        <input
          id="marker-title"
          value={title}
          maxLength={200}
          required
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <label htmlFor="marker-description">Description</label>
        <textarea
          id="marker-description"
          value={description}
          maxLength={10000}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="form-grid">
          <div>
            <label htmlFor="marker-category">Category</label>
            <select
              id="marker-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="marker-icon">Icon</label>
            <select
              id="marker-icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value as PersonalMarker['icon'])}
            >
              <option value="pin">Pin</option>
              <option value="star">Star</option>
              <option value="flag">Flag</option>
            </select>
          </div>
        </div>
        <div className="form-grid">
          <div>
            <label htmlFor="marker-x">Game X</label>
            <input
              id="marker-x"
              type="number"
              step="any"
              min={-16000}
              max={4000}
              value={x}
              onChange={(e) => setX(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="marker-y">Game Y</label>
            <input
              id="marker-y"
              type="number"
              step="any"
              min={-8000}
              max={12000}
              value={y}
              onChange={(e) => setY(e.target.value)}
              required
            />
          </div>
        </div>
        {duplicateReview && nearbyPlaces.length > 0 && (
          <section className="duplicate-review" aria-label="Nearby map entries" aria-live="polite">
            <strong>Nearby map entries</strong>
            <p>These are possible matches, not confirmed duplicates. Open one to inspect it or keep yours as a separate personal marker.</p>
            {nearbyPlaces.map(({ place, distance }) => (
              <button
                type="button"
                className="duplicate-review-row"
                key={place.id}
                onClick={() => {
                  useMapStore.getState().select(place);
                  onClose();
                }}
              >
                <span>{place.title}</span>
                <small>{Math.round(distance)} map units away · {place.source.title}</small>
              </button>
            ))}
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => {
                setAllowNearbyDuplicate(true);
                void save(true);
              }}
            >
              Save as a separate marker
            </button>
          </section>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save marker'}
          </button>
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
        </div>
        {marker && !deleting && (
          <button
            type="button"
            className="text-button danger"
            disabled={busy}
            onClick={() => setDeleting(true)}
          >
            Delete marker
          </button>
        )}
        {deleting && (
          <div className="delete-confirm">
            <p>
              Delete this marker and its note? It will also be removed from favorites and
              collections.
            </p>
            <button
              type="button"
              className="button danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              Confirm deletion
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}
