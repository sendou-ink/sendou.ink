/**
 * A visit is one page load of the scanner. A file's clips live for the visit
 * that cut them (the file is on disk), so each visit holds a Web Lock named
 * after it until its tab closes, and the next page load drops the VoD clips
 * of visits no tab holds any more — never those of a scanner open elsewhere.
 */
import { deleteVodClips, type ScannerClip } from "../store/clips";

const VISIT_LOCK_PREFIX = "scanner:visit:";

// not crypto.randomUUID(): that needs a secure context
export const VISIT_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

let visitLock: Promise<void> | null = null;

/** Holds this visit's lock for the rest of the page's life; resolves once held. */
export function holdVisitLock(): Promise<void> {
	visitLock ??= new Promise((held) => {
		if (!navigator.locks) {
			held();
			return;
		}
		void navigator.locks.request(`${VISIT_LOCK_PREFIX}${VISIT_ID}`, () => {
			held();
			return new Promise<never>(() => {});
		});
	});
	return visitLock;
}

/** Drops the VoD clips of visits no tab has open any more. */
export async function deleteClosedVisitsVodClips(): Promise<void> {
	await holdVisitLock();
	const open = await openVisits();
	await deleteVodClips(
		(clip) => clip.source.kind === "vod" && !open.has(clip.source.visit),
	);
}

/** Ids of the visits open in some tab (this one included); only this one's without Web Locks. */
async function openVisits(): Promise<Set<string>> {
	if (!navigator.locks) return new Set([VISIT_ID]);
	const { held = [] } = await navigator.locks.query();
	return new Set(
		held.flatMap((lock) =>
			lock.name?.startsWith(VISIT_LOCK_PREFIX)
				? [lock.name.slice(VISIT_LOCK_PREFIX.length)]
				: [],
		),
	);
}

/** Whether the clip was cut from file `name` during this visit. */
export function isThisVisitsVodClip(clip: ScannerClip, name: string): boolean {
	return (
		clip.source.kind === "vod" &&
		clip.source.visit === VISIT_ID &&
		clip.source.name === name
	);
}
