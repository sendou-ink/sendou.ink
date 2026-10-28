import { describe, expect, test } from "bun:test";
import * as WebPushCrypto from "./webPushCrypto";

// https://www.rfc-editor.org/rfc/rfc8291#appendix-A
const RFC_8291_EXAMPLE = {
	plaintext: "When I grow up, I want to be a watermelon",
	applicationServerPrivateKey: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
	applicationServerPublicKey:
		"BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
	userAgentPublicKey:
		"BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
	authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
	salt: "DGv6ra1nlYgDCS1FRnbzlw",
	pushMessage:
		"DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("WebPushCrypto.encryptPayload", () => {
	test("matches the RFC 8291 example push message", async () => {
		const publicKeyBytes = fromBase64Url(
			RFC_8291_EXAMPLE.applicationServerPublicKey,
		);
		const localKeyPair = {
			privateKey: await crypto.subtle.importKey(
				"jwk",
				{
					...jwkCoordinates(publicKeyBytes),
					d: RFC_8291_EXAMPLE.applicationServerPrivateKey,
				},
				{ name: "ECDH", namedCurve: "P-256" },
				false,
				["deriveBits"],
			),
			publicKey: await crypto.subtle.importKey(
				"raw",
				publicKeyBytes,
				{ name: "ECDH", namedCurve: "P-256" },
				true,
				[],
			),
		};

		const encrypted = await WebPushCrypto.encryptPayload({
			payload: RFC_8291_EXAMPLE.plaintext,
			keys: {
				p256dh: RFC_8291_EXAMPLE.userAgentPublicKey,
				auth: RFC_8291_EXAMPLE.authSecret,
			},
			salt: fromBase64Url(RFC_8291_EXAMPLE.salt),
			localKeyPair,
		});

		expect(toBase64Url(encrypted)).toBe(RFC_8291_EXAMPLE.pushMessage);
	});

	test("throws when the payload does not fit in a single record", async () => {
		await expect(
			WebPushCrypto.encryptPayload({
				payload: "a".repeat(4096),
				keys: {
					p256dh: RFC_8291_EXAMPLE.userAgentPublicKey,
					auth: RFC_8291_EXAMPLE.authSecret,
				},
			}),
		).rejects.toThrow("Push payload too large");
	});
});

describe("WebPushCrypto.vapidAuthorization", () => {
	test("signs a JWT verifiable with the VAPID public key", async () => {
		const keyPair = await crypto.subtle.generateKey(
			{ name: "ECDSA", namedCurve: "P-256" },
			true,
			["sign", "verify"],
		);
		const publicKey = toBase64Url(
			new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey)),
		);
		const { d } = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

		const authorization = await WebPushCrypto.vapidAuthorization({
			audience: "https://push.example.com",
			subject: "mailto:admin@example.com",
			publicKey,
			privateKey: d!,
			nowSeconds: 1_000_000,
		});

		const [, token, k] = authorization.match(/^vapid t=(.+), k=(.+)$/)!;
		const [header, payload, signature] = token.split(".");

		expect(k).toBe(publicKey);
		expect(decodeJson(header)).toEqual({ typ: "JWT", alg: "ES256" });
		expect(decodeJson(payload)).toEqual({
			aud: "https://push.example.com",
			exp: 1_000_000 + 12 * 60 * 60,
			sub: "mailto:admin@example.com",
		});
		expect(
			await crypto.subtle.verify(
				{ name: "ECDSA", hash: "SHA-256" },
				keyPair.publicKey,
				fromBase64Url(signature),
				new TextEncoder().encode(`${header}.${payload}`),
			),
		).toBe(true);
	});
});

function jwkCoordinates(publicKeyBytes: Uint8Array) {
	return {
		kty: "EC",
		crv: "P-256",
		x: toBase64Url(publicKeyBytes.subarray(1, 33)),
		y: toBase64Url(publicKeyBytes.subarray(33, 65)),
	};
}

function decodeJson(base64Url: string) {
	return JSON.parse(new TextDecoder().decode(fromBase64Url(base64Url)));
}

function fromBase64Url(value: string) {
	return new Uint8Array(Buffer.from(value, "base64url"));
}

function toBase64Url(bytes: Uint8Array) {
	return Buffer.from(bytes).toString("base64url");
}
