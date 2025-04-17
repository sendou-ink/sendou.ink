import { Form, Link, useLoaderData } from "@remix-run/react";
import * as React from "react";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { SendouButton } from "~/components/elements/Button";
import { TrashIcon } from "~/components/icons/Trash";
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

	// biome-ignore lint/correctness/useExhaustiveDependencies:
	React.useEffect(() => {
		window.scrollTo(0, 0);
	}, [data]);

	if (data.images.length === 0) {
		return <>All validated!</>;
	}

	return (
		<>
			<div className="text-lighter">{data.unvalidatedImgCount} left</div>
			<div className="stack md">
				{data.images.map((image, i) => {
					return (
						<div key={image.id}>
							<div className="text-lg font-bold stack horizontal md">
								{i + 1}){" "}
								<FormWithConfirm
									dialogHeading={`Reject image submitted by ${image.username}?`}
									submitButtonText="Reject"
									fields={[
										["imageId", image.id],
										["_action", "REJECT"],
									]}
								>
									<SendouButton
										icon={<TrashIcon />}
										variant="minimal-destructive"
										size="medium"
									/>
								</FormWithConfirm>
							</div>
							<img src={userSubmittedImage(image.url)} alt="" />
							<Link
								to={`/u/${image.submitterUserId}`}
								className="text-xs"
								target="_blank"
								rel="noopener noreferrer"
							>
								From: {image.username}
							</Link>
						</div>
					);
				})}
			</div>

			<Form method="post" className="mt-12">
				<input
					type="hidden"
					name="imageIds"
					value={JSON.stringify(data.images.map((img) => img.id))}
				/>
				<SubmitButton size="big" className="mx-auto" _action="VALIDATE">
					All {data.images.length} above ok
				</SubmitButton>
			</Form>
		</>
	);
}
