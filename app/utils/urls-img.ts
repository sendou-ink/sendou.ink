// TODO: separating this file from urls.ts is a temporary solution. The reason is that import.meta.env cannot currently be used in files that are consumed by plain Node.js

import { IS_E2E_TEST_RUN } from "./e2e";

const USER_SUBMITTED_IMAGE_ROOT =
	(process.env.NODE_ENV === "development" &&
		import.meta.env.VITE_PROD_MODE !== "true") ||
	IS_E2E_TEST_RUN
		? "http://127.0.0.1:9000/sendou"
		: "https://sendou.nyc3.cdn.digitaloceanspaces.com";

// TODO: move development images to minio and deprecate this hack
// images with https are not hosted on spaces, this is used for local development
export const conditionalUserSubmittedImage = (fileName: string) =>
	fileName.includes("https") ? fileName : userSubmittedImage(fileName);

export const userSubmittedImage = (fileName: string) =>
	`${USER_SUBMITTED_IMAGE_ROOT}/${fileName}`;
