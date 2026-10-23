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

export default function App() {
  const [zonesOpen, setZonesOpen] = useState(false);
  return (
    <div className="shell">
      <Header />
      <div className="shell-body">
        <aside className="col-left">
          <LeftPanels />
        </aside>
        <main className="center">
          <div className="twin-wrap">
            <TwinView />
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
            {zonesOpen && <div className="panel-b"><ZoneEditor /></div>}
          </section>
          <Inspector />
          <EventLog />
        </aside>
        <section className="bottom">
          <JourneyTable />
          <QueueChart />
          <WhatIf />
        </section>
      </div>
    </div>
  );
}
