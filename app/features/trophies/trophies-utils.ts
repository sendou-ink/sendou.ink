import { addWeeks } from "date-fns";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Role } from "~/modules/permissions/types";
import { compressToBase64, decompressFromBase64 } from "~/utils/compression";
import { databaseTimestampToDate } from "~/utils/dates";
import {
	SUPPORTER_TROPHY_CODE,
	TROPHIES_RELEASED,
	TROPHY_UPCOMING_HIGHLIGHT_WEEKS,
	XP_TROPHY_CODE_PREFIX,
} from "./trophies-constants";

const TERMS_AGREED_SESSION_STORAGE_KEY = "trophyTermsAgreed";

const DECOMPRESSED_MODEL_CACHE_MAX_CHARS = 16 * 1024 * 1024;

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

// Feature flag
export function canAccessTrophies(user?: { roles: Array<Role> } | null) {
	if (TROPHIES_RELEASED) return true;
	if (!user) return false;

	return user.roles.includes("ADMIN") || user.roles.includes("QA");
}

export function canReviewTrophies(user?: { roles: Array<Role> } | null) {
	if (!user) return false;

	return user.roles.includes("STAFF") || user.roles.includes("QA");
}

export function canEditAnyTrophy(user?: { roles: Array<Role> } | null) {
	if (!user) return false;

	return user.roles.includes("ADMIN");
}

export function hasUpcomingTournamentSoon(
	upcomingTournamentAt: number | null | undefined,
) {
	if (!upcomingTournamentAt) return false;

	const startTime = databaseTimestampToDate(upcomingTournamentAt);
	const now = new Date();

	return (
		startTime > now &&
		startTime <= addWeeks(now, TROPHY_UPCOMING_HIGHLIGHT_WEEKS)
	);
}

export function compressTrophyModel(model: string) {
	return compressToBase64(model);
}

const decompressedModelCache = new Map<string, string | null>();
let decompressedModelCacheChars = 0;

export function decompressTrophyModel(modelBase64: string) {
	const cached = decompressedModelCache.get(modelBase64);
	if (cached !== undefined) {
		decompressedModelCache.delete(modelBase64);
		decompressedModelCache.set(modelBase64, cached);
		return cached;
	}

	const decompressed = decompressFromBase64(modelBase64);
	decompressedModelCache.set(modelBase64, decompressed);
	decompressedModelCacheChars += cacheEntryChars(modelBase64, decompressed);

	for (const [oldestKey, oldestValue] of decompressedModelCache) {
		if (
			decompressedModelCacheChars <= DECOMPRESSED_MODEL_CACHE_MAX_CHARS ||
			decompressedModelCache.size === 1
		) {
			break;
		}

		decompressedModelCache.delete(oldestKey);
		decompressedModelCacheChars -= cacheEntryChars(oldestKey, oldestValue);
	}

	return decompressed;
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

function cacheEntryChars(key: string, value: string | null) {
	return key.length + (value?.length ?? 0);
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
