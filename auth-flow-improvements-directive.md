# Auth Flow — Security + UX Improvements

## Context

This is the OnSite Timekeeper app (Expo / React Native / TypeScript) using Supabase Auth (email/password only). An auth audit was completed. This directive fixes the security issues and improves the UX of the auth flow.

**Email confirmation is disabled for now** (testing phase). The signup flow should auto-login after registration. Keep the confirmation UI code in place but commented out — do NOT delete it. Add a comment: `// TODO: Re-enable email confirmation for production launch`.

---

## Security Fixes (do these FIRST)

### Fix S1: Remove `check_email_exists` RPC — email enumeration vulnerability

**Problem:** The RPC `check_email_exists` is callable by anon users, allowing anyone to probe whether an email is registered.

**What to change:**

Remove the RPC call from the auth flow entirely. Replace with a simpler approach:

```
EmailStep flow (new):
1. User enters email → tap Continue
2. Try signInWithPassword(email, DUMMY_PASSWORD) — this will ALWAYS fail
3. If error contains "Invalid login credentials" → email EXISTS → go to PasswordStep
4. If error contains "Invalid login" or similar → email may or may not exist
5. Default fallback: go to PasswordStep anyway
```

Actually, even simpler — **just always go to PasswordStep first**:

```
New EmailStep flow:
1. User enters email → tap Continue
2. Go to PasswordStep (always)
3. On PasswordStep, user enters password → try signIn
4. If "Invalid login credentials" → wrong password (show error)
5. If "User not found" or similar → redirect to SignupStep
6. Add a "New here? Create account" link on PasswordStep footer
```

This eliminates the email enumeration entirely — the app never confirms whether an email exists.

**Files to change:**
- `AuthScreen.tsx` — remove `checkEmailExists` call, always go to PasswordStep
- `EmailStep.tsx` — remove the RPC call in handleSubmit, just validate email format and advance
- Add "New here? Create account" link to PasswordStep footer (below "Forgot password?")
- `PasswordStep.tsx` — handle "user not found" error → redirect to SignupStep with email preserved

**Migration cleanup (if possible):** The RPC `check_email_exists` in migration 003 should be dropped. Create a new migration:
```sql
DROP FUNCTION IF EXISTS public.check_email_exists(TEXT);
```
If migrations can't be modified, leave a TODO comment.

---

### Fix S2: Filter raw Supabase errors

**Problem:** Some error paths pass raw Supabase error messages to the UI, which can leak internal info.

**What to change in AuthScreen.tsx / PasswordStep.tsx / SignupStep.tsx:**

Replace all catch-all error handlers with user-friendly messages:

```ts
// BEFORE (leaks info):
return { error: result.error || 'Sign in failed' };

// AFTER (safe):
return { error: 'Sign in failed. Please check your credentials and try again.' };
```

**Error mapping table — use these exact strings:**

| Supabase error contains | Show to user |
|---|---|
| "Invalid login credentials" | "Incorrect email or password" |
| "Email not confirmed" | "Please check your email to confirm your account" |
| "User already registered" | (silently try sign-in, existing behavior) |
| "rate limit" or "too many" | "Too many attempts. Please wait a moment and try again." |
| "network" or "fetch" | "No internet connection. Please check your network." |
| Anything else | "Something went wrong. Please try again." |

**Never show raw Supabase error text to the user.**

---

### Fix S3: Mask emails in auth logs

**Problem:** authStore.ts logs raw emails at lines 97, 186, and 262.

**What to change:**

```ts
// BEFORE:
logger.info('auth', `✅ Session found: ${session.user.email}`);

// AFTER:
logger.info('auth', `✅ Session found: ${__DEV__ ? session.user.email : 'user_' + session.user.id.slice(0, 8)}`);
```

Apply this pattern to ALL three instances (lines 97, 186, 262).

---

### Fix S4: Password minimum 8 characters

**What to change in SignupStep.tsx:**

```ts
// BEFORE:
if (password.length < 6) return 'Password must be at least 6 characters';

// AFTER:
if (password.length < 8) return 'Password must be at least 8 characters';
```

Also update the placeholder text:
```ts
// BEFORE:
placeholder="Create a password (min. 6 characters)"

// AFTER:
placeholder="Create a password (min. 8 characters)"
```

---

### Fix S5: Google Maps API key restrictions

**This requires manual action by Cris — not a code change.**

Add a TODO comment in app.json near the API keys:

```json
// TODO: Restrict this API key in Google Cloud Console:
// APIs & Services → Credentials → Edit key →
// Application restrictions: Android apps (package: com.onsite.timekeeper)
// + iOS apps (bundle ID: com.onsite.timekeeper)
// API restrictions: Maps SDK for Android, Maps SDK for iOS only
```

---

## UX Improvements

### UX1: Boot splash — show logo instead of spinner

**Problem:** The boot splash is just a naked ActivityIndicator with no branding. First impression is a blank screen with a spinner.

**What to change in _layout.tsx (lines 332-338):**

Replace the bare spinner with a centered logo + spinner:

```tsx
// Boot splash content:
<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F4' }}>
  <Image
    source={require('../logo.png')}
    style={{ width: 180, height: 62, marginBottom: 32 }}
    resizeMode="contain"
  />
  <ActivityIndicator size="small" color={colors.primary} />
</View>
```

**Keep it simple.** No animations, no fancy splash screen library. Just the logo above the spinner. If there are build errors related to splash screen packages from previous attempts, do NOT install any splash screen packages. This is just a View with an Image — no native module needed.

---

### UX2: Slide transitions between auth steps

**Problem:** Steps swap instantly with no animation — the user doesn't perceive the screen change.

**What to change in AuthScreen.tsx:**

Wrap the step rendering in an `Animated.View` with a horizontal slide:

```tsx
// When step changes:
// 1. Fade out current (150ms)
// 2. Swap component
// 3. Slide in new from right (200ms)

// Simple implementation:
const fadeAnim = useRef(new Animated.Value(1)).current;
const slideAnim = useRef(new Animated.Value(0)).current;

const transitionTo = (newStep: AuthStep) => {
  Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
    setStep(newStep);
    slideAnim.setValue(30); // start 30px to the right
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  });
};

// In render:
<Animated.View style={{ opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
  {step === 'email' && <EmailStep ... />}
  {step === 'password' && <PasswordStep ... />}
  {step === 'signup' && <SignupStep ... />}
</Animated.View>
```

Replace all `setStep('password')` etc. calls with `transitionTo('password')`.

---

### UX3: Reorder SignupStep — button above terms

**Problem:** The "Register & Login" button sits below the Terms text. The user's thumb is at the bottom after filling fields, but has to scroll past the terms to find the button.

**What to change in SignupStep.tsx:**

Move the button ABOVE the terms text:

```tsx
// Current order:
// ... password input
// Terms text
// Register button

// New order:
// ... password input
// Register button
// Terms text (smaller, 12px, more muted)
```

Also adjust the terms text to be smaller since it's now below the action:
```tsx
<Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 12, lineHeight: 18 }}>
  By registering, you agree to our{' '}
  <Text style={{ color: colors.primary }} onPress={() => Linking.openURL('...')}>Terms</Text>
  {' '}and{' '}
  <Text style={{ color: colors.primary }} onPress={() => Linking.openURL('...')}>Privacy Policy</Text>.
</Text>
```

---

### UX4: "New here?" link on PasswordStep

**Problem:** Currently if the email doesn't exist, the user gets sent to SignupStep automatically via the RPC. With the RPC removed (Fix S1), we need a manual path to signup.

**What to add to PasswordStep footer (below "Forgot password?"):**

```tsx
<View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 4 }}>
  <Text style={{ fontSize: 14, color: colors.textSecondary }}>New here?</Text>
  <Pressable onPress={() => onNavigateToSignup()}>
    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>Create account</Text>
  </Pressable>
</View>
```

Add an `onNavigateToSignup` prop to PasswordStep that calls `transitionTo('signup')` in AuthScreen.

Also handle the case where signIn fails with a "user not found" type error — show the error AND highlight the "Create account" link (maybe briefly pulse it amber).

---

### UX5: Session expiry notification

**Problem:** When the session expires, the user gets silently redirected to the login screen with no explanation.

**What to add:**

When the navigation guard detects `!isAuthenticated && !inAuthGroup` (user was using the app but session expired), show a brief message on the login screen:

```tsx
// In _layout.tsx, when redirecting to login due to session expiry:
// Pass a param to indicate this was an expiry, not a fresh launch

router.replace({ pathname: '/(auth)/login', params: { expired: 'true' } });

// In AuthScreen.tsx, check for this param on mount:
const { expired } = useLocalSearchParams<{ expired?: string }>();

// If expired === 'true', show a non-intrusive banner at the top:
{expired === 'true' && (
  <View style={{
    backgroundColor: colors.amberSoftWarm,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  }}>
    <Ionicons name="time-outline" size={18} color="#854F0B" />
    <Text style={{ fontSize: 13, color: '#854F0B', flex: 1 }}>
      Your session expired. Please sign in again.
    </Text>
  </View>
)}
```

This banner appears only when the user was kicked out — not on fresh app launches.

---

### UX6: Logout transition

**Problem:** Logout is instant and abrupt — screen disappears and login appears with no transition.

**What to change:**

After the user confirms "Sign Out", show a brief loading state before navigating:

```tsx
// In settings.tsx handleSignOut:
const handleSignOut = async () => {
  setIsSigningOut(true); // show a brief overlay/spinner
  await onUserLogout();
  await signOut();
  // Small delay so the user sees the transition
  setTimeout(() => {
    router.replace('/');
  }, 300);
};
```

Show a centered spinner with "Signing out..." text for 300ms before the navigation. This makes the logout feel intentional rather than broken.

---

## Implementation Rules

1. **Security fixes (S1-S5) take priority over UX improvements.** Do security first.
2. **Do NOT delete the email confirmation code** — comment it out with TODO marker.
3. **Do NOT install any splash screen native packages.** The boot splash fix (UX1) is just a View with an Image.
4. **Test the new auth flow thoroughly:**
   - Existing user: email → password → sign in → home
   - New user: email → password → wrong password → "Create account" → signup → auto-login → home
   - Forgot password: email → password → "Forgot password?" → green confirmation box
   - Session expiry: use app → force token expiry → amber banner on login
5. **The "Create account" link on PasswordStep must preserve the email** — when transitioning to SignupStep, the email should already be filled in.

---

## Report

After implementation, provide:

```
## Auth Flow Improvements — Implementation Summary

### Security Fixes
- [ ] S1: check_email_exists RPC removed from flow (and DROP migration created if possible)
- [ ] S1: EmailStep always advances to PasswordStep (no email probing)
- [ ] S1: "New here? Create account" link added to PasswordStep
- [ ] S1: Sign-in "user not found" error redirects to SignupStep
- [ ] S2: All raw Supabase errors replaced with user-friendly messages
- [ ] S3: Emails masked in auth logs (3 instances)
- [ ] S4: Password minimum changed to 8 characters + placeholder updated
- [ ] S5: TODO comment added for Google Maps API key restriction

### UX Improvements
- [ ] UX1: Boot splash shows OnSite logo above spinner (no native packages)
- [ ] UX2: Slide transitions between auth steps (fade out + slide in)
- [ ] UX3: Register button moved above Terms text
- [ ] UX4: "New here? Create account" link on PasswordStep
- [ ] UX5: Session expiry banner shows "Your session expired" on login screen
- [ ] UX6: Logout shows brief "Signing out..." before navigating

### Flow verification
- [ ] Existing user login: email → password → home ✓
- [ ] New user signup: email → password (fail) → "Create account" → signup → home ✓
- [ ] Direct signup: email → password → "New here?" → signup → home ✓
- [ ] Forgot password: shows green confirmation, no raw errors ✓
- [ ] Wrong password: shows "Incorrect email or password" (not raw error) ✓
- [ ] Session expiry: amber banner visible on re-login ✓
- [ ] Logout: brief spinner → login screen ✓
- [ ] Email preserved across all step transitions ✓

### Screenshots
- EmailStep (first screen)
- PasswordStep with "New here?" link visible
- SignupStep with button above terms
- Boot splash with logo
- Session expiry banner on login
- Error state (wrong password — user-friendly message)
```
