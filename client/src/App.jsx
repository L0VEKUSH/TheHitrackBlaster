import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";

// Layout
import Navbar   from "./components/common/Navbar";
import Footer   from "./components/common/Footer";
import ErrorBoundary from "./components/common/ErrorBoundary";

// Public pages
import HomePage            from "./pages/HomePage";
import MatchesPage         from "./pages/MatchesPage";
import MatchDetailPage     from "./pages/MatchDetailPage";
import PlayersPage         from "./pages/PlayersPage";
import PlayerDetailPage    from "./pages/PlayerDetailPage";
import TeamsPage           from "./pages/TeamsPage";
import TeamDetailPage      from "./pages/TeamDetailPage";
import NewsPage            from "./pages/NewsPage";
import NewsDetailPage      from "./pages/NewsDetailPage";
import TournamentsPage     from "./pages/TournamentsPage";
import TournamentDetailPage from "./pages/TournamentDetailPage";
import RankingsPage        from "./pages/RankingsPage";
import PollRankings        from "./pages/PollRankings";
import LoginPage           from "./pages/LoginPage";
import RegisterPage        from "./pages/RegisterPage";
import ManagementPage      from "./pages/ManagementPage";
import MoreGamesPage      from "./pages/MoreGamesPage";
import MultiSportLivePage from "./pages/MultiSportLivePage";
import AboutMePage        from "./pages/AboutMePage";
import OtherServices     from "./pages/OtherServices";

// Admin pages
import AdminLayout         from "./pages/admin/AdminLayout";
import AdminDashboard      from "./pages/admin/AdminDashboard";
import AdminMatches        from "./pages/admin/AdminMatches";
import AdminMatchForm      from "./pages/admin/AdminMatchForm";
import AdminLiveScoring    from "./pages/admin/AdminLiveScoring";
import AdminPlayers        from "./pages/admin/AdminPlayers";
import AdminPlayerForm     from "./pages/admin/AdminPlayerForm";
import AdminTeams          from "./pages/admin/AdminTeams";
import AdminTeamForm       from "./pages/admin/AdminTeamForm";
import AdminNews           from "./pages/admin/AdminNews";
import AdminNewsForm       from "./pages/admin/AdminNewsForm";
import AdminTournaments    from "./pages/admin/AdminTournaments";
import AdminTournamentForm from "./pages/admin/AdminTournamentForm";
import AdminLogin          from "./pages/admin/AdminLogin";
import AdminSetup          from "./pages/admin/AdminSetup";
import AdminManagement     from "./pages/admin/AdminManagement";
import AdminManagementForm from "./pages/admin/AdminManagementForm";
import AdminMultiSport      from "./pages/admin/AdminMultiSport";
import AdminMultiSportForm  from "./pages/admin/AdminMultiSportForm";
import AdminMultiSportScoring from "./pages/admin/AdminMultiSportScoring";
import AdminServices      from "./pages/admin/AdminServices";
import AdminAboutMe        from "./pages/admin/AdminAboutMe";

function AdminGuard({ children }) {
  const { admin, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  );
  if (!admin) return <Navigate to="/admin/login" replace />;
  return children;
}

function PublicLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Routes>
        {/* ── Public ─────────────────────────────────── */}
        <Route path="/"              element={<PublicLayout><HomePage /></PublicLayout>} />
        <Route path="/matches"       element={<PublicLayout><MatchesPage /></PublicLayout>} />
        <Route path="/matches/:id"   element={<PublicLayout><MatchDetailPage /></PublicLayout>} />
        <Route path="/players"       element={<PublicLayout><PlayersPage /></PublicLayout>} />
        <Route path="/players/:id"   element={<PublicLayout><PlayerDetailPage /></PublicLayout>} />
        <Route path="/teams"         element={<PublicLayout><TeamsPage /></PublicLayout>} />
        <Route path="/teams/:id"     element={<PublicLayout><TeamDetailPage /></PublicLayout>} />
        <Route path="/news"          element={<PublicLayout><NewsPage /></PublicLayout>} />
        <Route path="/news/:id"      element={<PublicLayout><NewsDetailPage /></PublicLayout>} />
        <Route path="/tournaments"   element={<PublicLayout><TournamentsPage /></PublicLayout>} />
        <Route path="/tournaments/:id" element={<PublicLayout><TournamentDetailPage /></PublicLayout>} />
        <Route path="/rankings"      element={<PublicLayout><RankingsPage /></PublicLayout>} />
        <Route path="/fan-rankings"  element={<PublicLayout><PollRankings /></PublicLayout>} />
        <Route path="/login"         element={<PublicLayout><LoginPage /></PublicLayout>} />
        <Route path="/register"      element={<PublicLayout><RegisterPage /></PublicLayout>} />
        <Route path="/management"    element={<PublicLayout><ManagementPage /></PublicLayout>} />
        <Route path="/more-games"    element={<PublicLayout><MoreGamesPage /></PublicLayout>} />
        <Route path="/multi-sport-live" element={<PublicLayout><MultiSportLivePage /></PublicLayout>} />
        <Route path="/about-me"         element={<PublicLayout><AboutMePage /></PublicLayout>} />
        <Route path="/other-services"   element={<PublicLayout><OtherServices /></PublicLayout>} />

        {/* ── Admin Auth ──────────────────────────────── */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/setup" element={<AdminSetup />} />

        {/* ── Admin Protected ─────────────────────────── */}
        <Route path="/admin" element={<AdminGuard><AdminLayout /></AdminGuard>}>
          <Route index                       element={<AdminDashboard />} />
          <Route path="matches"              element={<AdminMatches />} />
          <Route path="matches/new"          element={<AdminMatchForm />} />
          <Route path="matches/:id/edit"     element={<AdminMatchForm />} />
          <Route path="matches/:id/live"     element={<AdminLiveScoring />} />
          <Route path="players"              element={<AdminPlayers />} />
          <Route path="players/new"          element={<AdminPlayerForm />} />
          <Route path="players/:id/edit"     element={<AdminPlayerForm />} />
          <Route path="teams"                element={<AdminTeams />} />
          <Route path="teams/new"            element={<AdminTeamForm />} />
          <Route path="teams/:id/edit"       element={<AdminTeamForm />} />
          <Route path="news"                 element={<AdminNews />} />
          <Route path="news/new"             element={<AdminNewsForm />} />
          <Route path="news/:id/edit"        element={<AdminNewsForm />} />
          <Route path="tournaments"          element={<AdminTournaments />} />
          <Route path="tournaments/new"      element={<AdminTournamentForm />} />
          <Route path="tournaments/:id/edit" element={<AdminTournamentForm />} />
          <Route path="management"           element={<AdminManagement />} />
          <Route path="management/new"       element={<AdminManagementForm />} />
          <Route path="management/:id/edit"  element={<AdminManagementForm />} />
          <Route path="about-me"             element={<AdminAboutMe />} />
          <Route path="multi-sport"          element={<AdminMultiSport />} />
          <Route path="multi-sport/new"      element={<AdminMultiSportForm />} />
          <Route path="multi-sport/:id/edit" element={<AdminMultiSportForm />} />
          <Route path="multi-sport/:id/live" element={<AdminMultiSportScoring />} />
          <Route path="services"             element={<AdminServices />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </AuthProvider>
    </ErrorBoundary>
  );
}
