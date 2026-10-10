import "server-only";
import { cacheLife } from "next/cache";
import { db } from "@/server/db/client";
import { unwrap } from "@/server/db/query";

export async function getCircuits() {
  "use cache";
  cacheLife("hours");
  return unwrap(await db().from("circuits").select("*").order("circuit_key"));
}

export async function getTeams() {
  "use cache";
  cacheLife("hours");
  return unwrap(await db().from("teams").select("*").order("name"));
}

export async function getDrivers() {
  "use cache";
  cacheLife("hours");
  return unwrap(await db().from("drivers").select("*").order("code"));
}
