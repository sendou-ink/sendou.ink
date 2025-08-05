import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// xxx: ensure translations are tree shaken
// xxx: when running npm run dev paraglide compiles twice, first with the setup script then dev server boot up

export default defineConfig(({ mode }) => ({
	optimizeDeps: {
		exclude: ['@lucide/svelte']
	},
	plugins: [
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
			outputStructure: mode === 'production' ? 'message-modules' : 'locale-modules'
		}),
		sveltekit()
	]
}));
