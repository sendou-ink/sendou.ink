/** hh:mm:ss for positions in a session or file, CSV cells and scan progress. */
export function formatTime(t: number): string {
	const total = Math.max(0, Math.floor(t));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** h:mm:ss with no leading zero hour, and m:ss under an hour ("1:02:10", "3:05"). */
export function formatPosition(t: number): string {
	const total = Math.max(0, Math.floor(t));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	return h > 0
		? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
		: `${m}:${String(s).padStart(2, "0")}`;
}

/** the match timer's M:SS (215 → "3:35") */
export function formatClock(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${String(s).padStart(2, "0")}`;
}
