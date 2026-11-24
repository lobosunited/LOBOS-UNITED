import { useEffect, useState } from "react";
import { AlertCircle, Database, LoaderCircle } from "lucide-react";
import { publicPath } from "./public-path";

interface CommunityManifest {
  updatedAt: string;
  sourceUpdatedAt?: string;
  upstreamRevision: string;
  records: number;
  positioned: number;
}

type ManifestStatus =
  | { state: "loading" }
  | { state: "ready"; manifest: CommunityManifest }
  | { state: "unavailable" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isGtadbManifest(value: unknown): value is CommunityManifest {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === 1 &&
    value.source === "rolux/gtadb.org" &&
    typeof value.updatedAt === "string" &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    typeof value.upstreamRevision === "string" &&
    /^[a-f0-9]{40}$/i.test(value.upstreamRevision) &&
    Number.isSafeInteger(value.records) &&
    Number(value.records) >= 100 &&
    Number(value.records) <= 50_000 &&
    Number.isSafeInteger(value.positioned) &&
    Number(value.positioned) >= 1 &&
    Number(value.positioned) <= Number(value.records)
  );
}

function isFullSweepManifest(value: unknown): value is CommunityManifest {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === 1 &&
    value.source === "fullsweepmap.com/api/v1/locations" &&
    typeof value.updatedAt === "string" &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    typeof value.sourceUpdatedAt === "string" &&
    Number.isFinite(Date.parse(value.sourceUpdatedAt)) &&
    typeof value.upstreamRevision === "string" &&
    /^[a-f0-9]{64}$/i.test(value.upstreamRevision) &&
    value.sha256 === value.upstreamRevision &&
    Number.isSafeInteger(value.records) &&
    Number(value.records) >= 10 &&
    Number(value.records) <= 20_000 &&
    Number.isSafeInteger(value.positioned) &&
    Number(value.positioned) === Number(value.records)
  );
}

async function loadManifest(
  url: string,
  isManifest: (value: unknown) => value is CommunityManifest,
  signal: AbortSignal,
): Promise<ManifestStatus> {
  try {
    const response = await fetch(url, { cache: "no-store", signal });
    if (!response.ok) throw new Error("Manifest request failed.");
    const value: unknown = await response.json();
    if (!isManifest(value)) throw new Error("Manifest validation failed.");
    return { state: "ready", manifest: value };
  } catch {
    return signal.aborted ? { state: "loading" } : { state: "unavailable" };
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function SourceStatus({
  title,
  sourceDateLabel,
  revisionLabel,
  revisionUrl,
  status,
}: {
  title: string;
  sourceDateLabel?: string;
  revisionLabel: string;
  revisionUrl?: string;
  status: ManifestStatus;
}) {
  if (status.state === "loading") {
    return (
      <div className="community-data-status" role="status" aria-live="polite">
        <LoaderCircle size={15} className="spin" aria-hidden="true" />
        <span>Checking {title}…</span>
      </div>
    );
  }

  if (status.state === "unavailable") {
    return (
      <div
        className="community-data-status is-unavailable"
        role="status"
        aria-live="polite"
      >
        <AlertCircle size={15} aria-hidden="true" />
        <span>
          <strong>{title} status unavailable</strong>
          <small>The bundled Atlas data remains available.</small>
        </span>
      </div>
    );
  }

  const { manifest } = status;
  const revision = manifest.upstreamRevision.slice(0, 7);
  return (
    <div className="community-data-status" role="status" aria-live="polite">
      <Database size={15} aria-hidden="true" />
      <span>
        <strong>{title}</strong>
        <small>
          Synced {formatDate(manifest.updatedAt)} ·{" "}
          {manifest.records.toLocaleString()} records
        </small>
        {manifest.sourceUpdatedAt && (
          <small>
            {sourceDateLabel} {manifest.sourceUpdatedAt}
          </small>
        )}
        <small>
          {revisionLabel}{" "}
          {revisionUrl ? (
            <a
              href={`${revisionUrl}${manifest.upstreamRevision}`}
              target="_blank"
              rel="noreferrer"
            >
              {revision}
            </a>
          ) : (
            revision
          )}
          {" · "}
          {manifest.positioned.toLocaleString()} positioned
        </small>
      </span>
    </div>
  );
}

export function CommunityDataStatus() {
  const [gtadb, setGtadb] = useState<ManifestStatus>({ state: "loading" });
  const [fullSweep, setFullSweep] = useState<ManifestStatus>({
    state: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const [gtadbStatus, fullSweepStatus] = await Promise.all([
        loadManifest(
          publicPath("assets/street-leonida/maps/community-manifest.json"),
          isGtadbManifest,
          controller.signal,
        ),
        loadManifest(
          publicPath("assets/leonida-database/fullsweep-manifest.json"),
          isFullSweepManifest,
          controller.signal,
        ),
      ]);
      if (!controller.signal.aborted) {
        setGtadb(gtadbStatus);
        setFullSweep(fullSweepStatus);
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  return (
    <section
      className="community-data-panel"
      aria-label="Community data freshness"
    >
      <SourceStatus
        title="GTADB community data"
        revisionLabel="Revision"
        revisionUrl="https://github.com/rolux/gtadb.org/commit/"
        status={gtadb}
      />
      <SourceStatus
        title="FullSweep locations"
        sourceDateLabel="Source updated"
        revisionLabel="Snapshot"
        status={fullSweep}
      />
    </section>
  );
}
