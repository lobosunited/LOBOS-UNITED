import { getAllDossiers } from '../dossier/registry';
import type { DossierEntry } from '../dossier/types';
import type { Place } from '../../domain/types';

export interface VehicleConnection {
  id: string;
  name: string;
  placeIds?: string[];
  manufacturer?: string;
  vehicleClass?: string;
  summary?: string;
  tags?: string[];
  aliases?: string[];
}

/** Only explicit record relationships are shown as map connections. */
export function suggestDossierConnections(place: Place): DossierEntry[] {
  return getAllDossiers().filter((entry) => entry.placeId === place.id);
}

export function suggestVehicleConnections(
  place: Place,
  vehicles: VehicleConnection[],
): VehicleConnection[] {
  return vehicles.filter((vehicle) => vehicle.placeIds?.includes(place.id));
}
