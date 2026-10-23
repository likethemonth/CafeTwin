// Deterministic drive-through queue simulation (SIMULATED — never touches observed data).
// Two stages: order point (1 or 2 order-takers, parallel) -> pickup window (capacity 1, FIFO).
// Both staffing variants consume the IDENTICAL seeded arrival + service-time stream.
import type { Scenario } from "../types";

export interface SimResult {
  orderTakers: 1 | 2;
  vehicles: number;
  completed: number;
  avgWaitS: number;     // queue wait before order start + wait before pickup start
  maxWaitS: number;
  avgOrderWaitS: number;
  avgPickupWaitS: number;
  throughputPerHr: number;
}

export interface SimInput {
  arrivalsPerMin: number;
  orderServiceS: number;
  pickupServiceS: number;
  horizonS: number;
  seed: number;
}

/** mulberry32 seeded PRNG */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Customer { arrive: number; orderS: number; pickupS: number }

export function generateCustomers(inp: SimInput): Customer[] {
  const rnd = prng(inp.seed);
  const exp = (mean: number) => -Math.log(1 - rnd()) * mean;
  // service times: exponential-ish around mean, floored at 30% of mean
  const svc = (mean: number) => Math.max(mean * 0.3, mean * (0.5 + rnd()));
  const out: Customer[] = [];
  const meanGap = 60 / Math.max(0.01, inp.arrivalsPerMin);
  let t = 0;
  for (;;) {
    t += exp(meanGap);
    if (t > inp.horizonS) break;
    out.push({ arrive: t, orderS: svc(inp.orderServiceS), pickupS: svc(inp.pickupServiceS) });
  }
  return out;
}

export function simulate(customers: Customer[], orderTakers: 1 | 2, horizonS: number): SimResult {
  const takerFree = new Array<number>(orderTakers).fill(0);
  let pickupFree = 0;
  let sumWait = 0, maxWait = 0, sumO = 0, sumP = 0, completed = 0;
  for (const c of customers) {
    // single lane: FIFO; next free order-taker
    let k = 0;
    for (let i = 1; i < takerFree.length; i++) if (takerFree[i] < takerFree[k]) k = i;
    const orderStart = Math.max(c.arrive, takerFree[k]);
    const orderEnd = orderStart + c.orderS;
    takerFree[k] = orderEnd;
    const pickupStart = Math.max(orderEnd, pickupFree);
    const pickupEnd = pickupStart + c.pickupS;
    pickupFree = pickupEnd;
    const wO = orderStart - c.arrive, wP = pickupStart - orderEnd;
    sumO += wO; sumP += wP; sumWait += wO + wP; maxWait = Math.max(maxWait, wO + wP);
    if (pickupEnd <= horizonS) completed++;
  }
  const n = Math.max(1, customers.length);
  return {
    orderTakers,
    vehicles: customers.length,
    completed,
    avgWaitS: sumWait / n,
    maxWaitS: maxWait,
    avgOrderWaitS: sumO / n,
    avgPickupWaitS: sumP / n,
    throughputPerHr: (completed / horizonS) * 3600,
  };
}

export function compare(sc: Omit<Scenario, "orderTakers">, horizonS = 3600, seed = 42): [SimResult, SimResult] {
  const customers = generateCustomers({ ...sc, horizonS, seed });
  return [simulate(customers, 1, horizonS), simulate(customers, 2, horizonS)];
}
