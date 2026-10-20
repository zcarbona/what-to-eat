import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './components/AuthProvider'
import { ToastProvider } from './components/ToastProvider'
import { AppLayout } from './components/layout/AppLayout'
import { PublicOnly, RequireAuth } from './components/layout/Guards'
import { CreateGroupPage } from './pages/CreateGroupPage'
import { GatheringDetailPage } from './pages/GatheringDetailPage'
import { GroupDetailPage } from './pages/GroupDetailPage'
import { GroupsPage } from './pages/GroupsPage'
import { HomePage } from './pages/HomePage'
import { JoinGroupPage } from './pages/JoinGroupPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { ProfilePage } from './pages/ProfilePage'
import { RegisterPage } from './pages/RegisterPage'

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />

            <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route index element={<HomePage />} />
              <Route path="groups" element={<GroupsPage />} />
              <Route path="groups/new" element={<CreateGroupPage />} />
              <Route path="groups/:groupId" element={<GroupDetailPage />} />
              <Route path="groups/:groupId/gatherings/:eventId" element={<GatheringDetailPage />} />
              <Route path="join" element={<JoinGroupPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
