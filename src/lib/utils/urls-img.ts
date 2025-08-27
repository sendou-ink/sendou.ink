// xxx: move back to urls.ts

import { PUBLIC_USER_SUBMITTED_IMAGE_URL_ROOT } from '$env/static/public';

// TODO: move development images to minio and deprecate this hack
// images with https are not hosted on spaces, this is used for local development
export function conditionalUserSubmittedImage(fileName: string) {
	return fileName.includes('https') ? fileName : userSubmittedImage(fileName);
}

export function userSubmittedImage(fileName: string) {
	return `${PUBLIC_USER_SUBMITTED_IMAGE_URL_ROOT}/${fileName}`;
}
