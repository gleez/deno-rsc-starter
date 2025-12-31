# deno-rsc-starter

**A minimal, production-ready, framework-less template for building React Server Components (RSC) applications with Deno and Vite.**

[![Deno](https://img.shields.io/badge/Deno-2.6-brightgreen.svg)](https://deno.land)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-7.x-646cff.svg?logo=vite)](https://vitejs.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4.x-06B6D4.svg?logo=tailwind-css)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This starter gives you a clean, lightweight foundation to build full-stack RSC apps in Deno — **no heavy framework required**.  
Just pure Deno HTTP server + router, React 19 Server Components, Vite for dev/build, and Tailwind CSS for styling.

Perfect for edge deployments (Deno Deploy), APIs, dashboards, or any modern web app.

## Features

- **React Server Components** (React 19 + RSC payload streaming)
- **Deno-native** runtime (`deno serve`) — zero Node.js
- **Vite** dev server with HMR and fast builds
- **Tailwind CSS** pre-configured
- **Framework-less** — simple custom router (easy to swap with Hono, @std/http, etc.)
- Server actions with instant partial updates
- TypeScript out of the box
- Minimal dependencies

## Quick Start

```bash
git clone https://github.com/gleez/deno-rsc-starter.git my-app
cd my-app

# Install dependencies (uses JSR + npm specifiers)
deno install

# Start dev server (Vite + Deno)
deno task dev
```

Open [http://localhost:3000](http://localhost:3000)

## Scripts

| Command           | Description                              |
|-------------------|------------------------------------------|
| `deno task dev`   | Start Vite dev server with HMR           |
| `deno task build` | Build for production                     |
| `deno task start` | Run production server with `deno serve`  |

## Project Structure

```
├── pages/              # Your pages and server actions (Server Components)
│   └── Home.tsx        # Example home page
├── components/         # Reusable Client & Server components
├── public/             # Static assets (served as-is)
├── lib/                # Utilities, custom router, helpers
├── styles.css          # Tailwind and global CSS
├── vite.config.ts      # Vite + RSC plugin configuration
└── deno.json           # Deno config, tasks, imports
```

## Built With

- [Deno](https://deno.land) – Modern runtime for JavaScript/TypeScript
- [React](https://react.dev) – The UI library
- [Vite](https://vitejs.dev) – Fast dev server & build tool
- [@vitejs/plugin-rsc](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc) – RSC support
- [React Server Components](https://react.dev/blog/2020/12/21/data-fetching-with-react-server-components) - The RSC specification
- [Tailwind CSS](https://tailwindcss.com) – Utility-first styling


## Contributing

Contributions are welcome! Feel free to open issues or PRs.

## License

[MIT](LICENSE) © 2025 Gleez, Inc

---

Made with ❤️ for the Deno + React community

**Inspired by** [@bureaudouble/rsc](https://jsr.io/@bureaudouble/rsc) – advanced RSC runtime for Deno
