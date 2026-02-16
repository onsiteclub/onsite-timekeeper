/**
 * Index - Redirect to Home (Reports)
 * Former Home tab merged into Reports in v2.0
 */
import { Redirect } from 'expo-router';

export default function HomeRedirect() {
  return <Redirect href="/(tabs)/reports" />;
}
