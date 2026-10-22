import { Navigate, Route, Routes } from 'react-router';
import {
  LoginPage,
  PasswordResetPage,
  SignupPage,
  VerifyEmailPage,
} from '../features/auth/AuthPages';
import { EmailChangeConfirmationPage } from '../features/account/AccountSettingsPage';
import InvitationAcceptPage from '../features/workspaces/InvitationAcceptPage';
import { CompleteProfilePage } from '../features/auth/CompleteProfile';

export default function Account() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route path="signup" element={<SignupPage />} />
      <Route path="complete-profile" element={<CompleteProfilePage />} />
      <Route path="verify" element={<VerifyEmailPage />} />
      <Route path="reset-password" element={<PasswordResetPage />} />
      <Route path="email-change" element={<EmailChangeConfirmationPage />} />
      <Route path="invitation" element={<InvitationAcceptPage />} />
      <Route path="*" element={<Navigate to="login" replace />} />
    </Routes>
  );
}
