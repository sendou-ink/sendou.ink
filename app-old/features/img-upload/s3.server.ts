// from: https://github.com/remix-run/examples/blob/main/file-and-s3-upload/app/utils/s3.server.ts

import { PassThrough } from "node:stream";

import { S3 } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { UploadHandler } from "@remix-run/node";
import { writeAsyncIterableToWritable } from "@remix-run/node";
import type AWS from "aws-sdk";
import { nanoid } from "nanoid";
import invariant from "~/utils/invariant";

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

// predeciding file name is useful when you are uploading more than one asset
// and want them to share name
export const s3UploadHandler =
	(preDecidedFilename?: string): UploadHandler =>
	async ({ name, filename, data }) => {
		invariant(
			name !== "smallImg" || preDecidedFilename,
			"must have predecided filename when uploading many images",
		);

		if (name !== "img" && name !== "smallImg") {
			return undefined;
		}

		const [, ending] = filename!.split(".");
		invariant(ending);
		const newFilename = preDecidedFilename
			? `${preDecidedFilename}${name === "smallImg" ? "-small" : ""}.${ending}`
			: `${nanoid()}-${Date.now()}.${ending}`;

		const uploadedFileLocation = await uploadStreamToS3(data, newFilename);
		return uploadedFileLocation;
	};
