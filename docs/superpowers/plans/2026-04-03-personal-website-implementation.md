# Personal Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimalist, timeline-based personal website for Rahul Sannapureddy using Astro and Vanilla CSS.

**Architecture:** A multi-page Astro site with content managed via Markdown collections. The homepage features a vertical timeline of milestones, while dedicated pages handle project listings and blog posts.

**Tech Stack:** Astro, TypeScript, Vanilla CSS, Markdown.

---

### Task 1: Initialize Astro Project

**Files:**
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`

- [ ] **Step 1: Scaffold Astro project**

Run: `npm create astro@latest . -- --template minimal --typescript strict --install --no-git`
(Note: Using existing directory, so `--template minimal` is safest to avoid overwriting too much, though we've already cleared most things.)

- [ ] **Step 2: Verify installation**

Run: `npm run dev` (in background) and check if it starts.
Expected: Astro dev server starts on port 4321.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json astro.config.mjs tsconfig.json
git commit -m "chore: initialize astro project"
```

### Task 2: Global Styles and Base Layout

**Files:**
- Create: `src/styles/global.css`
- Create: `src/layouts/Layout.astro`

- [ ] **Step 1: Define global CSS variables and reset**

`src/styles/global.css`:
```css
:root {
  --bg: #ffffff;
  --text: #1a1a1a;
  --text-muted: #666;
  --accent: #2563eb;
  --border: #eeeeee;
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  line-height: 1.6;
}
```

- [ ] **Step 2: Create base Layout component**

`src/layouts/Layout.astro`:
```astro
---
import '../styles/global.css';

interface Props {
	title: string;
}

const { title } = Astro.props;
---

<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width" />
		<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
		<title>{title}</title>
	</head>
	<body>
		<slot />
	</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add src/styles/global.css src/layouts/Layout.astro
git commit -m "feat: add global styles and base layout"
```

### Task 3: Core Components (Navigation & Footer)

**Files:**
- Create: `src/components/Navigation.astro`
- Create: `src/components/Footer.astro`
- Modify: `src/layouts/Layout.astro`

- [ ] **Step 1: Create Navigation component**

`src/components/Navigation.astro`:
```astro
<nav>
  <a href="/">Home</a>
  <a href="/projects">Projects</a>
  <a href="/blog">Blog</a>
</nav>

<style>
  nav { display: flex; gap: 2rem; padding: 2rem 0; border-bottom: 1px solid var(--border); }
  a { text-decoration: none; color: var(--text); font-weight: 500; }
  a:hover { color: var(--accent); }
</style>
```

- [ ] **Step 2: Create Footer component**

`src/components/Footer.astro`:
```astro
<footer>
  <p>&copy; 2026 Rahul Sannapureddy</p>
  <div class="links">
    <a href="https://github.com/RahulSannapureddy">GitHub</a>
    <a href="#">LinkedIn</a>
    <a href="mailto:rahul.sannapureddy@gmail.com">Email</a>
  </div>
</footer>

<style>
  footer { margin-top: 4rem; padding: 2rem 0; border-top: 1px solid var(--border); display: flex; justify-content: space-between; }
  .links { display: flex; gap: 1rem; }
</style>
```

- [ ] **Step 3: Integrate components into Layout**

- [ ] **Step 4: Commit**

```bash
git add src/components/Navigation.astro src/components/Footer.astro src/layouts/Layout.astro
git commit -m "feat: add navigation and footer components"
```

### Task 4: Content Collections Setup

**Files:**
- Create: `src/content/config.ts`
- Create: `src/content/projects/placeholder.md`
- Create: `src/content/blog/hello-world.md`

- [ ] **Step 1: Define collections in config.ts**

`src/content/config.ts`:
```typescript
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
	type: 'content',
	schema: z.object({
		title: z.string(),
		description: z.string(),
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		heroImage: z.string().optional(),
	}),
});

const projects = defineCollection({
	type: 'content',
	schema: z.object({
		title: z.string(),
		description: z.string(),
		pubDate: z.coerce.date(),
		heroImage: z.string().optional(),
		tags: z.array(z.string()).optional(),
	}),
});

export const collections = { blog, projects };
```

- [ ] **Step 2: Add placeholder content**

`src/content/blog/hello-world.md`:
```markdown
---
title: "Hello World"
description: "Welcome to my new personal website!"
pubDate: "Apr 03 2026"
---
This is the first post on my new blog. Stay tuned for more updates!
```

`src/content/projects/placeholder.md`:
```markdown
---
title: "Personal Website"
description: "My personal portfolio built with Astro and Vanilla CSS."
pubDate: "Apr 03 2026"
tags: ["Astro", "TypeScript", "CSS"]
---
A minimalist, timeline-based website showcasing my journey as a CS student.
```

- [ ] **Step 3: Commit**

```bash
git add src/content/config.ts src/content/projects/placeholder.md src/content/blog/hello-world.md
git commit -m "feat: set up content collections for projects and blog"
```

### Task 5: Homepage with Timeline

**Files:**
- Create: `src/components/TimelineItem.astro`
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Create TimelineItem component**

`src/components/TimelineItem.astro`:
```astro
---
interface Props {
	date: string;
	title: string;
	description: string;
}

const { date, title, description } = Astro.props;
---
<div class="timeline-item">
	<div class="date">{date}</div>
	<div class="content">
		<h3>{title}</h3>
		<p>{description}</p>
	</div>
</div>

<style>
	.timeline-item { display: flex; gap: 2rem; margin-bottom: 2rem; position: relative; }
	.timeline-item::before { content: ""; position: absolute; left: 5rem; top: 0; bottom: -2rem; width: 1px; background: var(--border); }
	.date { width: 4rem; text-align: right; font-family: var(--font-mono); font-size: 0.9rem; color: var(--text-muted); }
	.content { flex: 1; padding-left: 1rem; }
	h3 { font-size: 1.1rem; margin-bottom: 0.25rem; }
	p { color: var(--text-muted); }
</style>
```

- [ ] **Step 2: Implement Homepage layout**

`src/pages/index.astro`:
```astro
---
import Layout from '../layouts/Layout.astro';
import Navigation from '../components/Navigation.astro';
import Footer from '../components/Footer.astro';
import TimelineItem from '../components/TimelineItem.astro';
---

<Layout title="Rahul Sannapureddy | Personal Website">
	<main>
		<Navigation />
		<section class="hero">
			<h1>Rahul Sannapureddy</h1>
			<p class="subtitle">CS Student at IIT Guwahati</p>
			<p>Passionate about building efficient systems and elegant software.</p>
		</section>

		<section class="timeline">
			<h2>Timeline</h2>
			<TimelineItem 
				date="2026" 
				title="Launched Personal Website" 
				description="Built with Astro and Vanilla CSS." 
			/>
			<TimelineItem 
				date="2022" 
				title="Started at IIT Guwahati" 
				description="Pursuing B.Tech in Computer Science and Engineering." 
			/>
		</section>
		<Footer />
	</main>
</Layout>

<style>
	main { max-width: 800px; margin: 0 auto; padding: 0 1rem; }
	.hero { padding: 4rem 0; }
	h1 { font-size: 3rem; margin-bottom: 0.5rem; }
	.subtitle { font-size: 1.5rem; color: var(--text-muted); margin-bottom: 1rem; }
	.timeline { padding: 2rem 0; }
	h2 { margin-bottom: 2rem; }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/TimelineItem.astro src/pages/index.astro
git commit -m "feat: implement homepage with vertical timeline"
```

### Task 6: Projects Page

**Files:**
- Create: `src/components/ProjectCard.astro`
- Create: `src/pages/projects/index.astro`

- [ ] **Step 1: Create ProjectCard component**

`src/components/ProjectCard.astro`:
```astro
---
interface Props {
	title: string;
	description: string;
	tags?: string[];
	slug: string;
}

const { title, description, tags, slug } = Astro.props;
---
<a href={`/projects/${slug}`} class="project-card">
	<h3>{title}</h3>
	<p>{description}</p>
	{tags && <div class="tags">{tags.map(tag => <span>{tag}</span>)}</div>}
</a>

<style>
	.project-card { display: block; padding: 1.5rem; border: 1px solid var(--border); text-decoration: none; color: inherit; transition: border-color 0.2s; }
	.project-card:hover { border-color: var(--accent); }
	h3 { margin-bottom: 0.5rem; }
	p { color: var(--text-muted); font-size: 0.95rem; }
	.tags { display: flex; gap: 0.5rem; margin-top: 1rem; }
	.tags span { font-family: var(--font-mono); font-size: 0.8rem; background: #f0f0f0; padding: 0.2rem 0.5rem; border-radius: 4px; }
</style>
```

- [ ] **Step 2: Implement Projects listing page**

`src/pages/projects/index.astro`:
```astro
---
import { getCollection } from 'astro:content';
import Layout from '../../layouts/Layout.astro';
import Navigation from '../../components/Navigation.astro';
import Footer from '../../components/Footer.astro';
import ProjectCard from '../../components/ProjectCard.astro';

const projects = (await getCollection('projects')).sort(
	(a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
);
---

<Layout title="Projects | Rahul Sannapureddy">
	<main>
		<Navigation />
		<section>
			<h1>Projects</h1>
			<div class="grid">
				{projects.map(p => (
					<ProjectCard 
						title={p.data.title} 
						description={p.data.description} 
						tags={p.data.tags} 
						slug={p.slug} 
					/>
				))}
			</div>
		</section>
		<Footer />
	</main>
</Layout>

<style>
	main { max-width: 800px; margin: 0 auto; padding: 0 1rem; }
	h1 { margin: 2rem 0; }
	.grid { display: grid; gap: 1.5rem; }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ProjectCard.astro src/pages/projects/index.astro
git commit -m "feat: implement projects listing page"
```

### Task 7: Blog Listing and Post Pages

**Files:**
- Create: `src/pages/blog/index.astro`
- Create: `src/pages/blog/[...slug].astro`

- [ ] **Step 1: Implement Blog listing page**

`src/pages/blog/index.astro`:
```astro
---
import { getCollection } from 'astro:content';
import Layout from '../../layouts/Layout.astro';
import Navigation from '../../components/Navigation.astro';
import Footer from '../../components/Footer.astro';

const posts = (await getCollection('blog')).sort(
	(a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
);
---

<Layout title="Blog | Rahul Sannapureddy">
	<main>
		<Navigation />
		<section>
			<h1>Blog</h1>
			<ul class="posts">
				{posts.map(p => (
					<li>
						<span class="date">{p.data.pubDate.toLocaleDateString()}</span>
						<a href={`/blog/${p.slug}`}>{p.data.title}</a>
					</li>
				))}
			</ul>
		</section>
		<Footer />
	</main>
</Layout>

<style>
	main { max-width: 800px; margin: 0 auto; padding: 0 1rem; }
	h1 { margin: 2rem 0; }
	.posts { list-style: none; }
	li { display: flex; gap: 2rem; margin-bottom: 1rem; }
	.date { font-family: var(--font-mono); color: var(--text-muted); min-width: 120px; }
	a { text-decoration: none; color: inherit; font-weight: 500; }
	a:hover { color: var(--accent); }
</style>
```

- [ ] **Step 2: Implement Dynamic Blog Post page**

`src/pages/blog/[...slug].astro`:
```astro
---
import { type CollectionEntry, getCollection } from 'astro:content';
import Layout from '../../layouts/Layout.astro';
import Navigation from '../../components/Navigation.astro';
import Footer from '../../components/Footer.astro';

export async function getStaticPaths() {
	const posts = await getCollection('blog');
	return posts.map((post) => ({
		params: { slug: post.slug },
		props: post,
	}));
}
type Props = CollectionEntry<'blog'>;

const post = Astro.props;
const { Content } = await post.render();
---

<Layout title={post.data.title}>
	<main>
		<Navigation />
		<article>
			<header>
				<p class="date">{post.data.pubDate.toLocaleDateString()}</p>
				<h1>{post.data.title}</h1>
			</header>
			<div class="prose">
				<Content />
			</div>
		</article>
		<Footer />
	</main>
</Layout>

<style>
	main { max-width: 800px; margin: 0 auto; padding: 0 1rem; }
	article { padding: 2rem 0; }
	.date { font-family: var(--font-mono); color: var(--text-muted); }
	h1 { margin: 0.5rem 0 2rem; }
	.prose { line-height: 1.8; }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/blog/index.astro src/pages/blog/[...slug].astro
git commit -m "feat: implement blog listing and post pages"
```

### Task 8: Final Polish and Build

- [ ] **Step 1: Run build to verify**

Run: `npm run build`
Expected: Successful build in `dist/` directory.

- [ ] **Step 2: Commit final changes**

```bash
git commit -m "chore: final polish and build verification"
```
