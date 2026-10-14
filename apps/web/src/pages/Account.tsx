import { Navigate, Route, Routes } from 'react-router';
import {
  LoginPage,
  PasswordResetPage,
  SignupPage,
  VerifyEmailPage,
} from '../features/auth/AuthPages';

export default function Account() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route path="signup" element={<SignupPage />} />
      <Route path="verify" element={<VerifyEmailPage />} />
      <Route path="reset-password" element={<PasswordResetPage />} />
      <Route path="*" element={<Navigate to="login" replace />} />
    </Routes>
  );
}
