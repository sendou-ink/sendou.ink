import Compressor from "compressorjs";
import { X } from "lucide-react";
import { nanoid } from "nanoid";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Form, useFetcher, useLoaderData } from "react-router";
import { Alert } from "~/components/Alert";
import { SendouButton } from "~/components/elements/Button";
import { SendouSwitch } from "~/components/elements/Switch";
import { UserSearch } from "~/components/elements/UserSearch";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { useHasRole } from "~/modules/permissions/hooks";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { artPage, navIconUrl } from "~/utils/urls";
import { metaTitle } from "../../../utils/remix";
import { action } from "../actions/art.new.server";
import { ART } from "../art-constants";
import { previewUrl } from "../art-utils";
import { TagSelect } from "../components/TagSelect";
import { loader } from "../loaders/art.new.server";
export { loader, action };

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

export default function NewArtPage() {
	const data = useLoaderData<typeof loader>();
	const [img, setImg] = React.useState<File | null>(null);
	const [smallImg, setSmallImg] = React.useState<File | null>(null);
	const { t } = useTranslation(["common", "art"]);
	const ref = React.useRef<HTMLFormElement>(null);
	const fetcher = useFetcher();
	const isArtist = useHasRole("ARTIST");

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

	if (!isArtist) {
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
					<SendouButton
						onPress={handleSubmit}
						isDisabled={submitButtonDisabled()}
					>
						{t("common:actions.save")}
					</SendouButton>
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
	const id = React.useId();

	if (data.art) {
		return <img src={previewUrl(data.art.url)} alt="" />;
	}

	return (
		<div>
			<label htmlFor={id}>{t("common:upload.imageToUpload")}</label>
			<input
				id={id}
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
							logger.error(err.message);
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
							logger.error(err.message);
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
	const id = React.useId();

	return (
		<div>
			<Label
				htmlFor={id}
				valueLimits={{ current: value.length, max: ART.DESCRIPTION_MAX_LENGTH }}
			>
				{t("art:forms.description.title")}
			</Label>
			<textarea
				id={id}
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

		const alreadyCreatedTag = data.tags.find(
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
					<SendouButton
						variant="minimal"
						onPress={() => setCreationMode(false)}
					>
						{t("art:forms.tags.selectFromExisting")}
					</SendouButton>
				</div>
			) : (
				<div className="stack horizontal sm text-xs text-lighter art__creation-mode-switcher-container">
					{t("art:forms.tags.cantFindExisting")}{" "}
					<SendouButton variant="minimal" onPress={() => setCreationMode(true)}>
						{t("art:forms.tags.addNew")}
					</SendouButton>
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
					<SendouButton
						size="small"
						variant="outlined"
						onPress={handleAddNewTag}
					>
						{t("common:actions.add")}
					</SendouButton>
				</div>
			) : (
				<TagSelect
					// empty combobox on select
					key={tags.length}
					tags={data.tags}
					disabledKeys={tags.map((t) => t.id).filter((id) => id !== undefined)}
					onSelectionChange={(tagName) =>
						setTags([...tags, data.tags.find((t) => t.name === tagName)!])
					}
				/>
			)}
			<div className="text-sm stack sm flex-wrap horizontal">
				{tags.map((t) => {
					return (
						<div key={t.name} className="stack horizontal">
							{t.name}{" "}
							<SendouButton
								icon={<X />}
								size="small"
								variant="minimal-destructive"
								className="art__delete-tag-button"
								onPress={() => {
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
		data.art?.linkedUsers && data.art.linkedUsers.length > 0
			? data.art.linkedUsers.map((user) => ({
					userId: user.id,
					inputId: nanoid(),
				}))
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
							name="user"
							onChange={(newUser) => {
								const newUsers = structuredClone(users);
								newUsers[i] = { ...newUsers[i], userId: newUser?.id };

								setUsers(newUsers);
							}}
							initialUserId={userId}
						/>
						{users.length > 1 || users[0].userId ? (
							<SendouButton
								size="small"
								variant="minimal-destructive"
								onPress={() => {
									if (users.length === 1) {
										setUsers([{ inputId: nanoid() }]);
									} else {
										setUsers(users.filter((u) => u.inputId !== inputId));
									}
								}}
								icon={<X />}
							/>
						) : null}
					</div>
				);
			})}
			<SendouButton
				size="small"
				onPress={() => setUsers([...users, { inputId: nanoid() }])}
				isDisabled={users.length >= ART.LINKED_USERS_MAX_LENGTH}
				className="my-3"
				variant="outlined"
			>
				{t("art:forms.linkedUsers.anotherOne")}
			</SendouButton>
			<FormMessage type="info">{t("art:forms.linkedUsers.info")}</FormMessage>
		</div>
	);
}

function ShowcaseToggle() {
	const { t } = useTranslation(["art"]);
	const data = useLoaderData<typeof loader>();
	const isCurrentlyShowcase = Boolean(data.art?.isShowcase);
	const [checked, setChecked] = React.useState(isCurrentlyShowcase);
	const id = React.useId();

	return (
		<div>
			<label htmlFor={id}>{t("art:forms.showcase.title")}</label>
			<SendouSwitch
				isSelected={checked}
				onChange={setChecked}
				name="isShowcase"
				id={id}
				isDisabled={isCurrentlyShowcase}
			/>
			<FormMessage type="info">{t("art:forms.showcase.info")}</FormMessage>
		</div>
	);
}
