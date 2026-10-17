import { isIP } from "node:net";
import { ServerConfig } from "~/config.server";

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const PRESIGNED_UPLOAD_EXPIRES_IN_SECONDS = 60;

const CONTENT_TYPES: Record<string, string> = {
	avif: "image/avif",
	gif: "image/gif",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
};

let client: Bun.S3Client | undefined;

/** Uploads a publicly readable file to the S3 compatible object storage bucket under `fileName` */
export async function uploadToS3(
	data: Uint8Array<ArrayBuffer>,
	fileName: string,
) {
	const extension = fileName.split(".").pop() ?? "";

	await s3Client().write(fileName, data, {
		acl: "public-read",
		type: CONTENT_TYPES[extension] ?? "application/octet-stream",
	});
}

/** Uploads a publicly readable object that never changes under its key, so it is cached forever. */
export async function uploadImmutableToS3({
	key,
	body,
	contentType,
}: {
	key: string;
	body: Uint8Array<ArrayBuffer>;
	contentType: string;
}) {
	// Bun's S3 client can't set Cache-Control, a request to a presigned URL can
	const response = await fetch(
		s3Client().presign(key, {
			method: "PUT",
			acl: "public-read",
			expiresIn: PRESIGNED_UPLOAD_EXPIRES_IN_SECONDS,
		}),
		{
			method: "PUT",
			body,
			headers: {
				"content-type": contentType,
				"cache-control": IMMUTABLE_CACHE_CONTROL,
			},
		},
	);
	if (!response.ok) {
		throw new Error(
			`Uploading ${key} failed with ${response.status}: ${await response.text()}`,
		);
	}
}

export async function deleteFromS3(keys: string[]) {
	await Promise.all(keys.map((key) => s3Client().delete(key)));
}

function s3Client() {
	client ??= storageClient();
	return client;
}

/** Virtual-hosted style (`bucket.host/key`) like the AWS SDK, path style for IP address endpoints */
function storageClient() {
	const { endpoint, accessKey, secret, region, bucket } = ServerConfig.storage;
	const url = new URL(endpoint);
	const virtualHostedStyle = !isIP(url.hostname);
	if (virtualHostedStyle) {
		url.hostname = `${bucket}.${url.hostname}`;
	}

	return new Bun.S3Client({
		endpoint: url.origin,
		virtualHostedStyle,
		accessKeyId: accessKey,
		secretAccessKey: secret,
		region,
		bucket,
	});
}
