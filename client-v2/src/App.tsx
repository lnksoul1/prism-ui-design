import { useEffect } from "react";
import { Topbar } from "./components/Topbar";
import { DesignLibrary } from "./components/DesignLibrary";
import { CanvasStage } from "./components/Canvas/CanvasStage";
import { InspectorPanel } from "./components/Inspector/InspectorPanel";
import { useDesignStore } from "./stores/design";
import { connectPrismSocket } from "./ws/client";
import { api } from "./api";
import type { DesignStateView } from "./types";

export function App() {
  const applyServerState = useDesignStore((s) => s.applyServerState);

  useEffect(() => {
    void api.getState().then((raw) => applyServerState(raw as DesignStateView));
    return connectPrismSocket();
  }, [applyServerState]);

  return (
    <div className="app-shell">
      <Topbar />
      <div className="main-layout">
        <aside className="panel panel-left"><DesignLibrary /></aside>
        <main className="canvas-host"><CanvasStage /></main>
        <aside className="panel panel-right"><InspectorPanel /></aside>
      </div>
    </div>
  );
}
