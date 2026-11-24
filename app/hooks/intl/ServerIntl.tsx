import * as React from "react";

/** What the server knows of how the viewer's browser formats dates, so the server render can format them the same way. */
export interface ServerIntl {
	/** Reported by the browser in a cookie, `null` on a device's very first document request. */
	timezone: string | null;
	/** Language tags of the `Accept-Language` header, most preferred first. */
	acceptedLanguages: string[];
}

const ServerIntlContext = React.createContext<ServerIntl | undefined>(
	undefined,
);

export function ServerIntlProvider({
	value,
	children,
}: {
	value: ServerIntl | undefined;
	children: React.ReactNode;
}) {
	return <ServerIntlContext value={value}>{children}</ServerIntlContext>;
}

/** The viewer's date formatting as known on the server, `undefined` outside the app's root (e.g. a component test). */
export function useServerIntl() {
	return React.useContext(ServerIntlContext);
}
