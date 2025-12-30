// from: https://github.com/remix-run/examples/blob/main/file-and-s3-upload/app/utils/s3.server.ts

import { PassThrough } from "node:stream";

import { S3 } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { writeAsyncIterableToWritable } from "@react-router/node";
import type AWS from "aws-sdk";

const envVars = () => {
	const {
		STORAGE_END_POINT,
		STORAGE_ACCESS_KEY,
		STORAGE_SECRET,
		STORAGE_REGION,
		STORAGE_BUCKET,
	} = process.env;

	if (
		!(
			STORAGE_ACCESS_KEY &&
			STORAGE_END_POINT &&
			STORAGE_SECRET &&
			STORAGE_REGION &&
			STORAGE_BUCKET
		)
	) {
		throw new Error("Storage is missing required configuration.");
	}

	return {
		STORAGE_END_POINT,
		STORAGE_ACCESS_KEY,
		STORAGE_SECRET,
		STORAGE_REGION,
		STORAGE_BUCKET,
	};
};

const uploadStream = ({ Key }: Pick<AWS.S3.Types.PutObjectRequest, "Key">) => {
	const {
		STORAGE_END_POINT,
		STORAGE_ACCESS_KEY,
		STORAGE_SECRET,
		STORAGE_REGION,
		STORAGE_BUCKET,
	} = envVars();

	const s3 = new S3({
		endpoint: STORAGE_END_POINT,
		forcePathStyle: false,
		credentials: {
			accessKeyId: STORAGE_ACCESS_KEY,
			secretAccessKey: STORAGE_SECRET,
		},
		region: STORAGE_REGION,
	});
	const pass = new PassThrough();
	return {
		writeStream: pass,
		promise: new Upload({
			client: s3,
			params: { Bucket: STORAGE_BUCKET, Key, Body: pass, ACL: "public-read" },
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
