import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CarFront, Search, Users, X } from "lucide-react";
import { getAllDossiers } from "../dossier/registry";
import type { DossierEntry } from "../dossier/types";
import { matchesSearch } from "../../domain/filter";
import "./catalog.css";

type CatalogCategory = "characters" | "vehicles";

interface VehicleRecord {
  id: string;
  name: string;
  summary?: string;
  description?: string;
  manufacturer?: string;
  vehicleClass?: string;
  aliases?: string[];
  evidence?: string;
  source?: string;
  sourceUrl?: string;
  attributes?: {
    manufacturer?: string | null;
    model?: string | null;
    class?: string | null;
    seen_in?: string | null;
    drivetrain?: string | null;
    seats?: number | null;
    doors?: number | null;
    stats?: {
      speed?: number;
      acceleration?: number;
      handling?: number;
      off_road?: number;
      strength?: number;
    } | null;
  };
}

interface VehicleFile {
  count?: number;
  vehicles?: VehicleRecord[];
}

function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function validVehicleFile(input: unknown): VehicleFile {
  if (!input || typeof input !== "object" || !("vehicles" in input))
    return { vehicles: [] };
  const value = input as { count?: unknown; vehicles?: unknown };
  const vehicles = Array.isArray(value.vehicles)
    ? value.vehicles.filter(
        (vehicle): vehicle is VehicleRecord =>
          !!vehicle &&
          typeof vehicle === "object" &&
          "id" in vehicle &&
          typeof vehicle.id === "string" &&
          vehicle.id.length > 0 &&
          "name" in vehicle &&
          typeof vehicle.name === "string" &&
          vehicle.name.trim().length > 0 &&
          "sourceUrl" in vehicle &&
          safeHttpsUrl(vehicle.sourceUrl) !== null,
      )
    : [];
  return { count: vehicles.length, vehicles };
}

interface CatalogPageProps {
  category: CatalogCategory;
  onClose: () => void;
}

const base = import.meta.env.BASE_URL;

function VehicleStat({ label, value }: { label: string; value?: number }) {
  if (value === undefined || value === null) return null;
  return (
    <div className="catalog-stat">
      <div className="catalog-stat-heading">
        <span>{label}</span>
        <strong>{value.toFixed(1)}</strong>
      </div>
      <div className="catalog-stat-track">
        <span style={{ width: `${Math.max(0, Math.min(10, value)) * 10}%` }} />
      </div>
    </div>
  );
}

export default function CatalogPage({ category, onClose }: CatalogPageProps) {
  const isCharacters = category === "characters";
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [vehicleLoading, setVehicleLoading] = useState(true);
  const [vehicleError, setVehicleError] = useState("");

  const characters = useMemo(
    () => getAllDossiers().filter((entry) => entry.category === "character"),
    [],
  );

  useEffect(() => {
    let active = true;
    setVehicleLoading(true);
    fetch(`${base}assets/leonida-database/catalogs/vehicles.json`)
      .then((response) => {
        if (!response.ok)
          throw new Error(`Vehicle catalog returned ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((data) => {
        if (active) setVehicles(validVehicleFile(data).vehicles ?? []);
      })
      .catch((error: unknown) => {
        if (active)
          setVehicleError(
            error instanceof Error
              ? error.message
              : "Unable to load vehicle data.",
          );
      })
      .finally(() => {
        if (active) setVehicleLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredCharacters = useMemo(() => {
    return characters.filter((entry) => {
      return matchesSearch(
        [
          entry.name,
          entry.summary,
          entry.description,
          ...entry.aliases,
          ...entry.tags,
        ].join(" "),
        query,
      );
    });
  }, [characters, query]);

  const vehicleClasses = useMemo(
    () =>
      [
        ...new Set(
          vehicles.map(
            (vehicle) =>
              vehicle.attributes?.class ||
              vehicle.vehicleClass ||
              "Unclassified",
          ),
        ),
      ].sort(),
    [vehicles],
  );

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((vehicle) => {
      const vehicleClass =
        vehicle.attributes?.class || vehicle.vehicleClass || "Unclassified";
      if (classFilter !== "all" && vehicleClass !== classFilter) return false;
      return matchesSearch(
        [
          vehicle.name,
          vehicle.manufacturer,
          vehicleClass,
          vehicle.summary,
          vehicle.description,
          ...(vehicle.aliases ?? []),
        ].join(" "),
        query,
      );
    });
  }, [vehicles, query, classFilter]);

  const selectedCharacter = characters.find((entry) => entry.id === selectedId);
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedId);

  useEffect(() => {
    setSelectedId("");
    setQuery("");
    setClassFilter("all");
  }, [category]);

  function navigate(next: CatalogCategory) {
    history.pushState({}, "", `${base}${next}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function openCharacter(entry: DossierEntry) {
    setSelectedId(entry.id);
  }

  function openVehicle(vehicle: VehicleRecord) {
    setSelectedId(vehicle.id);
  }

  const count = isCharacters
    ? filteredCharacters.length
    : filteredVehicles.length;

  return (
    <main className="catalog-page">
      <header className="catalog-header">
        <div className="catalog-header-top">
          <button className="catalog-back" onClick={onClose}>
            <ArrowLeft size={17} />
            <span>Return to map</span>
          </button>
          <div className="catalog-brand">
            LOBOS UNITED <span>· LEONIDA DATABASE</span>
          </div>
          <div className="catalog-header-mark">LU / 06</div>
        </div>

        <div className="catalog-hero">
          <div className="catalog-eyebrow">
            THE LEONIDA ARCHIVE / FIELD INDEX
          </div>
          <h1>
            {isCharacters ? "CHARACTER" : "VEHICLE"} <span>DATABASE</span>
          </h1>
          <p>
            {isCharacters
              ? "Profiles, official promotional artwork, known details, and source-backed character information."
              : "Community-reported vehicles, source links, and documented details. Source labels show the underlying record provider; community records do not imply official confirmation."}
          </p>
          <div className="catalog-tabs">
            <button
              className={isCharacters ? "active" : ""}
              onClick={() => navigate("characters")}
            >
              <Users size={16} /> Characters
            </button>
            <button
              className={!isCharacters ? "active" : ""}
              onClick={() => navigate("vehicles")}
            >
              <CarFront size={17} /> Vehicles
            </button>
          </div>
        </div>
      </header>

      <section className="catalog-content">
        <div className="catalog-toolbar">
          <label className="catalog-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                isCharacters
                  ? "Search characters, aliases, details..."
                  : "Search vehicles, makes, classes..."
              }
            />
            {query && (
              <button aria-label="Clear search" onClick={() => setQuery("")}>
                <X size={16} />
              </button>
            )}
          </label>
          {!isCharacters && (
            <select
              value={classFilter}
              onChange={(event) => setClassFilter(event.target.value)}
              aria-label="Filter vehicle class"
            >
              <option value="all">All vehicle classes</option>
              {vehicleClasses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          )}
          <div className="catalog-result-count">
            <strong>{count}</strong> RECORDS
          </div>
        </div>

        {isCharacters ? (
          <div className="catalog-grid">
            {filteredCharacters.map((entry) => (
              <button
                className="catalog-card character-card"
                key={entry.id}
                onClick={() => openCharacter(entry)}
              >
                <div className="catalog-card-image">
                  {entry.gallery[0] ? (
                    <img
                      src={entry.gallery[0].url}
                      alt={entry.gallery[0].caption || entry.name}
                      loading="lazy"
                    />
                  ) : (
                    <div className="catalog-image-placeholder">
                      <Users size={34} />
                    </div>
                  )}
                  <span className="catalog-card-index">
                    CHAR /{" "}
                    {String(characters.indexOf(entry) + 1).padStart(2, "0")}
                  </span>
                  <span className="catalog-card-open">VIEW FILE ↗</span>
                </div>
                <div className="catalog-card-body">
                  <div className="catalog-card-kicker">
                    {entry.region || "LEONIDA"}
                  </div>
                  <h2>{entry.name}</h2>
                  <p>
                    {entry.summary ||
                      entry.description ||
                      "Character dossier and available reference material."}
                  </p>
                  <div className="catalog-card-footer">
                    <span>{entry.gallery.length} ARTWORK ITEMS</span>
                    <span
                      className={`catalog-evidence evidence-${entry.evidence}`}
                    >
                      {entry.evidence}
                    </span>
                  </div>
                </div>
              </button>
            ))}
            {filteredCharacters.length === 0 && (
              <div className="catalog-empty">
                No character records match that search.
              </div>
            )}
          </div>
        ) : (
          <>
            {vehicleLoading && (
              <div className="catalog-empty">Loading vehicle records…</div>
            )}
            {vehicleError && (
              <div className="catalog-empty">
                Vehicle data could not be loaded: {vehicleError}
              </div>
            )}
            {!vehicleLoading && !vehicleError && (
              <div className="catalog-grid vehicle-grid">
                {filteredVehicles.map((vehicle, index) => {
                  const vehicleClass =
                    vehicle.attributes?.class ||
                    vehicle.vehicleClass ||
                    "Unclassified";
                  return (
                    <button
                      className="catalog-card vehicle-card"
                      key={vehicle.id}
                      onClick={() => openVehicle(vehicle)}
                    >
                      <div className="vehicle-card-art">
                        <CarFront size={48} strokeWidth={1.1} />
                        <span className="catalog-card-index">
                          VEH / {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="vehicle-class">{vehicleClass}</span>
                      </div>
                      <div className="catalog-card-body">
                        <div className="catalog-card-kicker">
                          {vehicle.manufacturer ||
                            vehicle.attributes?.manufacturer ||
                            "MANUFACTURER UNKNOWN"}
                        </div>
                        <h2>{vehicle.name}</h2>
                        <p>
                          {vehicle.summary ||
                            vehicle.description ||
                            "Vehicle record recovered; additional specifications have not yet been documented."}
                        </p>
                        <div className="catalog-card-footer">
                          <span>
                            {vehicle.attributes?.seen_in ||
                              "SOURCE NOT SPECIFIED"}
                          </span>
                          <span
                            className={`catalog-evidence evidence-${vehicle.evidence || "unknown"}`}
                          >
                            {vehicle.evidence || "unknown"}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {filteredVehicles.length === 0 && (
                  <div className="catalog-empty">
                    No vehicle records match those filters.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {(selectedCharacter || selectedVehicle) && (
        <div
          className="catalog-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedId("");
          }}
        >
          <section
            className="catalog-detail"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedCharacter?.name || selectedVehicle?.name} details`}
          >
            <button
              className="catalog-detail-close"
              onClick={() => setSelectedId("")}
              aria-label="Close details"
            >
              <X size={21} />
            </button>
            {selectedCharacter && (
              <>
                <div className="catalog-detail-kicker">
                  CHARACTER DOSSIER / {selectedCharacter.evidence.toUpperCase()}
                </div>
                <h2>{selectedCharacter.name}</h2>
                <p className="catalog-detail-summary">
                  {selectedCharacter.summary}
                </p>
                {selectedCharacter.gallery.length > 0 && (
                  <div className="catalog-gallery">
                    {selectedCharacter.gallery.map((image) => (
                      <figure key={image.id}>
                        <img
                          src={image.url}
                          alt={image.caption || selectedCharacter.name}
                          loading="lazy"
                        />
                        <figcaption>
                          {image.caption || selectedCharacter.name} ·{" "}
                          {image.credit || "Rockstar Games"}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}
                {selectedCharacter.description && (
                  <p className="catalog-detail-description">
                    {selectedCharacter.description}
                  </p>
                )}
                {selectedCharacter.facts.length > 0 && (
                  <div className="catalog-facts">
                    {selectedCharacter.facts.map((fact) => (
                      <div key={`${fact.label}-${fact.value}`}>
                        <span>{fact.label}</span>
                        <strong>{fact.value}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {selectedCharacter.aliases.length > 0 && (
                  <p className="catalog-detail-meta">
                    <b>ALIASES</b> {selectedCharacter.aliases.join(" · ")}
                  </p>
                )}
                {selectedCharacter.sources.length > 0 && (
                  <div className="catalog-sources">
                    <h3>REFERENCE SOURCES</h3>
                    {selectedCharacter.sources.map((source) => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {source.label} ↗
                      </a>
                    ))}
                  </div>
                )}
              </>
            )}
            {selectedVehicle && (
              <>
                <div className="catalog-detail-kicker">
                  VEHICLE RECORD / {selectedVehicle.evidence || "UNVERIFIED"}
                </div>
                <h2>{selectedVehicle.name}</h2>
                <p className="catalog-detail-summary">
                  {selectedVehicle.description ||
                    selectedVehicle.summary ||
                    "No extended description is currently available for this record."}
                </p>
                <div className="catalog-facts">
                  <div>
                    <span>Manufacturer</span>
                    <strong>
                      {selectedVehicle.manufacturer ||
                        selectedVehicle.attributes?.manufacturer ||
                        "Unknown"}
                    </strong>
                  </div>
                  <div>
                    <span>Vehicle class</span>
                    <strong>
                      {selectedVehicle.attributes?.class ||
                        selectedVehicle.vehicleClass ||
                        "Unknown"}
                    </strong>
                  </div>
                  <div>
                    <span>Drivetrain</span>
                    <strong>
                      {selectedVehicle.attributes?.drivetrain ||
                        "Not documented"}
                    </strong>
                  </div>
                  <div>
                    <span>Seats</span>
                    <strong>
                      {selectedVehicle.attributes?.seats ?? "Not documented"}
                    </strong>
                  </div>
                  <div>
                    <span>Doors</span>
                    <strong>
                      {selectedVehicle.attributes?.doors ?? "Not documented"}
                    </strong>
                  </div>
                  <div>
                    <span>Seen in</span>
                    <strong>
                      {selectedVehicle.attributes?.seen_in || "Not documented"}
                    </strong>
                  </div>
                </div>
                {selectedVehicle.attributes?.stats && (
                  <div className="catalog-vehicle-stats">
                    <h3>AVAILABLE PERFORMANCE DATA</h3>
                    <VehicleStat
                      label="Speed"
                      value={selectedVehicle.attributes.stats.speed}
                    />
                    <VehicleStat
                      label="Acceleration"
                      value={selectedVehicle.attributes.stats.acceleration}
                    />
                    <VehicleStat
                      label="Handling"
                      value={selectedVehicle.attributes.stats.handling}
                    />
                    <VehicleStat
                      label="Off-road"
                      value={selectedVehicle.attributes.stats.off_road}
                    />
                    <VehicleStat
                      label="Strength"
                      value={selectedVehicle.attributes.stats.strength}
                    />
                  </div>
                )}
                {safeHttpsUrl(selectedVehicle.sourceUrl) && (
                  <a
                    className="catalog-source-link"
                    href={safeHttpsUrl(selectedVehicle.sourceUrl)!}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {selectedVehicle.source
                      ? `SOURCE: ${selectedVehicle.source}`
                      : "OPEN ORIGINAL SOURCE"} ↗
                  </a>
                )}
                <p className="catalog-detail-note">
                  Catalog coverage is limited to structured records currently
                  recovered by the project. Missing specifications are
                  intentionally left blank.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
