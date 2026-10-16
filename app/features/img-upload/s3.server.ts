import { isIP } from "node:net";
import { S3 } from "@aws-sdk/client-s3";
import { ServerConfig } from "~/config.server";

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

const CONTENT_TYPES: Record<string, string> = {
	avif: "image/avif",
	gif: "image/gif",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
};

/** Uploads a publicly readable file to the S3 compatible object storage bucket under `fileName` */
export async function uploadToS3(
	data: Uint8Array<ArrayBuffer>,
	fileName: string,
) {
	const { endpoint, accessKey, secret, region, bucket } = ServerConfig.storage;
	const url = objectUrl({ endpoint, bucket, key: fileName });
	const extension = fileName.split(".").pop() ?? "";

	const headers: Record<string, string> = {
		"content-type": CONTENT_TYPES[extension] ?? "application/octet-stream",
		host: url.host,
		"x-amz-acl": "public-read",
		"x-amz-content-sha256": await sha256Hex(data),
		"x-amz-date": amzDate(new Date()),
	};
	headers.authorization = await authorizationHeader({
		method: "PUT",
		url,
		headers,
		accessKey,
		secret,
		region,
	});

	const { host: _host, ...requestHeaders } = headers;
	const response = await fetch(url, {
		method: "PUT",
		headers: requestHeaders,
		body: data,
	});
	if (!response.ok) {
		throw new Error(
			`Uploading ${fileName} failed with ${response.status}: ${await response.text()}`,
		);
	}
}

/** AWS Signature Version 4 `Authorization` header for a request without a query string, signing every header passed in `headers` (which must include `x-amz-date` and `x-amz-content-sha256`) */
export async function authorizationHeader({
	method,
	url,
	headers,
	accessKey,
	secret,
	region,
}: {
	method: string;
	url: URL;
	headers: Record<string, string>;
	accessKey: string;
	secret: string;
	region: string;
}) {
	const sortedHeaders = Object.entries(headers)
		.map(([name, value]) => [name.toLowerCase(), value.trim()] as const)
		.sort(([a], [b]) => (a < b ? -1 : 1));
	const signedHeaders = sortedHeaders.map(([name]) => name).join(";");
	const date = headers["x-amz-date"];
	const scope = `${date.slice(0, 8)}/${region}/s3/aws4_request`;

	const canonicalRequest = [
		method,
		url.pathname,
		"",
		sortedHeaders.map(([name, value]) => `${name}:${value}\n`).join(""),
		signedHeaders,
		headers["x-amz-content-sha256"],
	].join("\n");
	const stringToSign = [
		"AWS4-HMAC-SHA256",
		date,
		scope,
		await sha256Hex(new TextEncoder().encode(canonicalRequest)),
	].join("\n");

	let signingKey = new TextEncoder().encode(`AWS4${secret}`).buffer;
	for (const part of scope.split("/")) {
		signingKey = await hmac(signingKey, part);
	}
	const signature = toHex(await hmac(signingKey, stringToSign));

	return `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

/** Virtual-hosted style (`bucket.host/key`) like the AWS SDK, path style for IP address endpoints */
function objectUrl({
	endpoint,
	bucket,
	key,
}: {
	endpoint: string;
	bucket: string;
	key: string;
}) {
	const url = new URL(endpoint);
	const encodedKey = key.split("/").map(encodeRfc3986).join("/");

	if (isIP(url.hostname)) {
		url.pathname = `/${bucket}/${encodedKey}`;
	} else {
		url.hostname = `${bucket}.${url.hostname}`;
		url.pathname = `/${encodedKey}`;
	}

	return url;
}

function encodeRfc3986(value: string) {
	return encodeURIComponent(value).replace(
		/[!'()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

function amzDate(date: Date) {
	return date.toISOString().replace(/[-:]|\.\d{3}/g, "");
}

async function hmac(key: ArrayBuffer, message: string) {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		key,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return crypto.subtle.sign(
		"HMAC",
		cryptoKey,
		new TextEncoder().encode(message),
	);
}

async function sha256Hex(data: Uint8Array<ArrayBuffer>) {
	return toHex(await crypto.subtle.digest("SHA-256", data));
}

function toHex(buffer: ArrayBuffer) {
	return Buffer.from(buffer).toString("hex");
}

/** Uploads a publicly readable object that never changes under its key, so it is cached forever. */
export async function uploadImmutableToS3({
	key,
	body,
	contentType,
}: {
	key: string;
	body: Uint8Array;
	contentType: string;
}) {
	await s3Client().putObject({
		Bucket: ServerConfig.storage.bucket,
		Key: key,
		Body: body,
		ACL: "public-read",
		ContentType: contentType,
		CacheControl: IMMUTABLE_CACHE_CONTROL,
	});
}

export async function deleteFromS3(keys: string[]) {
	if (keys.length === 0) return;

	await s3Client().deleteObjects({
		Bucket: ServerConfig.storage.bucket,
		Delete: { Objects: keys.map((Key) => ({ Key })) },
	});
}

let client: S3 | null = null;
function s3Client() {
	if (client) return client;

	const { endpoint, accessKey, secret, region } = ServerConfig.storage;

	client = new S3({
		endpoint,
		forcePathStyle: false,
		credentials: {
			accessKeyId: accessKey,
			secretAccessKey: secret,
		},
		region,
	});

	return client;
}
