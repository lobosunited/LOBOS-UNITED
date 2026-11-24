import { useState } from 'react';
import type { DossierEntry } from './types';
import './dossier.css';

interface DossierPanelProps {
  entry: DossierEntry;
  onClose?: () => void;
  onRelatedSelect?: (id: string) => void;
}

export default function DossierPanel({
  entry,
  onClose,
  onRelatedSelect,
}: DossierPanelProps) {
  const [imageIndex, setImageIndex] = useState(0);
  const images = entry.gallery ?? [];
  const currentImage = images[imageIndex];

  const moveImage = (direction: number) => {
    if (!images.length) return;
    setImageIndex((current) =>
      (current + direction + images.length) % images.length,
    );
  };

  return (
    <aside className="dossier-panel" aria-label={`${entry.name} dossier`}>
      <header className="dossier-header">
        <div>
          <span className="dossier-eyebrow">LOBOS UNITED INTELLIGENCE</span>
          <h2>FIELD DOSSIER</h2>
        </div>
        {onClose && (
          <button className="dossier-close" onClick={onClose} aria-label="Close dossier">
            ×
          </button>
        )}
      </header>

      <div className="dossier-scroll">
        <div className="dossier-category-row">
          <span className="dossier-category">{entry.category.toUpperCase()}</span>
          <span className={`dossier-evidence evidence-${entry.evidence}`}>
            {entry.evidence.toUpperCase()}
          </span>
        </div>

        <h1 className="dossier-name">{entry.name}</h1>

        {entry.region && (
          <div className="dossier-region">LOCATION · {entry.region}</div>
        )}

        <div className="dossier-gallery">
          {currentImage ? (
            <img
              src={currentImage.url}
              alt={currentImage.caption || entry.name}
            />
          ) : (
            <div className="dossier-image-placeholder">
              <span>IMAGE ARCHIVE</span>
              <strong>NO IMAGE AVAILABLE</strong>
            </div>
          )}

          {images.length > 1 && (
            <>
              <button
                className="dossier-gallery-arrow previous"
                onClick={() => moveImage(-1)}
                aria-label="Previous image"
              >
                ‹
              </button>
              <button
                className="dossier-gallery-arrow next"
                onClick={() => moveImage(1)}
                aria-label="Next image"
              >
                ›
              </button>
              <div className="dossier-gallery-counter">
                {imageIndex + 1} / {images.length}
              </div>
            </>
          )}

          {currentImage?.caption && (
            <div className="dossier-image-caption">{currentImage.caption}</div>
          )}
        </div>

        {entry.summary && (
          <section className="dossier-summary">
            <span className="dossier-section-label">INTELLIGENCE SUMMARY</span>
            <p>{entry.summary}</p>
          </section>
        )}

        {entry.description && (
          <section className="dossier-section">
            <h3>PROFILE</h3>
            <p className="dossier-description">{entry.description}</p>
          </section>
        )}

        {entry.facts.length > 0 && (
          <section className="dossier-section">
            <h3>INTELLIGENCE DATA</h3>
            <div className="dossier-facts">
              {entry.facts.map((fact, index) => (
                <div className="dossier-fact" key={`${fact.label}-${index}`}>
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                </div>
              ))}
            </div>
          </section>
        )}

        {entry.tags.length > 0 && (
          <section className="dossier-section">
            <h3>IDENTIFIERS</h3>
            <div className="dossier-tags">
              {entry.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </section>
        )}

        {entry.aliases.length > 0 && (
          <section className="dossier-section">
            <h3>KNOWN ALIASES</h3>
            <div className="dossier-tags">
              {entry.aliases.map((alias) => (
                <span key={alias}>{alias}</span>
              ))}
            </div>
          </section>
        )}

        {entry.relatedIds.length > 0 && onRelatedSelect && (
          <section className="dossier-section">
            <h3>RELATED INTELLIGENCE</h3>
            <div className="dossier-related">
              {entry.relatedIds.map((id) => (
                <button key={id} onClick={() => onRelatedSelect(id)}>
                  <span>RECORD</span>
                  <strong>{id}</strong>
                  <span className="dossier-related-arrow">↗</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {entry.sources.length > 0 && (
          <section className="dossier-section">
            <h3>SOURCES & VERIFICATION</h3>
            <div className="dossier-sources">
              {entry.sources.map((source, index) => (
                <a
                  key={`${source.url}-${index}`}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>{source.label}</span>
                  <strong>OPEN SOURCE ↗</strong>
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
