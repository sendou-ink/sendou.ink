export function previewUrl(url: string) {
	const lastDotIndex = url.lastIndexOf(".");
	if (lastDotIndex === -1) return url;

	const urlWithoutExtension = url.slice(0, lastDotIndex);
	const extension = url.slice(lastDotIndex + 1);

	return `${urlWithoutExtension}-small.${extension}`;
}
