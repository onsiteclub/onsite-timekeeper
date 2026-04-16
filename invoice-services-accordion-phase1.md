# Invoice by Services — Phase 1: Accordion Structure

## Objective

Replace the current "Invoice by Services" screen with an accordion wizard.
This phase is **STRUCTURE ONLY** — no visual polish, no animations, no color refinements.
Focus: state machine, expand/collapse, navigation between steps, "Continue" buttons.

---

## Context

- The current screen is at: `app/(tabs)/invoices/by-services.tsx` (or similar — search for the file that renders the "Invoice by Services" form)
- It is a single long-scroll page with all fields visible at once
- It must become a sequential accordion wizard with expandable cards
- **This is a regular screen (push navigation), NOT a modal** — different from Invoice by Hours intentionally

---

## What to build

### Accordion state machine

Create a reusable accordion wizard with these states per card:

```typescript
type CardState = 'active' | 'completed' | 'pending';

// Only ONE card can be 'active' at a time
// Cards before the active one are 'completed'
// Cards after the active one are 'pending'
```

### Steps

The wizard has **4 steps** (NOT 5 — do not split Details and Review):

| Step | Title | Required? | Summary when collapsed |
|------|-------|-----------|----------------------|
| 1 | Client | Yes (name required) | Client name |
| 2 | Job site | No (skippable) | Site name or "Skipped" |
| 3 | Line items | Yes (≥1 item) | "{n} items · ${total}" |
| 4 | Review | Final step | N/A (never collapses) |

### Card layout (structural, not styled)

Each card renders as a `View` with:

```
┌─────────────────────────────────────┐
│ [circle: step number] Step title    │  ← header (always visible)
│                                     │
│ [content area - only when active]   │  ← body (conditionally rendered)
│                                     │
│              [Continue →]           │  ← footer button (only when active)
└─────────────────────────────────────┘
```

**Active card**: header + body + footer visible, border shows active state
**Completed card**: header only, shows summary text + edit icon (pencil), tappable
**Pending card**: header only, dimmed (opacity 0.4), NOT tappable

---

## Step 1 — Client (content)

### When active, show:

1. **Recent clients section** (if any previous invoices exist):
   - Query existing invoices to find unique client names
   - Show each as a tappable row: `[initials circle] Name` + `Last invoice: [date]`
   - Tapping a recent client → selects them → auto-advances to Step 2

2. **"+ New client" button** (dashed border):
   - Tapping expands to show TWO options:
     - "From contacts" — opens device contact picker (`expo-contacts`), extracts name
     - "Type a name" — shows a TextInput + submit arrow
   - When expanded, recent client cards reduce opacity to 0.4

3. **"Continue →" button** at bottom:
   - Disabled (gray) until a client name is set
   - Enabled (charcoal `#2C2C2A`) when client name exists
   - Tapping advances to Step 2

### When completed (collapsed), show:
```
✓  [initials] Client Name                    ✏️
```

### Data to capture:
```typescript
clientName: string;  // required
```

---

## Step 2 — Job site (content)

### When active, show:

1. **Saved locations** (from the app's locations store):
   - Query `useLocationStore` to get saved locations
   - Show each as a tappable row: `● Location Name` + `Address`
   - Tapping a location → selects it → auto-advances to Step 3

2. **Free-text input**:
   - TextInput with placeholder "Job site / lot address"
   - When text is entered, show "Continue →" button

3. **Skip option**:
   - Text link: "Skip — add later"
   - Tapping advances to Step 3 with no job site

4. **"Continue →" button**:
   - Only visible when text input has content
   - Charcoal `#2C2C2A`

### When completed (collapsed), show:
```
✓  Location Name (or typed text)              ✏️
```
Or if skipped:
```
✓  No job site                                ✏️
```

### Data to capture:
```typescript
jobSiteName: string | null;   // from location or typed
jobSiteAddress: string | null; // from location
```

---

## Step 3 — Line items (content)

### When active, show:

1. **"Presets" button** in header row (right side):
   - Pill shape, tappable
   - Opens a bottom sheet (or inline dropdown) with framing presets
   - See preset data below

2. **Line item cards** (one per item):
   ```
   ┌─────────────────────────────────┐
   │ #1                          ✕   │
   │ [Description input]             │
   │ Qty/Sq Ft [___]  Price [___]  $X│
   └─────────────────────────────────┘
   ```
   - Description: multiline TextInput
   - Qty: numeric TextInput
   - Unit Price: numeric TextInput (with $ prefix)
   - Line total: calculated `qty × unitPrice`, displayed right-aligned
   - Delete (✕): removes the item

3. **"+ Add item" button** (dashed border):
   - Adds a new empty line item card
   - Auto-focuses the description field

4. **Running subtotal**:
   - Below all items: `Subtotal    $X,XXX.XX`

5. **"Next: review →" button**:
   - Disabled (gray) when no items exist or any item has qty=0 or price=0
   - Enabled (charcoal) when at least 1 valid item exists
   - Label: "Add at least one item" when disabled, "Next: review →" when enabled

### Preset data (hardcoded constant):

```typescript
const FRAMING_PRESETS = [
  { name: 'Wall framing', description: 'Layout, plate, stud, and sheathing per plan specs' },
  { name: 'Floor framing', description: 'Joist, rim board, and subfloor install' },
  { name: 'Roof framing', description: 'Install rafters, ridge board, and collar ties per plan specs' },
  { name: 'Backing & blocking', description: 'Install backing for fixtures, cabinets, and railings' },
  { name: 'Beam & post', description: 'LVL/glulam beam and support post install' },
  { name: 'Stair framing', description: 'Cut and install stringers, treads, and risers' },
];
```

- Tapping a preset adds it as a new line item with `name` as the first line and `description` pre-filled
- Already-added presets show checkmark instead of +
- Preset descriptions are EDITABLE after adding

### When completed (collapsed), show:
```
✓  3 items · $8,450.00                       ✏️
```

### Data to capture:
```typescript
interface LineItem {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
  presetName?: string; // to track which preset was used
}

lineItems: LineItem[];
```

---

## Step 4 — Review (content)

### When active, show:

1. **Invoice preview card** (read-only summary):
   ```
   TO
   Client Name

   JOB SITE
   Location Name
   Address

   LINE ITEMS

   Wall framing
   2,400 sq ft × $2.80        $6,720.00

   Roof framing
   1,200 sq ft × $3.50        $4,200.00

   ─────────────────────────────────
   Subtotal                  $10,920.00
   HST (13%)                  $1,419.60
   ─────────────────────────────────
   TOTAL                     $12,339.60
   ```

2. **Notes field**:
   - Label: "NOTES"
   - Multiline TextInput, placeholder "Optional notes..."

3. **Two action buttons** (stacked, full width):
   - **"Generate invoice"** — amber `#D4A017`, white text, document icon
   - **"Generate & share"** — charcoal `#2C2C2A`, white text, share icon

### Connect to existing logic:
- Tax calculation: use existing HST 13% logic from the current implementation
- PDF generation: call existing `generateInvoicePDF` (or equivalent)
- Invoice saving: use existing save-to-database logic
- Share: use existing share sheet logic

---

## Accordion behavior rules

### Advancing (Continue button):
1. Validate current step data
2. Set current step to 'completed'
3. Set next step to 'active'
4. Scroll to show the newly active card

### Going back (tapping a completed card):
1. Set tapped card to 'active'
2. Cards BELOW the tapped card keep their state — do NOT reset them
3. The previously active card becomes 'pending' only if it was never completed
4. If the previously active card was completed, it stays completed

### Header back arrow (←):
- If any data has been entered, show confirmation alert: "Discard invoice?" with "Cancel" / "Discard"
- If no data entered, navigate back immediately

### Progress dots:
- 4 dots in the header, right-aligned
- Amber dot = completed or active step
- Gray dot = pending step

---

## Implementation constraints

1. **DO NOT touch Invoice by Hours** — that flow uses modals and is completely separate
2. **Keep ALL existing business logic** — tax calc, PDF generation, invoice saving, line item math
3. **Keep the existing data model** — how invoices are stored in the database
4. **Reuse existing stores** — `useLocationStore` for saved locations, invoice store for saving
5. **The screen is a regular push navigation screen**, not a modal
6. **Keyboard handling**: scroll so focused input is visible above keyboard
7. **The voice FAB remains visible** on this screen

---

## Files to create/modify

- **Primary file**: the existing `by-services.tsx` screen — rewrite its content
- **New component** (optional): `AccordionCard.tsx` — reusable card wrapper with active/completed/pending states
- **DO NOT create new navigation routes** — keep the same route, just change the rendered content

---

## What NOT to do in Phase 1

- ❌ No animations (expand/collapse transitions come in Phase 3)
- ❌ No initials circle colors (just use a gray circle with letters)
- ❌ No amber borders on active cards (just use a thicker border or different shade)
- ❌ No fine-tuned spacing or typography (use reasonable defaults)
- ❌ No "From contacts" integration yet (show the button but `Alert.alert('Coming soon')`)

Focus ONLY on:
- ✅ State machine working (active/completed/pending)
- ✅ All 4 steps rendering correct content
- ✅ Navigation forward and backward
- ✅ Data flow between steps
- ✅ Line items CRUD (add, edit, delete)
- ✅ Presets adding items
- ✅ Review showing all data
- ✅ Generate buttons calling existing logic
- ✅ "Continue →" button on each active card
- ✅ Progress dots (basic)
- ✅ Back arrow with discard confirmation

---

## Report

After implementation, provide:

```
## Phase 1 — Accordion Structure — Report

### State machine:
- [ ] 4 steps: Client → Job Site → Line Items → Review
- [ ] Only one card active at a time
- [ ] Completed cards show summary + edit icon
- [ ] Pending cards dimmed and not tappable
- [ ] Tapping completed card reopens it for editing
- [ ] State preserved when going back to edit

### Step 1 — Client:
- [ ] Recent clients displayed (from existing invoices)
- [ ] "New client" button expands to options
- [ ] "Type a name" shows text input
- [ ] "Continue →" button advances when name entered
- [ ] Collapsed summary shows client name

### Step 2 — Job site:
- [ ] Saved locations displayed (from location store)
- [ ] Free-text input available
- [ ] "Skip — add later" option works
- [ ] "Continue →" button advances
- [ ] Collapsed summary shows site or "No job site"

### Step 3 — Line items:
- [ ] Add item creates empty item card
- [ ] Delete item removes card
- [ ] Description, qty, price inputs work
- [ ] Line total calculates correctly
- [ ] Running subtotal displays
- [ ] Presets button opens preset list
- [ ] All 6 presets present
- [ ] Tapping preset adds editable line item
- [ ] Already-added presets show checkmark
- [ ] "Next: review →" button validates items

### Step 4 — Review:
- [ ] Invoice preview shows all entered data
- [ ] Tax calculation correct (HST 13%)
- [ ] Total displays correctly
- [ ] Notes field works
- [ ] "Generate invoice" creates PDF
- [ ] "Generate & share" creates PDF + opens share

### Navigation:
- [ ] Progress dots update per step
- [ ] Back arrow shows discard confirmation when data exists
- [ ] Keyboard scrolling works for inputs
- [ ] "Continue →" button present on each active card
```
