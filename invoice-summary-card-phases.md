# InvoiceSummaryCard in Services Wizard — Two-Phase Directive

## Context

The `InvoiceSummaryCard` component (1,542 lines, pure presentational, zero store connections) already works in two places:

1. **Invoice detail modal** (invoice.tsx) — full edit mode with `onSave`
2. **Hourly wizard Step 3** (invoice.tsx) — read-only mode without `onSave`

It must now work in a third place:

3. **Services wizard Step 4** (ServicesWizard.tsx) — replacing the custom inline review

The component already supports `lineItems` prop for products/services layout. The gap is small.

---

## PHASE 1 — Ensure InvoiceSummaryCard supports job site display

**File to modify**: `src/screens/invoice/InvoiceSummaryCard.tsx`

### What to add

The component currently does NOT display a "JOB SITE" section. Add it.

#### 1.1 Add props:

```typescript
// Add to InvoiceSummaryCardProps:
jobSiteName?: string;    // Already exists as `jobSite` — VERIFY the exact prop name
jobSiteAddress?: string; // May need to add
```

Check the existing props — `jobSite` and `jobSiteLot` already exist in the interface. If `jobSite` is already there, just make sure it's rendered. If `jobSiteAddress` is missing, add it.

#### 1.2 Add JOB SITE section to the render:

Add a "JOB SITE" section between the TO/FROM row and the DUE DATE row. Only render it if `jobSite` (or `jobSiteName`) has a value.

```
┌─────────────────────────────────────┐
│ TO              FROM                │  ← existing
│ Client Name     Business Name       │
│─────────────────────────────────────│
│ JOB SITE                            │  ← NEW (only if jobSite has value)
│ 2289 Lawn Ave                       │
│─────────────────────────────────────│
│ DUE DATE                            │  ← existing
│ May 15, 2026                        │
└─────────────────────────────────────┘
```

Follow the EXACT same styling pattern as the other sections:
- Label: same style as "TO", "FROM", "DUE DATE" labels (uppercase, small, secondary color)
- Value: same style as client name (weight 500, primary color)
- Container: same background, border-radius, padding as adjacent sections

#### 1.3 Verify lineItems rendering

The component already renders line items when `lineItems` prop is provided. Verify:
- Each item shows: description, `qty × $unitPrice`, and `$total` right-aligned
- Subtotal, tax, total display correctly
- The `isHourly` flag: `!lineItems || lineItems.length === 0` — this is already correct

**NO other changes to InvoiceSummaryCard.** Do not change how it handles hourly, do not change edit mode, do not change any existing behavior. Only add the JOB SITE section.

### Verify after Phase 1:

Open the Invoices tab, tap an existing services invoice. Confirm:
- JOB SITE section appears (if the invoice has a job site in notes or data)
- Everything else looks identical to before
- Hourly invoices still work (JOB SITE section hidden since no jobSite value)

---

## PHASE 2 — Replace Services Wizard Step 4 with InvoiceSummaryCard

**File to modify**: `ServicesWizard.tsx`

### What to change

Replace the ENTIRE Step 4 custom content with InvoiceSummaryCard. The flow changes from "preview → generate" to "auto-generate → display".

#### 2.1 Change the Step 3 → Step 4 transition

Currently when user taps "Continue →" on Step 3, it just opens Step 4 with a preview. Change to:

```typescript
const handleAdvanceToReview = async () => {
  // 1. Show loading
  setIsGenerating(true);
  
  try {
    // 2. Save invoice to database (creates INV-XXXX number)
    const result = await invoiceStore.createProductsInvoice({
      userId: user.id,
      clientName: wizardData.clientName,
      // ... map all wizard data to createProductsInvoice params
      // Look at how the current "Generate invoice" button does it — 
      // copy that exact logic, just move it to happen BEFORE Step 4 opens
    });
    
    // 3. Store the created invoice for Step 4 to display
    setCreatedInvoice(result.invoice);
    setCreatedInvoiceItems(result.items); // if returned
    
    // 4. Advance to Step 4
    setActiveStep(4);
    
  } catch (error) {
    // Stay on Step 3, show error
    Alert.alert('Error', 'Failed to generate invoice. Please try again.');
  } finally {
    setIsGenerating(false);
  }
};
```

Add state:
```typescript
const [createdInvoice, setCreatedInvoice] = useState<InvoiceDB | null>(null);
const [createdInvoiceItems, setCreatedInvoiceItems] = useState<InvoiceItemDB[]>([]);
const [isGenerating, setIsGenerating] = useState(false);
```

#### 2.2 Replace Step 4 render content

Remove ALL the current Step 4 JSX (the custom TO/JOB SITE/LINE ITEMS preview, Notes input, Generate buttons).

Replace with:

```tsx
// Step 4 body content:
{createdInvoice && (
  <InvoiceSummaryCard
    // Header
    invoiceNumber={createdInvoice.invoice_number}
    createdAt={createdInvoice.created_at}
    
    // Client
    clientName={createdInvoice.client_name}
    clientPhone={createdInvoice.client_phone}
    clientAddress={/* format from client fields */}
    clientEmail={createdInvoice.client_email}
    
    // From (business profile)
    fromName={businessProfile?.business_name}
    fromPhone={businessProfile?.phone}
    fromAddress={/* format from business profile */}
    fromEmail={businessProfile?.email}
    
    // Job site
    jobSite={createdInvoice.job_site || wizardData.jobSiteName}
    
    // Due date
    dueDate={/* format createdInvoice.due_date */}
    
    // Line items (products/services mode)
    lineItems={createdInvoiceItems.map(item => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      total: item.total,
    }))}
    
    // Hourly fields (empty — this is services)
    days={[]}
    totalDays={0}
    totalMinutes={0}
    totalLabel="0h"
    rate={0}
    
    // Tax
    taxRate={createdInvoice.tax_rate}
    taxLabel="HST"
    
    // Notes
    notes={createdInvoice.notes}
    
    // Actions — NO onSave (read-only for now)
    // Share and delete are handled by buttons inside the card
    // OR add onClose to navigate back:
    onClose={() => router.back()}
  />
)}
```

**IMPORTANT**: Look at how `invoice.tsx` passes props to InvoiceSummaryCard in the invoice detail modal (the `openInvoiceDetail` flow). Copy that pattern exactly — same prop mapping, same data transformations. The goal is identical rendering.

#### 2.3 Step 4 accordion card behavior

- Step 4 card should NOT have a "Continue →" button (it's the final step — already true)
- Step 4 card should NOT collapse (it's always the last active step)
- The back arrow (←) from Step 4 navigates to the Invoices tab: `router.back()` or `router.replace('/(tabs)/invoices')`
- No discard confirmation needed — invoice is already saved

#### 2.4 Loading state during generation

While `isGenerating === true` and Step 4 is about to open, show a loading indicator in Step 3's Continue button:

```tsx
// Step 3 Continue button:
<TouchableOpacity 
  onPress={handleAdvanceToReview}
  disabled={isGenerating || !hasValidItems}
>
  {isGenerating ? (
    <ActivityIndicator color="#FFF" />
  ) : (
    <Text>Continue →</Text>
  )}
</TouchableOpacity>
```

#### 2.5 Remove old generation logic

The current Step 4 has "Generate invoice" and "Generate & share" buttons that call `createProductsInvoice`. Since generation now happens BEFORE Step 4 opens:

- Remove the "Generate invoice" button
- Remove the "Generate & share" button  
- Remove the Notes TextInput (notes can be passed during generation or edited via the card later)
- Remove the custom preview JSX

The InvoiceSummaryCard's own Share PDF button handles sharing.

#### 2.6 Handle notes

Two options (pick the simpler one):

**Option A** (recommended): Add a Notes TextInput in Step 3, below the line items. When advancing to Step 4, include notes in the `createProductsInvoice` call. The card displays them read-only.

**Option B**: Keep notes as a text input below the InvoiceSummaryCard in Step 4, and call `updateInvoice` when user types. This adds complexity — avoid if possible.

Go with Option A.

---

## Import changes in ServicesWizard.tsx

Add:
```typescript
import InvoiceSummaryCard from '../../src/screens/invoice/InvoiceSummaryCard';
// Verify the exact relative path from ServicesWizard.tsx to InvoiceSummaryCard.tsx
```

---

## What NOT to change

- ❌ Do not modify invoice.tsx (Invoices tab)
- ❌ Do not modify the hourly wizard flow
- ❌ Do not change InvoiceSummaryCard's existing behavior (only add JOB SITE in Phase 1)
- ❌ Do not change Steps 1-3 of ServicesWizard (except adding Notes input to Step 3 if Option A)
- ❌ Do not change invoice data model, stores, or PDF generation

---

## Report

```
## InvoiceSummaryCard in Services Wizard — Report

### Phase 1 — JOB SITE section:
- [ ] jobSite/jobSiteAddress props verified in InvoiceSummaryCard
- [ ] JOB SITE section renders between TO/FROM and DUE DATE
- [ ] Only shows when jobSite has a value
- [ ] Styling matches existing sections
- [ ] Existing invoice detail modal still works
- [ ] Hourly invoices still work (no JOB SITE shown)

### Phase 2 — Step 4 replacement:
- [ ] Invoice auto-generated when advancing from Step 3
- [ ] createProductsInvoice called with all wizard data
- [ ] Invoice number displayed in card header
- [ ] InvoiceSummaryCard renders in Step 4 with correct props
- [ ] Line items display correctly (description, qty, price, total)
- [ ] Subtotal, HST, Total calculate correctly
- [ ] JOB SITE section shows (if job site was selected)
- [ ] Notes included in generated invoice
- [ ] Share PDF button works
- [ ] Loading state during generation
- [ ] Error handling if generation fails
- [ ] Back arrow navigates to Invoices tab
- [ ] Old custom preview JSX removed
- [ ] Old Generate/Share buttons removed
```
