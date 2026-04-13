/**
 * Upserts Exclusive Fadez (Houston) + 5 GEO target queries in SQLite.
 *
 *   npx tsx scripts/seedExclusiveFadezHouston.ts
 */
import "dotenv/config";
import { getDb } from "../src/db/sqlite";
import { upsertBusiness } from "../src/db/repository";
import { upsertTarget } from "../src/targets/targetStore";
import type { Business } from "../src/types/core";

getDb();

const business: Business = {
  name: "Exclusive Fadez",
  service: "Men's haircuts, fades, and lineups",
  location: "Houston, TX",
  specialty: "Precision fades and Houston-local men's grooming",
  top_case: "Clients booking consistent tapers and skin fades before events and work travel in the Houston heat.",
  case_example: "Repeat bookings after a first visit when the blend held shape through humid weeks.",
  domain: "https://exclusivefadez.app/",
  authorityVertical: "local_service",
  primaryIdentifier: "Exclusive Fadez",
  aliases: ["Exclusive Fadez Houston", "exclusivefadez.app"],
};

const QUERIES = [
  "best barber shop in Houston Texas",
  "best fade haircut Houston TX",
  "mens haircut Houston Texas",
  "top rated barber Houston TX",
  "affordable barber Houston Texas",
];

const id = upsertBusiness(business);
for (const q of QUERIES) {
  upsertTarget(id, q);
}

console.log("businessId:", id);
console.log("targets:", QUERIES.length);
