import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Documents from './pages/Documents';
import Nominees from './pages/Nominees';
import Settings from './pages/Settings';
import Activity from './pages/Activity';
import Landing from './pages/Landing';
import NomineeAccess from './pages/nominee/NomineeAccess';
import NomineeVault from './pages/nominee/NomineeVault';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Owner area */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/nominees" element={<Nominees />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      {/* Nominee portal */}
      <Route path="/nominee" element={<NomineeAccess />} />
      <Route path="/nominee/vault" element={<NomineeVault />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
