// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Discover } from './pages/Discover';
import { Chats } from './pages/Chats';
import { Soul } from './pages/Soul';
import { Profile } from './pages/Profile';
import { Taberna } from './pages/Taberna';
import './styles/global.css';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/descubrir" element={<Discover />} />
            <Route path="/chats" element={<Chats />} />
            <Route path="/alma" element={<Soul />} />
            <Route path="/perfil" element={<Profile />} />
            <Route path="/taberna" element={<Taberna />} />
          </Route>

          <Route path="*" element={<Navigate to="/descubrir" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
