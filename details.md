# Project Setup Details

This file documents the steps taken to set up the Astro project.

## Initial Goal

The goal is to build a high-performance personal portfolio using Astro 5.x, Tailwind CSS, and TypeScript. The project should have a modular directory structure, a content collection for a blog, Shadcn/UI for components, and be optimized for SSR/Hybrid rendering.

## Setup Process

1.  **Project Structure**: Manually created the project structure and configuration files for Astro, Tailwind, and TypeScript.
    - `package.json`: with dependencies for astro, tailwind, and svelte.
    - `astro.config.mjs`: configured for hybrid output and with tailwind and svelte integrations.
    - `tailwind.config.mjs`: basic configuration.
    - `tsconfig.json`: with strictest settings and path aliases.
    - Created directories: `src/components`, `src/layouts`, `src/content`.

2.  **Dependency Installation**: The user manually ran `npm install` to install the project's dependencies.

3.  **Shadcn/UI Setup**:
    - Installed `tailwindcss-animate`, `clsx`, and `tailwind-merge`.
    - Created `components.json` to configure Shadcn/UI.
    - Created `src/app.css` with the default and dark themes.
    - Created `src/lib/utils.ts` with the `cn` utility function.
    - Updated `tailwind.config.mjs` with the Shadcn/UI theme and plugins.

4.  **Content Collections**:
    - Created `src/content/config.ts` to define the `blog` collection.
    - Created a sample blog post at `src/content/blog/first-post.mdx`.

5.  **Global Design System**:
    - Created `src/styles/globals.css` with a 'Systems Architect' aesthetic.
    - Created `Navigation` and `Footer` components.
    - Created a base `Layout.astro` to integrate the design system.

6.  **Systems Optimizations**:
    - **Sitemap & RSS**: Added `@astrojs/rss` to generate an RSS feed. Note: `@astrojs/sitemap` was temporarily removed due to build errors.
    - **Image Optimization**: Configured Astro's asset system for images and used the `<Image />` component.
    - **Security Headers**: Implemented a middleware (`src/middleware.ts`) to set security headers like CSP.
    - **SEO**: Added a `robots.txt` and integrated OpenGraph metadata into the layout, pulling from frontmatter.

7.  **Build Troubleshooting**:
    - Renamed `src/content/blog/first-post.mdx` to `src/content/blog/first-post.md` to resolve issues with empty collections (due to missing `@astrojs/mdx`).
    - Temporarily disabled `@astrojs/sitemap` in `astro.config.mjs` to resolve a `Cannot read properties of undefined (reading 'reduce')` error during the static build.
    - Added `trailingSlash: 'always'` to `astro.config.mjs` for consistent URL structure.

## Next Steps

### Dark Mode

To enable dark mode by default, you need to add `class="dark"` to the `<html>` tag in your layout files. For example, in a base layout file (`src/layouts/Layout.astro`):

```astro
---
import '../styles/globals.css';
---
<html lang="en" class="dark">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width" />
    <meta name="generator" content={Astro.generator} />
    <title>Astro</title>
  </head>
  <body>
    <slot />
  </body>
</html>
```
