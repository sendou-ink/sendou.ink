// from: https://github.com/remix-run/examples/blob/main/file-and-s3-upload/app/utils/s3.server.ts

import { PassThrough } from "node:stream";
import type { PutObjectCommandInput } from "@aws-sdk/client-s3";
import { S3 } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { writeAsyncIterableToWritable } from "@react-router/node";
import { ServerConfig } from "~/config.server";

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

const uploadStream = ({ Key }: Pick<PutObjectCommandInput, "Key">) => {
	const { bucket } = ServerConfig.storage;

	const pass = new PassThrough();
	return {
		writeStream: pass,
		promise: new Upload({
			client: s3Client(),
			params: { Bucket: bucket, Key, Body: pass, ACL: "public-read" },
		}).done(),
	};
};

export async function uploadStreamToS3(data: any, filename: string) {
	const stream = uploadStream({
		Key: filename,
	});
	await writeAsyncIterableToWritable(data, stream.writeStream);
	const file = await stream.promise;
	return file.Location;
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
