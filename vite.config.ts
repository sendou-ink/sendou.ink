import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// xxx: ensure translations are tree shaken
// xxx: remove english from translation jsons and empty keys

export default defineConfig(({ mode }) => ({
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
