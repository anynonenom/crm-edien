# Eiden Group BMS // Forensic Revenue Architecture

A high-fidelity, AI-driven BMS designed for the Eiden Group. This application provides a futuristic "Flash UI" interface for managing sales pipelines, contacts, tasks, and forensic revenue analytics.

## Core Objective
To provide a unified, secure, and intelligent platform for managing the organization's commercial operations with a focus on forensic data visualization and AI-driven insights.

## Key Features
- **Neural Link Protocol Access Terminal:** Multi-step authentication with 2FA simulation and identity recovery.
- **Executive Command Center:** Real-time KPI tracking and AI-generated "Morning Intelligence Briefs" via Gemini API.
- **Forensic Pipeline Board:** Kanban-style deal management with risk scoring and win probability analysis.
- **Protocol Matrix:** Task management integrated with deals and operators.
- **Operator Database:** Comprehensive contact management with LTV tracking and source analysis.
- **Neural Shell:** Integrated terminal for system interaction and forensic commands.

## Technical Stack
- **Frontend:** React 19, Tailwind CSS 4, Motion, Lucide React.
- **Backend:** Express.js, SQLite (better-sqlite3).
- **AI:** Google Gemini API (@google/genai).
- **Runtime:** Node.js.

## Getting Started
1. **Install Dependencies:** `npm install`
2. **Configure Environment:** Create a `.env` file with:
   - `GEMINI_API_KEY=<your Gemini key>`
   - `SUPABASE_URL=<your Supabase project URL>`
   - `SUPABASE_ANON_KEY=<your Supabase anon/public key>`
   - `SUPABASE_SERVICE_ROLE_KEY=<your Supabase service role key>`
   - `AUTH_TOKEN_SECRET=<long random secret>` (enables signed auth tokens for `/api/v1/*`)
   - `STRIPE_WEBHOOK_SECRET=<stripe webhook signing secret>` (enables webhook signature verification)
3. **Apply Database Schema:** Run `supabase_migration.sql`, then `supabase_ibms_core_migration.sql` in Supabase SQL Editor.
4. **Start Development Server:** `npm run dev`
5. **Build for Production:** `npm run build`

## Project Structure
- `/src/App.tsx`: Main application logic and view management.
- `/src/index.css`: Global styles and "Flash UI" theme definitions.
- `/server.ts`: Express server and SQLite database management.
- `/bms.db`: SQLite database file (generated on first run).

## Acceptance Criteria
- [x] Multi-step authentication and registration.
- [x] Real-time dashboard with KPI tracking.
- [x] AI-driven intelligence briefs.
- [x] Task management (Protocols) with deal integration.
- [x] Activity logging and forensic audit trails.
- [x] Responsive "Flash UI" design.
