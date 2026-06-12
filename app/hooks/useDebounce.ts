import * as React from "react";

/**
 * Runs `fn` once `ms` has elapsed without any value in `deps` changing. The
 * timer is (re)started on mount and whenever `ms` or a value in `deps` changes.
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
