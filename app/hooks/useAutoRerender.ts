import * as React from "react";

/**
 * Forces the component to rerender periodically. Returns the current `Date` at
 * the time of the latest tick — callers should consume this value (e.g. pass
 * it to date-fns) so React Compiler can see the state is observable and won't
 * memoize the rerender away.
 */
export function useAutoRerender(every?: "second" | "ten seconds"): Date {
	const [now, setNow] = React.useState(() => new Date());

	React.useEffect(() => {
		const intervalTime = !every || every === "second" ? 1000 : 10000;

		const interval = setInterval(() => {
			setNow(new Date());
		}, intervalTime);

		return () => {
			clearInterval(interval);
		};
	}, [every]);

	return now;
}

// xxx: react compiler thingy: use `now` everywhere this component is used. currently i guess those are not rendering
