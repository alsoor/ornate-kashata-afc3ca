import { RouteObject } from "react-router";
import HomePage from './pages/index';
import WhisperPage from './pages/whisper';
import SettingsPage from './pages/settings';
import AddFriendPage from './pages/add-friend';
import ChatPage from './pages/chat';
import RoomPage from './pages/room';
import ProfilePage from './pages/profile';
import PrivacyPage from './pages/privacy';
import UserProfilePage from './pages/user-profile';
import SharePage from './pages/share';
import LivePage from './pages/live';
import FeedPage from './pages/feed';
import DmPage from './pages/dm';
import AuthPage from './pages/auth/AuthPage';
import ProdNotFoundPage from './pages/_404';
const NotFoundPage = ProdNotFoundPage;
export const routes: RouteObject[] = [{
  path: '/',
  element: <HomePage />
}, {
  path: '/feed',
  element: <FeedPage />
}, {
  path: '/dm',
  element: <DmPage />
}, {
  path: '/whisper',
  element: <WhisperPage />
}, {
  path: '/settings',
  element: <SettingsPage />
}, {
  path: '/add-friend',
  element: <AddFriendPage />
}, {
  path: '/chat',
  element: <ChatPage />
}, {
  path: '/room',
  element: <RoomPage />
}, {
  path: '/profile',
  element: <ProfilePage />
}, {
  path: '/privacy',
  element: <PrivacyPage />
}, {
  path: '/u/:username',
  element: <UserProfilePage />
}, {
  path: '/share',
  element: <SharePage />
}, {
  path: '/live',
  element: <LivePage />
}, {
  path: '/auth',
  element: <AuthPage />
}, {
  path: '*',
  element: <NotFoundPage />
}];
export type Path = '/' | '/feed' | '/whisper' | '/settings' | '/add-friend' | '/chat' | '/room' | '/profile' | '/privacy' | '/u/:username' | '/live';
export type Params = Record<string, string | undefined>;
