# DIRETIVA PARA O AGENTE DE WEBSITE
## Publicar Privacy Policy, Terms of Service e corrigir URLs

**Data:** 17 de fevereiro de 2026
**Prioridade:** BLOQUEADOR — sem isso, Apple e Google rejeitam o app
**Contexto:** O app OnSite Timekeeper está pronto para submissão nas stores, mas TODAS as URLs de documentos legais estão quebradas (retornam 404 ou página vazia).

---

## 1. PROBLEMA ATUAL

Existem **2 domínios** sendo referenciados no codebase, e NENHUM funciona:

| Domínio | Status atual | Onde é referenciado |
|---|---|---|
| `onsiteclub.ca/legal/timekeeper/` | **404 Not Found** | Código do app (links clicáveis) |
| `timekeeperweb.onsiteclub.ca/` | **Página vazia** (só CSS) | Store metadata, disclosure modal |

---

## 2. DECISÃO DE URL CANÔNICA

Usar **`onsiteclub.ca`** como domínio canônico (é o domínio principal da empresa).

### URLs finais que DEVEM funcionar:

| Documento | URL canônica |
|---|---|
| Privacy Policy | `https://onsiteclub.ca/legal/timekeeper/privacy.html` |
| Terms of Service | `https://onsiteclub.ca/legal/timekeeper/terms.html` |
| Página de suporte | `https://onsiteclub.ca/support/timekeeper` |

### Redirect obrigatório (para não quebrar referências existentes):

| URL antiga | Redirecionar para |
|---|---|
| `https://timekeeperweb.onsiteclub.ca/privacy` | `https://onsiteclub.ca/legal/timekeeper/privacy.html` |
| `https://timekeeperweb.onsiteclub.ca/terms` | `https://onsiteclub.ca/legal/timekeeper/terms.html` |
| `https://timekeeperweb.onsiteclub.ca` | `https://onsiteclub.ca/support/timekeeper` |

> **Por que redirect?** O `LocationDisclosureModal.tsx` e os formulários já submetidos podem referenciar o domínio antigo. O redirect 301 garante que funcione em qualquer cenário.

---

## 3. CONTEÚDO A PUBLICAR

### 3.1 — Privacy Policy

**URL:** `https://onsiteclub.ca/legal/timekeeper/privacy.html`
**Conteúdo fonte:** arquivo `publicacao/01-PRIVACY-POLICY.txt` (copiar integralmente)

**Requisitos de formatação:**
- Título visível: "Privacy Policy — OnSite Timekeeper"
- Data visível: "Last updated: February 17, 2026"
- Texto legível em mobile (responsive, min 16px font)
- Sem pop-ups, sem login, sem paywall — página 100% estática e pública
- HTTPS obrigatório (HTTP deve redirecionar para HTTPS)
- Sem JavaScript pesado — o reviewer da Apple/Google pode acessar de qualquer browser
- Tempo de carregamento < 3 segundos

**Seções obrigatórias no conteúdo (já estão no arquivo fonte):**
1. Information We Collect (email, location, audio, work hours, crash reports, device info)
2. How We Use Your Information
3. Third-Party Services (Supabase, OpenAI, Sentry, Google Maps)
4. Data Storage and Security
5. Your Rights (GDPR, CCPA)
6. Children's Privacy (idade mínima 16)
7. Changes to This Policy
8. Contact Us (email: privacy@onsiteclub.ca)

### 3.2 — Terms of Service

**URL:** `https://onsiteclub.ca/legal/timekeeper/terms.html`
**Conteúdo fonte:** arquivo `publicacao/02-TERMS-OF-SERVICE.txt` (copiar integralmente)

**Requisitos de formatação:** mesmos da Privacy Policy acima.

**Link interno importante:** Na seção 8 dos Terms, há um link para a Privacy Policy:
```
https://timekeeperweb.onsiteclub.ca/privacy
```
Esse link DEVE ser atualizado para:
```
https://onsiteclub.ca/legal/timekeeper/privacy.html
```

### 3.3 — Página de Suporte (opcional mas recomendada)

**URL:** `https://onsiteclub.ca/support/timekeeper`

**Conteúdo mínimo:**
- Nome do app: OnSite Timekeeper
- Email de suporte: support@onsiteclub.ca
- Descrição em 1 parágrafo do que o app faz
- Links para Privacy Policy e Terms of Service

> Apple exige "Support URL" no App Store Connect. Esta página é o destino.

---

## 4. VALIDAÇÃO PÓS-PUBLICAÇÃO

Após publicar, o agente de website DEVE confirmar que:

- [ ] `https://onsiteclub.ca/legal/timekeeper/privacy.html` retorna **200 OK** com conteúdo legível
- [ ] `https://onsiteclub.ca/legal/timekeeper/terms.html` retorna **200 OK** com conteúdo legível
- [ ] `https://timekeeperweb.onsiteclub.ca/privacy` faz **redirect 301** para a privacy policy
- [ ] `https://timekeeperweb.onsiteclub.ca/terms` faz **redirect 301** para os terms
- [ ] `https://timekeeperweb.onsiteclub.ca` faz **redirect 301** para a página de suporte
- [ ] Todas as páginas carregam em < 3 segundos
- [ ] Todas as páginas são legíveis em mobile (viewport responsivo)
- [ ] Todas as páginas funcionam sem JavaScript (conteúdo é server-rendered ou HTML estático)
- [ ] HTTPS ativo em ambos os domínios (certificado válido)

---

## 5. ALTERAÇÕES NECESSÁRIAS NO CÓDIGO DO APP (para o agente do app, não do website)

Após o website estar publicado, o agente do app precisa atualizar estas referências:

### Arquivos que usam URL ANTIGA (`onsiteclub.ca/legal/timekeeper/`) — MANTER COMO ESTÁ:
```
app/legal.tsx:21          → https://onsiteclub.ca/legal/timekeeper/privacy.html  ✅ JÁ CORRETO
app/legal.tsx:22          → https://onsiteclub.ca/legal/timekeeper/terms.html    ✅ JÁ CORRETO
app/(tabs)/settings.tsx:397 → https://onsiteclub.ca/legal/timekeeper/privacy.html  ✅ JÁ CORRETO
app/(tabs)/settings.tsx:407 → https://onsiteclub.ca/legal/timekeeper/terms.html    ✅ JÁ CORRETO
src/components/auth/SignupStep.tsx:92 → terms.html   ✅ JÁ CORRETO
src/components/auth/SignupStep.tsx:96 → privacy.html ✅ JÁ CORRETO
```

### Arquivo que usa URL ANTIGA (`timekeeperweb.onsiteclub.ca`) — ATUALIZAR:
```
src/components/LocationDisclosureModal.tsx:63
  DE:  https://timekeeperweb.onsiteclub.ca/privacy
  PARA: https://onsiteclub.ca/legal/timekeeper/privacy.html
```

### Metadados da store — ATUALIZAR para a URL canônica:
```
publicacao/03-APPLE-APP-STORE-METADATA.txt:20 (URL de suporte)
  DE:  https://timekeeperweb.onsiteclub.ca
  PARA: https://onsiteclub.ca/support/timekeeper

publicacao/03-APPLE-APP-STORE-METADATA.txt:23 (URL de privacy)
  DE:  https://timekeeperweb.onsiteclub.ca/privacy
  PARA: https://onsiteclub.ca/legal/timekeeper/privacy.html

publicacao/10-CHECKLIST-FINAL.txt:9
  DE:  timekeeperweb.onsiteclub.ca/privacy
  PARA: onsiteclub.ca/legal/timekeeper/privacy.html

publicacao/10-CHECKLIST-FINAL.txt:13
  DE:  timekeeperweb.onsiteclub.ca/terms
  PARA: onsiteclub.ca/legal/timekeeper/terms.html
```

---

## 6. EMAILS DE CONTATO — MAPA DE USO

Para consistência, estes são os emails usados:

| Email | Uso | Onde aparece |
|---|---|---|
| `privacy@onsiteclub.ca` | Questões de privacidade/dados | Privacy Policy, tela Legal do app |
| `support@onsiteclub.ca` | Suporte geral do app | Terms of Service, metadata Google Play, settings.tsx |

**Ambos precisam estar funcionando** (recebendo emails). O reviewer da Apple pode mandar email de teste.

---

## 7. RESUMO VISUAL

```
                       ┌─────────────────────────────┐
                       │   onsiteclub.ca (CANÔNICO)   │
                       └─────────────┬───────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
   /legal/timekeeper/      /legal/timekeeper/     /support/timekeeper
     privacy.html            terms.html             (página suporte)
              │                      │                      │
              │                      │                      │
    ┌─────────┴─────────┐  ┌────────┴────────┐   ┌────────┴────────┐
    │ REDIRECT 301 de:  │  │ REDIRECT 301 de:│   │ REDIRECT 301 de:│
    │ timekeeperweb.    │  │ timekeeperweb.  │   │ timekeeperweb.  │
    │ onsiteclub.ca     │  │ onsiteclub.ca   │   │ onsiteclub.ca   │
    │ /privacy          │  │ /terms          │   │ / (raiz)        │
    └───────────────────┘  └─────────────────┘   └─────────────────┘

Referenciado por:                  Referenciado por:
• App Store Connect               • App Store Connect
• Google Play Console              • Google Play Console
• LocationDisclosureModal.tsx      • Terms of Service (link interno)
• legal.tsx                        • legal.tsx
• settings.tsx                     • settings.tsx
• SignupStep.tsx                   • SignupStep.tsx
• Privacy Policy (seção Contact)   • Metadata Google Play
```

---

## 8. PRIORIDADE E ORDEM DE EXECUÇÃO

1. **[5 min]** Publicar `privacy.html` como HTML estático em `onsiteclub.ca/legal/timekeeper/`
2. **[5 min]** Publicar `terms.html` como HTML estático no mesmo diretório
3. **[5 min]** Configurar redirects 301 de `timekeeperweb.onsiteclub.ca` → `onsiteclub.ca`
4. **[5 min]** Verificar HTTPS em ambos os domínios
5. **[5 min]** Testar todas as URLs da seção 4 (validação)
6. **[2 min]** Confirmar que emails `privacy@` e `support@` estão recebendo

**Tempo total estimado: 30 minutos**

---

*Este documento é a diretiva oficial. Quando o website estiver OK, o agente do app fará as alterações de código correspondentes (seção 5).*
