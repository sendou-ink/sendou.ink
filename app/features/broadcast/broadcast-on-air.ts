/** Set on the document once its overlay is up: hydrated, with its stylesheets. The watchdog of {@link onAirGuardScript} waits for it. */
const ON_AIR_ATTRIBUTE = "data-broadcast-on-air";
/** Only a page of the app rendering the guard has it, so a gateway's or CDN's page answering 200 is not loaded. */
export const ON_AIR_GUARD_MARKER = "data-broadcast-guard";
export const OBS_TOO_OLD_ID = "broadcast-obs-too-old";
const WATCHDOG_MS = 15_000;
const RELOAD_RETRY_BASE_MS = 2_000;
const RELOAD_RETRY_MAX_MS = 60_000;

/**
 * Inline script guarding a page OBS shows, run as the document parses so it works when the app's own scripts don't.
 * ES5, so it also runs in the old browsers it checks for:
 * - a browser older than the overlay needs (OBS 30 and older) gets the "update OBS" card instead of a frozen scene
 * - a page not up within {@link WATCHDOG_MS} (a script, stylesheet or translation that failed to load, a failed
 *   loader) loads again, but only once its URL answers 200 with the app's page: until then it stays as it is, retrying
 *   with backoff, so a gateway's error page never replaces it
 */
export const onAirGuardScript = `(function () {
	var root = document.documentElement;
	var supportsCss = window.CSS && CSS.supports && CSS.supports("color", "color-mix(in srgb, red, blue)");
	if (!Array.prototype.toReversed || !supportsCss) {
		var card = document.getElementById("${OBS_TOO_OLD_ID}");
		if (card) card.hidden = false;
		return;
	}

	function reload(attempt) {
		function retry() {
			setTimeout(function () {
				reload(attempt + 1);
			}, Math.min(${RELOAD_RETRY_BASE_MS} * Math.pow(2, attempt), ${RELOAD_RETRY_MAX_MS}));
		}

		fetch(location.href, { cache: "no-store" })
			.then(function (response) {
				return response.status === 200 ? response.text() : "";
			})
			.then(function (html) {
				if (html.indexOf("${ON_AIR_GUARD_MARKER}") === -1) return retry();
				if (!root.hasAttribute("${ON_AIR_ATTRIBUTE}")) location.reload();
			}, retry);
	}

	setTimeout(function () {
		if (!root.hasAttribute("${ON_AIR_ATTRIBUTE}")) reload(0);
	}, ${WATCHDOG_MS});
})();`;

/**
 * Whether the overlay can go on air: every stylesheet the document links loaded. Marks the document for the guard's
 * watchdog when it can, otherwise the overlay stays hidden and the watchdog loads the page again.
 */
export function markOnAirIfLoaded() {
	const stylesheets = document.querySelectorAll<HTMLLinkElement>(
		'link[rel="stylesheet"]',
	);
	if (!Array.from(stylesheets).every(isStylesheetLoaded)) return false;

	document.documentElement.setAttribute(ON_AIR_ATTRIBUTE, "");
	return true;
}

/** A stylesheet that failed to load still has a sheet, an empty one or one whose rules can't be read. */
function isStylesheetLoaded(link: HTMLLinkElement) {
	// another site's rules can never be read, whether it loaded or not
	if (new URL(link.href).origin !== window.location.origin) return true;

	try {
		return (link.sheet?.cssRules.length ?? 0) > 0;
	} catch {
		return false;
	}
}
