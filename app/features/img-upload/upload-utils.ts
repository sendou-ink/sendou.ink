import { IMAGE_TYPES } from "./upload-constants";

export function requestToImgType(request: Request) {
	const rawType = new URL(request.url).searchParams.get("type") ?? "";
	return IMAGE_TYPES.find((type) => type === rawType);
}
