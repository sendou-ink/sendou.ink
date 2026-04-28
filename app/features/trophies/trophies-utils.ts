import { deflateRaw, inflateRaw } from "pako";
import { useEffect, useRef, useState } from "react";
import type { Role } from "~/modules/permissions/types";

export function canReviewTrophies(user?: { roles: Array<Role> } | null) {
	if (!user) return false;

	return user.roles.includes("STAFF") || user.roles.includes("QA");
}

export function canEditTrophy(
	user: { id: number; roles: Array<Role> } | null | undefined,
	trophy: { managerId: number | null },
) {
	if (!user) return false;
	if (canReviewTrophies(user)) return true;
	return trophy.managerId === user.id;
}

export function compressTrophyModel(model: string) {
	const compressed = deflateRaw(model);
	let binary = "";
	for (const byte of compressed) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

export function decompressTrophyModel(modelBase64: string) {
	const binary = atob(modelBase64);
	const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
	return inflateRaw(bytes, { to: "string" });
}

export function useProgressiveRender(total: number, resetKey: string) {
	const [count, setCount] = useState(1);
	const prevKeyRef = useRef(resetKey);

	if (prevKeyRef.current !== resetKey) {
		prevKeyRef.current = resetKey;
		setCount(1);
	}

	useEffect(() => {
		if (count >= total) return;

		const id = requestAnimationFrame(() => {
			setCount((c) => c + 1);
		});

		return () => cancelAnimationFrame(id);
	}, [count, total]);

	return count;
}
