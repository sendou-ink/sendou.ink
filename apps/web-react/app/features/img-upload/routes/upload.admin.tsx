import { Trash } from "lucide-react";
import * as React from "react";
import { Link, useLoaderData } from "react-router";
import { ActionButton } from "~/components/ActionButton";
import { Main } from "~/components/Main";

import { action } from "../actions/upload.admin.server";
import { loader } from "../loaders/upload.admin.server";
import { validateImageSchema } from "../upload-schemas";

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

	React.useEffect(() => {
		window.scrollTo(0, 0);
	}, [data]);

	if (data.images.length === 0) {
		return "All validated!";
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
								<ActionButton
									schema={validateImageSchema}
									action="REJECT"
									fields={{ imageId: image.id }}
									confirm={{
										dialogHeading: `Reject image submitted by ${image.username}?`,
										submitButtonText: "Reject",
									}}
									icon={<Trash />}
									variant="minimal-destructive"
									size="medium"
								/>
							</div>
							<img src={image.url} alt="" />
							<Link to={`/u/${image.submitterUserId}`} className="text-xs">
								From: {image.username}
							</Link>
						</div>
					);
				})}
			</div>

			<ActionButton
				schema={validateImageSchema}
				action="VALIDATE"
				fields={{ imageIds: data.images.map((img) => img.id) }}
				formClassName="mt-12"
				size="big"
				className="mx-auto"
			>
				All {data.images.length} above ok
			</ActionButton>
		</>
	);
}
