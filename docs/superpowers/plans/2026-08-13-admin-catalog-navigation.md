# Admin Catalog Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make returning from the authenticated admin page to the public catalog obvious on every screen size.

**Architecture:** Add ordinary semantic anchor links at the two user decision points: the persistent admin header and the successful import result. Keep logout as a separate action and use existing button styles with a small responsive action-group wrapper.

**Tech Stack:** React 19, Next.js-compatible `Link`, TypeScript, CSS, Node test runner.

## Global Constraints

- The catalog destination is exactly `/#catalog-title`.
- Navigation remains visible at widths up to and below 640 pixels.
- Logout behavior and authentication remain unchanged.
- Successful import does not automatically redirect.

---

### Task 1: Admin-to-catalog navigation

**Files:**
- Create: `tests/admin-navigation.test.ts`
- Create: `app/admin/AdminNavigation.tsx`
- Modify: `app/admin/AdminConsole.tsx`
- Modify: `app/admin/ImportAnalyzer.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: the existing authenticated admin title area and successful import notice.
- Produces: two accessible links labeled «В каталог» and «Посмотреть каталог» with `href="/#catalog-title"`.

- [ ] **Step 1: Write the failing navigation test**

Render the real navigation components to static HTML and assert both actions and destinations:

```ts
const header = renderToStaticMarkup(createElement(AdminHeaderActions, { onLogout() {} }));
const success = renderToStaticMarkup(createElement(ImportSuccessNotice, { text: "Импортировано 10 товаров." }));
assert.match(header, /href="\/#catalog-title"[^>]*>.*В каталог/);
assert.match(success, /href="\/#catalog-title"[^>]*>.*Посмотреть каталог/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx tsx --test tests/admin-navigation.test.ts`

Expected: FAIL because neither admin component contains the new catalog action.

- [ ] **Step 3: Implement the persistent and success actions**

Create `AdminHeaderActions` and `ImportSuccessNotice` using semantic anchors and arrow icons. Use the first beside logout in `AdminConsole` and the second for the successful notice in `ImportAnalyzer`.

- [ ] **Step 4: Add responsive styles**

Add `.admin-actions` and `.success-actions`; keep controls at least 44 pixels high and stack them only when the mobile width cannot fit both.

- [ ] **Step 5: Verify GREEN and the complete project**

Run:

```bash
npx tsx --test tests/admin-navigation.test.ts
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: every command exits with code 0.

- [ ] **Step 6: Commit and publish**

```bash
git add app/admin/AdminConsole.tsx app/admin/AdminNavigation.tsx app/admin/ImportAnalyzer.tsx app/globals.css tests/admin-navigation.test.ts
git commit -m "fix: add catalog return actions"
```

Merge to `main`, push GitHub, and publish the same validated commit to Sites.
