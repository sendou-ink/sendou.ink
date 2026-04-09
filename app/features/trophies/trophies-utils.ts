import { gzip, ungzip } from "pako";
import type { Role } from "~/modules/permissions/types";

export function canReviewTrophies(user?: { roles: Array<Role> } | null) {
	if (!user) return false;

	return user.roles.includes("STAFF") || user.roles.includes("QA");
}

export function compressTrophyModel(model: string) {
	const compressed = gzip(model);
	let binary = "";
	for (const byte of compressed) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

export function decompressTrophyModel(modelBase64: string) {
	const binary = atob(modelBase64);
	const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
	return ungzip(bytes, { to: "string" });
}
