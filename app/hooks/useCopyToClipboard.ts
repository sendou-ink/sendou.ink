import * as React from "react";

const COPY_SUCCESS_DURATION_MS = 2000;

/**
 * Copies a string to the clipboard and exposes `copySuccess`, which stays
 * `true` for a short while after a successful copy so a confirmation (e.g. a
 * checkmark) can be flashed. `reset` clears `copySuccess` immediately.
 */
export function useCopyToClipboard(): {
	copyToClipboard: (value: string) => void;
	copySuccess: boolean;
	reset: () => void;
} {
	const { copySuccess, flashCopySuccess, reset } = useCopySuccessFlash();

	const copyToClipboard = (value: string) => {
		if (!value) return;

		navigator.clipboard.writeText(value).then(flashCopySuccess, () => {});
	};

	return { copyToClipboard, copySuccess, reset };
}

/**
 * Copies a .png image to the clipboard, exposing `copySuccess` like {@link useCopyToClipboard}.
 * The image is taken as a promise rather than a blob because Safari only allows the write while
 * the click that started it is still being handled, so awaiting the image first would break it.
 */
export function useCopyPngToClipboard(): {
	copyPngToClipboard: (png: Promise<Blob>) => Promise<void>;
	copySuccess: boolean;
} {
	const { copySuccess, flashCopySuccess } = useCopySuccessFlash();

	const copyPngToClipboard = async (png: Promise<Blob>) => {
		try {
			await navigator.clipboard.write([
				new ClipboardItem({ "image/png": png }),
			]);
			flashCopySuccess();
		} catch {}
	};

	return { copyPngToClipboard, copySuccess };
}

function useCopySuccessFlash() {
	const [copySuccess, setCopySuccess] = React.useState(false);

	React.useEffect(() => {
		if (!copySuccess) return;

		const timeout = setTimeout(
			() => setCopySuccess(false),
			COPY_SUCCESS_DURATION_MS,
		);
		return () => clearTimeout(timeout);
	}, [copySuccess]);

	return {
		copySuccess,
		flashCopySuccess: () => setCopySuccess(true),
		reset: () => setCopySuccess(false),
	};
}
