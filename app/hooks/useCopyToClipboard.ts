import * as React from "react";

const COPY_SUCCESS_DURATION_MS = 2000;

/**
 * Copies a string to the clipboard and exposes `copySuccess`, which stays
 * `true` for a short while after a successful copy so a confirmation (e.g. a
 * checkmark) can be flashed.
 */
export function useCopyToClipboard(): {
	copyToClipboard: (value: string) => void;
	copySuccess: boolean;
} {
	const [copySuccess, setCopySuccess] = React.useState(false);

	React.useEffect(() => {
		if (!copySuccess) return;

		const timeout = setTimeout(
			() => setCopySuccess(false),
			COPY_SUCCESS_DURATION_MS,
		);
		return () => clearTimeout(timeout);
	}, [copySuccess]);

	const copyToClipboard = (value: string) => {
		if (!value) return;

		navigator.clipboard.writeText(value).then(
			() => setCopySuccess(true),
			() => {},
		);
	};

	return { copyToClipboard, copySuccess };
}
