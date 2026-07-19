import { deflateRaw, inflateRaw } from "pako";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Role } from "~/modules/permissions/types";
import {
	SUPPORTER_TROPHY_CODE,
	XP_TROPHY_CODE_PREFIX,
} from "./trophies-constants";

const TERMS_AGREED_SESSION_STORAGE_KEY = "trophyTermsAgreed";

type SpecialTrophyKind = { type: "supporter" } | { type: "xp"; value: number };

export function parseSpecialTrophyCode(
	code: string | null | undefined,
): SpecialTrophyKind | null {
	if (!code) return null;
	if (code === SUPPORTER_TROPHY_CODE) return { type: "supporter" };

	if (code.startsWith(XP_TROPHY_CODE_PREFIX)) {
		const value = Number(code.slice(XP_TROPHY_CODE_PREFIX.length));
		if (Number.isFinite(value)) return { type: "xp", value };
	}

	return null;
}

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

export function useTrophyTermsAgreement() {
	const hasAgreedToTerms = useSyncExternalStore(
		subscribeToTermsAgreed,
		getTermsAgreedSnapshot,
		getTermsAgreedServerSnapshot,
	);

	const agreeToTerms = () => {
		sessionStorage.setItem(TERMS_AGREED_SESSION_STORAGE_KEY, "true");
		for (const listener of termsAgreedListeners) {
			listener();
		}
	};

	return { hasAgreedToTerms, agreeToTerms };
}

const termsAgreedListeners = new Set<() => void>();

function subscribeToTermsAgreed(listener: () => void) {
	termsAgreedListeners.add(listener);
	return () => termsAgreedListeners.delete(listener);
}

function getTermsAgreedSnapshot() {
	return sessionStorage.getItem(TERMS_AGREED_SESSION_STORAGE_KEY) === "true";
}

function getTermsAgreedServerSnapshot() {
	return false;
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
