import { useEffect, useMemo, useState } from 'react';
import { matchesSearch } from '../../domain/filter';
import './intelligence.css';

type Entity = {
  id?: string;
  name?: string;
  category?: string;
  description?: string;
  aliases?: string[];
  attributes?: Record<string, unknown>;
  sources?: Array<string | { title?: string; name?: string; url?: string }>;
  reliability?: string;
  verifiedInGame?: boolean;
  spoiler?: boolean;
  mapCoordinates?: unknown;
  gtadbLandmarkId?: string;
};

type ResearchRecord = {
  id?: string;
  title?: string;
  name?: string;
  url?: string;
  sourceUrl?: string;
  source?: string;
  description?: string;
  snippet?: string;
  relevance?: string;
  pageType?: string;
};

type Props = { onClose: () => void };

export default function IntelligencePage({ onClose }: Props) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [research, setResearch] = useState<ResearchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [tab, setTab] = useState<'entities' | 'research'>('entities');
  const [selected, setSelected] = useState<Entity | null>(null);

  useEffect(() => {
    let active = true;
    const base = import.meta.env.BASE_URL;
    Promise.all([
      fetch(`${base}assets/leonida-database/catalogs/encyclopedia.json`).then(r => {
        if (!r.ok) throw new Error('Entity archive index was not found.');
        return r.json();
      }),
      fetch(`${base}assets/leonida-database/catalogs/research-index.json`).then(r => {
        if (!r.ok) return { records: [] };
        return r.json();
      })
    ]).then(([entityData, researchData]) => {
      if (!active) return;
      setEntities(Array.isArray(entityData.entities) ? entityData.entities : []);
      setResearch(Array.isArray(researchData.records)
        ? researchData.records.filter((r: ResearchRecord) => r.relevance === 'explicit GTA VI reference' && r.pageType === 'public-page')
        : []);
    }).catch(e => {
      if (active) setError(e instanceof Error ? e.message : 'Unable to load archive.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const categories = useMemo(
    () => [...new Set(entities.map(e => e.category || 'uncategorized'))].sort(),
    [entities]
  );

  const entityResults = useMemo(() => {
    return entities.filter(e => {
      const values = [
        e.name, e.category, e.description, ...(e.aliases ?? []),
        ...Object.values(e.attributes ?? {}).map(v => String(v))
      ];
      return (category === 'all' || e.category === category) &&
        matchesSearch(values.join(' '), query);
    });
  }, [entities, query, category]);

  const researchResults = useMemo(() => {
    return research.filter(r =>
      matchesSearch([r.title, r.name, r.source, r.description, r.snippet, r.url].join(' '), query)
    );
  }, [research, query]);

  return (
    <main className="intel-page">
      <header className="intel-header">
        <div>
          <div className="intel-kicker">LEONIDA ATLAS / FIELD ARCHIVE</div>
          <h1>INTELLIGENCE DATABASE</h1>
          <p>Searchable entity records, research files, source trails and field evidence.</p>
        </div>
        <button className="intel-back" onClick={onClose}>← RETURN TO MAP</button>
      </header>

      <section className="intel-stats">
        <div><strong>{entities.length.toLocaleString()}</strong><span>ENTITY RECORDS</span></div>
        <div><strong>{categories.length.toLocaleString()}</strong><span>CATEGORIES</span></div>
        <div><strong>{research.length.toLocaleString()}</strong><span>RESEARCH FILES</span></div>
      </section>

      <div className="intel-toolbar">
        <nav className="intel-tabs">
          <button className={tab === 'entities' ? 'active' : ''} onClick={() => setTab('entities')}>ENTITY ARCHIVE</button>
          <button className={tab === 'research' ? 'active' : ''} onClick={() => setTab('research')}>RESEARCH FILES</button>
        </nav>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search names, aliases, descriptions and sources..." />
      </div>

      {tab === 'entities' && (
        <div className="intel-filter">
          <label htmlFor="intel-category">CATEGORY</label>
          <select id="intel-category" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span>{entityResults.length.toLocaleString()} MATCHING RECORDS</span>
        </div>
      )}

      {loading ? <div className="intel-message">Loading archive records...</div> :
       error ? <div className="intel-message intel-error">{error}<p>Check that the index-generation step completed successfully.</p></div> :
       tab === 'entities' ? (
        <section className="intel-grid">
          {entityResults.map((e, i) => (
            <button className="intel-card" key={e.id ?? `${e.name}-${i}`} onClick={() => setSelected(e)}>
              <span className="intel-card-top">{e.category ?? 'UNCATEGORIZED'}</span>
              <strong>{e.name ?? 'Unnamed record'}</strong>
              <span className="intel-description">{e.description || 'No description supplied by source.'}</span>
              <span className="intel-card-bottom">
                {e.verifiedInGame ? 'IN-GAME VERIFIED FLAG' : 'RESEARCH RECORD'}
                <span>OPEN FILE ↗</span>
              </span>
            </button>
          ))}
          {!entityResults.length && <div className="intel-message">No matching entity records.</div>}
        </section>
       ) : (
        <section className="intel-grid">
          {researchResults.map((r, i) => (
            <article className="intel-card" key={r.id ?? `${r.title}-${i}`}>
              <span className="intel-card-top">{r.relevance ?? r.pageType ?? 'SOURCE RECORD'}</span>
              <strong>{r.title ?? r.name ?? 'Untitled research record'}</strong>
              <span className="intel-description">{r.description || r.snippet || 'No summary supplied.'}</span>
              <span className="intel-card-bottom">
                {r.source || 'SOURCE NOT SPECIFIED'}
                {(r.url || r.sourceUrl) &&
                  <a href={r.url || r.sourceUrl} target="_blank" rel="noreferrer">OPEN SOURCE ↗</a>}
              </span>
            </article>
          ))}
          {!researchResults.length && <div className="intel-message">No matching research records.</div>}
        </section>
       )}

      <footer className="intel-disclaimer">
        Imported research is not automatically confirmed GTA VI content. Labels and verification
        flags reflect the underlying records; consult the cited source before treating a claim as fact.
      </footer>

      {selected && (
        <div className="intel-overlay" onClick={() => setSelected(null)}>
          <section className="intel-detail" role="dialog" aria-modal="true"
            aria-label={selected.name ?? 'Entity details'} onClick={e => e.stopPropagation()}>
            <button className="intel-close" onClick={() => setSelected(null)}>✕ CLOSE</button>
            <div className="intel-kicker">{selected.category ?? 'ENTITY'} / RECORD DETAILS</div>
            <h2>{selected.name}</h2>
            <p>{selected.description || 'No description supplied.'}</p>
            <dl>
              <dt>Record ID</dt><dd>{selected.id ?? 'Not supplied'}</dd>
              <dt>Reliability</dt><dd>{selected.reliability ?? 'Not specified'}</dd>
              <dt>In-game verification flag</dt><dd>{selected.verifiedInGame ? 'Yes' : 'Not verified'}</dd>
              <dt>Spoiler flag</dt><dd>{selected.spoiler ? 'Yes' : 'No / not specified'}</dd>
              <dt>GTADB landmark ID</dt><dd>{selected.gtadbLandmarkId ?? 'Not supplied'}</dd>
            </dl>
            {!!selected.aliases?.length && <><h3>ALIASES</h3><p>{selected.aliases.join(' · ')}</p></>}
            {!!selected.attributes && <><h3>ATTRIBUTES</h3><pre>{JSON.stringify(selected.attributes, null, 2)}</pre></>}
            {!!selected.sources?.length && <><h3>SOURCES</h3><ul>{selected.sources.map((s, i) =>
              <li key={i}>{typeof s === 'string' ? s : s.title ?? s.name ?? s.url ?? 'Source record'}</li>
            )}</ul></>}
            {selected.mapCoordinates != null && <><h3>MAP COORDINATES</h3><pre>{JSON.stringify(selected.mapCoordinates, null, 2)}</pre></>}
          </section>
        </div>
      )}
    </main>
  );
}
