import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { HomePage } from "./routes/HomePage";
import { LiveMatchPage } from "./routes/LiveMatchPage";
import { MatchesPage } from "./routes/MatchesPage";
import { NewMatchPage } from "./routes/NewMatchPage";
import { HalfTimeSetupPage } from "./routes/HalfTimeSetupPage";
import { PeriodSummaryPage } from "./routes/PeriodSummaryPage";
import { ReportPage } from "./routes/ReportPage";
import { SettingsPage } from "./routes/SettingsPage";
import { TeamPage } from "./routes/TeamPage";
import { TimelinePage } from "./routes/TimelinePage";

export function App() {
  return (
    <Routes>
      <Route path="/match/:id/live" element={<LiveMatchPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/matches" element={<MatchesPage />} />
        <Route path="/matches/new" element={<NewMatchPage />} />
        <Route path="/match/:id/report" element={<ReportPage />} />
        <Route path="/match/:id/summary/:period" element={<PeriodSummaryPage />} />
        <Route path="/match/:id/halftime" element={<HalfTimeSetupPage />} />
        <Route path="/match/:id/timeline" element={<TimelinePage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
