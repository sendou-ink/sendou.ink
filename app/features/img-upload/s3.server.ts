// from: https://github.com/remix-run/examples/blob/main/file-and-s3-upload/app/utils/s3.server.ts

import { PassThrough } from "node:stream";
import type { PutObjectCommandInput } from "@aws-sdk/client-s3";
import { S3 } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { writeAsyncIterableToWritable } from "@react-router/node";
import { ServerConfig } from "~/config.server";

const uploadStream = ({ Key }: Pick<PutObjectCommandInput, "Key">) => {
	const { endpoint, accessKey, secret, region, bucket } = ServerConfig.storage;

	const s3 = new S3({
		endpoint,
		forcePathStyle: false,
		credentials: {
			accessKeyId: accessKey,
			secretAccessKey: secret,
		},
		region,
	});
	const pass = new PassThrough();
	return {
		writeStream: pass,
		promise: new Upload({
			client: s3,
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
