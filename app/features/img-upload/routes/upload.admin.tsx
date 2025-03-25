import { Form, useLoaderData } from "@remix-run/react";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { userSubmittedImage } from "~/utils/urls";

import { action } from "../actions/upload.admin.server";
import { loader } from "../loaders/upload.admin.server";
export { action, loader };

export default function ImageUploadAdminPage() {
	return (
		<Main>
			<ImageValidator />
		</Main>
	);
}

function ImageValidator() {
	const data = useLoaderData<typeof loader>();

	if (!data.image) {
		return <>All validated!</>;
	}

	return (
		<>
			<div>{data.unvalidatedImgCount} left</div>
			<img src={userSubmittedImage(data.image.url)} alt="" />
			<Form method="post">
				<input type="hidden" name="imageId" value={data.image.id} />
				<SubmitButton>Ok</SubmitButton>
			</Form>
			<div>From: {data.image.submitterUserId}</div>
		</>
	);
}
