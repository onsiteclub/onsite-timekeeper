/**
 * Register Screen - OnSite Timekeeper
 *
 * Redirects to login which now handles both login and signup
 * in a unified multi-step flow.
 */

import { Redirect } from 'expo-router';

export default function RegisterScreen() {
  // Registration is now part of the unified auth flow in login.tsx
  return <Redirect href="/(auth)/login" />;
}
