import invariant from '$lib/utils/invariant';
import { PutObjectCommand, S3 } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';
import {
	STORAGE_ACCESS_KEY,
	STORAGE_SECRET,
	STORAGE_REGION,
	STORAGE_END_POINT,
	STORAGE_BUCKET
} from '$env/static/private';

const s3 = new S3({
	endpoint: STORAGE_END_POINT,
	forcePathStyle: false,
	credentials: {
		accessKeyId: STORAGE_ACCESS_KEY,
		secretAccessKey: STORAGE_SECRET
	},
	region: STORAGE_REGION
});

export async function putFile(file: File) {
	const [, ending] = file.name.split('.');
	invariant(ending);
	const Key = `${nanoid()}-${Date.now()}.${ending}`;

	await s3.send(
		new PutObjectCommand({
			Bucket: STORAGE_BUCKET,
			Key,
			Body: await file.bytes()
			// ContentType: file.mimetype xxx: is this needed?
		})
	);

	return Key;
}
