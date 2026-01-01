# OnSite Timekeeper

📍 App mobile de registro de ponto baseado em geofencing. O trabalhador cadastra locais de trabalho, e o app automaticamente detecta entrada/saída via GPS, registrando horas trabalhadas de forma offline-first.

## Features

- ✅ **Geofencing automático** - detecta entrada/saída do trabalho
- ✅ **Offline-first** - funciona sem internet, sincroniza depois
- ✅ **Popup estilo "soneca"** - 30s para decidir antes da ação automática
- ✅ **3 modos de adicionar local** - GPS atual, busca de endereço, toque no mapa
- ✅ **Histórico e relatórios** - exporta em TXT
- ✅ **DevMonitor** - console de debug para desenvolvimento

## Stack

- **Mobile:** React Native + Expo (SDK 52)
- **Navegação:** Expo Router (file-based)
- **Estado:** Zustand
- **Database Local:** SQLite (expo-sqlite)
- **Database Cloud:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **Maps:** react-native-maps (Google Maps)
- **Geofencing:** expo-location + expo-task-manager

## Setup

### 1. Clone e instale

```bash
git clone https://github.com/seu-usuario/onsite-timekeeper.git
cd onsite-timekeeper
npm install
```

### 2. Configure o Supabase

1. Crie um projeto no [Supabase](https://supabase.com)
2. Vá em **SQL Editor** e execute o arquivo `supabase/migrations/001_create_tables.sql`
3. Vá em **Authentication > Providers** e habilite **Email**
4. Copie as credenciais em **Settings > API**

### 3. Configure variáveis de ambiente

Crie um arquivo `.env` na raiz:

```env
EXPO_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

### 4. Execute o app

```bash
# Desenvolvimento
npx expo start

# Android
npx expo run:android

# iOS
npx expo run:ios
```

## Estrutura do Projeto

```
onsite-timekeeper/
├── app/                          # Expo Router (telas)
│   ├── (auth)/                   # Telas de autenticação
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/                   # Tabs principais
│   │   ├── _layout.tsx
│   │   ├── index.tsx             # Home/Dashboard
│   │   ├── map.tsx               # Mapa + gerenciar locais
│   │   ├── history.tsx           # Histórico de sessões
│   │   └── settings.tsx          # Configurações
│   ├── _layout.tsx               # Root layout
│   └── index.tsx
├── src/
│   ├── components/
│   │   ├── DevMonitor.tsx        # Console de debug
│   │   ├── GeofenceAlert.tsx     # Popup fullscreen
│   │   └── ui/
│   │       └── Button.tsx
│   ├── constants/
│   │   └── colors.ts
│   ├── lib/
│   │   ├── backgroundTasks.ts    # TaskManager
│   │   ├── database.ts           # SQLite CRUD
│   │   ├── geocoding.ts          # Nominatim API
│   │   ├── location.ts           # GPS + Geofencing
│   │   ├── logger.ts             # Sistema de logs
│   │   ├── notifications.ts      # Expo Notifications
│   │   ├── reports.ts            # Geração de relatórios
│   │   ├── supabase.ts           # Supabase client
│   │   └── sync.ts               # Sync engine
│   └── stores/
│       ├── authStore.ts
│       ├── locationStore.ts
│       ├── registroStore.ts
│       ├── settingsStore.ts
│       ├── syncStore.ts
│       └── workSessionStore.ts
├── supabase/
│   └── migrations/
│       └── 001_create_tables.sql
├── app.json
├── package.json
└── tsconfig.json
```

## Fluxo de Geofencing

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   ENTRADA   │────▶│  Popup 30s       │────▶│  Auto-start     │
│  (geofence) │     │  ▶️ Trabalhar     │     │  (se timeout)   │
│             │     │  😴 Ignorar hoje │     │                 │
│             │     │  ⏰ Em 10 min    │     │                 │
└─────────────┘     └──────────────────┘     └─────────────────┘

┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   SAÍDA     │────▶│  Popup 30s       │────▶│  Auto-stop      │
│  (geofence) │     │  ⏹️ Encerrar     │     │  (se timeout)   │
│             │     │  ▶️ Continuar    │     │                 │
│             │     │  ✏️ Ajustar      │     │                 │
└─────────────┘     └──────────────────┘     └─────────────────┘
```

## Sync Architecture

```
┌──────────────┐          ┌──────────────┐
│   SQLite     │◀────────▶│   Supabase   │
│   (local)    │   Sync   │   (cloud)    │
│              │  5 min   │              │
│  - locais    │          │  - locais    │
│  - registros │          │  - registros │
│  - sync_log  │          │  - sync_log  │
└──────────────┘          └──────────────┘
       │
       │ Source of Truth
       │
       ▼
┌──────────────┐
│   Zustand    │
│   (state)    │
└──────────────┘
       │
       ▼
┌──────────────┐
│     UI       │
└──────────────┘
```

## Database Schema

### locais
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | Primary key |
| user_id | UUID | FK → auth.users |
| nome | TEXT | Nome do local |
| latitude | DOUBLE | Latitude |
| longitude | DOUBLE | Longitude |
| raio | INTEGER | Raio em metros (default: 100) |
| cor | TEXT | Cor hex (default: #3B82F6) |
| status | TEXT | 'active' \| 'deleted' \| 'pending_delete' \| 'syncing' |
| deleted_at | TIMESTAMPTZ | Quando foi deletado (soft delete) |
| created_at | TIMESTAMPTZ | Criação |
| updated_at | TIMESTAMPTZ | Última atualização |
| synced_at | TIMESTAMPTZ | Último sync com servidor |

### registros
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | Primary key |
| user_id | UUID | FK → auth.users |
| local_id | UUID | FK → locais |
| local_nome | TEXT | Nome do local (cache) |
| entrada | TIMESTAMPTZ | Horário de entrada |
| saida | TIMESTAMPTZ | Horário de saída (null = ativa) |
| tipo | TEXT | 'automatico' \| 'manual' |
| editado_manualmente | BOOLEAN | Se foi ajustado |
| motivo_edicao | TEXT | Motivo do ajuste |

### sync_log
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | Primary key |
| user_id | UUID | FK → auth.users |
| entity_type | TEXT | 'local' \| 'registro' |
| entity_id | UUID | ID da entidade |
| action | TEXT | 'create' \| 'update' \| 'delete' \| 'sync_up' \| 'sync_down' |
| old_value | JSONB | Estado anterior |
| new_value | JSONB | Estado novo |
| sync_status | TEXT | 'pending' \| 'synced' \| 'conflict' \| 'failed' |

## DevMonitor

Botão flutuante (🔍) disponível em desenvolvimento:

- **Logs**: Tempo real com filtros por nível
- **Stats**: Contagem de tabelas, status de sync
- **Actions**: Force sync, purge deletados, reset database

## Permissões Necessárias

### Android
- ACCESS_FINE_LOCATION
- ACCESS_COARSE_LOCATION
- ACCESS_BACKGROUND_LOCATION
- FOREGROUND_SERVICE
- FOREGROUND_SERVICE_LOCATION

### iOS
- NSLocationWhenInUseUsageDescription
- NSLocationAlwaysAndWhenInUseUsageDescription
- UIBackgroundModes: location

## Build

```bash
# EAS Build (produção)
npx eas build --platform android
npx eas build --platform ios

# Build local
npx expo run:android --variant release
npx expo run:ios --configuration Release
```

## Troubleshooting

### Geofencing não detecta entrada/saída
1. Verifique permissão "Sempre" em localização
2. Desabilite otimização de bateria para o app
3. Verifique se o raio é grande o suficiente (min 50m)

### Sync não funciona
1. Verifique conexão com internet
2. Verifique variáveis de ambiente do Supabase
3. Use o DevMonitor para ver logs de erro

### Phantom Geofence (local fantasma)
1. Use DevMonitor > Actions > Purge Deletados
2. Force Full Sync
3. Se persistir, Reset Database

## License

MIT © OnSite Club
