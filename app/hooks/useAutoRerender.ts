import * as React from "react";

interface AutoRerenderOptions {
	alignTo: Date;
}

/**
 * Forces the component to rerender periodically. Returns the current `Date` at
 * the time of the latest tick — callers should consume this value (e.g. pass
 * it to date-fns) so React Compiler can see the state is observable and won't
 * memoize the rerender away.
 *
 * When `every` is `"minute"`, ticks are aligned to the `alignTo` reference
 * time via a self-rescheduling `setTimeout`, so the component rerenders at
 * exactly `alignTo + N*60s` rather than at arbitrary offsets from mount.
 */
export function useAutoRerender(): Date;
export function useAutoRerender(every: "second" | "ten seconds"): Date;
export function useAutoRerender(
	every: "minute",
	options: AutoRerenderOptions,
): Date;
export function useAutoRerender(
	every?: "second" | "ten seconds" | "minute",
	options?: AutoRerenderOptions,
): Date {
	const [now, setNow] = React.useState(() => new Date());
	const alignToMs = options?.alignTo.getTime();

	React.useEffect(() => {
		if (every === "minute") {
			let timeout: ReturnType<typeof setTimeout>;

			const scheduleNext = () => {
				const elapsed = Date.now() - alignToMs!;
				const remainder = ((elapsed % 60_000) + 60_000) % 60_000;
				timeout = setTimeout(() => {
					setNow(new Date());
					scheduleNext();
				}, 60_000 - remainder);
			};

			scheduleNext();

			return () => {
				clearTimeout(timeout);
			};
		}

		const intervalTime = !every || every === "second" ? 1000 : 10000;

		const interval = setInterval(() => {
			setNow(new Date());
		}, intervalTime);

		return () => {
			clearInterval(interval);
		};
	}, [every, alignToMs]);

	return now;
}
