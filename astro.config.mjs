import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  // Use your exact GitHub URL
  site: 'https://RahulSannapureddy.github.io',
  // For username.github.io repos, base must be '/'
  base: '/',
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },
});
