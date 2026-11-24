import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Building2,
  Bus,
  CarFront,
  ChevronRight,
  Compass,
  Database,
  Eye,
  EyeOff,
  Factory,
  Flag,
  Fuel,
  Gift,
  House,
  Hotel,
  Leaf,
  Layers,
  MapPin,
  MapPinned,
  Plane,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Train,
  Trees,
  Trophy,
  Utensils,
  Waves,
  X,
} from 'lucide-react';
import type { Category, Place } from '../domain/types';
import { useDomainStore, useMapStore, useUiStore } from '../stores/atlas';
import { SavedPlaces } from '../features/library/SavedPlaces';
import { Status } from './Status';
import { CommunityDataStatus } from './CommunityDataStatus';
import { setAccountEntryTarget } from '../capabilities/extension-host';

export const CATEGORIES: { id: Category | 'all'; name: string }[] = [
  { id: 'all', name: 'All places' },
  { id: 'region', name: 'Regions' },
  { id: 'landmark', name: 'Landmarks' },
  { id: 'nature', name: 'Nature' },
  { id: 'transport', name: 'Transport' },
  { id: 'business', name: 'Businesses' },
  { id: 'personal', name: 'Personal' },
];

const INTERNAL_TAGS = new Set([
  'fullsweep', 'unconfirmed', 'enterable', 'demolished', 'closed', 'reused',
  'mirrored', 'cancelled', 'fictional', 'gtav', 'scarface', 'badboys', 'dexter',
]);

function isBrowseableTag(tag: string): boolean {
  const normalized = tag.trim().toLowerCase();
  return Boolean(normalized) &&
    !normalized.startsWith('//') &&
    !normalized.startsWith('@') &&
    !/^l\d+$/i.test(normalized) &&
    !INTERNAL_TAGS.has(normalized);
}

function canonicalTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/^#/, '').replaceAll('-', ' ').replaceAll('_', ' ').replace(/\s+/g, ' ');
}

function readableTag(tag: string): string {
  const key = canonicalTag(tag);
  const labels: Record<string, string> = {
    gas: 'Gas Stations', fuel: 'Gas Stations', store: 'Stores', supermarket: 'Supermarkets',
    office: 'Offices', restaurant: 'Restaurants', hotel: 'Hotels', guns: 'Gun Shops',
    hair: 'Hair & Beauty', clothes: 'Clothing Stores', fastfood: 'Fast Food',
    food: 'Food & Dining', fence: 'Fences', "pay'n'spray": "Pay ’n’ Spray",
    carwash: 'Car Washes', bikeshop: 'Bike Shops', safehouse: 'Safehouses',
    modshop: 'Vehicle Customization', shoes: 'Shoe Stores', tattoos: 'Tattoo Shops',
    industrial: 'Industrial', residential: 'Residential', retail: 'Retail',
  };
  return labels[key] ?? key.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function tagIcon(tag: string) {
  const key = canonicalTag(tag);
  if (/bus|transport|vehicle/.test(key)) return Bus;
  if (/train|metro|rail/.test(key)) return Train;
  if (/airport|airfield|airbase/.test(key)) return Plane;
  if (/gas|fuel|carwash|spray|modshop/.test(key)) return Fuel;
  if (/car|vehicle|garage|hangar/.test(key)) return CarFront;
  if (/hotel|lodging/.test(key)) return Hotel;
  if (/residential|safehouse|home/.test(key)) return House;
  if (/industrial|construction|infrastructure/.test(key)) return Factory;
  if (/government|police|jail|criminal|illegal/.test(key)) return Shield;
  if (/natural|agriculture|wildlife|nature/.test(key)) return Leaf;
  if (/collect|egg|treasure|magazine|book|card/.test(key)) return Gift;
  if (/event|leisure|activity|mission|side/.test(key)) return Flag;
  if (/restaurant|food|bar|drink/.test(key)) return Utensils;
  if (/retail|store|shop|supermarket|market/.test(key)) return ShoppingBag;
  if (/landmark|public|office|building|business/.test(key)) return Building2;
  if (/marina|harbor|water/.test(key)) return Waves;
  if (/trophy|race|sport/.test(key)) return Trophy;
  return MapPin;
}

function filterSectionIcon(id: string) {
  switch (id) {
    case 'story': return Flag;
    case 'travel': return Bus;
    case 'service': return ShoppingBag;
    case 'activities': return Trophy;
    case 'nature': return Trees;
    case 'collectibles': return Gift;
    default: return MapPinned;
  }
}

const FILTER_SECTIONS = [
  { id: 'story', name: 'Story / Progression', matches: /safehouse|garage|mission|property|business|residential/ },
  { id: 'travel', name: 'Travel / Navigation', matches: /airport|airstrip|helipad|marina|dock|gas|fuel|transport|train|rail|metro|bus|bridge|road|highway|port|parking/ },
  { id: 'service', name: 'Service', matches: /service|shop|store|bank|gun|clothes|clothing|barber|tattoo|modshop|carwash|hospital|police|pharmacy|supermarket|restaurant|food|fastfood|liquor|bar|hotel|hair|shoe|electronics|pawn|jewel/ },
  { id: 'activities', name: 'Activities', matches: /activity|race|sport|stunt|golf|tennis|strip|nightclub|cinema|event|club|trial|recreation/ },
  { id: 'nature', name: 'Nature', matches: /natural|agriculture|wildlife|nature|swamp|fish|hunt|beach|river|lake|pond|water/ },
  { id: 'collectibles', name: 'Collectibles / Finds', matches: /collect|egg|treasure|waink|curiosity|hidden|unique/ },
] as const;

function LayerManager() {
  const layers = useMapStore((s) => s.layers);
  const ordered = [...layers].sort((a, b) => b.order - a.order);
  function move(id: string, direction: number) {
    const index = ordered.findIndex((l) => l.id === id);
    const neighbor = ordered[index + direction];
    const current = ordered[index];
    if (!neighbor || !current) return;
    useMapStore
      .getState()
      .setLayers(
        layers.map((layer) =>
          layer.id === id
            ? { ...layer, order: neighbor.order }
            : layer.id === neighbor.id
              ? { ...layer, order: current.order }
              : layer,
        ),
      );
  }
  return (
    <div className="layer-manager">
      <p className="panel-intro">
        Choose what appears on the map. Layers at the top draw above the others.
      </p>
      {ordered.map((layer, index) => (
        <div className="layer-row" key={layer.id}>
          <label>
            <input
              type="checkbox"
              checked={layer.visible}
              onChange={(e) =>
                useMapStore
                  .getState()
                  .setLayers(
                    layers.map((l) =>
                      l.id === layer.id ? { ...l, visible: e.target.checked } : l,
                    ),
                  )
              }
            />
            <span className="layer-dot" style={{ background: layer.style.color }} />
            <span>
              {layer.name}
              <small>{layer.description}</small>
            </span>
          </label>
          <div>
            <button
              className="icon-button"
              aria-label={`Raise ${layer.name}`}
              disabled={index === 0}
              onClick={() => move(layer.id, -1)}
            >
              <ArrowUp size={15} />
            </button>
            <button
              className="icon-button"
              aria-label={`Lower ${layer.name}`}
              disabled={index === ordered.length - 1}
              onClick={() => move(layer.id, 1)}
            >
              <ArrowDown size={15} />
            </button>
          </div>
        </div>
      ))}
      <p className="empty-state">
        The basemap is a community reconstruction. Unmapped areas remain unknown; positions are
        approximate.
      </p>
    </div>
  );
}

function Results({ places, allPlaces, foundIds, hideFound, onToggleFound, onHideFoundChange }: { places: Place[]; allPlaces: Place[]; foundIds: string[]; hideFound: boolean; onToggleFound: (placeId: string) => void; onHideFoundChange: (value: boolean) => void }) {
  const filters = useUiStore((s) => s.filters);
  const selectedId = useMapStore((s) => s.selectedId);
  const status = useDomainStore((s) => s.status);
  const [limit, setLimit] = useState(50);
  const [categoryProgressOpen, setCategoryProgressOpen] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>('service');
  const nextPlaceByCategory = useRef(new Map<string, string>());
  const categoryGroups = useMemo(() => {
    const regionNames = new Set(allPlaces
      .filter((place) => place.category === 'region')
      .flatMap((place) => [place.title, place.region])
      .map(canonicalTag));
    const tagPlaces = new Map<string, Set<string>>();
    for (const place of allPlaces) {
      for (const tag of new Set(place.tags
        .filter(isBrowseableTag)
        .map(canonicalTag)
        .filter((value) => !regionNames.has(value)))) {
        const ids = tagPlaces.get(tag) ?? new Set<string>();
        ids.add(place.id);
        tagPlaces.set(tag, ids);
      }
    }
    const sortedTags = [...tagPlaces]
      .map(([tag, ids]) => ({ tag, count: ids.size, ids }))
      .sort((a, b) => b.count - a.count || readableTag(a.tag).localeCompare(readableTag(b.tag)));
    const assigned = new Set<string>();
    const groups: { id: string; name: string; count: number; tags: [string, number][] }[] = FILTER_SECTIONS.map((section) => {
      const tags = sortedTags.filter(({ tag }) =>
        !assigned.has(tag) && section.matches.test(tag),
      );
      tags.forEach(({ tag }) => assigned.add(tag));
      const ids = new Set(tags.flatMap((item) => [...item.ids]));
      return { id: section.id, name: section.name, count: ids.size, tags: tags.map(({ tag, count }) => [tag, count] as [string, number]) };
    }).filter((section) => section.tags.length > 0);
    const otherTags = sortedTags.filter(({ tag }) => !assigned.has(tag));
    if (otherTags.length) {
      const ids = new Set(otherTags.flatMap((item) => [...item.ids]));
      groups.push({
        id: 'places',
        name: 'Places / Landmarks',
        count: ids.size,
        tags: otherTags.map(({ tag, count }) => [tag, count] as [string, number]),
      });
    }
    return groups;
  }, [allPlaces]);
  useEffect(() => setLimit(50), [filters]);
  function setAllLayers(visible: boolean) {
    useMapStore.getState().setLayers(
      useMapStore.getState().layers.map((layer) => ({ ...layer, visible })),
    );
  }
  function select(place: Place) {
    useMapStore.getState().select(place);
    if (window.innerWidth < 1000) useUiStore.getState().setSidebar(false);
  }
  function locateNext(categoryId: Category | 'all') {
    const candidates = allPlaces.filter((place) =>
      place.position &&
      (categoryId === 'all' || place.category === categoryId) &&
      !foundIds.includes(place.id),
    );
    if (!candidates.length) return;
    const previousId = nextPlaceByCategory.current.get(categoryId);
    const previousIndex = candidates.findIndex((place) => place.id === previousId);
    const next = candidates[(previousIndex + 1) % candidates.length];
    if (!next) return;
    nextPlaceByCategory.current.set(categoryId, next.id);
    select(next);
  }
  return (
    <>
      <div className="found-summary" aria-label="Exploration progress">
        <div className="found-summary-top">
          <span className="found-summary-label">MAP PROGRESS</span>
          <div className="found-summary-links">
            <button className="found-details-toggle" onClick={() => setCategoryProgressOpen((open) => !open)} aria-expanded={categoryProgressOpen}>
              Categories <ChevronRight size={14} />
            </button>
            <button className="found-next-all" onClick={() => locateNext('all')} disabled={!allPlaces.some((place) => place.position && !foundIds.includes(place.id))}>
              Find next <ChevronRight size={15} />
            </button>
          </div>
        </div>
        <div className="found-summary-total">
          <strong>{foundIds.length.toLocaleString()}</strong>
          <span>of {allPlaces.length.toLocaleString()} places found</span>
          <b>{allPlaces.length ? Math.min(100, Math.round(foundIds.length / allPlaces.length * 100)) : 0}%</b>
        </div>
        <div className="found-progress-track" aria-label={`${allPlaces.length ? Math.min(100, Math.round(foundIds.length / allPlaces.length * 100)) : 0}% explored`}>
          <span style={{ width: `${allPlaces.length ? Math.min(100, foundIds.length / allPlaces.length * 100) : 0}%` }} />
        </div>
        {categoryProgressOpen && <div className="found-category-breakdown">
          {CATEGORIES.filter((category) => category.id !== 'all').map((category) => {
            const categoryPlaces = allPlaces.filter((place) => place.category === category.id);
            const total = categoryPlaces.length;
            const done = categoryPlaces.filter((place) => foundIds.includes(place.id)).length;
            const available = categoryPlaces.some((place) => place.position && !foundIds.includes(place.id));
            return (
              <div className="found-category-row" key={category.id}>
                <span>{category.name}</span>
                <div className="found-category-progress">
                  <strong>{done}<i>/</i>{total}</strong>
                  <span><b style={{ width: `${total ? Math.min(100, done / total * 100) : 0}%` }} /></span>
                </div>
                <button className="found-next-category" onClick={() => locateNext(category.id)} disabled={!available} aria-label={`Find next uncollected ${category.name.toLowerCase()}`} title={`Find next uncollected ${category.name.toLowerCase()}`}>
                  <ChevronRight size={16} />
                </button>
              </div>
            );
          })}
        </div>}
        <div className="found-summary-actions">
          <label className="check-label"><input type="checkbox" checked={hideFound} onChange={(e) => onHideFoundChange(e.target.checked)} /> Hide found</label>
          <button className="text-button" onClick={() => useUiStore.getState().resetFilters()}>Reset filters</button>
        </div>
      </div>
      <div className="filter-controls">
        <div className="filter-toolbar" aria-label="Map marker visibility">
          <button
            className="filter-toolbar-button"
            onClick={() => {
              useUiStore.getState().setFilters({ category: 'all', categoryTags: [] });
              setAllLayers(true);
            }}
          >
            <Eye size={14} /> Show all
          </button>
          <button className="filter-toolbar-button" onClick={() => setAllLayers(false)}>
            <EyeOff size={14} /> Hide all
          </button>
        </div>
        <div className="category-browser" aria-label="Marker filters">
          <div className="category-browser-heading">
            <span>Marker filters</span>
            <span>{places.length.toLocaleString()} matches</span>
          </div>
          <button
            className={`category-filter-row all-category-row ${filters.category === 'all' && !filters.categoryTags?.length ? 'active' : ''}`}
            aria-pressed={filters.category === 'all' && !filters.categoryTags?.length}
            onClick={() => useUiStore.getState().setFilters({ category: 'all', categoryTags: [] })}
          >
            <span className="category-filter-name">All places</span>
            <span className="category-filter-count">{allPlaces.length.toLocaleString()}</span>
          </button>
          {categoryGroups.map((group) => {
            const Icon = filterSectionIcon(group.id);
            const expanded = expandedCategory === group.id;
            return (
              <section className="category-filter-group" key={group.id}>
                <button
                  className={`category-group-heading ${filters.category === 'all' && group.tags.some(([tag]) => filters.categoryTags?.includes(tag)) ? 'active' : ''}`}
                  aria-expanded={expanded}
                  onClick={() => {
                    setExpandedCategory(expanded ? null : group.id);
                    useUiStore.getState().setFilters({ category: 'all', categoryTags: group.tags.map(([tag]) => tag) });
                  }}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{group.name}</span>
                  <span className="category-filter-count">{group.count.toLocaleString()}</span>
                  <ChevronRight size={14} className={`category-group-chevron ${expanded ? 'expanded' : ''}`} />
                </button>
                {expanded && group.tags.length > 0 && (
                  <div className="category-subcategory-list">
                    {group.tags.map(([tag, count]) => {
                      const TagIcon = tagIcon(tag);
                      const selected = Boolean(filters.categoryTags?.includes(tag));
                      return (
                        <button
                          className={`subcategory-filter-row ${selected ? 'active' : ''}`}
                          key={tag}
                          aria-pressed={selected}
                          onClick={() => {
                            const active = filters.categoryTags ?? [];
                            const next = selected ? active.filter((item) => item !== tag) : [...active, tag];
                            useUiStore.getState().setFilters({ category: 'all', categoryTags: next });
                          }}
                        >
                          <TagIcon size={13} aria-hidden="true" />
                          <span>{readableTag(tag)}</span>
                          <span className="category-filter-count">{count.toLocaleString()}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        <div className="row-between sidebar-quick-filters">
          <label className="check-label">
            <input
              type="checkbox"
              checked={filters.favoritesOnly}
              onChange={(e) =>
                useUiStore.getState().setFilters({ favoritesOnly: e.target.checked })
              }
            />
            Favorites only
          </label>
          <select
            className="compact-select"
            aria-label="Evidence filter"
            value={filters.evidence}
            onChange={(e) =>
              useUiStore
                .getState()
                .setFilters({ evidence: e.target.value as 'all' | 'approximate' | 'uncertain' })
            }
          >
            <option value="all">All evidence</option>
            <option value="approximate">Named entries</option>
            <option value="uncertain">Uncertain entries</option>
          </select>
        </div>
      </div>
      <div className="results-count"><span>{places.length.toLocaleString()} visible results</span></div>
      {status === 'loading' ? (
        <p className="empty-state">Loading the public catalogue…</p>
      ) : !places.length ? (
        <p className="empty-state">
          No places match these filters. Try another name, region or tag.
        </p>
      ) : (
        <div className="place-results" aria-label="Search results">
          {places.slice(0, limit).map((place) => (
            <button
              className={`place-result ${selectedId === place.id ? 'active' : ''}`}
              key={place.id}
              onClick={() => select(place)}
            >
              <MapPin size={19} />
              <span>
                <strong>{place.title || 'Unnamed entry'}</strong>
                <small>
                  {!place.position
                    ? 'Unpositioned'
                    : place.evidence === 'personal'
                      ? 'Personal marker'
                      : place.category === 'region'
                        ? 'Region · approximate'
                        : place.evidence === 'uncertain'
                          ? 'Uncertain · approximate'
                          : `${place.category} · approximate`}
                </small>
              </span>
              <ChevronRight size={16} />
              <span className={`found-chip ${foundIds.includes(place.id) ? 'done' : ''}`} onClick={(event) => { event.stopPropagation(); onToggleFound(place.id); }} role="button" tabIndex={0} aria-label={foundIds.includes(place.id) ? 'Unmark found' : 'Mark found'} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onToggleFound(place.id); } }}>{foundIds.includes(place.id) ? '✓' : '+'}</span>
            </button>
          ))}
        </div>
      )}
      {places.length > limit && (
        <button className="load-more" onClick={() => setLimit((n) => n + 50)}>
          Show next {Math.min(50, places.length - limit)} places
        </button>
      )}
    </>
  );
}

export function Sidebar({ places, allPlaces, foundIds, hideFound, onToggleFound, onHideFoundChange }: { places: Place[]; allPlaces: Place[]; foundIds: string[]; hideFound: boolean; onToggleFound: (placeId: string) => void; onHideFoundChange: (value: boolean) => void }) {
  const tab = useUiStore((s) => s.tab);
  const open = useUiStore((s) => s.sidebarOpen);
  const query = useUiStore((s) => s.filters.query);
  return (
    <aside className="sidebar" data-open={open} aria-label="Atlas sidebar">
      <header className="brand-header">
        <div>
          <h1>LOBOS UNITED</h1>
          <p>LEONIDA EXPLORER</p>
          <span className="brand-tagline">EXPLORE · DISCOVER · COLLECT · CONQUER</span>
        </div>
        <button
          className="icon-button mobile-only"
          aria-label="Close sidebar"
          onClick={() => useUiStore.getState().setSidebar(false)}
        >
          <X size={21} />
        </button>
      </header>
      <div className="search-field">
        <Search size={18} />
        <input
          id="atlas-search"
          type="search"
          maxLength={250}
          placeholder="Search places, regions, tags"
          aria-label="Search places, regions, tags"
          value={query}
          onChange={(e) => {
            useUiStore.getState().setFilters({ query: e.target.value });
            useUiStore.getState().setTab('explore');
          }}
        />
        {query && (
          <button className="icon-button" aria-label="Clear search"
            onClick={() => useUiStore.getState().setFilters({ query: '' })}>
            <X size={16} />
          </button>
        )}
        <kbd>/</kbd>
      </div>
      <nav className="sidebar-tabs" aria-label="Atlas tools">
        {(
          [
            { id: 'explore', name: 'Explore', icon: Compass },
            { id: 'layers', name: 'Layers', icon: Layers },
            { id: 'saved', name: 'Saved', icon: Bookmark },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? 'active' : ''}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => useUiStore.getState().setTab(item.id)}
          >
            <item.icon size={18} />
            {item.name}
          </button>
        ))}
      </nav>
            <div className="sidebar-intelligence-link">
        <a href={`${import.meta.env.BASE_URL}database`}>
          <Database size={16} />
          <span>INTELLIGENCE DATABASE</span>
          <span className="sidebar-intel-arrow">↗</span>
        </a>
      </div>
      <div className="sidebar-content">
        {tab === 'explore' ? (
          <Results places={places} allPlaces={allPlaces} foundIds={foundIds} hideFound={hideFound} onToggleFound={onToggleFound} onHideFoundChange={onHideFoundChange} />
        ) : tab === 'layers' ? (
          <LayerManager />
        ) : (
          <SavedPlaces />
        )}
      </div>
      <footer className="sidebar-footer">
        <div ref={setAccountEntryTarget} data-atlas-account-slot />
        <Status />
        <CommunityDataStatus />
        <div className="button-row">
          <button className="button" onClick={(event) => {
              event.currentTarget.focus();
              useUiStore.getState().setDialog('settings');
            }}>
            <Settings size={17} />
            Settings
          </button>
          <button className="button" onClick={(event) => {
              event.currentTarget.focus();
              useUiStore.getState().setDialog('backup');
            }}>
            <Database size={17} />
            Backup
          </button>
        </div>
      </footer>
    </aside>
  );
}
