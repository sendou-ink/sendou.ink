import * as React from "react";

/**
 * Runs `fn` once `ms` has elapsed without any value in `deps` changing. The
 * timer is (re)started on mount and whenever `ms` or a value in `deps` changes.
 *
 * Uses the latest-ref pattern instead of `useEffectEvent`: effect events don't
 * update past the first render inside `React.memo`/`React.forwardRef` wrapped
 * components (React 19.2), which would silently break callers.
 */
export function useDebounce(
	fn: () => void,
	ms = 0,
	deps: React.DependencyList = [],
) {
	const callback = React.useRef(fn);
	callback.current = fn;

	React.useEffect(() => {
		const timeout = setTimeout(() => callback.current(), ms);
		return () => clearTimeout(timeout);
	}, [ms, ...deps]);
}
