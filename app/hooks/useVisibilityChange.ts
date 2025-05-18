import React from "react";

// "initial" = user has not tabbed out yet
type Visibility = "initial" | DocumentVisibilityState;

/** Track the `visibilitychange` event: The `visibilitychange` event is fired at the document when the contents of its tab have become visible or have been hidden. */
export function useVisibilityChange() {
	const [visible, setVisible] = React.useState<Visibility>("initial");

	React.useEffect(() => {
		function handleVisibilityChange() {
			setVisible(document.visibilityState);
		}

		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, []);

	return visible;
}
