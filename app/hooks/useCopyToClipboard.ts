import * as React from "react";

const COPY_SUCCESS_DURATION_MS = 2000;

/** `copySuccess` stays `true` for a short while after a copy so a confirmation can be flashed; `reset` clears it. */
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

/** Like {@link useCopyToClipboard} for a png. Takes a promise since Safari only allows the write during the click that started it. */
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
