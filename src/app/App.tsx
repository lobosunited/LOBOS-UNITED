import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { CarFront, Info, MapPinPlus, Menu, Users, X, Layers, Trophy, Maximize2, Minimize2 } from 'lucide-react';
import { loadCatalogue, markerToPlace } from '../data/catalogue';
import { filterPlaces } from '../domain/filter';
import { DEFAULT_LAYERS } from '../features/map/layers';

import { atlasRegistry } from '../plugins/registry';
import {
  hydrateUserData,
  useDomainStore,
  useMapStore,
  usePersistenceStore,
  useUiStore,
  useUserStore,
  useWorkspaceStore,
} from '../stores/atlas';
import { Sidebar } from './Sidebar';
import { resolveRoute } from './routes';
import { updateAtlasHead } from './seo';
import type { Position } from '../domain/types';

const MapView = lazy(() => import('../features/map/MapView'));
const PlaceDetails = lazy(() => import('../features/library/PlaceDetails'));
const MarkerEditor = lazy(() => import('../features/editor/MarkerEditor'));
const BackupDialog = lazy(() => import('../features/library/BackupDialog'));
const SettingsDialog = lazy(() => import('../features/library/SettingsDialog'));
const ProjectPage = lazy(() => import('../features/project/ProjectPage'));
const CatalogPage = lazy(() => import('../features/catalog/CatalogPage'));
const IntelligencePage = lazy(() => import('../features/intelligence/IntelligencePage'));
const ProgressPage = lazy(() => import('../features/progress/ProgressPage'));

let cataloguePromise: ReturnType<typeof loadCatalogue> | undefined;
for (const layer of DEFAULT_LAYERS) {
  if (!atlasRegistry.layers.has(layer.id)) atlasRegistry.registerLayer(layer);
}
if (!atlasRegistry.sources.has('public'))
  atlasRegistry.registerDataSource({ id: 'public', load: loadCatalogue });

export default function App() {
  const [route, setRoute] = useState(() => resolveRoute(location.pathname, location.search));
  const appliedPlaceRoute = useRef<typeof route>(null);
  useEffect(() => { updateAtlasHead(location.pathname, location.search); }, [route]);
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const mapWorkspaceRef = useRef<HTMLElement | null>(null);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  useEffect(() => {
    const updateFullscreen = () => setMapFullscreen(document.fullscreenElement === mapWorkspaceRef.current);
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);
  const toggleMapFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement === mapWorkspaceRef.current) await document.exitFullscreen();
      else if (!document.fullscreenElement) await mapWorkspaceRef.current?.requestFullscreen();
    } catch {
      // Fullscreen can be unavailable in embedded or restricted browser contexts.
    }
  }, []);
const places = useDomainStore((s) => s.places);
  const status = useDomainStore((s) => s.status);
  const error = useDomainStore((s) => s.error);
  const markers = useUserStore((s) => s.markers);
  const favorites = useUserStore((s) => s.favorites);
  const notes = useUserStore((s) => s.notes);
  const collections = useUserStore((s) => s.collections);
  const preferences = useUserStore((s) => s.preferences);
  const filters = useUiStore((s) => s.filters);
  const dialog = useUiStore((s) => s.dialog);
  const editorOpen = useUiStore((s) => s.editorOpen);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const selectedId = useMapStore((s) => s.selectedId);
  const [foundIds, setFoundIds] = useState<string[]>(() => { try { const raw = localStorage.getItem('lobos-united-found-v1'); const value = raw ? JSON.parse(raw) : []; return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; } catch { return []; } });
  const [hideFound, setHideFound] = useState(false);
  useEffect(() => { try { localStorage.setItem('lobos-united-found-v1', JSON.stringify(foundIds)); } catch { /* local storage unavailable */ } }, [foundIds]);
  const toggleFound = useCallback((placeId: string) => { const wasFound = foundIds.includes(placeId); setFoundIds((current) => wasFound ? current.filter((id) => id !== placeId) : [...current, placeId]); if (!wasFound && hideFound && selectedId === placeId) useMapStore.getState().select(null); }, [foundIds, hideFound, selectedId]);
  const layers = useMapStore((s) => s.layers);
  const allMapLayersVisible = layers.length > 0 && layers.every((layer) => layer.visible);
  const toggleMapLayer = (layerId: string) => {
    const current = useMapStore.getState().layers;
    useMapStore.getState().setLayers(
      current.map((layer) => layer.id === layerId ? { ...layer, visible: !layer.visible } : layer)
    );
  };
  const toggleAllMapLayers = () => {
    const show = !allMapLayersVisible;
    useMapStore.getState().setLayers(
      useMapStore.getState().layers.map((layer) => ({ ...layer, visible: show }))
    );
  };
  const focus = useMapStore((s) => s.focus);
  const editorMode = useMapStore((s) => s.editorMode);
  const draftPosition = useMapStore((s) => s.draftPosition);
  const ready = usePersistenceStore((s) => s.ready);
  const allPlaces = useMemo(() => [...places, ...markers.map(markerToPlace)], [places, markers]);
  const deferredQuery = useDeferredValue(filters.query);
  const filtered = useMemo(
    () =>
      filterPlaces(
        allPlaces,
        { ...filters, query: deferredQuery },
        favorites.map((f) => f.placeId),
        notes,
        collections,
      ).filter((place) => !hideFound || !foundIds.includes(place.id)).filter((place) =>
        [...atlasRegistry.filters.values()].every((filter) => filter.matches(place)),
      ),
    [allPlaces, filters, deferredQuery, favorites, notes, collections, hideFound, foundIds],
  );
  const selected = useMemo(
    () => allPlaces.find((p) => p.id === selectedId),
    [allPlaces, selectedId],
  );
  const select = useCallback(
    (id: string) => {
      const place = allPlaces.find((p) => p.id === id);
      if (place) {
        useMapStore.getState().select(place);
        if (window.innerWidth < 1000) useUiStore.getState().setSidebar(false);
      }
    },
    [allPlaces],
  );
  const placePosition = useCallback((position: Position) => {
    useMapStore.getState().setPosition(position);
    useUiStore.getState().setEditorOpen(true);
  }, []);
  const closeEditor = useCallback(() => {
    useUiStore.getState().setEditorOpen(false);
    useMapStore.getState().setEditor('none');
  }, []);
  const closeDialog = useCallback(() => useUiStore.getState().setDialog(null), []);
  const goMap = useCallback(() => {
    history.pushState({}, '', import.meta.env.BASE_URL);
    setRoute(resolveRoute(location.pathname, location.search));
  }, []);
  function navigateAbout() {
    history.pushState({}, '', `${import.meta.env.BASE_URL}about`);
    setRoute(resolveRoute(location.pathname, location.search));
  }

  function navigateProgress() {
    const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    history.pushState({}, '', `${base}progress`);
    setRoute(resolveRoute(location.pathname, location.search));
  }
  function navigateCatalog(page: 'characters' | 'vehicles') {
    const base = import.meta.env.BASE_URL.endsWith('/')
      ? import.meta.env.BASE_URL
      : `${import.meta.env.BASE_URL}/`;
    history.pushState({}, '', `${base}${page}`);
    setRoute(resolveRoute(location.pathname, location.search));
  }
  function beginMarker() {
    useMapStore.getState().setEditor('create');
    if (window.innerWidth < 1000) useUiStore.getState().setSidebar(false);
  }
  useEffect(() => {
    useMapStore.getState().setLayers([...atlasRegistry.layers.values()]);
    void hydrateUserData();
    cataloguePromise ??= Promise.all(
      [...atlasRegistry.sources.values()].map((source) => source.load()),
    ).then((batches) => batches.flat());
    void cataloguePromise
      .then((p) => useDomainStore.getState().setPlaces(p))
      .catch(() =>
        useDomainStore
          .getState()
          .fail('The public catalogue could not be loaded. Reload to retry.'),
      );
    const network = (event: Event) =>
      usePersistenceStore.setState({ offline: event.type === 'offline' });
    const pop = () => setRoute(resolveRoute(location.pathname, location.search));
    window.addEventListener('online', network);
    window.addEventListener('offline', network);
    window.addEventListener('popstate', pop);
    const keyboard = (event: KeyboardEvent) => {
      const editing =
        event.target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) ||
          event.target.isContentEditable);
      if (event.key === '/' && !editing && !document.querySelector('dialog[open]')) {
        event.preventDefault();
        useUiStore.getState().setSidebar(true);
        requestAnimationFrame(() => document.getElementById('atlas-search')?.focus());
      }
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        useMapStore.getState().setEditor('none');
        useMapStore.getState().select(null);
      }
    };
    document.addEventListener('keydown', keyboard);
    const channel =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('leonida-atlas-local') : null;
    channel?.addEventListener('message', (event: MessageEvent<unknown>) => {
      const data = event.data;
      const ownWorkspace = useWorkspaceStore.getState().workspaceId;
      const matches =
        data === 'saved'
          ? ownWorkspace === null
          : typeof data === 'object' &&
            data !== null &&
            'workspaceId' in data &&
            data.workspaceId === ownWorkspace;
      if (matches && usePersistenceStore.getState().status !== 'saving') void hydrateUserData();
    });
    const unlisten = atlasRegistry.on('saved', () =>
      channel?.postMessage({ workspaceId: useWorkspaceStore.getState().workspaceId }),
    );
    return () => {
      window.removeEventListener('online', network);
      window.removeEventListener('offline', network);
      window.removeEventListener('popstate', pop);
      document.removeEventListener('keydown', keyboard);
      unlisten();
      channel?.close();
    };
  }, []);
  useEffect(() => {
    if (!route.placeId || status !== 'ready' || appliedPlaceRoute.current === route) return;
    const place = allPlaces.find((p) => p.id === route.placeId);
    if (!place) return;
    appliedPlaceRoute.current = route;
    useMapStore.getState().select(place);
  }, [route, status, allPlaces]);
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(preferences.reducedMotion);
  }, [preferences.reducedMotion]);
  if (route.view === 'progress')
    return (
      <Suspense fallback={<div className="full-loading">Loading progress tracker...</div>}>
        <ProgressPage places={allPlaces} onClose={goMap} onLocate={(placeId) => { select(placeId); goMap(); }} />
      </Suspense>
    );
  if (route.view === 'intelligence')
    return (
      <Suspense fallback={<div className="full-loading">Loading intelligence archive...</div>}>
        <IntelligencePage onClose={goMap} />
      </Suspense>
    );
  if (route.view === 'catalog')
    return (
      <Suspense fallback={<div className="full-loading">Loading Leonida catalog…</div>}>
        <CatalogPage
          category={route.page === 'vehicles' ? 'vehicles' : 'characters'}
          onClose={goMap}
        />
      </Suspense>
    );
  if (route.view === 'project')
    return (
      <Suspense fallback={<div className="full-loading">Loading project information…</div>}>
        <ProjectPage page={route.page} onClose={goMap} />
      </Suspense>
    );
  return (
    <main
      className="atlas-app"
      data-details={Boolean(selected)}
      data-placement={editorMode !== 'none'}
    >
      <a className="skip-link" href="#atlas-map-region">
        Skip to map
      </a>
      <Sidebar places={filtered} allPlaces={allPlaces} foundIds={foundIds} hideFound={hideFound} onToggleFound={toggleFound} onHideFoundChange={setHideFound} />
      <section ref={mapWorkspaceRef} className="map-workspace" id="atlas-map-region" aria-label="Interactive Leonida map">
        <Suspense fallback={<div className="map-notice" role="status">Loading Leonida map engine...</div>}>
        <MapView
          places={selected && !filtered.some((place) => place.id === selected.id) ? [...filtered, selected] : filtered}
          layers={layers}
          selectedId={selectedId}
          focus={focus}
          editorMode={editorMode}
          preferences={preferences}
          onSelect={select}
          onPlacePosition={placePosition}
        />
        </Suspense>
        <div className="map-layer-panel">
          <div className="map-layer-heading">
            <button
              className="map-layer-title"
              onClick={() => setLayerPanelOpen((open) => !open)}
              aria-expanded={layerPanelOpen}
            >
              <Layers size={17} />
              <span>MAP LAYERS</span>
              <span className="map-layer-total">{places.length.toLocaleString()}</span>
            </button>
            <button
              className="map-layer-collapse"
              onClick={() => setLayerPanelOpen((open) => !open)}
              aria-label={layerPanelOpen ? "Collapse map layers" : "Expand map layers"}
            >
              {layerPanelOpen ? "−" : "+"}
            </button>
          </div>
          {layerPanelOpen && (
            <>
              <button className="map-layer-all" onClick={toggleAllMapLayers}>
                {allMapLayersVisible ? "Hide all layers" : "Show all layers"}
              </button>
              <div className="map-layer-list">
                {layers.map((layer) => {
                  const count = places.filter((place) => place.layerId === layer.id).length;
                  return (
                    <button
                      key={layer.id}
                      className={`map-layer-row ${layer.visible ? "is-visible" : "is-hidden"}`}
                      onClick={() => toggleMapLayer(layer.id)}
                      aria-pressed={layer.visible}
                      title={layer.description || layer.name}
                    >
                      <span className="map-layer-swatch" style={{ background: layer.style.color }} />
                      <span className="map-layer-name">{layer.name}</span>
                      <span className="map-layer-count">{count.toLocaleString()}</span>
                      <span className="map-layer-status">{layer.visible ? '\u25cf' : '\u25cb'}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="map-topbar">
          <button
            className="button sidebar-toggle"
            aria-label={sidebarOpen ? 'Hide sidebar' : 'Open sidebar'}
            onClick={() => useUiStore.getState().setSidebar(!sidebarOpen)}
          >
            <Menu size={18} />
            <span>Explore</span>
          </button>
          <div className="map-actions">
            <button className="button" disabled={!ready} onClick={beginMarker} aria-label="Add personal marker">
              <MapPinPlus size={18} />
              <span>Add marker</span>
            </button>
                  <button className="button map-catalog-button progress-nav-button" onClick={navigateProgress} aria-label="Open progress tracker">
              <Trophy size={18} />
              <span>Progress</span>
            </button>
            <button
              className="button map-catalog-button"
              onClick={() => navigateCatalog('characters')}
              aria-label="Open character catalog"
            >
              <Users size={18} />
              <span>Characters</span>
            </button>
            <button
              className="button map-catalog-button"
              onClick={() => navigateCatalog('vehicles')}
              aria-label="Open vehicle catalog"
            >
              <CarFront size={18} />
              <span>Vehicles</span>
            </button>      <button
              className="icon-button map-fullscreen"
              onClick={toggleMapFullscreen}
              aria-label={mapFullscreen ? 'Exit full screen map' : 'View full screen map'}
              aria-pressed={mapFullscreen}
              title={mapFullscreen ? 'Exit full screen' : 'Full screen map'}
            >
              {mapFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button
              className="icon-button map-about"
              aria-label="About this atlas"
              onClick={navigateAbout}
            >
              <Info size={19} />
            </button>
          </div>
        </div>
        {status === 'error' && (
          <div className="map-notice inline-error" role="alert">
            {error}
            <button className="text-button" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        )}
        {editorMode !== 'none' && (
          <div className="placement-notice" role="status">
            <MapPinPlus size={19} />
            <span>
              {editorMode === 'create'
                ? 'Click the map to place your marker'
                : 'Click a new position for this marker'}
            </span>
            <button
              className="text-button"
              onClick={() => useUiStore.getState().setEditorOpen(true)}
            >
              Enter coordinates
            </button>
            <button className="icon-button" aria-label="Cancel placement" onClick={closeEditor}>
              <X size={18} />
            </button>
          </div>
        )}
      </section>
      <Suspense
        fallback={
          <div className="loading-panel" role="status">
            Opening panel…
          </div>
        }
      >
        {selected && <PlaceDetails key={selected.id} place={selected} found={foundIds.includes(selected.id)} onToggleFound={toggleFound} />}
        {editorOpen && <MarkerEditor position={draftPosition} onClose={closeEditor} />}
        {dialog === 'backup' && <BackupDialog onClose={closeDialog} />}
        {dialog === 'settings' && <SettingsDialog onClose={closeDialog} />}
      </Suspense>
    </main>
  );
}
