import { logger } from "~/utils/logger";

/** How long to wait before connecting again after OBS closed the connection or wasn't reachable. */
const RECONNECT_DELAY_MS = 5_000;

/** obs-websocket v5 opcodes, see https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md */
const OP = {
	HELLO: 0,
	IDENTIFY: 1,
	IDENTIFIED: 2,
	REQUEST: 6,
	REQUEST_RESPONSE: 7,
} as const;

/** OBS closes the connection with this code when the password is wrong, trying again won't help. */
const AUTHENTICATION_FAILED_CLOSE_CODE = 4009;

/** A connection to the obs-websocket server of the OBS on this machine, kept open until closed. */
export interface ObsConnection {
	/** Sends the request if identified, otherwise drops it: `onIdentified` is the time to send the current state. */
	request: (requestType: string, requestData: Record<string, unknown>) => void;
	close: () => void;
}

/**
 * Connects to the obs-websocket server (OBS 28+) of the OBS on this machine, as the OBS browser source page runs in it.
 * Connects again whenever the connection drops or OBS isn't reachable, except when the password is wrong. Calls
 * `onIdentified` every time it is ready for requests.
 */
export function connect({
	port,
	password,
	onIdentified,
}: {
	port: number;
	password: string | null;
	onIdentified: () => void;
}): ObsConnection {
	let socket: WebSocket | null = null;
	let isIdentified = false;
	let isClosed = false;
	let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
	let lastRequestId = 0;

	const open = () => {
		const current = new WebSocket(`ws://127.0.0.1:${port}`);
		socket = current;

		current.onmessage = async (event) => {
			const message = parseMessage(event.data);
			if (!message) return;

			switch (message.op) {
				case OP.HELLO: {
					current.send(
						JSON.stringify({
							op: OP.IDENTIFY,
							d: await identifyData({
								password,
								authentication: message.d.authentication,
							}),
						}),
					);
					break;
				}
				case OP.IDENTIFIED: {
					isIdentified = true;
					onIdentified();
					break;
				}
				case OP.REQUEST_RESPONSE: {
					if (!message.d.requestStatus?.result) {
						logger.warn(
							`OBS ${message.d.requestType} failed: ${message.d.requestStatus?.comment ?? message.d.requestStatus?.code}`,
						);
					}
					break;
				}
			}
		};

		current.onclose = (event) => {
			isIdentified = false;
			if (isClosed || socket !== current) return;

			if (event.code === AUTHENTICATION_FAILED_CLOSE_CODE) {
				logger.warn("OBS WebSocket password is wrong");
				return;
			}

			reconnectTimeout = setTimeout(open, RECONNECT_DELAY_MS);
		};
	};

	open();

	return {
		request: (requestType, requestData) => {
			if (!socket || !isIdentified) return;

			lastRequestId++;
			socket.send(
				JSON.stringify({
					op: OP.REQUEST,
					d: { requestType, requestId: String(lastRequestId), requestData },
				}),
			);
		},
		close: () => {
			isClosed = true;
			clearTimeout(reconnectTimeout);
			socket?.close();
		},
	};
}

/**
 * The authentication string of obs-websocket's Identify: `base64(sha256(base64(sha256(password + salt)) + challenge))`.
 * @internal
 */
export async function authenticationString({
	password,
	salt,
	challenge,
}: {
	password: string;
	salt: string;
	challenge: string;
}) {
	const secret = await sha256Base64(password + salt);

	return sha256Base64(secret + challenge);
}

async function identifyData({
	password,
	authentication,
}: {
	password: string | null;
	authentication?: { challenge: string; salt: string };
}) {
	// no events wanted, only answers to requests
	const base = { rpcVersion: 1, eventSubscriptions: 0 };
	if (!authentication) return base;

	return {
		...base,
		authentication: await authenticationString({
			password: password ?? "",
			...authentication,
		}),
	};
}

async function sha256Base64(value: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(value),
	);

	return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

type ObsMessage =
	| {
			op: typeof OP.HELLO;
			d: { authentication?: { challenge: string; salt: string } };
	  }
	| { op: typeof OP.IDENTIFIED; d: unknown }
	| {
			op: typeof OP.REQUEST_RESPONSE;
			d: {
				requestType: string;
				requestStatus?: { result: boolean; code: number; comment?: string };
			};
	  };

function parseMessage(data: unknown): ObsMessage | null {
	if (typeof data !== "string") return null;

	try {
		return JSON.parse(data) as ObsMessage;
	} catch {
		return null;
	}
}
