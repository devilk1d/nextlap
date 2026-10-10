import "server-only";
import { notFound } from "@/server/http";
import { getRaceSummary, listRaces } from "@/server/races/service";
import { getCircuits } from "@/server/reference/repository";

export const listCircuits = getCircuits;

/** One summary per season in which the circuit hosted a race, oldest first. */
export async function getCircuitHistory(circuitKey: number) {
  const circuit = (await getCircuits()).find((candidate) => candidate.circuit_key === circuitKey);
  if (!circuit) throw notFound("Circuit");

  const races = await listRaces({ circuit_key: circuitKey });
  const seasons = await Promise.all(races.map((race) => getRaceSummary(race.race_id)));
  return { circuit, seasons };
}
