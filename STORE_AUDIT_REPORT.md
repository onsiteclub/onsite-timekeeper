# RELATÓRIO DE APROVAÇÃO — OnSite Timekeeper v1.6.2
## App Store (Apple) + Google Play — Auditoria Completa

**Data:** 17 de fevereiro de 2026
**Auditor:** Analista Sênior de App Review
**Bundle:** `com.onsiteclub.timekeeper`
**Versão iOS:** 1.6.2 (build 17) | **Versão Android:** 2.0.0 (versionCode 14)

---

# 1) SUMÁRIO EXECUTIVO

**Se eu submetesse hoje, eu espero: REPROVAR (ambas as plataformas)**

O app tem arquitetura técnica sólida e boas práticas de privacidade no código, mas possui 3 bloqueadores absolutos que impedem aprovação em qualquer store.

### Top 3 motivos de reprovação — Apple
1. **Política de Privacidade VAZIA** — a URL retorna página sem conteúdo (só CSS). Guideline 5.1.1
2. **Background Location sem disclosure adequado** — falta App Review Notes explicando o uso. Guideline 5.1.1(ii) + 2.5.4
3. **NSMicrophoneUsageDescription genérica demais** — "for voice commands" não explica o pipeline AI (Whisper → GPT-4o). Guideline 5.1.1(i)

### Top 3 motivos de reprovação — Google Play
1. **Política de Privacidade VAZIA** — bloqueador imediato na revisão de Data Safety
2. **Background Location sem "prominent disclosure"** — Google exige tela in-app ANTES de pedir permissão. Policy: Permissions > Location
3. **Data Safety Form** — precisa declarar: localização precisa, dados de áudio enviados a terceiros (OpenAI), crash reports (Sentry)

---

# 2) APPLE — ACHADOS E CORREÇÕES

## 2.1 — Política de Privacidade Inoperante

| | |
|---|---|
| **Risco** | BLOQUEADOR |
| **Guideline** | 5.1.1 — Data Collection and Storage |
| **Tipo** | Legal / Política |

**O que o reviewer vê:** Clica no link da Privacy Policy → página em branco ou apenas estilização CSS.

**Por que reprova:** Apple exige política de privacidade funcional e acessível. Sem ela, o app é automaticamente rejeitado. Não há exceção.

**Como corrigir:**
1. Publicar conteúdo real na URL `timekeeperweb.onsiteclub.ca/privacy`
2. Deve cobrir: dados coletados, terceiros (OpenAI, Sentry, Supabase, Google Maps), retenção, direitos do usuário, contato
3. Ver Seção 5 deste relatório para texto modelo

---

## 2.2 — Background Location: Justificativa Insuficiente

| | |
|---|---|
| **Risco** | BLOQUEADOR |
| **Guideline** | 5.1.1(ii), 2.5.4, 4.0 |
| **Tipo** | Política + UX |

**O que o reviewer vê:** App usa `UIBackgroundModes: location` + `NSLocationAlwaysUsageDescription`, mas não há:
- Nenhuma tela explicativa no onboarding antes de pedir permissão
- Nenhuma App Review Note explicando por que precisa de "Always"

**Por que reprova:** Desde iOS 13, Apple é extremamente rígida com background location. Sem justificativa detalhada, rejeitam automaticamente.

**Como corrigir:**

**Passo 1 — App Review Notes (colar no App Store Connect):**
```
BACKGROUND LOCATION JUSTIFICATION:

OnSite Timekeeper is a workforce time-tracking app for construction workers.
It uses background location EXCLUSIVELY for geofencing — detecting when the
user physically arrives at or leaves a registered work site.

How it works:
1. User creates a work site (geofence) on the Map tab with a name and radius
2. When the user enters or exits that geofence, the app automatically logs
   entry/exit time to their daily timesheet
3. This eliminates the need for manual clock-in/clock-out
4. Background location is ONLY active when the user has at least one active
   geofence configured
5. No continuous GPS tracking — we use region monitoring (geofencing), which
   is battery-efficient and only triggers on boundary crossings

Why "Always" permission is required:
- Construction workers arrive at job sites with the app closed/backgrounded
- The geofence entry event MUST fire even when the app is not in foreground
- Without "Always", the app cannot detect arrival at the work site
- This is the core value proposition for the user

Data handling:
- GPS coordinates are stored locally (SQLite) and synced to our backend
  (Supabase) for audit trail purposes only
- Coordinates are never shared with third parties
- User can delete all location data at any time

Test account: test@onsiteclub.ca / Teste123!
To test geofencing: Go to Map tab → Create a geofence → Walk in/out of the area
```

**Passo 2 — Tela de onboarding antes de pedir permissão (recomendado):**
Antes de chamar `requestAlwaysAuthorization()`, mostrar uma tela explicando:
- Ícone de mapa com geofence visual
- "Para registrar suas horas automaticamente, precisamos saber quando você chega e sai do canteiro"
- Botão "Ativar localização" → só então pedir permissão do sistema

---

## 2.3 — Microfone / Voz: Disclosure Inadequado

| | |
|---|---|
| **Risco** | ALTO |
| **Guideline** | 5.1.1(i), 5.1.2(i) |
| **Tipo** | Política + Texto |

**O que o reviewer vê:**
- `NSMicrophoneUsageDescription`: "OnSite Timekeeper needs the microphone for voice commands."
- Mas o áudio é enviado para OpenAI Whisper (terceiro) para transcrição
- A transcrição é enviada para GPT-4o (terceiro) para interpretação

**Por que reprova:** "Voice commands" não revela que o áudio sai do dispositivo. Apple exige disclosure de envio a terceiros.

**Como corrigir:**

**Texto corrigido para `NSMicrophoneUsageDescription`:**
```
OnSite Timekeeper uses the microphone to record voice commands. Your audio is
sent to a secure server for speech-to-text transcription and is not stored
after processing.
```

**Texto para App Review Notes (adicionar ao existente):**
```
VOICE COMMANDS / MICROPHONE USAGE:

The app includes a voice assistant accessible via a floating microphone button.
When the user taps the button, audio is recorded and sent to our Supabase
Edge Function backend, which forwards it to OpenAI Whisper API for transcription.

The transcript is then processed by OpenAI GPT-4o to interpret the command
(e.g., "log 8 hours today", "start timer", "send weekly report").

IMPORTANT:
- Audio is NEVER stored permanently — it is deleted immediately after transcription
- Only the text transcript is kept (temporarily, for command execution)
- The user must explicitly tap the microphone button to start recording
- A clear visual indicator (red pulsing button) shows when recording is active
- The user can stop recording at any time
- Microphone permission is requested only when the user first taps the mic button
```

---

## 2.4 — expo-camera no bundle sem uso declarado

| | |
|---|---|
| **Risco** | MÉDIO |
| **Guideline** | 2.5.1 |
| **Tipo** | Implementação |

**O que o reviewer vê:** `expo-camera` está no `package.json` mas não há `NSCameraUsageDescription` no Info.plist.

**Por que reprova:** Se o framework incluir o entitlement de câmera no binary sem usage string, Apple rejeita.

**Como corrigir:**
- **Opção A (recomendada):** Remover `expo-camera` do `package.json` se não está sendo usado
- **Opção B:** Se usa (ex: QR code scanner), adicionar `NSCameraUsageDescription` ao `infoPlist` no `app.json`

---

## 2.5 — Versão iOS vs Android desalinhada

| | |
|---|---|
| **Risco** | MÉDIO |
| **Guideline** | Nenhuma (mas causa confusão na revisão) |
| **Tipo** | Implementação |

**O que o reviewer vê:** iOS = 1.6.2, Android = 2.0.0 (versionName implícito via Expo)

**Como corrigir:** Alinhar `version` e `android.versionCode`. Para primeira submissão:
- iOS: version `1.6.2`, buildNumber `17` → OK
- Android: alinhar versionName para `1.6.2` e garantir versionCode `17` (ou maior que 14)

---

## 2.6 — NSPhotoLibraryUsageDescription sem feature visível

| | |
|---|---|
| **Risco** | MÉDIO |
| **Guideline** | 5.1.1(i) |
| **Tipo** | Política |

**O que o reviewer vê:** "may need access to your photo library to attach images" — mas onde no app o usuário anexa imagens?

**Por que reprova:** Apple rejeita se a permissão é declarada mas a feature não é visível no app.

**Como corrigir:**
- **Se não usa:** Remover `NSPhotoLibraryUsageDescription` do `infoPlist`
- **Se usa:** Indicar nas Review Notes onde o reviewer pode testar essa feature

---

## 2.7 — Sentry sem disclosure na Privacy Policy

| | |
|---|---|
| **Risco** | BAIXO |
| **Guideline** | 5.1.1 |
| **Tipo** | Legal |

**Como corrigir:** Incluir na Privacy Policy que o app usa crash reporting (Sentry) e que dados de erro (sem PII) são enviados a terceiro.

---

# 3) GOOGLE PLAY — ACHADOS E CORREÇÕES

## 3.1 — Política de Privacidade Inoperante

| | |
|---|---|
| **Risco** | BLOQUEADOR |
| **Policy** | User Data policy |
| **Tipo** | Legal / Política |

Mesmo problema da Apple. Google Play Console exige URL funcional. Rejeição automática.

**Correção:** Idêntica à seção 2.1.

---

## 3.2 — Background Location: "Prominent Disclosure" Obrigatório

| | |
|---|---|
| **Risco** | BLOQUEADOR |
| **Policy** | Background Location Access, Permissions policy |
| **Tipo** | UX + Política |

**O que o reviewer vê:** App usa `ACCESS_BACKGROUND_LOCATION` mas (provavelmente) não tem tela de disclosure in-app.

**Por que reprova:** Google Play exige **explicitamente** desde 2021:
1. Um formulário especial no Play Console declarando uso de background location
2. Uma tela **dentro do app** (antes de pedir permissão) que explica por que precisa
3. Vídeo demonstrativo do fluxo de permissão

**Como corrigir:**

**Passo 1 — Tela de Prominent Disclosure (OBRIGATÓRIA para Google):**
Antes de pedir `ACCESS_BACKGROUND_LOCATION`, mostrar dialog/tela com:
```
OnSite Timekeeper coleta dados de localização para detectar automaticamente
quando você chega e sai do canteiro de obra, mesmo quando o app está fechado
ou em segundo plano.

[Entendi, continuar] [Agora não]
```
- O texto deve mencionar "even when the app is closed or not in use"
- Deve ter botão de aceitar E de recusar
- Deve aparecer ANTES do dialog do sistema operacional

**Passo 2 — Formulário no Play Console:**
No Play Console → App Content → Sensitive permissions:
- Tipo: Geofencing
- Justificativa: "App tracks arrival/departure at construction job sites for automatic timesheet logging"
- Upload de vídeo mostrando: onboarding → disclosure → permissão → geofence funcionando

**Passo 3 — Vídeo demonstrativo:**
Gravar vídeo de ~30 segundos mostrando:
1. Abrir o app
2. Tela de disclosure aparecendo
3. Usuário aceitando
4. Dialog do sistema pedindo permissão
5. Geofence configurado e funcionando

---

## 3.3 — Data Safety Form Incompleto

| | |
|---|---|
| **Risco** | ALTO |
| **Policy** | Data safety section |
| **Tipo** | Política |

**O que declarar no Play Console → Data Safety:**

| Tipo de dado | Coletado? | Compartilhado? | Obrigatório? | Pode deletar? |
|---|---|---|---|---|
| Precise location | Sim | Não* | Sim (geofencing) | Sim |
| Approximate location | Sim | Não* | Sim | Sim |
| Audio (voice) | Sim | Sim (OpenAI) | Não (opcional) | Sim** |
| Crash logs | Sim | Sim (Sentry) | Sim (auto) | Não |
| App interactions | Sim | Não | Sim (analytics) | Não |
| Email address | Sim | Não | Sim (auth) | Sim |
| Name | Não | — | — | — |
| Files/docs | Não | — | — | — |

*Localização é enviada ao backend (Supabase) mas não é "compartilhada com terceiros" no sentido do Google — é nosso próprio backend.
**Áudio é deletado imediatamente após transcrição, nunca armazenado.

**Encryption in transit:** Sim (HTTPS)
**Encryption at rest:** Sim (Supabase managed)
**Deletion mechanism:** Deletar conta → deleta todos os dados

---

## 3.4 — `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`

| | |
|---|---|
| **Risco** | ALTO |
| **Policy** | Permissions policy, restricted permissions |
| **Tipo** | Política |

**O que o reviewer vê:** A permissão `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` está declarada.

**Por que reprova:** Google restringe essa permissão. Só aceita para apps cuja funcionalidade CORE depende de rodar em background. Time tracking com geofencing **se qualifica**, mas precisa justificar.

**Como corrigir:**
- No formulário de permissões restritas do Play Console, declarar:
```
OnSite Timekeeper requires exemption from battery optimization because its core
feature — geofence-based automatic time tracking — depends on receiving location
events when the app is in the background. Without this exemption, the Android OS
may kill the geofence monitoring service, causing missed clock-in/clock-out events
for construction workers.
```

---

## 3.5 — `SYSTEM_ALERT_WINDOW` não declarada mas pode estar no build

| | |
|---|---|
| **Risco** | MÉDIO |
| **Policy** | Permissions policy |
| **Tipo** | Implementação |

**Verificar:** O Transistorsoft SDK pode adicionar `SYSTEM_ALERT_WINDOW` automaticamente via merge do AndroidManifest. Se presente no APK final, Google pode questionar.

**Como corrigir:** Após `expo prebuild`, verificar o AndroidManifest gerado e remover se não necessário.

---

## 3.6 — Versionamento Android

| | |
|---|---|
| **Risco** | BAIXO |
| **Tipo** | Implementação |

`versionCode: 14` com `version: 1.6.2`. Para cada upload no Play Console, o versionCode DEVE ser incrementado. Certifique-se de que nunca foi enviada uma versão com versionCode >= 14 antes.

---

# 4) PERMISSÕES & JUSTIFICATIVAS

## iOS

| Permissão | Por que precisa | Onde aparece no app | Texto que o usuário vê | Risco | Mitigação |
|---|---|---|---|---|---|
| `NSLocationWhenInUseUsage` | Mostrar posição no mapa | Aba Mapa | "...to show where you are on the map" | Baixo | OK como está |
| `NSLocationAlwaysAndWhenInUse` | Geofencing em background | Aba Mapa → criar geofence | "...to automatically detect when you arrive at or leave work" | **ALTO** | Adicionar tela de onboarding + Review Notes |
| `NSLocationAlways` | Fallback do Always | Idem | "...to automatically track your work hours" | **ALTO** | Coberto pelo anterior |
| `NSMicrophoneUsage` | Comandos de voz (Whisper) | Botão mic flutuante | "...for voice commands" | **ALTO** | Reescrever texto (ver 2.3) |
| `NSPhotoLibraryUsage` | Anexar imagens | ? | "...to attach images" | **MÉDIO** | Remover se não usa |
| `NSMotionUsage` | Accuracy do GPS | Background | "...to improve location accuracy" | Baixo | OK como está |

## Android

| Permissão | Por que precisa | Risco | Mitigação |
|---|---|---|---|
| `ACCESS_FINE_LOCATION` | GPS preciso para geofencing | Baixo | Standard |
| `ACCESS_COARSE_LOCATION` | Fallback de localização | Baixo | Standard |
| `ACCESS_BACKGROUND_LOCATION` | Geofencing com app fechado | **BLOQUEADOR** | Prominent disclosure + formulário Play Console |
| `FOREGROUND_SERVICE` | Notificação persistente durante tracking | Baixo | Standard para apps de tracking |
| `FOREGROUND_SERVICE_LOCATION` | Android 12+ requer tipo específico | Baixo | Standard |
| `RECORD_AUDIO` | Comandos de voz | **ALTO** | Disclosure na Privacy Policy + Data Safety |
| `POST_NOTIFICATIONS` | Alertas de entrada/saída | Baixo | Standard |
| `RECEIVE_BOOT_COMPLETED` | Reativar geofences após restart | Baixo | Standard |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Evitar kill do serviço | **ALTO** | Justificativa no Play Console |
| `WAKE_LOCK` | CPU ativa durante tasks | Baixo | Standard |
| `VIBRATE` | Feedback háptico | Baixo | Standard |
| `INTERNET` / `ACCESS_NETWORK_STATE` | API calls | Baixo | Standard |

---

# 5) PRIVACIDADE & DATA SAFETY

## O que o app coleta (verdade técnica do código):

| Dado | Onde armazena | Envia para | Retenção | Deletável pelo usuário? |
|---|---|---|---|---|
| **GPS coords (lat/lon)** | SQLite `location_audit` | Supabase | Indefinido | Sim (deletar conta) |
| **Horários de entrada/saída** | SQLite `daily_hours` | Supabase | Indefinido | Sim |
| **Geofences (nome, coords, raio)** | SQLite `locations` | Supabase | Até deletar | Sim |
| **Áudio de voz** | Temp file (deletado imediatamente) | Supabase Edge → OpenAI Whisper | **0 segundos** (não armazenado) | N/A |
| **Transcrição de voz** | Memória (não persistido) | Supabase Edge → OpenAI GPT-4o | Apenas durante processamento | N/A |
| **Email (auth)** | Supabase Auth | Supabase | Até deletar conta | Sim |
| **Crash reports** | — | Sentry | Conforme Sentry retention | Não diretamente |
| **Device info (crash context)** | — | Sentry | Idem | Não diretamente |

## O que deve estar na Privacy Policy (texto modelo na Seção 8)

## O que NÃO coletar (para reduzir risco):
- IDFA / Advertising ID → não coletar (não tem SDK de ads)
- Contatos → não acessar
- Histórico de navegação → não existe
- Dados de saúde → não coletar
- Dados financeiros → não coletar

---

# 6) "REVIEWER MODE" — PASSAR NA REVISÃO

## 6.1 — Conta de Teste

**Apple App Store Connect → App Review Information:**
```
Username: test@onsiteclub.ca
Password: Teste123!
```

**Google Play Console → App Content → App Access:**
- Marcar "All or some functionality is restricted"
- Fornecer mesmas credenciais

## 6.2 — Guia Passo a Passo para o Reviewer

Incluir nas **Review Notes** (Apple) e na **Description** do teste (Google):

```
HOW TO TEST OnSite Timekeeper:

1. LOGIN
   - Open the app → Login screen appears
   - Use: test@onsiteclub.ca / Teste123!
   - You'll be taken to the Home screen

2. MANUAL TIME ENTRY (Free feature)
   - On Home tab, tap "Entry" time field → set time
   - Tap "Exit" time field → set time
   - Select a location from the horizontal cards
   - Tap "Save" → Entry appears in the calendar
   - Go to Reports tab to see the calendar with your entry

3. GEOFENCING (Background location feature)
   - Go to Map tab (📍)
   - Tap "+" to create a new geofence
   - Name it "Test Site", set radius to 200m
   - Place it on your current location
   - Walk 200+ meters away → app detects exit and logs time
   - Walk back → app detects entry

4. VOICE COMMANDS (Microphone feature)
   - Tap the green floating microphone button (bottom-right)
   - A chat sheet slides up
   - Say "Log 8 hours today" or "Start timer"
   - The app transcribes your voice and executes the command
   - You can also type commands in the text field

5. REPORTS
   - Go to Reports tab
   - Tap any day with entries to see details
   - Use export to generate PDF timesheet
```

## 6.3 — Edge Cases que Quebram a Revisão

| Edge case | Como prevenir |
|---|---|
| **Conta de teste expirada ou sem dados** | Verificar que `test@onsiteclub.ca` funciona 1 dia antes de submeter |
| **Login falha sem internet** | Garantir que o reviewer tem mensagem clara de erro offline |
| **Permissão de localização negada** | App deve funcionar (modo manual) sem crash se permissão negada |
| **Permissão de microfone negada** | VoiceCommandSheet deve mostrar banner "Open Settings" sem crash |
| **Geofence não dispara no simulador** | Adicionar nas Review Notes: "Geofencing requires physical device with GPS" |
| **Tela em branco no primeiro uso** | Garantir que Home mostra formulário vazio, não tela em branco |
| **Crash no boot** | Testar clean install no device antes de submeter |

---

# 7) CHECKLIST FINAL ANTES DE ENVIAR

## Prioridade BLOQUEADORA (sem isso = rejeição garantida)

- [ ] **Publicar Privacy Policy real** na URL `timekeeperweb.onsiteclub.ca/privacy` (ver texto modelo Seção 8)
- [ ] **Publicar Terms of Service real** na URL `timekeeperweb.onsiteclub.ca/terms`
- [ ] **Criar tela de "Prominent Disclosure"** para background location (obrigatória para Google, recomendada para Apple)
- [ ] **Escrever App Review Notes** para Apple (ver texto na seção 2.2)
- [ ] **Gravar vídeo de demonstração** do fluxo de permissão para Google Play

## Prioridade ALTA (pode causar rejeição)

- [ ] **Reescrever `NSMicrophoneUsageDescription`** para mencionar envio a servidor (ver seção 2.3)
- [ ] **Preencher Data Safety Form** no Google Play Console (ver tabela seção 3.3)
- [ ] **Justificar `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`** no Play Console (ver seção 3.4)
- [ ] **Remover ou justificar `NSPhotoLibraryUsageDescription`** — se não usa foto, remover
- [ ] **Verificar `expo-camera`** — remover do `package.json` se não usa câmera
- [ ] **Alinhar versões** iOS/Android (ambos 1.6.2 ou decidir qual)

## Prioridade MÉDIA (pode causar rejeição em revisões mais rigorosas)

- [ ] **Verificar AndroidManifest gerado** após `expo prebuild` para permissões extras indesejadas
- [ ] **Verificar conta de teste** funciona com dados (test@onsiteclub.ca)
- [ ] **Testar fluxo com permissões negadas** (localização, microfone)
- [ ] **Testar clean install** em device físico (iOS + Android)
- [ ] **Preparar screenshots** para ambas as stores (6.7" e 5.5" para iOS, phone para Google)

## Prioridade BAIXA (boas práticas)

- [ ] **Incluir Sentry** na Privacy Policy
- [ ] **Incluir Google Maps** na Privacy Policy
- [ ] **Criar página de suporte/contato** (Apple requer URL de suporte)
- [ ] **Verificar classificação etária** — declarar 17+ se permitir acesso irrestrito a localização
- [ ] **Configurar App Privacy** no App Store Connect (declaração de dados coletados)

---

# 8) TEXTOS PRONTOS PARA COLAR

## 8.1 — App Store Metadata (Apple)

### Nome do App
```
OnSite Timekeeper
```

### Subtítulo (máx 30 caracteres)
```
Work Hours & Job Site Tracker
```

### Categoria
```
Primary: Business
Secondary: Productivity
```

### Descrição (App Store — máx 4000 caracteres)
```
OnSite Timekeeper is the easiest way to track your work hours on construction sites and job locations.

SIMPLE TIME TRACKING
• Log your daily hours with just a few taps
• Set entry and exit times manually
• Track break time separately
• View your work history on a clean calendar
• Export professional PDF timesheets

AUTOMATIC GEOFENCING
• Create geofence zones around your job sites
• The app automatically detects when you arrive and leave
• No more forgetting to clock in or out
• Works in the background — even when your phone is locked
• Battery-efficient region monitoring (not constant GPS tracking)

VOICE COMMANDS
• Tap the microphone button to speak commands
• "Log 8 hours today" — done in seconds
• "Start timer" / "Stop timer" — hands-free control
• Works in English and Portuguese
• AI-powered natural language understanding

REPORTS & EXPORT
• Monthly calendar view with daily summaries
• Detailed breakdown per day (entry, exit, breaks, total)
• Export to PDF for payroll or invoicing
• Share reports via email or messaging apps

MULTIPLE JOB SITES
• Track hours across different locations
• Color-coded sites for easy identification
• Map view to manage all your geofences

PRIVACY FIRST
• Your data stays on your device (offline-first)
• Syncs securely when online
• GPS data used only for geofencing — never sold or shared
• Delete your data anytime

Built for construction workers, contractors, freelancers, and anyone who needs reliable proof of their work hours.
```

### Keywords (máx 100 caracteres)
```
timesheet,time tracker,geofence,work hours,clock in,construction,job site,ponto,horas
```

### URL de Suporte
```
https://timekeeperweb.onsiteclub.ca
```

### URL de Privacy Policy
```
https://timekeeperweb.onsiteclub.ca/privacy
```

### What's New (para v1.6.2)
```
• Simplified logs screen for easier navigation
• Performance improvements and bug fixes
```

---

## 8.2 — Google Play Store Listing

### Título (máx 30 caracteres)
```
OnSite Timekeeper
```

### Descrição Curta (máx 80 caracteres)
```
Track work hours automatically with geofencing. Voice commands & PDF reports.
```

### Descrição Longa (máx 4000 caracteres)
```
OnSite Timekeeper is the simplest way to track your work hours on construction sites and job locations.

★ MANUAL TIME ENTRY
Log your daily entry and exit times with just a few taps. Track breaks, select your job site, and save. It's as simple as writing on a notepad — but smarter.

★ AUTOMATIC GEOFENCING
Create a virtual boundary around your work site. When you arrive, the app automatically starts tracking. When you leave, it logs your exit time. No more forgetting to clock in.

★ VOICE COMMANDS
Tap the microphone and say what you need: "Log 8 hours today", "Start timer", "Send my weekly report". The AI assistant understands natural language in English and Portuguese.

★ CALENDAR & REPORTS
See all your work days on a clean monthly calendar. Tap any day to see the full breakdown. Export professional PDF timesheets for payroll or invoicing.

★ MULTIPLE JOB SITES
Managing different locations? Create color-coded geofences for each site. The app knows which site you're at and logs accordingly.

★ OFFLINE FIRST
Your data is stored locally on your device. It syncs securely to the cloud when you're online. You're never blocked by poor connectivity on a job site.

★ PRIVACY FOCUSED
GPS data is used exclusively for geofencing and is never sold or shared with advertisers. You can delete all your data at any time.

Perfect for: construction workers, contractors, freelancers, field technicians, maintenance crews, and anyone who needs proof of their work hours.

Questions? Contact us at support@onsiteclub.ca
```

### Categoria
```
Business
```

---

## 8.3 — Privacy Policy (TEXTO COMPLETO para publicar)

```
PRIVACY POLICY — OnSite Timekeeper
Last updated: February 17, 2026
Effective date: February 17, 2026

OnSite Club ("we", "our", "us") operates the OnSite Timekeeper mobile application
(the "App"). This Privacy Policy describes how we collect, use, store, and protect
your information.

By using the App, you agree to the collection and use of information as described
in this policy.

1. INFORMATION WE COLLECT

1.1 Account Information
When you create an account, we collect your email address and password (encrypted).
This is required for authentication and data synchronization.

1.2 Location Data
The App collects precise GPS coordinates for the following purposes:
• Geofencing: Detecting when you arrive at or leave a registered work site
• Map display: Showing your position on the in-app map
• Audit trail: Recording entry/exit coordinates as proof of attendance

Location data is collected in the background when you have active geofences
configured. You can disable background location at any time in your device settings.

1.3 Audio Data
When you use the voice command feature, the App temporarily records audio through
your device microphone. This audio is:
• Sent to our secure backend server for processing
• Forwarded to OpenAI's Whisper API for speech-to-text transcription
• Deleted immediately after transcription — audio is NEVER stored permanently
• The resulting text transcript is processed by OpenAI's GPT-4o model to interpret
  your command, then discarded

You must explicitly tap the microphone button to start recording. Recording never
happens automatically or without your action.

1.4 Work Hours Data
The App stores your daily work hours, including:
• Entry and exit times
• Break duration
• Associated job site name and location
• Source (manual entry, geofence, or voice command)

1.5 Crash Reports and Diagnostics
We use Sentry (https://sentry.io) for crash reporting. When the App encounters an
error, the following may be sent to Sentry:
• Error messages and stack traces
• Device type, operating system version, and app version
• Anonymized usage context (no email addresses or precise coordinates)

This data helps us identify and fix bugs. You cannot opt out of crash reporting at
this time, but no personally identifiable information is included.

1.6 Device Information
We may collect basic device information (device model, OS version, app version) for
compatibility and debugging purposes.

2. HOW WE USE YOUR INFORMATION

We use collected information exclusively for:
• Providing the time-tracking and geofencing service
• Processing voice commands
• Generating timesheets and reports
• Synchronizing your data across devices
• Diagnosing and fixing technical issues
• Improving the App's functionality

We do NOT use your information for:
• Advertising or marketing to third parties
• Selling or renting to data brokers
• Profiling or behavioral tracking
• Any purpose unrelated to the App's core functionality

3. THIRD-PARTY SERVICES

We use the following third-party services:

3.1 Supabase (https://supabase.com)
• Purpose: Authentication, database, and cloud synchronization
• Data shared: Account info, work hours, location data, audit trail
• Supabase acts as our data processor, not a third-party recipient
• Data is encrypted in transit (TLS) and at rest

3.2 OpenAI (https://openai.com)
• Purpose: Voice command transcription (Whisper) and interpretation (GPT-4o)
• Data shared: Audio recordings (temporary), text transcripts (temporary)
• Audio and transcripts are not stored by OpenAI after processing
• OpenAI's data usage policy: https://openai.com/policies/api-data-usage-policies

3.3 Sentry (https://sentry.io)
• Purpose: Crash reporting and error tracking
• Data shared: Anonymized error reports, device metadata
• No PII (email, precise coordinates) is sent to Sentry

3.4 Google Maps (https://cloud.google.com/maps-platform)
• Purpose: Map display and geocoding
• Data shared: Map tile requests, geocoding queries
• Subject to Google's Privacy Policy

4. DATA STORAGE AND SECURITY

4.1 Local Storage
Your data is stored primarily on your device using encrypted SQLite databases.
The App works offline and only syncs when an internet connection is available.

4.2 Cloud Storage
When online, data is synchronized to our Supabase backend, which uses:
• Row-Level Security (RLS) to ensure users can only access their own data
• TLS encryption for all data in transit
• AES encryption for data at rest
• Hosted on secure cloud infrastructure

4.3 Data Retention
• Work hours data: Retained until you delete it or delete your account
• Location audit data: Retained until you delete your account
• Audio recordings: Deleted immediately after transcription (not retained)
• Crash reports: Retained per Sentry's default retention policy (90 days)

5. YOUR RIGHTS

You have the right to:
• Access: View all your data within the App
• Correction: Edit your work hours and location data
• Deletion: Delete individual records or your entire account
• Portability: Export your data as PDF reports
• Withdraw consent: Disable location or microphone permissions at any time

To exercise these rights, contact us at privacy@onsiteclub.ca or use the in-app
data management features.

For users in the European Economic Area (EEA), you also have rights under the
General Data Protection Regulation (GDPR), including the right to lodge a complaint
with your local data protection authority.

For users in California, you have rights under the California Consumer Privacy Act
(CCPA), including the right to know what data we collect and to request deletion.

6. CHILDREN'S PRIVACY

The App is not intended for children under 16. We do not knowingly collect
information from children under 16. If you believe a child has provided us with
personal information, please contact us at privacy@onsiteclub.ca.

7. CHANGES TO THIS POLICY

We may update this Privacy Policy from time to time. We will notify you of changes
by updating the "Last updated" date at the top of this policy. Continued use of
the App after changes constitutes acceptance of the updated policy.

8. CONTACT US

If you have questions about this Privacy Policy, contact us:
• Email: privacy@onsiteclub.ca
• Website: https://timekeeperweb.onsiteclub.ca
• Developer: OnSite Club
```

---

## 8.4 — Terms of Service (TEXTO COMPLETO para publicar)

```
TERMS OF SERVICE — OnSite Timekeeper
Last updated: February 17, 2026
Effective date: February 17, 2026

Please read these Terms of Service ("Terms") carefully before using the OnSite
Timekeeper mobile application ("App") operated by OnSite Club ("we", "our", "us").

1. ACCEPTANCE OF TERMS

By downloading, installing, or using the App, you agree to be bound by these Terms.
If you do not agree, do not use the App.

2. DESCRIPTION OF SERVICE

OnSite Timekeeper is a time-tracking application that allows users to:
• Manually log daily work hours
• Automatically detect work site arrival/departure using geofencing
• Use voice commands to manage work records
• Generate and export timesheet reports

3. ACCOUNT REGISTRATION

3.1 You must create an account to use the App.
3.2 You are responsible for maintaining the confidentiality of your credentials.
3.3 You must provide accurate information during registration.
3.4 You must be at least 16 years old to use the App.

4. ACCEPTABLE USE

You agree NOT to:
• Use the App for any unlawful purpose
• Attempt to gain unauthorized access to our systems
• Reverse engineer, decompile, or disassemble the App
• Use the App to track another person's location without their consent
• Share your account credentials with unauthorized parties
• Submit false or misleading work hour records for fraudulent purposes

5. LOCATION SERVICES

5.1 The App uses device location services for geofencing functionality.
5.2 You consent to the collection of location data as described in our Privacy Policy.
5.3 You may disable location services at any time through your device settings.
5.4 Disabling location will prevent geofencing features from working but will not
    affect manual time entry.

6. VOICE COMMANDS

6.1 The App offers optional voice command functionality.
6.2 Audio is processed by third-party services (OpenAI) for transcription and
    interpretation.
6.3 Audio recordings are not stored permanently.
6.4 You are responsible for the content of your voice commands.

7. DATA AND CONTENT

7.1 You retain ownership of all work hour data you enter.
7.2 You grant us a limited license to process your data for the purpose of
    providing the service.
7.3 We do not claim ownership of your data.
7.4 You may export or delete your data at any time.

8. PRIVACY

Your use of the App is also governed by our Privacy Policy, available at:
https://timekeeperweb.onsiteclub.ca/privacy

9. DISCLAIMER OF WARRANTIES

THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.

We do not guarantee that:
• The App will be uninterrupted or error-free
• Geofencing will detect all entries/exits with 100% accuracy
• Time records are suitable as legal proof of attendance without additional
  verification
• Voice command transcription will be 100% accurate

10. LIMITATION OF LIABILITY

TO THE MAXIMUM EXTENT PERMITTED BY LAW, ONSITE CLUB SHALL NOT BE LIABLE FOR:
• Any indirect, incidental, special, or consequential damages
• Lost wages, profits, or data arising from use of the App
• Inaccuracies in time tracking, geofencing, or voice transcription
• Decisions made by employers or clients based on App-generated reports

Our total liability shall not exceed the amount you paid us in the 12 months
preceding the claim (if any).

11. INDEMNIFICATION

You agree to indemnify and hold harmless OnSite Club from any claims, damages,
or expenses arising from your use of the App or violation of these Terms.

12. TERMINATION

12.1 You may stop using the App and delete your account at any time.
12.2 We may suspend or terminate your access if you violate these Terms.
12.3 Upon termination, your data will be retained for 30 days, then permanently
     deleted, unless you request immediate deletion.

13. CHANGES TO TERMS

We may modify these Terms at any time. We will notify you of material changes
through the App or by email. Continued use after changes constitutes acceptance.

14. GOVERNING LAW

These Terms are governed by the laws of the Province of Ontario, Canada, without
regard to conflict of law principles. Any disputes shall be resolved in the courts
of Ontario, Canada.

15. CONTACT

Questions about these Terms? Contact us:
• Email: support@onsiteclub.ca
• Website: https://timekeeperweb.onsiteclub.ca
```

---

## 8.5 — Textos de Permissão Corrigidos para app.json

### NSMicrophoneUsageDescription (CORRIGIR)
```
OnSite Timekeeper uses the microphone to record voice commands. Your audio is sent to a secure server for speech-to-text transcription and is not stored after processing.
```

### NSLocationAlwaysAndWhenInUseUsageDescription (OK, mas pode melhorar)
```
OnSite Timekeeper uses background location to automatically detect when you arrive at or leave your work site, even when the app is closed. Location is only used for geofencing and is never shared with advertisers.
```

### backgroundPermissionRationale (Android — CORRIGIR)
```json
{
  "title": "Allow OnSite Timekeeper to access your location in the background?",
  "message": "OnSite Timekeeper uses background location to automatically detect when you arrive at or leave your work site, even when the app is closed. This is required for automatic time tracking. Your location is never shared with third parties.",
  "positiveAction": "Allow",
  "negativeAction": "Deny"
}
```

---

## 8.6 — Apple App Privacy (App Store Connect)

No App Store Connect → App Privacy, declarar:

### Data Linked to You:
| Data Type | Usage |
|---|---|
| Email Address | App Functionality |
| Precise Location | App Functionality |
| Coarse Location | App Functionality |

### Data Not Linked to You:
| Data Type | Usage |
|---|---|
| Crash Data | App Functionality |
| Performance Data | App Functionality |

### Data Used to Track You:
**None** (marcar "No")

---

# 9) RESUMO DE AÇÕES IMEDIATAS (ORDEM DE EXECUÇÃO)

| # | Ação | Tempo estimado | Bloqueador? |
|---|---|---|---|
| 1 | Publicar Privacy Policy real (copiar texto 8.3) | 15 min | SIM |
| 2 | Publicar Terms of Service real (copiar texto 8.4) | 15 min | SIM |
| 3 | Criar tela de Prominent Disclosure para BG location | 2-4h | SIM (Google) |
| 4 | Atualizar `NSMicrophoneUsageDescription` no app.json | 2 min | Não, mas ALTO |
| 5 | Remover `expo-camera` se não usa / ou adicionar Camera permission | 5 min | Não, mas MÉDIO |
| 6 | Remover `NSPhotoLibraryUsageDescription` se não usa foto | 2 min | Não, mas MÉDIO |
| 7 | Preencher App Review Notes no App Store Connect | 10 min | SIM (Apple) |
| 8 | Preencher Data Safety Form no Play Console | 30 min | SIM (Google) |
| 9 | Gravar vídeo de demo para Google Play | 20 min | SIM (Google) |
| 10 | Preencher App Privacy no App Store Connect | 15 min | SIM (Apple) |
| 11 | Alinhar versões iOS/Android | 5 min | Não |
| 12 | Testar clean install + conta de teste | 30 min | Não, mas crítico |

---

*FIM DO RELATÓRIO*
