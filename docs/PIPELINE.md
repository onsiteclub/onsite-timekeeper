# 🔄 CI/CD Pipeline - OnSite Timekeeper

Documentação do pipeline automatizado de build e validação.

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
| Typecheck | `npm run typecheck` | Verifica erros TypeScript, imports quebrados, tipos incorretos |
| Doctor | `npm run doctor` | Verifica configuração do Expo |

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
npm run typecheck

# Verifica configuração Expo
npm run doctor
```

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
        run: npm run typecheck

      - name: Expo Doctor
        run: npm run doctor
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

- [ ] `npm run typecheck` passa sem erros
- [ ] Testou no Expo Go / dev build
- [ ] Commit message descritivo

---

## Troubleshooting

| Erro | Causa | Solução |
|------|-------|---------|
| Typecheck falha | Erros de TypeScript | Rode `npm run typecheck` local e corrija |
| Build falha no Gradle | Versão Java errada | Pipeline usa Java 17 |
| APK não aparece | Build incompleto | Verifique logs do Actions |
| "Module not found" | Import quebrado | Verifique caminhos dos imports |
| "Cannot find name X" | Faltou importar | Adicione import no arquivo |

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

*Última atualização: Janeiro 2026*
