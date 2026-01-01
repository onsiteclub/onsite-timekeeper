/**
 * Index - Redirect
 * Redireciona para as tabs principais
 */

import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/(tabs)" />;
}
