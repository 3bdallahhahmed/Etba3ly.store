# Centurai Print OS / Etba3ly.store - Claude Code Collaboration Guidelines

Welcome! This repository powers **Centurai Print OS (Etba3ly.store)**, an Apple-inspired 3D printing service web application.

---

## 1. ABSOLUTE PROJECT RULES (NON-NEGOTIABLE)

1. **STRICT ZERO-EMOJI POLICY**:
   - **NEVER** use emojis anywhere in the final website or UI code (no emoji icons, no emoji status badges, no emoji buttons, no emoji toasts).
   - Use clean, minimal SVG icons or semantic text.
2. **BRANCH & APPROVAL ISOLATION**:
   - **PRODUCTION (`main`)**: STRICTLY FORBIDDEN to push directly or commit to `main`.
   - **STAGING (`development`)**: Owned by repo owner. Do NOT push directly to `development`.
   - **MAZEN'S WORKSPACE (`mazen-testing`)**: Mazen and his Claude Code AI work **exclusively** on the `mazen-testing` branch.
   - **APPROVAL GATEWAY**: All changes must be verified on Mazen's test website, then submitted as a GitHub Pull Request targeting `development` for review and approval.
3. **TOKEN EFFICIENCY & LARGE FILE HANDLING (`src/App.jsx`)**:
   - `src/App.jsx` is a large central component (~7,000 lines).
   - **NEVER dump or rewrite the full file** in one command.
   - Use surgical search-and-replace, or extract modular subcomponents into `src/components/`.
4. **BUILD VERIFICATION**:
   - Every single code change MUST pass local build before committing or pushing:
     ```bash
     npm run build
     ```
     Ensure zero build errors.

---

## 2. ENVIRONMENTS & DEPLOYMENTS

| Environment | Branch | Live URL | Database |
| :--- | :--- | :--- | :--- |
| **Production** | `main` | `https://3bdallahhahmed.github.io/3D-EJUST/` | Production Supabase |
| **Staging (Owner)** | `development` | `https://etba3leytest.vercel.app/` | Staging Supabase |
| **Mazen Test Site** | `mazen-testing` | Mazen's Vercel Deployment | Staging Supabase |

### Staging Database Credentials (Use for Local Dev & Mazen's Vercel):
```env
VITE_SUPABASE_URL=https://gfswtgvsbvmuxywewxij.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_ORiX5qWkvIQLrG17DIuvIQ_hgFm971W
```
*Note: Never connect to or alter the production Supabase database.*

---

## 3. TECH STACK & ARCHITECTURE

- **Frontend Framework**: React 19 + Vite 8
- **Styling System**: Apple Liquid Glass design system in `src/index.css`
  - CSS variables for both light and dark modes (`[data-theme="dark"]`, `[data-theme="light"]`)
  - No Tailwind; pure CSS with semantic utility classes
- **3D Graphics & Slicing**:
  - Three.js + `@react-three/fiber` + `@react-three/drei`
  - Client-side STL slicer engine in `src/slicer/slicerEngine.js`
  - 3D Previewer in `src/slicer/STLViewer.jsx`
- **Backend**: Supabase (`@supabase/supabase-js`)
  - Client initialized in `src/App.jsx`
  - Storage bucket: `stl-files`
- **Hardware Context**:
  - Printer: Elegoo Centauri Carbon (CC1) with 0.4 mm nozzle on textured PEI bed
  - Operational environment: University dorms (strictly PLA / PETG, quiet operational hours)

---

## 4. DESIGN GUIDELINES (Apple Human Interface Guidelines)

Consult these guidelines when designing or modifying UI:
- Hit targets: Minimum 44x44pt for touch and mouse interaction
- Typography: Clean SF Pro style, high contrast, balanced hierarchy
- Motion: Purposeful spring transitions, smooth and responsive
- Liquid Glass: High blur backdrop filter, subtle specular borders, dark/light contrast

---

## 5. MAZEN'S DAILY WORKFLOW & GIT COMMANDS

### Step 1: Ensure you are on `mazen-testing` and synced
```bash
git checkout mazen-testing
git pull origin mazen-testing
```

### Step 2: Implement changes & verify build
```bash
# Make edits
npm run build
```

### Step 3: Commit and push to your test branch
```bash
git add .
git commit -m "feat: describe your change cleanly"
git push origin mazen-testing
```
*Pushing to `mazen-testing` automatically triggers your personal Vercel test deployment.*

### Step 4: Verify on your Vercel test website
Open your Vercel test URL, check that your new feature works cleanly, and check browser console for errors.

### Step 5: Request Approval (Pull Request)
Open a Pull Request on GitHub:
- **Base branch**: `development`
- **Compare branch**: `mazen-testing`
- PR URL: `https://github.com/3bdallahhahmed/Etba3ly.store/pull/new/mazen-testing`
- Summarize changes and paste your Vercel test link so the repo owner can review, test, and merge into `development`.
