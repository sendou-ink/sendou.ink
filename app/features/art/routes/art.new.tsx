import type {
	ActionFunction,
	LoaderFunctionArgs,
	MetaFunction,
} from "@remix-run/node";
import {
	unstable_composeUploadHandlers as composeUploadHandlers,
	unstable_createMemoryUploadHandler as createMemoryUploadHandler,
	unstable_parseMultipartFormData as parseMultipartFormData,
	redirect,
} from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import Compressor from "compressorjs";
import clone from "just-clone";
import { nanoid } from "nanoid";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router-dom";
import { Alert } from "~/components/Alert";
import { Button } from "~/components/Button";
import { Combobox } from "~/components/Combobox";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { UserSearch } from "~/components/UserSearch";
import { SendouSwitch } from "~/components/elements/Switch";
import { CrossIcon } from "~/components/icons/Cross";
import { useUser } from "~/features/auth/core/user";
import { requireUser } from "~/features/auth/core/user.server";
import { s3UploadHandler } from "~/features/img-upload";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import {
	type SendouRouteHandle,
	parseFormData,
	parseRequestPayload,
	validate,
} from "~/utils/remix.server";
import {
	artPage,
	conditionalUserSubmittedImage,
	navIconUrl,
	userArtPage,
} from "~/utils/urls";
import { metaTitle } from "../../../utils/remix";
import { ART, NEW_ART_EXISTING_SEARCH_PARAM_KEY } from "../art-constants";
import { editArtSchema, newArtSchema } from "../art-schemas.server";
import { previewUrl } from "../art-utils";
import { addNewArt, editArt } from "../queries/addNewArt.server";
import { allArtTags } from "../queries/allArtTags.server";
import { findArtById } from "../queries/findArtById.server";

export const handle: SendouRouteHandle = {
	i18n: ["art"],
	breadcrumb: () => ({
		imgPath: navIconUrl("art"),
		href: artPage(),
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = () => {
	return metaTitle({
		title: "New art",
	});
};

export const action: ActionFunction = async ({ request }) => {
	const user = await requireUser(request);
	validate(user.isArtist, "Lacking artist role", 403);

	const searchParams = new URL(request.url).searchParams;
	const artIdRaw = searchParams.get(NEW_ART_EXISTING_SEARCH_PARAM_KEY);

	// updating logic
	if (artIdRaw) {
		const artId = Number(artIdRaw);

		const existingArt = findArtById(artId);
		validate(
			existingArt?.authorId === user.id,
			"Insufficient permissions",
			401,
		);

		const data = await parseRequestPayload({
			request,
			schema: editArtSchema,
		});

		editArt({
			authorId: user.id,
			artId,
			description: data.description,
			isShowcase: data.isShowcase,
			linkedUsers: data.linkedUsers,
			tags: data.tags,
		});
	} else {
		const uploadHandler = composeUploadHandlers(
			s3UploadHandler(`art-${nanoid()}-${Date.now()}`),
			createMemoryUploadHandler(),
		);
		const formData = await parseMultipartFormData(request, uploadHandler);
		const imgSrc = formData.get("img") as string | null;
		invariant(imgSrc);

		const urlParts = imgSrc.split("/");
		const fileName = urlParts[urlParts.length - 1];
		invariant(fileName);

		const data = await parseFormData({
			formData,
			schema: newArtSchema,
		});

		addNewArt({
			authorId: user.id,
			description: data.description,
			url: fileName,
			validatedAt: user.patronTier ? dateToDatabaseTimestamp(new Date()) : null,
			linkedUsers: data.linkedUsers,
			tags: data.tags,
		});
	}

	throw redirect(userArtPage(user));
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUser(request);
	validate(user.isArtist, "Lacking artist role", 403);

	const artIdRaw = new URL(request.url).searchParams.get(
		NEW_ART_EXISTING_SEARCH_PARAM_KEY,
	);
	if (!artIdRaw) return { art: null, tags: allArtTags() };
	const artId = Number(artIdRaw);

	const art = findArtById(artId);
	if (!art || art.authorId !== user.id) {
		return { art: null, tags: allArtTags() };
	}

	return { art, tags: allArtTags() };
};

export default function NewArtPage() {
	const data = useLoaderData<typeof loader>();
	const [img, setImg] = React.useState<File | null>(null);
	const [smallImg, setSmallImg] = React.useState<File | null>(null);
	const { t } = useTranslation(["common", "art"]);
	const ref = React.useRef<HTMLFormElement>(null);
	const fetcher = useFetcher();
	const user = useUser();

	const handleSubmit = () => {
		const formData = new FormData(ref.current!);

		if (img) formData.append("img", img, img.name);
		if (smallImg) formData.append("smallImg", smallImg, smallImg.name);

		fetcher.submit(formData, {
			encType: "multipart/form-data",
			method: "post",
		});
	};

	const submitButtonDisabled = () => {
		if (fetcher.state !== "idle") return true;

		return !img && !data.art;
	};

	if (!user || !user.isArtist) {
		return (
			<Main className="stack items-center">
				<Alert variation="WARNING">{t("art:gainPerms")}</Alert>
			</Main>
		);
	}

	return (
		<Main halfWidth>
			<Form ref={ref} className="stack md">
				<FormMessage type="info">{t("art:forms.caveats")}</FormMessage>
				<ImageUpload img={img} setImg={setImg} setSmallImg={setSmallImg} />
				<Description />
				<Tags />
				<LinkedUsers />
				{data.art ? <ShowcaseToggle /> : null}
				<div>
					<Button onClick={handleSubmit} disabled={submitButtonDisabled()}>
						{t("common:actions.save")}
					</Button>
				</div>
			</Form>
		</Main>
	);
}

function ImageUpload({
	img,
	setImg,
	setSmallImg,
}: {
	img: File | null;
	setImg: (file: File | null) => void;
	setSmallImg: (file: File | null) => void;
}) {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["common"]);

	if (data.art) {
		return (
			<img
				src={conditionalUserSubmittedImage(previewUrl(data.art.url))}
				alt=""
			/>
		);
	}

	return (
		<div>
			<label htmlFor="img-field">{t("common:upload.imageToUpload")}</label>
			<input
				id="img-field"
				className="plain"
				type="file"
				name="img"
				accept="image/png, image/jpeg, image/jpg, image/webp"
				onChange={(e) => {
					const uploadedFile = e.target.files?.[0];
					if (!uploadedFile) {
						setImg(null);
						return;
					}

					new Compressor(uploadedFile, {
						success(result) {
							invariant(result instanceof Blob);
							const file = new File([result], uploadedFile.name);

							setImg(file);
						},
						error(err) {
							console.error(err.message);
						},
					});

					new Compressor(uploadedFile, {
						maxWidth: ART.THUMBNAIL_WIDTH,
						success(result) {
							invariant(result instanceof Blob);
							const file = new File([result], uploadedFile.name);

							setSmallImg(file);
						},
						error(err) {
							console.error(err.message);
						},
					});
				}}
			/>
			{img && <img src={URL.createObjectURL(img)} alt="" className="mt-4" />}
		</div>
	);
}

function Description() {
	const { t } = useTranslation(["art"]);
	const data = useLoaderData<typeof loader>();
	const [value, setValue] = React.useState(data.art?.description ?? "");

	return (
		<div>
			<Label
				htmlFor="description"
				valueLimits={{ current: value.length, max: ART.DESCRIPTION_MAX_LENGTH }}
			>
				{t("art:forms.description.title")}
			</Label>
			<textarea
				id="description"
				name="description"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				maxLength={ART.DESCRIPTION_MAX_LENGTH}
			/>
		</div>
	);
}

// note: not handling edge case where a tag was added by another user while this
// user was adding a new art with the same tag -> will crash
function Tags() {
	const { t } = useTranslation(["art", "common"]);
	const data = useLoaderData<typeof loader>();
	const [creationMode, setCreationMode] = React.useState(false);
	const [tags, setTags] = React.useState<{ name?: string; id?: number }[]>(
		data.art?.tags ?? [],
	);
	const [newTagValue, setNewTagValue] = React.useState("");

	const existingTags = data.tags;
	const unselectedTags = existingTags.filter(
		(t) => !tags.some((tag) => tag.id === t.id),
	);

	const handleAddNewTag = () => {
		const normalizedNewTagValue = newTagValue
			.trim()
			// replace many whitespaces with one
			.replace(/\s\s+/g, " ")
			.toLowerCase();

		if (
			normalizedNewTagValue.length === 0 ||
			normalizedNewTagValue.length > ART.TAG_MAX_LENGTH
		) {
			return;
		}

		const alreadyCreatedTag = existingTags.find(
			(t) => t.name === normalizedNewTagValue,
		);

		if (alreadyCreatedTag) {
			setTags((tags) => [...tags, alreadyCreatedTag]);
		} else if (tags.every((tag) => tag.name !== normalizedNewTagValue)) {
			setTags((tags) => [...tags, { name: normalizedNewTagValue }]);
		}

		setNewTagValue("");
		setCreationMode(false);
	};

	return (
		<div className="stack xs items-start">
			<Label htmlFor="tags" className="mb-0">
				{t("art:forms.tags.title")}
			</Label>
			<input type="hidden" name="tags" value={JSON.stringify(tags)} />
			{creationMode ? (
				<div className="art__creation-mode-switcher-container">
					<Button variant="minimal" onClick={() => setCreationMode(false)}>
						{t("art:forms.tags.selectFromExisting")}
					</Button>
				</div>
			) : (
				<div className="stack horizontal sm text-xs text-lighter art__creation-mode-switcher-container">
					{t("art:forms.tags.cantFindExisting")}{" "}
					<Button variant="minimal" onClick={() => setCreationMode(true)}>
						{t("art:forms.tags.addNew")}
					</Button>
				</div>
			)}
			{tags.length >= ART.TAGS_MAX_LENGTH ? (
				<div className="text-sm text-warning">
					{t("art:forms.tags.maxReached")}
				</div>
			) : creationMode ? (
				<div className="stack horizontal sm items-center">
					<input
						placeholder={t("art:forms.tags.addNew.placeholder")}
						name="tag"
						value={newTagValue}
						onChange={(e) => setNewTagValue(e.target.value)}
						onKeyDown={(event) => {
							if (event.code === "Enter") {
								handleAddNewTag();
							}
						}}
					/>
					<Button size="tiny" variant="outlined" onClick={handleAddNewTag}>
						{t("common:actions.add")}
					</Button>
				</div>
			) : (
				<Combobox
					// empty combobox on select
					key={tags.length}
					options={unselectedTags.map((t) => ({
						label: t.name,
						value: String(t.id),
					}))}
					inputName="tags"
					placeholder={t("art:forms.tags.searchExisting.placeholder")}
					initialValue={null}
					onChange={(selection) => {
						if (!selection) return;
						setTags([
							...tags,
							{ name: selection.label, id: Number(selection.value) },
						]);
					}}
				/>
			)}
			<div className="text-sm stack sm flex-wrap horizontal">
				{tags.map((t) => {
					return (
						<div key={t.name} className="stack horizontal">
							{t.name}{" "}
							<Button
								icon={<CrossIcon />}
								size="tiny"
								variant="minimal-destructive"
								className="art__delete-tag-button"
								onClick={() => {
									setTags(tags.filter((tag) => tag.name !== t.name));
								}}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function LinkedUsers() {
	const { t } = useTranslation(["art"]);
	const data = useLoaderData<typeof loader>();
	const [users, setUsers] = React.useState<
		{ inputId: string; userId?: number }[]
	>(
		(data.art?.linkedUsers ?? []).length > 0
			? data.art!.linkedUsers.map((userId) => ({ userId, inputId: nanoid() }))
			: [{ inputId: nanoid() }],
	);

	return (
		<div>
			<label htmlFor="user">{t("art:forms.linkedUsers.title")}</label>
			<input
				type="hidden"
				name="linkedUsers"
				value={JSON.stringify(
					users.filter((u) => u.userId).map((u) => u.userId),
				)}
			/>
			{users.map(({ inputId, userId }, i) => {
				return (
					<div key={inputId} className="stack horizontal sm mb-2 items-center">
						<UserSearch
							inputName="user"
							onChange={(newUser) => {
								const newUsers = clone(users);
								newUsers[i] = { ...newUsers[i], userId: newUser.id };

								setUsers(newUsers);
							}}
							initialUserId={userId}
						/>
						{users.length > 1 || users[0].userId ? (
							<Button
								size="tiny"
								variant="minimal-destructive"
								onClick={() => {
									if (users.length === 1) {
										setUsers([{ inputId: nanoid() }]);
									} else {
										setUsers(users.filter((u) => u.inputId !== inputId));
									}
								}}
								icon={<CrossIcon />}
							/>
						) : null}
					</div>
				);
			})}
			<Button
				size="tiny"
				onClick={() => setUsers([...users, { inputId: nanoid() }])}
				disabled={users.length >= ART.LINKED_USERS_MAX_LENGTH}
				className="my-3"
				variant="outlined"
			>
				{t("art:forms.linkedUsers.anotherOne")}
			</Button>
			<FormMessage type="info">{t("art:forms.linkedUsers.info")}</FormMessage>
		</div>
	);
}

function ShowcaseToggle() {
	const { t } = useTranslation(["art"]);
	const data = useLoaderData<typeof loader>();
	const isCurrentlyShowcase = Boolean(data.art?.isShowcase);
	const [checked, setChecked] = React.useState(isCurrentlyShowcase);

	return (
		<div>
			<label htmlFor="isShowcase">{t("art:forms.showcase.title")}</label>
			<SendouSwitch
				isSelected={checked}
				onChange={setChecked}
				name="isShowcase"
				id="isShowcase"
				isDisabled={isCurrentlyShowcase}
			/>
			<FormMessage type="info">{t("art:forms.showcase.info")}</FormMessage>
		</div>
	);
}
