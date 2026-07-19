/** Small JPEG data-URL thumbnail of an analyzed frame, for feed cards. */
export async function thumbnailFromBlob(frame: Blob): Promise<string> {
	const bitmap = await createImageBitmap(frame);
	const canvas = document.createElement("canvas");
	canvas.width = 320;
	canvas.height = 180;
	canvas.getContext("2d")!.drawImage(bitmap, 0, 0, 320, 180);
	bitmap.close();
	return canvas.toDataURL("image/jpeg", 0.7);
}
