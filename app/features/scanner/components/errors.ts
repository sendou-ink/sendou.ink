/** Turns capture/decode/worker failures into copy a player can act on. */
export function describeError(error: unknown): string {
	if (error instanceof DOMException) {
		switch (error.name) {
			case "NotAllowedError":
				return "Camera access was denied — allow it in the browser's site settings and try again";
			case "NotFoundError":
				return "No video input was found — plug in the capture card or start OBS Virtual Camera";
			case "NotReadableError":
				return "The video input is in use by another app";
			case "OverconstrainedError":
				return "The selected source is not available — pick another one in Settings";
			case "InvalidStateError":
				return "This file could not be decoded as video";
			case "QuotaExceededError":
				return "The browser's storage is full — delete some clips or sessions";
		}
	}
	const message = error instanceof Error ? error.message : String(error);
	if (/Failed to fetch|NetworkError/i.test(message)) {
		return "The detection models could not be downloaded — check the connection and try again";
	}
	if (
		/cannot decode|no video track|createImageBitmap|not usable/i.test(message)
	) {
		return "This file could not be decoded as video";
	}
	return message;
}
