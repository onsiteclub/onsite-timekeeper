# 🔄 CI/CD Pipeline - OnSite Timekeeper

Documentação do pipeline automatizado de build e validação.

---

## Visão Geral

Pipeline no GitHub Actions que valida o código e gera o APK de teste automaticamente.

```
Push/Manual Trigger
        ↓
   ┌─────────────┐
   │   CHECKS    │  ← Rápido (~1-2 min)
   │  typecheck  │
   │   doctor    │
   └──────┬──────┘
          │ ✅ Passou?
          ↓
   ┌─────────────┐
   │    BUILD    │  ← Pesado (~10-15 min)
   │  EAS Local  │
   │  Upload APK │
   └─────────────┘
```

---

## Jobs

### 1. Checks (Validação Rápida)

| Etapa | Comando | O que faz |
|-------|---------|-----------|
| Typecheck | `npx tsc --noEmit` | Verifica erros TypeScript, imports quebrados, tipos incorretos |
| Doctor | `npx expo-doctor` | Verifica configuração do Expo |

**Se falhar:** Build não roda → economia de tempo e recursos.

### 2. Build (Geração do APK)

| Etapa | O que faz |
|-------|-----------|
| Setup Java 17 | Necessário pro Android |
| Setup Android SDK | Ferramentas de compilação |
| EAS Build Local | Gera o APK |
| Upload Artifact | Disponibiliza APK pra download |

---

## Como Usar

### Trigger Manual (GitHub)

1. Vá em **Actions** no repositório
2. Selecione **"Build Android APK"**
3. Clique **"Run workflow"**
4. Aguarde (~12-15 min total)
5. Baixe o APK em **Artifacts**

### Validação Local (antes de push)

```bash
# Verifica erros TypeScript
npx tsc --noEmit

# Verifica configuração Expo
npx expo-doctor
```

### Pular o Workflow (Skip CI)

Para commits que não precisam de build (docs, configs, WIP):

```bash
git commit -m "docs: update readme [skip ci]"
git commit -m "feat(reports): add export modal [skip ci]"
```

**Quando usar `[skip ci]`:**
- Atualizações de documentação
- Commits intermediários durante desenvolvimento
- Mudanças em arquivos não-código (.md, .json configs)
- Quando você sabe que o código compila (rodou `tsc` local)

**Quando NÃO usar:**
- Antes de merge para main
- Após resolver bugs críticos
- Quando quer garantir que o APK funciona

---

## Arquivos do Pipeline

| Arquivo | Descrição |
|---------|-----------|
| `.github/workflows/build.yml` | Configuração do workflow |
| `package.json` | Scripts `typecheck` e `doctor` |
| `tsconfig.json` | Configuração TypeScript |
| `eas.json` | Perfis de build (preview, production) |

---

## Workflow Completo

```yaml
name: Build Android APK

on:
  workflow_dispatch:

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npx tsc --noEmit

      - name: Expo Doctor
        run: npx expo-doctor
        continue-on-error: true

  build:
    needs: checks
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Setup EAS
        uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Install dependencies
        run: npm ci

      - name: Build APK
        run: eas build --platform android --local --profile preview --non-interactive

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: onsite-timekeeper-apk
          path: '*.apk'
```

---

## Checklist Antes de Push

### Validação Obrigatória
- [ ] `npx tsc --noEmit` passa sem erros
- [ ] App roda no Expo Go / dev build

### Boas Práticas
- [ ] Commit message descritivo (feat/fix/docs/refactor)
- [ ] Usar `[skip ci]` se apropriado
- [ ] Verificar imports após mover/renomear arquivos

### Erros Comuns que Quebram o Build
- [ ] Logger com categoria inválida (usar: `boot`, `database`, `session`, `geofence`, `notification`, `sync`, `record`)
- [ ] Router.push com path inválido (verificar rotas em `app/`)
- [ ] Imports de arquivos deletados/movidos

---

## Troubleshooting

| Erro | Causa | Solução |
|------|-------|---------|
| `Argument of type 'X' is not assignable` | Tipo errado | Verificar interface/type esperado |
| `Cannot find module 'X'` | Import quebrado | Verificar caminho do import |
| `'X' is not assignable to parameter of type 'LogCategory'` | Categoria logger inválida | Usar categoria válida do logger.ts |
| Typecheck falha | Erros de TypeScript | Rode `npx tsc --noEmit` local e corrija |
| Build falha no Gradle | Versão Java errada | Pipeline usa Java 17 |
| APK não aparece | Build incompleto | Verifique logs do Actions |

### Categorias Válidas do Logger

```typescript
type LogCategory = 
  | 'boot' 
  | 'database' 
  | 'session' 
  | 'geofence' 
  | 'notification' 
  | 'sync' 
  | 'record';
```

### Rotas Válidas do Router

```typescript
// Verificar em app/ a estrutura real
router.push('/');              // Home
router.replace('/(auth)/login'); // Login
router.replace('/(tabs)');     // Tabs (após auth)
```

---

## Secrets Necessários

| Secret | Descrição | Onde obter |
|--------|-----------|------------|
| `EXPO_TOKEN` | Token de acesso EAS | [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens) |

---

## Métricas

| Métrica | Valor Típico |
|---------|--------------|
| Checks | ~1-2 min |
| Build completo | ~10-15 min |
| Tamanho APK | ~50-80 MB |

---

## Fluxo de Desenvolvimento Recomendado

```
1. Desenvolver feature
        ↓
2. npx tsc --noEmit (local)
        ↓
   ┌─── Passou? ───┐
   │               │
   ▼ Sim           ▼ Não
   │               │
   │          Corrigir erros
   │               │
   ▼               │
3. git add -A     ◄┘
   git commit -m "feat: X [skip ci]"
   git push
        ↓
4. Continuar desenvolvimento...
        ↓
5. Quando pronto para testar APK:
   git commit -m "feat: complete feature X"
   git push
        ↓
6. Actions > Run workflow > Build APK
        ↓
7. Download APK e testar no device
```

---

*Última atualização: Janeiro 2026*
