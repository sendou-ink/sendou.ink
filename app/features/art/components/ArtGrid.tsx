import { Link } from "@remix-run/react";
import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { CrossIcon } from "~/components/icons/Cross";
import { EditIcon } from "~/components/icons/Edit";
import { TrashIcon } from "~/components/icons/Trash";
import { UnlinkIcon } from "~/components/icons/Unlink";
import { Pagination } from "~/components/Pagination";
import { useIsMounted } from "~/hooks/useIsMounted";
import { usePagination } from "~/hooks/usePagination";
import { useSearchParamState } from "~/hooks/useSearchParamState";
import { databaseTimestampToDate } from "~/utils/dates";
import { artPage, newArtPage, userArtPage, userPage } from "~/utils/urls";
import { conditionalUserSubmittedImage } from "~/utils/urls-img";
import { ResponsiveMasonry } from "../../../modules/responsive-masonry/components/ResponsiveMasonry";
import { ART_PER_PAGE } from "../art-constants";
import type { ListedArt } from "../art-types";
import { previewUrl } from "../art-utils";

export function ArtGrid({
	arts,
	enablePreview = false,
	canEdit = false,
	showUploadDate = false,
}: {
	arts: ListedArt[];
	enablePreview?: boolean;
	canEdit?: boolean;
	showUploadDate?: boolean;
}) {
	const {
		itemsToDisplay,
		everythingVisible,
		currentPage,
		pagesCount,
		nextPage,
		previousPage,
		setPage,
	} = usePagination({
		items: arts,
		pageSize: ART_PER_PAGE,
	});
	const [bigArtId, setBigArtId] = useSearchParamState<number | null>({
		defaultValue: null,
		name: "big",
		revive: (value) =>
			itemsToDisplay.find((art) => art.id === Number(value))?.id,
	});
	const isMounted = useIsMounted();

	if (!isMounted) return null;

	const bigArt = itemsToDisplay.find((art) => art.id === bigArtId);

	return (
		<>
			{bigArt ? (
				<BigImageDialog close={() => setBigArtId(null)} art={bigArt} />
			) : null}
			<ResponsiveMasonry>
				{itemsToDisplay.map((art) => (
					<ImagePreview
						key={art.id}
						art={art}
						canEdit={canEdit}
						enablePreview={enablePreview}
						showUploadDate={showUploadDate}
						onClick={enablePreview ? () => setBigArtId(art.id) : undefined}
					/>
				))}
			</ResponsiveMasonry>
			{!everythingVisible ? (
				<div className="mt-6">
					<Pagination
						currentPage={currentPage}
						pagesCount={pagesCount}
						nextPage={nextPage}
						previousPage={previousPage}
						setPage={setPage}
					/>
				</div>
			) : null}
		</>
	);
}

function BigImageDialog({ close, art }: { close: () => void; art: ListedArt }) {
	const { i18n } = useTranslation();
	const [imageLoaded, setImageLoaded] = React.useState(false);

	return (
		<SendouDialog
			heading={databaseTimestampToDate(art.createdAt).toLocaleDateString(
				i18n.language,
				{
					year: "numeric",
					month: "long",
					day: "numeric",
				},
			)}
			onClose={close}
			isFullScreen
		>
			<img
				alt=""
				src={conditionalUserSubmittedImage(art.url)}
				loading="lazy"
				className="art__dialog__img"
				onLoad={() => setImageLoaded(true)}
			/>
			{art.tags || art.linkedUsers ? (
				<div
					className={clsx("art__tags-container", { invisible: !imageLoaded })}
				>
					{art.linkedUsers?.map((user) => (
						<Link
							to={userPage(user)}
							key={user.discordId}
							className="art__dialog__tag art__dialog__tag__user"
						>
							{user.username}
						</Link>
					))}
					{art.tags?.map((tag) => (
						<Link
							to={artPage(tag.name)}
							key={tag.id}
							className="art__dialog__tag"
						>
							#{tag.name}
						</Link>
					))}
				</div>
			) : null}
			{art.description ? (
				<div
					className={clsx("art__dialog__description", {
						invisible: !imageLoaded,
					})}
				>
					{art.description}
				</div>
			) : null}
			<SendouButton
				variant="destructive"
				className="mx-auto mt-6"
				onPress={close}
				icon={<CrossIcon />}
			>
				Close
			</SendouButton>
		</SendouDialog>
	);
}

function ImagePreview({
	art,
	onClick,
	enablePreview = false,
	canEdit = false,
	showUploadDate = false,
}: {
	art: ListedArt;
	onClick?: () => void;
	enablePreview?: boolean;
	canEdit?: boolean;
	showUploadDate?: boolean;
}) {
	const [imageLoaded, setImageLoaded] = React.useState(false);
	const { t } = useTranslation(["common", "art"]);

	const img = (
		// biome-ignore lint/a11y/noStaticElementInteractions: Biome v2 migration
		<img
			alt=""
			src={conditionalUserSubmittedImage(previewUrl(art.url))}
			loading="lazy"
			onClick={onClick}
			onLoad={() => setImageLoaded(true)}
			className={enablePreview ? "art__thumbnail" : undefined}
		/>
	);

	if (!art.author && canEdit) {
		return (
			<div>
				{img}
				<div
					className={clsx("stack horizontal justify-between mt-2", {
						invisible: !imageLoaded,
					})}
				>
					<LinkButton
						to={newArtPage(art.id)}
						size="small"
						variant="outlined"
						icon={<EditIcon />}
					>
						{t("common:actions.edit")}
					</LinkButton>
					<FormWithConfirm
						dialogHeading={t("art:delete.title")}
						fields={[
							["id", art.id],
							["_action", "DELETE_ART"],
						]}
					>
						<SendouButton
							icon={<TrashIcon />}
							variant="destructive"
							size="small"
						/>
					</FormWithConfirm>
				</div>
			</div>
		);
	}
	if (!art.author) return img;

	const uploadDateText = showUploadDate
		? formatDistanceToNow(databaseTimestampToDate(art.createdAt), {
				addSuffix: true,
			})
		: null;

	// whole thing is not a link so we can preview the image
	if (enablePreview) {
		return (
			<div>
				{img}
				<div
					className={clsx("stack horizontal justify-between", {
						"mt-2": canEdit,
					})}
				>
					<Link
						to={userArtPage(art.author, "MADE-BY")}
						className={clsx("stack sm horizontal text-xs items-center mt-1", {
							invisible: !imageLoaded,
						})}
					>
						<Avatar user={art.author} size="xxs" />
						{t("art:madeBy")} {art.author.username}
					</Link>
					{uploadDateText ? (
						<div
							className={clsx("text-xs text-lighter", {
								invisible: !imageLoaded,
							})}
						>
							{uploadDateText}
						</div>
					) : null}
					{canEdit ? (
						<FormWithConfirm
							dialogHeading={t("art:unlink.title", {
								username: art.author.username,
							})}
							fields={[
								["id", art.id],
								["_action", "UNLINK_ART"],
							]}
							submitButtonText={t("common:actions.remove")}
						>
							<SendouButton
								icon={<UnlinkIcon />}
								variant="destructive"
								size="small"
							/>
						</FormWithConfirm>
					) : null}
				</div>
			</div>
		);
	}

	return (
		<Link to={userArtPage(art.author, "MADE-BY")}>
			{img}
			<div className="stack horizontal justify-between">
				<div
					className={clsx("stack sm horizontal text-xs items-center mt-1", {
						invisible: !imageLoaded,
					})}
				>
					<Avatar user={art.author} size="xxs" />
					{art.author.username}
				</div>
				{uploadDateText ? (
					<div
						className={clsx("text-xxs mt-1 text-lighter", {
							invisible: !imageLoaded,
						})}
					>
						{uploadDateText}
					</div>
				) : null}
			</div>
		</Link>
	);
}
