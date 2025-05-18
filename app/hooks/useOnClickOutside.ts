import * as React from "react";

/** @link https://usehooks.com/useOnClickOutside/ */
export function useOnClickOutside<T extends HTMLElement = HTMLElement>(
	ref: React.RefObject<T>,
	handler: (event: MouseEvent | TouchEvent) => void,
) {
	React.useEffect(() => {
		const listener = (event: MouseEvent | TouchEvent) => {
			if (!ref.current || ref.current.contains(event.target as Node)) {
				return;
			}
			handler(event);
		};
		document.addEventListener("mousedown", listener);
		document.addEventListener("touchstart", listener);
		return () => {
			document.removeEventListener("mousedown", listener);
			document.removeEventListener("touchstart", listener);
		};
	}, [ref, handler]);
}
