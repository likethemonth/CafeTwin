// LaneTwin shell. Layout adapted from WareTwin's App.tsx (MIT, Wayne Chou).
import { useState } from "react";
import { Header } from "./components/shell/Header";
import { LeftPanels } from "./components/panels/LeftPanels";
import { EventLog, Inspector } from "./components/panels/RightPanels";
import { JourneyTable, QueueChart, Timeline } from "./components/panels/BottomPanels";
import { WhatIf } from "./components/panels/WhatIf";
import { TwinView } from "./components/twin/TwinView";
import { VideoPanel } from "./components/video/VideoPanel";
import { AnalysePanel } from "./components/video/AnalysePanel";
import { ZoneEditor } from "./components/video/ZoneEditor";
import { ThroughputPanel } from "./components/stats/ThroughputPanel";
import { StatusDonut } from "./components/stats/StatusDonut";
import { ZoneDwellBars } from "./components/stats/ZoneDwellBars";
import { HeatmapView } from "./components/stats/HeatmapView";

type CenterTab = "twin" | "heatmap" | "traffic";
type BottomTab = "journeys" | "dwell" | "queue" | "whatif";
const CENTER_TABS: [CenterTab, string][] = [["twin", "Twin"], ["heatmap", "Heatmap"], ["traffic", "Traffic"]];
const BOTTOM_TABS: [BottomTab, string][] = [["journeys", "Journeys"], ["dwell", "Zone dwell"], ["queue", "Queue"], ["whatif", "What-if"]];

export default function App() {
  const [zonesOpen, setZonesOpen] = useState(false);
  const [centerTab, setCenterTab] = useState<CenterTab>("twin");
  const [bottomTab, setBottomTab] = useState<BottomTab>("journeys");
  return (
    <div className="shell">
      <Header />
      <div className="shell-body">
        <aside className="col-left">
          <LeftPanels />
        </aside>
        <main className="center">
          <div className="st-tabs" role="tablist">
            {CENTER_TABS.map(([k, l]) => (
              <button key={k} role="tab" aria-selected={centerTab === k} className={"st-tab" + (centerTab === k ? " on" : "")} onClick={() => setCenterTab(k)}>{l}</button>
            ))}
          </div>
          <div className="twin-wrap">
            {centerTab === "twin" ? <TwinView /> : <HeatmapView mode={centerTab} />}
          </div>
          <Timeline />
        </main>
        <aside className="col-right">
          <VideoPanel />
          <AnalysePanel />
          <section className="panel">
            <header className="panel-h collapse-h" onClick={() => setZonesOpen((o) => !o)}>
              <span>Zones<span className="sub">edit polygons</span></span>
              <span className="muted">{zonesOpen ? "▾" : "▸"}</span>
            </header>
            {zonesOpen && <div className="panel-b"><ZoneEditor embedded /></div>}
          </section>
          <Inspector />
          <EventLog />
        </aside>
        <section className="bottom">
          <ThroughputPanel />
          <StatusDonut />
          <div className="st-stack">
            <div className="st-tabs sm" role="tablist">
              {BOTTOM_TABS.map(([k, l]) => (
                <button key={k} role="tab" aria-selected={bottomTab === k} className={"st-tab" + (bottomTab === k ? " on" : "")} onClick={() => setBottomTab(k)}>{l}</button>
              ))}
            </div>
            {bottomTab === "journeys" && <JourneyTable />}
            {bottomTab === "dwell" && <ZoneDwellBars />}
            {bottomTab === "queue" && <QueueChart />}
            {bottomTab === "whatif" && <WhatIf />}
          </div>
        </section>
      </div>
    </div>
  );
}
