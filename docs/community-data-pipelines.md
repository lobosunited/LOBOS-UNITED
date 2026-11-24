# Community data pipelines

The Atlas keeps its public source refreshes separate. Neither pipeline reads or
writes browser IndexedDB; favorites, notes, personal markers, collections and
preferences stay local to each visitor.

## GTADB landmarks

`.github/workflows/community-data-sync.yml` runs on its existing twice-weekly
schedule or by manual dispatch. It validates the upstream GTADB snapshot and
writes only:

- `public/assets/street-leonida/maps/gtadb-landmarks-5c1d69f.json`
- `public/assets/street-leonida/maps/community-manifest.json`

## FullSweep locations

`.github/workflows/fullsweep-data-sync.yml` runs daily or by manual dispatch.
It downloads the public FullSweep stats and locations endpoints, checks the
reported count, source update date, CC BY 4.0 license and attribution, normalizes
stable IDs and map-pixel coordinates, and rejects malformed, oversized or
unexpectedly reduced data. It writes only:

- `public/assets/leonida-database/fullsweep-locations.json`
- `public/assets/leonida-database/fullsweep-manifest.json`

The existing `map-locations.json` catalogue is retained as the curated baseline.
The app loads it first and then overlays the refreshed FullSweep records by
stable ID, retaining existing descriptions and saved-place identities. A
successful data change on `main` dispatches the artifact workflow with the
exact data commit SHA. Unchanged FullSweep data does not create a commit or a
build.

## Production packages and deployment

`.github/workflows/deployment-build-artifacts.yml` creates separate GTA6 State
and Zonepedia production packages from one verified source commit. Each package
includes the community files that exist at that commit and precaches them for
offline use. The workflow produces downloadable artifacts; it does not connect
to a host or deploy a site.

Use the GTA6 State package only at
`https://gta6state.com/gta6-leonida-atlas/` and the Zonepedia package only at
`https://atlas.zonepedia.com/`. Their base paths and canonical origins are
different. The existing Docker and Traefik instructions remain in
[`deploy/README.md`](../deploy/README.md); they require the instance owner to
provide the hostname, proxy network, TLS resolver and route prefix.

Hosting ownership, server access, automated deployment and live health checks
must be confirmed with the owners of both sites before production delivery.
