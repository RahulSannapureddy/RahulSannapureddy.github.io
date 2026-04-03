# Design Spec: Personal Website for Rahul Sannapureddy

**Date:** 2026-04-03
**Author:** Gemini CLI
**Status:** Draft (Pending User Review)

## 1. Overview
A personal website for Rahul Sannapureddy, a computer science student at IIT Guwahati. The site will showcase his projects, blog posts, and bio, with a focus on a professional, technical, and minimalist aesthetic.

### Goals
- Professional online presence for a CS student.
- Easy to update with new projects and blog posts.
- High performance and clean design.
- Hosted on GitHub Pages.

## 2. Visual Design: Minimalist Timeline
- **Style:** Minimalist & Clean with a "Timeline" feel on the homepage.
- **Typography:** A mix of clean Sans-Serif (for headers) and Monospaced (for technical details/timeline elements).
- **Color Palette:** High contrast (likely white background with dark text) with subtle accent colors (e.g., a single professional blue or green).
- **Key Visual Elements:** Thin vertical lines for the timeline, clear spacing, and high-quality typography.

## 3. Site Structure
A multi-page site for better organization and scalability.

### Pages:
1. **Homepage (`/`):**
   - Header with Navigation.
   - Brief Bio / About Me.
   - Vertical "Timeline" showing recent milestones (e.g., "Started at IITG", "Launched X Project").
   - Footer with social links (GitHub, LinkedIn, Email).
2. **Projects (`/projects`):**
   - A dedicated list or grid of all projects.
   - Each project has a title, description, tech stack, and links (GitHub/Demo).
3. **Blog (`/blog`):**
   - A list of blog posts with dates and summaries.
   - Individual blog post pages.

### Future Expansion (Out of Scope for now):
- **Education & Skills:** Dedicated pages to be added later.

## 4. Technical Stack
- **Framework:** [Astro](https://astro.build/) (Static Site Generator).
- **Language:** TypeScript.
- **Styling:** Vanilla CSS (no external CSS frameworks like Tailwind for maximum control and performance).
- **Content:** Markdown (`.md`) for projects and blog posts.
- **Hosting:** GitHub Pages.

## 5. Components & Data Flow
- **Components:**
  - `Navigation.astro`: Shared header navigation.
  - `TimelineItem.astro`: Reusable vertical timeline element.
  - `ProjectCard.astro`: Card component for projects.
  - `Footer.astro`: Shared site footer.
  - `Layout.astro`: Base layout wrapper.
- **Content Collections:**
  - `src/content/projects/`: Individual markdown files for projects.
  - `src/content/blog/`: Individual markdown files for blog posts.
- **Data Fetching:** Astro's `getCollection` API to fetch and sort content.

## 6. Testing & Validation
- **Local Preview:** Use `npm run dev` for development.
- **Build Verification:** Run `npm run build` to ensure the site compiles correctly.
- **Accessibility:** Ensure high contrast ratios and semantic HTML.
- **Mobile Responsive:** Layout must work seamlessly on mobile and desktop.
