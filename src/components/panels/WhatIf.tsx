// "What if?" staffing comparison — SIMULATED, separate from observed footage.
import { useMemo, useState } from "react";
import { compare } from "../../logic/sim";
import { Panel } from "./LeftPanels";

export function WhatIf() {
  const [arrivalsPerMin, setArr] = useState(1.2);
  const [orderServiceS, setOrd] = useState(60);
  const [pickupServiceS, setPick] = useState(40);
  const [seed, setSeed] = useState(42);
  const [one, two] = useMemo(() => compare({ arrivalsPerMin, orderServiceS, pickupServiceS }, 3600, seed), [arrivalsPerMin, orderServiceS, pickupServiceS, seed]);
  const num = (set: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0) set(v); };
  const row = (label: string, a: string, b: string) => (
    <><span className="h">{label}</span><span className="num">{a}</span><span className="num">{b}</span></>
  );
  return (
    <Panel title="What if?" action={<span className="pill sim">Simulated</span>}>
      <div className="wi-in">
        <span>Arrivals / min</span><input type="number" step={0.1} value={arrivalsPerMin} onChange={num(setArr)} />
        <span>Order service (s)</span><input type="number" step={5} value={orderServiceS} onChange={num(setOrd)} />
        <span>Pickup service (s)</span><input type="number" step={5} value={pickupServiceS} onChange={num(setPick)} />
        <span>Seed <button className="btn xs" onClick={() => setSeed((s) => s + 1)}>reroll</button></span><input type="number" value={seed} onChange={num(setSeed)} />
      </div>
      <div className="sim-grid">
        <span className="h" />
        <span className="h">1 order-taker</span>
        <span className="h">2 order-takers</span>
        {row("Avg wait", `${one.avgWaitS.toFixed(0)} s`, `${two.avgWaitS.toFixed(0)} s`)}
        {row("Max wait", `${one.maxWaitS.toFixed(0)} s`, `${two.maxWaitS.toFixed(0)} s`)}
        {row("…at pickup", `${one.avgPickupWaitS.toFixed(0)} s`, `${two.avgPickupWaitS.toFixed(0)} s`)}
        {row("Throughput", `${one.throughputPerHr.toFixed(0)}/h`, `${two.throughputPerHr.toFixed(0)}/h`)}
      </div>
      <div className="assume">
        Assumptions: 1 h horizon; Poisson arrivals (seeded, identical in both runs); service times uniform 0.5–1.5× mean, same per vehicle in both runs; single FIFO lane; pickup window capacity 1 (unchanged by staffing). Does not use or alter observed footage metrics.
      </div>
    </Panel>
  );
}
