import { useEffect } from "react";
import { makeTitle } from "~/utils/strings";

// xxx: retire this?
/** Set title on mount. Used for showing a translated title on pages without loader.  */
export function useSetTitle(title: string) {
	useEffect(() => {
		document.title = makeTitle(title);
	}, [title]);
}
