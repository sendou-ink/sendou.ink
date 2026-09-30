import * as React from "react";

/**
 * Runs `fn` once `ms` has elapsed without `deps` changing. Uses a latest-ref instead of `useEffectEvent`,
 * which doesn't update past the first render inside `React.memo`/`forwardRef` components (React 19.2).
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
