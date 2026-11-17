import { Navigate, Route, Routes } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { HomePage } from './pages/HomePage';
import { ProblemsPage } from './pages/ProblemsPage';
import { ProblemDetailPage } from './pages/ProblemDetailPage';
import { ContestsPage } from './pages/ContestsPage';
import { ContestDetailPage } from './pages/ContestDetailPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SubmissionHistoryPage } from './pages/SubmissionHistoryPage';
import { SubmissionDetailsPage } from './pages/SubmissionDetailsPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { useHealthCheck } from './hooks/useHealthCheck';

export function AppRoutes() {
  const { status, data } = useHealthCheck();

  return (
    <AuthProvider>
      <MainLayout apiStatus={status}>
        <Routes>
          <Route path="/" element={<HomePage apiStatus={status} healthData={data} />} />
          <Route path="/problems" element={<ProblemsPage />} />
          <Route path="/problems/:id" element={<ProblemDetailPage />} />
          <Route path="/contests" element={<ContestsPage />} />
          <Route path="/contests/:id" element={<ContestDetailPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/submissions" element={<SubmissionHistoryPage />} />
            <Route path="/submissions/:id" element={<SubmissionDetailsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MainLayout>
    </AuthProvider>
  );
}

export function App() {
  return <AppRoutes />;
}

export default App;
