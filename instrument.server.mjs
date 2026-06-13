import * as Sentry from "@sentry/react-router";

Sentry.init({
	dsn: process.env.VITE_SENTRY_DSN,
	sendDefaultPii: false,
	enableLogs: true,
	tracesSampleRate: 0.1, // Capture 10% of the transactions

	// Set up performance monitoring
	beforeSend(event) {
		// Filter out 404s from error reporting
		if (event.exception) {
			const error = event.exception.values?.[0];
			if (
				error?.type === "NotFoundException" ||
				error?.value?.includes("404")
			) {
				return null;
			}
		}
		return event;
	},
});
