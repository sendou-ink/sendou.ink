// Measurement only (scripts/measure.ts): `MEASURE_STAND_IN_SHELL=true react-router build` swaps the
// app shell root.tsx renders (side nav, chat, notifications, global status, ads and the loaders
// feeding them) for the same stand-in header the slice renders, so that the document, its scripts
// and the browser's work compare like for like. Only root.tsx's own imports are replaced.
import path from "node:path";
import type { Plugin } from "vite";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const ROOT_ROUTE = path.join(ROOT, "app/root.tsx");

const stub = (file: string) => path.join(import.meta.dirname, file);

/** Real module (resolved path without extension) → its stand-in. */
const STUBS = new Map(
	Object.entries({
		"app/components/layout/index": stub("StandInLayout.tsx"),
		"app/components/fuse/Fuse": stub("stubs.tsx"),
		"app/features/chat/ChatProvider": stub("stubs.tsx"),
		"app/features/notifications/NotificationsProvider": stub("stubs.tsx"),
		"app/features/global-status/GlobalStatusProvider": stub("stubs.tsx"),
		"app/features/layout/LayoutDataProvider": stub("stubs.tsx"),
		"app/features/voice/components/VoiceCallHost": stub("stubs.tsx"),
		"app/features/translate/components/TranslationPreview": stub("stubs.tsx"),
		"app/features/layout/core/layout.server": stub("stubs.server.ts"),
		"app/features/chat/chat-room-list.server": stub("stubs.server.ts"),
	}).map(([real, standIn]) => [path.join(ROOT, real), standIn]),
);

export function reactStandInShell(): Plugin {
	return {
		name: "measure-react-stand-in-shell",
		enforce: "pre",
		async resolveId(source, importer, options) {
			if (!importer || withoutQuery(importer) !== ROOT_ROUTE) return null;

			const resolved = await this.resolve(source, importer, {
				...options,
				skipSelf: true,
			});
			if (!resolved) return null;

			const standIn = STUBS.get(
				withoutQuery(resolved.id).replace(/\.(tsx?|jsx?)$/, ""),
			);

			return standIn ?? resolved;
		},
	};
}

function withoutQuery(id: string) {
	return id.split("?")[0];
}
