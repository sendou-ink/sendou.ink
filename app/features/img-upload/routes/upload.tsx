import { useFetcher, useLoaderData } from "@remix-run/react";
import Compressor from "compressorjs";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/Button";
import { Main } from "~/components/Main";
import invariant from "~/utils/invariant";
import { imgTypeToDimensions, imgTypeToStyle } from "../upload-constants";
import type { ImageUploadType } from "../upload-types";

import { action } from "../actions/upload.server";
import { loader } from "../loaders/upload.server";
export { action, loader };

export default function FileUploadPage() {
	const { t } = useTranslation(["common"]);
	const data = useLoaderData<typeof loader>();
	const [img, setImg] = React.useState<File | null>(null);
	const fetcher = useFetcher();

	const handleSubmit = () => {
		invariant(img);

		const formData = new FormData();
		formData.append("img", img, img.name);

		fetcher.submit(formData, {
			encType: "multipart/form-data",
			method: "post",
		});
	};

	React.useEffect(() => {
		if (fetcher.state === "loading") {
			setImg(null);
		}
	}, [fetcher.state]);

	const { width, height } = imgTypeToDimensions[data.type];

	return (
		<Main className="stack lg">
			<div>
				<div>
					{t("common:upload.title", {
						type: t(`common:upload.type.${data.type}`),
						width,
						height,
					})}
				</div>
				{data.type === "team-banner" || data.type === "team-pfp" ? (
					<div className="text-sm text-lighter">
						{t("common:upload.commonExplanation")}{" "}
						{data.unvalidatedImages ? (
							<span>
								{t("common:upload.afterExplanation", {
									count: data.unvalidatedImages,
								})}
							</span>
						) : null}
					</div>
				) : null}
			</div>
			<div>
				<label htmlFor="img-field">{t("common:upload.imageToUpload")}</label>
				<input
					id="img-field"
					className="plain"
					type="file"
					name="img"
					accept="image/png, image/jpeg, image/webp"
					onChange={(e) => {
						const uploadedFile = e.target.files?.[0];
						if (!uploadedFile) {
							setImg(null);
							return;
						}

						new Compressor(uploadedFile, {
							height,
							width,
							maxHeight: height,
							maxWidth: width,
							// 0.5MB
							convertSize: 500_000,
							resize: "cover",
							success(result) {
								const file = new File([result], "img.webp", {
									type: "image/webp",
								});
								setImg(file);
							},
							error(err) {
								console.error(err.message);
							},
						});
					}}
				/>
			</div>
			{img ? <PreviewImage img={img} type={data.type} /> : null}
			<Button
				className="self-start"
				disabled={!img || fetcher.state !== "idle"}
				onClick={handleSubmit}
			>
				{t("common:actions.upload")}
			</Button>
		</Main>
	);
}

function PreviewImage({ img, type }: { img: File; type: ImageUploadType }) {
	return (
		<img src={URL.createObjectURL(img)} alt="" style={imgTypeToStyle[type]} />
	);
}
