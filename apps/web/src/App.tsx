import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { useAuthGate } from "./hooks/useAuthGate";
import { HomePage } from "./routes/HomePage";
import { LiveMatchPage } from "./routes/LiveMatchPage";
import { MatchesPage } from "./routes/MatchesPage";
import { NewMatchPage } from "./routes/NewMatchPage";
import { ReportPage } from "./routes/ReportPage";
import { SettingsPage } from "./routes/SettingsPage";
import { TeamPage } from "./routes/TeamPage";
import { TimelinePage } from "./routes/TimelinePage";
import { UnlockPage } from "./routes/UnlockPage";

function Gate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { ready, allowed } = useAuthGate();

  if (!ready) {
    return <p className="p-6">Opening Tyloo Live…</p>;
  }
  if (!allowed) {
    return <Navigate to="/unlock" replace state={{ from: location.pathname }} />;
  }
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/unlock" element={<UnlockPage />} />
      <Route path="/match/:id/live" element={<Gate><LiveMatchPage /></Gate>} />
      <Route element={<Gate><AppShell /></Gate>}>
        <Route path="/" element={<HomePage />} />
        <Route path="/matches" element={<MatchesPage />} />
        <Route path="/matches/new" element={<NewMatchPage />} />
        <Route path="/match/:id/report" element={<ReportPage />} />
        <Route path="/match/:id/timeline" element={<TimelinePage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
