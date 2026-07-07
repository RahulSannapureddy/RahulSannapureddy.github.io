import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
	loader: glob({ pattern: '**/[^_]*.md', base: './src/content/blog' }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		heroImage: z.string().optional(),
	}),
});

const projects = defineCollection({
	loader: glob({ pattern: '**/[^_]*.md', base: './src/content/projects' }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		pubDate: z.coerce.date(),
		heroImage: z.string().optional(),
		tags: z.array(z.string()).optional(),
	}),
});

const timeline = defineCollection({
	loader: glob({ pattern: '**/[^_]*.json', base: './src/content/timeline' }),
	schema: z.object({
		date: z.string(),
		title: z.string(),
		description: z.string(),
		sortOrder: z.number(),
		link: z.string().optional(),
	}),
});

export const collections = { blog, projects, timeline };
