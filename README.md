# Centurai Print OS

A premium, high-performance web dashboard for managing 3D print farms. 

Built with React, Vite, and Supabase, Centurai Print OS provides a centralized interface for tracking orders, assigning active jobs to hardware (e.g., CC Abdalla, CC Mazen), and offering customers a beautiful portal to check their order status.

## Features

- **Liquid Glass UI:** A stunning, modern design featuring glass-morphism, responsive CSS grid layouts, and smooth micro-animations.
- **Admin Command Center:** A secure, Supabase-authenticated dashboard for full farm management.
- **Intelligent Printer Allocation:** Automatically assign queued orders to available printers and track real-time machine status (Working/Resting).
- **Public Order Tracking:** Customers can view the progress of their print jobs using a secure tracking code.
- **CMS Integration:** Allows administrators to update site text, pricing, and configuration dynamically.

## Tech Stack

- **Frontend:** React, Vite
- **Styling:** Custom Vanilla CSS (no Tailwind, pure design flexibility)
- **Backend/Database:** Supabase (PostgreSQL, Realtime, Auth, Storage)
- **3D Rendering:** `@react-three/fiber` for abstract, immersive background elements.

## Getting Started

To run the project locally for development:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/3bdallahhahmed/3D-EJUST.git
   cd 3D-EJUST
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   Create a `.env` file in the root directory and add your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Start the Development Server:**
   ```bash
   npm run dev
   ```

## Contributing

This project uses an **Environment-Based Branching** workflow. Direct pushes to the `main` branch are restricted. Please refer to [CONTRIBUTING.md](.github/CONTRIBUTING.md) for details on the development process.
