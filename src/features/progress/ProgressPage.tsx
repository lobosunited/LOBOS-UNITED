import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Circle, Plus, Search, Trash2, Trophy, Download, Upload, ShieldCheck } from 'lucide-react';
import type { Place } from '../../domain/types';
import { matchesSearch } from '../../domain/filter';
import { getAllDossiers } from '../dossier/registry';
import './progress.css';

type TrackerCategory = 'locations' | 'characters' | 'vehicles' | 'collectibles' | 'custom';
type Task = { id: string; name: string; category: TrackerCategory; description?: string; custom?: boolean; placeId?: string };
type SavedProgress = { done: string[]; customTasks: Task[] };
const STORAGE_KEY = 'leonida-atlas-progress-v1';
const categories: { id: TrackerCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All objectives' }, { id: 'locations', label: 'Locations' }, { id: 'characters', label: 'Characters' },
  { id: 'vehicles', label: 'Vehicles' }, { id: 'collectibles', label: 'Collectibles' }, { id: 'custom', label: 'Custom' },
];
function readProgress(): SavedProgress {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<SavedProgress>;
    return { done: Array.isArray(value.done) ? value.done.filter((x): x is string => typeof x === 'string') : [],
      customTasks: Array.isArray(value.customTasks) ? value.customTasks.filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string') : [] };
  } catch { return { done: [], customTasks: [] }; }
}
function safeId(name: string) { return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
type ProgressBackup = { format: 'leonida-progress'; version: 1; exportedAt: string; progress: SavedProgress };
function exportProgress(progress: SavedProgress) {
  const payload: ProgressBackup = { format: 'leonida-progress', version: 1, exportedAt: new Date().toISOString(), progress };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `leonida-progress-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click(); URL.revokeObjectURL(url);
}
function importProgressFile(file: File): Promise<SavedProgress> {
  return file.text().then(text => {
    const parsed = JSON.parse(text) as Partial<ProgressBackup>;
    if (parsed.format !== 'leonida-progress' || parsed.version !== 1 || !parsed.progress || !Array.isArray(parsed.progress.done) || !Array.isArray(parsed.progress.customTasks)) throw new Error('Unsupported Leonida Progress backup file.');
    const done = parsed.progress.done.filter((id): id is string => typeof id === 'string' && id.length < 500);
    const customTasks = parsed.progress.customTasks.filter((task): task is Task => !!task && typeof task.id === 'string' && typeof task.name === 'string' && ['locations','characters','vehicles','collectibles','custom'].includes(task.category)).map(task => ({ ...task, custom: true }));
    return { done: [...new Set(done)], customTasks };
  });
}
export default function ProgressPage({ places, onClose, onLocate }: { places: Place[]; onClose: () => void; onLocate: (placeId: string) => void }) {
  const [progress, setProgress] = useState<SavedProgress>(() => readProgress());
  const [tasksFromData, setTasksFromData] = useState<Task[]>([]);
  const [category, setCategory] = useState<TrackerCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [newTask, setNewTask] = useState('');
  const [newCategory, setNewCategory] = useState<TrackerCategory>('custom');
  const [showAdd, setShowAdd] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [backupMessage, setBackupMessage] = useState('');
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }, [progress]);
  useEffect(() => {
    let alive = true;
    const base = import.meta.env.BASE_URL;
    const fromPlaces: Task[] = places.filter(p => p.position && p.category !== 'region').map(p => ({ id: `location:${p.id}`, name: p.title, category: 'locations', placeId: p.id, description: `${p.region || 'Leonida'} · ${p.category}` }));
    const fromCharacters: Task[] = getAllDossiers().filter(d => d.category === 'character').map(d => ({ id: `character:${d.id}`, name: d.name, category: 'characters', description: d.summary || d.region }));
    Promise.allSettled([
      fetch(`${base}assets/leonida-database/catalogs/vehicles.json`).then(r => r.ok ? r.json() : null),
      fetch(`${base}assets/leonida-database/catalogs/encyclopedia.json`).then(r => r.ok ? r.json() : null),
    ]).then(results => {
      const vehicleData = results[0].status === 'fulfilled' ? results[0].value : null;
      const encyclopediaData = results[1].status === 'fulfilled' ? results[1].value : null;
      const vehicles: Task[] = Array.isArray(vehicleData?.vehicles) ? vehicleData.vehicles.map((v: { id?: string; name?: string; manufacturer?: string; vehicleClass?: string; attributes?: { class?: string } }) => ({ id: `vehicle:${v.id || safeId(v.name || 'unknown')}`, name: v.name || 'Unknown vehicle', category: 'vehicles' as const, description: [v.manufacturer, v.attributes?.class || v.vehicleClass].filter(Boolean).join(' · ') })) : [];
      const encyclopedia: Task[] = Array.isArray(encyclopediaData?.entities) ? encyclopediaData.entities.filter((e: { category?: string; name?: string }) => /collect|hidden|item|stunt|treasure/i.test(`${e.category || ''} ${e.name || ''}`)).map((e: { id?: string; name?: string; category?: string; description?: string }) => ({ id: `collectible:${e.id || safeId(e.name || 'unnamed')}`, name: e.name || 'Unnamed collectible', category: 'collectibles' as const, description: e.category || e.description || 'Imported encyclopedia record' })) : [];
      if (alive) setTasksFromData([...fromPlaces, ...fromCharacters, ...vehicles, ...encyclopedia]);
    });
    return () => { alive = false; };
  }, [places]);
  const allTasks = useMemo(() => [...tasksFromData, ...progress.customTasks], [tasksFromData, progress.customTasks]);
  const filtered = useMemo(() => allTasks.filter(t => (category === 'all' || t.category === category) && (showCompleted || !progress.done.includes(t.id)) && matchesSearch(`${t.name} ${t.description || ''} ${t.category}`, query)), [allTasks, category, showCompleted, progress.done, query]);
  const counts = useMemo(() => categories.slice(1).map(c => ({ ...c, total: allTasks.filter(t => t.category === c.id).length, done: allTasks.filter(t => t.category === c.id && progress.done.includes(t.id)).length })), [allTasks, progress.done]);
  const total = allTasks.length, completed = allTasks.filter(t => progress.done.includes(t.id)).length;
  const pct = total ? Math.round(completed / total * 100) : 0;
  function toggleTask(id: string) { setProgress(p => ({ ...p, done: p.done.includes(id) ? p.done.filter(x => x !== id) : [...p.done, id] })); }
  function addTask() { const name = newTask.trim(); if (!name) return; const task: Task = { id: `custom:${Date.now()}`, name, category: newCategory, custom: true }; setProgress(p => ({ ...p, customTasks: [...p.customTasks, task] })); setNewTask(''); setShowAdd(false); }
  function removeTask(task: Task) { setProgress(p => ({ ...p, customTasks: p.customTasks.filter(t => t.id !== task.id), done: p.done.filter(id => id !== task.id) })); }
  return <main className="progress-page">
    <header className="progress-header"><button className="progress-back" onClick={onClose}><ArrowLeft size={16}/> Back to atlas</button><span className="progress-brand">LOBOS UNITED / LEONIDA TRACKER</span><span className="progress-code">FIELD PROGRESS</span><div className="progress-backup-actions"><button type="button" onClick={() => exportProgress(progress)} title="Export backup"><Download size={14}/> Export</button><button type="button" onClick={() => importInput.current?.click()} title="Import backup"><Upload size={14}/> Import</button><input ref={importInput} type="file" accept="application/json,.json" hidden onChange={async e => { const file=e.target.files?.[0]; if(!file)return; try { const imported=await importProgressFile(file); setProgress(imported); setBackupMessage(`Restored ${imported.done.length} completed records and ${imported.customTasks.length} custom goals.`); } catch(err) { setBackupMessage(err instanceof Error ? err.message : "Import failed."); } finally { e.target.value=""; } }}/></div></header>
    <section className="progress-hero"><div className="progress-kicker">YOUR PERSONAL LEONIDA CHECKLIST</div><h1>PROGRESS <span>TRACKER</span></h1><p>Keep track of what you have discovered and completed. Your progress is saved locally on this device.</p>
      <div className="progress-total"><div className="progress-total-numbers"><strong>{completed.toLocaleString()} <small>/ {total.toLocaleString()}</small></strong><span>{pct}% COMPLETE</span></div><div className="progress-meter"><span style={{ width: `${pct}%` }}/></div></div>
    </section>
    <section className="progress-stats">{counts.map(c => <article key={c.id}><span>{c.label.toUpperCase()}</span><strong>{c.done.toLocaleString()} <small>/ {c.total.toLocaleString()}</small></strong><div className="progress-mini-meter"><span style={{width: `${c.total ? c.done/c.total*100 : 0}%`}}/></div></article>)}</section>
    <div className="progress-toolbar"><div className="progress-search"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find an objective…"/></div><button className="progress-add-toggle" onClick={() => setShowAdd(v => !v)}><Plus size={16}/> Add goal</button></div>
    {showAdd && <form className="progress-add-form" onSubmit={e => {e.preventDefault();addTask();}}><input autoFocus value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Goal name"/><select value={newCategory} onChange={e => setNewCategory(e.target.value as TrackerCategory)}>{categories.slice(1).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select><button type="submit" disabled={!newTask.trim()}>Add</button></form>}
    <nav className="progress-categories">{categories.map(c => <button key={c.id} className={category === c.id ? 'active' : ''} onClick={() => setCategory(c.id)}>{c.label}{c.id !== 'all' && <small>{counts.find(x => x.id === c.id)?.done || 0}/{counts.find(x => x.id === c.id)?.total || 0}</small>}</button>)}</nav>
    <div className="progress-list-heading"><span>{filtered.length.toLocaleString()} OBJECTIVES</span><button onClick={() => setShowCompleted(v => !v)}>{showCompleted ? 'Hide completed' : 'Show completed'}</button></div>
    <div className="progress-task-list">{filtered.map(task => { const checked = progress.done.includes(task.id); return <div className={`progress-task ${checked ? 'checked' : ''}`} key={task.id}><button className="progress-check" aria-label={checked ? 'Mark incomplete' : 'Mark complete'} onClick={() => toggleTask(task.id)}>{checked ? <Check size={16}/> : <Circle size={16}/>}</button><div className="progress-task-copy"><strong>{task.name}</strong><small>{task.description || task.category}</small></div><span className="progress-task-type">{task.category}</span>{task.placeId && <button className="progress-locate" onClick={() => onLocate(task.placeId!)} title="Locate on atlas">Locate</button>}{task.custom && <button className="progress-delete" title="Delete custom goal" onClick={() => removeTask(task)}><Trash2 size={15}/></button>}</div>; })}{!filtered.length && <div className="progress-empty"><Trophy size={25}/><p>{total ? 'No objectives match your search or filter.' : 'Tracker records are loading, or no catalog data is available.'}</p></div>}</div>
    <footer className="progress-footer"><ShieldCheck size={14}/> Progress is stored locally in this browser and is independent of the atlas database backup. Use Export to keep a portable backup.{backupMessage && <p className="progress-backup-message" role="status">{backupMessage}</p>}</footer>
  </main>;
}
