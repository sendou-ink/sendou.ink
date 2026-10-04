import { shortNanoid } from "~/utils/id";

const IDLE_AFTER_MS = 3 * 60 * 1000;
const LAST_ACTIVE_TAB_KEY = "chat__last-active-tab";
const LAST_ACTIVE_TAB_WRITE_INTERVAL_MS = 5_000;
const ACTIVITY_EVENTS = [
	"pointerdown",
	"pointermove",
	"keydown",
	"wheel",
	"touchstart",
] as const;

interface AttentionEnvironment {
	document: Pick<Document, "visibilityState" | "hasFocus"> & EventTarget;
	window: EventTarget;
	storage: Pick<Storage, "getItem" | "setItem"> | null;
	now: () => number;
}

export type Tracker = ReturnType<typeof createTracker>;

// Whether the user is paying attention to this tab. It has to be visible, window focused, and be interacted with in the last 3 minutes
export function createTracker(
	getEnvironment: () => AttentionEnvironment,
	{ idleAfterMs = IDLE_AFTER_MS }: { idleAfterMs?: number } = {},
) {
	const tabId = shortNanoid();
	const listeners = new Set<() => void>();
	let environment: AttentionEnvironment | null = null;
	let attending = false;
	let lastActivityAt = 0;
	let lastActiveTabWrittenAt = Number.NEGATIVE_INFINITY;
	let idleTimer: ReturnType<typeof setTimeout> | null = null;

	const started = () => {
		if (environment) return environment;

		environment = getEnvironment();
		lastActivityAt = environment.now();
		for (const type of ACTIVITY_EVENTS) {
			environment.window.addEventListener(type, handleActivity, {
				passive: true,
			});
		}
		environment.window.addEventListener("focus", update);
		environment.window.addEventListener("blur", update);
		environment.document.addEventListener("visibilitychange", update);
		update();

		return environment;
	};

	function update() {
		const env = environment!;
		const next =
			env.document.visibilityState === "visible" &&
			env.document.hasFocus() &&
			env.now() - lastActivityAt < idleAfterMs;

		if (idleTimer) clearTimeout(idleTimer);
		idleTimer = next
			? setTimeout(update, lastActivityAt + idleAfterMs - env.now())
			: null;

		if (next) writeLastActiveTab(false);
		if (next === attending) return;

		attending = next;
		for (const listener of listeners) listener();
	}

	function handleActivity() {
		lastActivityAt = environment!.now();
		if (attending) {
			writeLastActiveTab(true);
		} else {
			update();
		}
	}

	function writeLastActiveTab(throttled: boolean) {
		const env = environment!;
		if (
			throttled &&
			env.now() - lastActiveTabWrittenAt < LAST_ACTIVE_TAB_WRITE_INTERVAL_MS
		) {
			return;
		}

		lastActiveTabWrittenAt = env.now();
		try {
			env.storage?.setItem(LAST_ACTIVE_TAB_KEY, tabId);
		} catch {
			// storage blocked
		}
	}

	return {
		isAttending: () => {
			started();
			return attending;
		},
		isLastActiveTab: () => {
			const env = started();
			try {
				const lastActiveTabId = env.storage?.getItem(LAST_ACTIVE_TAB_KEY);
				return !lastActiveTabId || lastActiveTabId === tabId;
			} catch {
				return true;
			}
		},
		subscribe: (listener: () => void) => {
			started();
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

export const tracker = createTracker(() => ({
	document,
	window,
	storage: browserStorage(),
	now: () => Date.now(),
}));

function browserStorage() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
