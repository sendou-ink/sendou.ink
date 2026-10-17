import type { NotificationSubscription } from "~/db/tables-json";

const RECORD_SIZE = 4096;
const GCM_TAG_LENGTH_BYTES = 16;
const LAST_RECORD_DELIMITER = 0x02;
const VAPID_JWT_LIFETIME_SECONDS = 12 * 60 * 60;

const textEncoder = new TextEncoder();

/**
 * Encrypts a push message payload for the subscription's user agent using the "aes128gcm" content encoding (RFC 8291 & RFC 8188).
 * Returns the request body: the content coding header followed by a single encrypted record.
 *
 * `salt` and `localKeyPair` are randomly generated unless given.
 */
export async function encryptPayload({
	payload,
	keys,
	salt = crypto.getRandomValues(new Uint8Array(16)),
	localKeyPair,
}: {
	payload: string;
	keys: NotificationSubscription["keys"];
	salt?: Uint8Array<ArrayBuffer>;
	localKeyPair?: CryptoKeyPair;
}) {
	const plaintext = textEncoder.encode(payload);
	if (plaintext.length + 1 + GCM_TAG_LENGTH_BYTES > RECORD_SIZE) {
		throw new Error(
			`Push payload too large: ${plaintext.length} bytes, max ${RECORD_SIZE - 1 - GCM_TAG_LENGTH_BYTES}`,
		);
	}

	const userAgentPublicKeyBytes = fromBase64Url(keys.p256dh);
	const authSecret = fromBase64Url(keys.auth);

	const userAgentPublicKey = await crypto.subtle.importKey(
		"raw",
		userAgentPublicKeyBytes,
		{ name: "ECDH", namedCurve: "P-256" },
		false,
		[],
	);
	const { privateKey: localPrivateKey, publicKey: localPublicKey } =
		localKeyPair ??
		(await crypto.subtle.generateKey(
			{ name: "ECDH", namedCurve: "P-256" },
			true,
			["deriveBits"],
		));
	const localPublicKeyBytes = new Uint8Array(
		await crypto.subtle.exportKey("raw", localPublicKey),
	);

	const sharedSecret = await crypto.subtle.deriveBits(
		{ name: "ECDH", public: userAgentPublicKey },
		localPrivateKey,
		256,
	);

	const inputKeyingMaterial = await hkdf({
		salt: authSecret,
		inputKeyingMaterial: sharedSecret,
		info: concatBytes(
			textEncoder.encode("WebPush: info\0"),
			userAgentPublicKeyBytes,
			localPublicKeyBytes,
		),
		lengthBytes: 32,
	});
	const contentEncryptionKey = await hkdf({
		salt,
		inputKeyingMaterial,
		info: textEncoder.encode("Content-Encoding: aes128gcm\0"),
		lengthBytes: 16,
	});
	const nonce = await hkdf({
		salt,
		inputKeyingMaterial,
		info: textEncoder.encode("Content-Encoding: nonce\0"),
		lengthBytes: 12,
	});

	const aesKey = await crypto.subtle.importKey(
		"raw",
		contentEncryptionKey,
		"AES-GCM",
		false,
		["encrypt"],
	);
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: nonce },
		aesKey,
		concatBytes(plaintext, Uint8Array.of(LAST_RECORD_DELIMITER)),
	);

	const recordSize = new Uint8Array(4);
	new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE);

	return concatBytes(
		salt,
		recordSize,
		Uint8Array.of(localPublicKeyBytes.length),
		localPublicKeyBytes,
		new Uint8Array(ciphertext),
	);
}

/**
 * Creates the value of the `Authorization` header that identifies the application server to the push service (VAPID, RFC 8292).
 *
 * @param audience - origin of the push service e.g. `https://fcm.googleapis.com`
 * @param subject - contact of the application server, a `mailto:` or `https:` URL
 * @param publicKey - VAPID public key, base64url encoded uncompressed P-256 point
 * @param privateKey - VAPID private key, base64url encoded P-256 scalar
 */
export async function vapidAuthorization({
	audience,
	subject,
	publicKey,
	privateKey,
	nowSeconds = Math.floor(Date.now() / 1000),
}: {
	audience: string;
	subject: string;
	publicKey: string;
	privateKey: string;
	nowSeconds?: number;
}) {
	const publicKeyBytes = fromBase64Url(publicKey);
	const signingKey = await crypto.subtle.importKey(
		"jwk",
		{
			kty: "EC",
			crv: "P-256",
			x: toBase64Url(publicKeyBytes.subarray(1, 33)),
			y: toBase64Url(publicKeyBytes.subarray(33, 65)),
			d: privateKey,
		},
		{ name: "ECDSA", namedCurve: "P-256" },
		false,
		["sign"],
	);

	const unsignedToken = [
		{ typ: "JWT", alg: "ES256" },
		{
			aud: audience,
			exp: nowSeconds + VAPID_JWT_LIFETIME_SECONDS,
			sub: subject,
		},
	]
		.map((part) => toBase64Url(textEncoder.encode(JSON.stringify(part))))
		.join(".");
	const signature = await crypto.subtle.sign(
		{ name: "ECDSA", hash: "SHA-256" },
		signingKey,
		textEncoder.encode(unsignedToken),
	);

	return `vapid t=${unsignedToken}.${toBase64Url(new Uint8Array(signature))}, k=${publicKey}`;
}

async function hkdf({
	salt,
	inputKeyingMaterial,
	info,
	lengthBytes,
}: {
	salt: Uint8Array<ArrayBuffer>;
	inputKeyingMaterial: ArrayBuffer | Uint8Array<ArrayBuffer>;
	info: Uint8Array<ArrayBuffer>;
	lengthBytes: number;
}) {
	const key = await crypto.subtle.importKey(
		"raw",
		inputKeyingMaterial,
		"HKDF",
		false,
		["deriveBits"],
	);
	return new Uint8Array(
		await crypto.subtle.deriveBits(
			{ name: "HKDF", hash: "SHA-256", salt, info },
			key,
			lengthBytes * 8,
		),
	);
}

function concatBytes(...parts: Uint8Array[]) {
	const result = new Uint8Array(
		parts.reduce((total, part) => total + part.length, 0),
	);
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
}

function fromBase64Url(value: string) {
	return new Uint8Array(Buffer.from(value, "base64url"));
}

function toBase64Url(bytes: Uint8Array) {
	return Buffer.from(bytes).toString("base64url");
}
