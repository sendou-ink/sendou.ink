import { defineConfig } from "vite";
import babel from "vite-plugin-babel";

// vite-node config of react-render-bench.tsx: the app's sources with production JSX and the React
// Compiler, as the production build has them (see ../../vite.config.ts), without the React Router
// plugin (which only serves the dev JSX runtime)
export default defineConfig({
	resolve: { tsconfigPaths: true },
	oxc: { jsx: { runtime: "automatic", development: false } },
	define: { __GIT_COMMIT__: JSON.stringify("") },
	plugins: [
		babel({
			include: /\.[jt]sx?$/,
			babelConfig: {
				presets: ["@babel/preset-typescript"],
				plugins: [["babel-plugin-react-compiler", {}]],
			},
		}),
	],
});
