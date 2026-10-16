# Centurai Print OS - Agent Guidelines & Workflow Rules

- Never use any emojis in the final website.

## Environment & Testing Rules
- Always work and commit on the `development` branch. Never commit or push directly to `main`.
- Online Staging / Test Website: https://etba3leytest.vercel.app/ (connected to the staging Supabase database).
- Live Production Website: https://3bdallahhahmed.github.io/3D-EJUST/ (connected to the production Supabase database).
- When building or testing new features (such as the 3D slicer):
  - Develop and test on the `development` branch.
  - Verify local builds using `npm.cmd run build` before pushing.
  - Keep test orders, mock data, and experiments isolated to the staging database and test site.

## Hardware & User Environment Context
- User 3D Printer: **Elegoo Centauri Carbon (CC1)** with 0.4 mm nozzle on textured PEI bed.
- User Location: **University Student Dormitory (dorms)** (E-JUST, Egypt).
- Operational Priorities: Dorm quiet hours (gyroid infill, controlled accelerations), air quality / no toxic fumes (strictly PLA/PETG in dorm rooms), and safe bed adhesion.

