import clsx from "clsx";
import { ImageOff, SquarePen, Trash, Unlink } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouModal } from "~/components/elements/Dialog";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Pagination } from "~/components/Pagination";
import { artPage, newArtPage, userArtPage } from "~/features/art/art-urls";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { useFormatDistanceToNow } from "~/hooks/intl/useFormatDistanceToNow";
import { useHydrated } from "~/hooks/useHydrated";
import { usePagination } from "~/hooks/usePagination";
import { useHasPermission } from "~/modules/permissions/hooks";
import { useSearchParam } from "~/modules/search-params/hooks";
import { databaseTimestampToDate } from "~/utils/dates";
import { userPage } from "~/utils/urls";
import { ResponsiveMasonry } from "../../../modules/responsive-masonry/components/ResponsiveMasonry";
import { ART_PER_PAGE } from "../art-constants";
import { artGridSearchParams } from "../art-search-params";
import type { ListedArt } from "../art-types";
import { previewUrl } from "../art-utils";
import styles from "./ArtGrid.module.css";

const preloadedImageUrls = new Set<string>();

export function ArtGrid({
	arts,
	enablePreview = false,
	showUploadDate = false,
}: {
	arts: ListedArt[];
	enablePreview?: boolean;
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
	const [bigArtId, setBigArtId] = useSearchParam(artGridSearchParams, "big");
	const isHydrated = useHydrated();

	if (!isHydrated) return null;

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
	const dialogRef = React.useRef<HTMLDialogElement>(null);
	const [infoVisible, setInfoVisible] = React.useState(true);
	const [imageSettled, imageRef] = useImageSettled();
	const [aspectRatio, placeholderRef] = useImageAspectRatio();
	const { t } = useTranslation(["art"]);
	const { formatter } = useDateTimeFormat({
		year: "numeric",
		month: "numeric",
		day: "numeric",
	});

	const imageFailed = aspectRatio === "FAILED";

	const dateText = formatter.format(databaseTimestampToDate(art.createdAt));

	const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
		const target = event.target as HTMLElement;
		if (target.closest("a")) return;
		if (target.closest("figure") && !deviceCanHover()) {
			setInfoVisible((visible) => !visible);
			return;
		}
		dialogRef.current?.close();
	};

	return (
		<SendouModal
			ref={dialogRef}
			className={styles.lightbox}
			blurredBackdrop
			onClose={close}
			aria-label={art.description || dateText}
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: click-anywhere to close, Escape is handled by the dialog */}
			<div className={styles.lightboxBody} onClick={handleClick}>
				<figure
					className={clsx(styles.lightboxFigure, {
						[styles.lightboxFigureSized]: typeof aspectRatio === "number",
						[styles.lightboxFigureFailed]: imageFailed,
					})}
					style={
						typeof aspectRatio === "number"
							? ({ "--aspect-ratio": aspectRatio } as React.CSSProperties)
							: undefined
					}
				>
					<img
						alt=""
						src={previewUrl(art.url)}
						className={styles.lightboxPlaceholder}
						ref={placeholderRef}
					/>
					{imageFailed ? (
						<div className={styles.lightboxFailed}>
							<ImageOff />
							{t("art:imageFailed")}
						</div>
					) : (
						<img
							alt=""
							src={art.url}
							className={clsx(styles.lightboxImg, {
								[styles.lightboxImgSettled]: imageSettled,
							})}
							ref={imageRef}
						/>
					)}
					<figcaption
						className={clsx(styles.lightboxInfo, {
							[styles.lightboxInfoHidden]: !infoVisible,
						})}
					>
						<time className={styles.lightboxDate}>{dateText}</time>
						{art.description ? (
							<div className={styles.lightboxDescription}>
								{art.description}
							</div>
						) : null}
						{art.tags || art.linkedUsers ? (
							<div className={styles.tagsContainer}>
								{art.linkedUsers?.map((user) => (
									<Link
										to={userPage(user)}
										key={user.discordId}
										className={clsx(styles.dialogTag, styles.dialogTagUser)}
									>
										{user.username}
									</Link>
								))}
								{art.tags?.map((tag) => (
									<Link
										to={artPage(tag.name)}
										key={tag.id}
										className={styles.dialogTag}
									>
										#{tag.name}
									</Link>
								))}
							</div>
						) : null}
					</figcaption>
				</figure>
			</div>
		</SendouModal>
	);
}

function ImagePreview({
	art,
	onClick,
	enablePreview = false,
	showUploadDate = false,
}: {
	art: ListedArt;
	onClick?: () => void;
	enablePreview?: boolean;
	showUploadDate?: boolean;
}) {
	const canEdit = useHasPermission(art, "EDIT");
	const canUnlink = useHasPermission(art, "UNLINK");
	const [imageSettled, imageRef] = useImageSettled();
	const { t } = useTranslation(["common", "art"]);
	const formatDistanceToNow = useFormatDistanceToNow();

	const img = (
		// biome-ignore lint/a11y/noStaticElementInteractions: Biome v2 migration
		<img
			alt=""
			src={previewUrl(art.url)}
			loading="lazy"
			onClick={onClick}
			onPointerEnter={enablePreview ? () => preloadImage(art.url) : undefined}
			ref={imageRef}
			className={enablePreview ? styles.thumbnail : undefined}
			data-testid="art-image"
		/>
	);

	if (!art.author && canEdit) {
		return (
			<div>
				{img}
				<div
					className={clsx("stack horizontal justify-between mt-2", {
						invisible: !imageSettled,
					})}
				>
					<LinkButton
						to={newArtPage(art.id)}
						size="small"
						variant="outlined"
						icon={<SquarePen />}
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
							icon={<Trash />}
							variant="destructive"
							size="small"
							testId="delete-art-button"
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
						"mt-2": canUnlink,
					})}
				>
					<Link
						to={userArtPage(art.author, "MADE-BY")}
						className={clsx("stack sm horizontal text-xs items-center mt-1", {
							invisible: !imageSettled,
						})}
					>
						<Avatar user={art.author} size="xxs" />
						{t("art:madeBy")} {art.author.username}
					</Link>
					{uploadDateText ? (
						<div
							className={clsx("text-xs text-lighter", {
								invisible: !imageSettled,
							})}
						>
							{uploadDateText}
						</div>
					) : null}
					{canUnlink ? (
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
								icon={<Unlink />}
								variant="destructive"
								size="small"
								testId="unlink-art-button"
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
						invisible: !imageSettled,
					})}
				>
					<Avatar user={art.author} size="xxs" />
					{art.author.username}
				</div>
				{uploadDateText ? (
					<div
						className={clsx("text-xxs mt-1 text-lighter", {
							invisible: !imageSettled,
						})}
					>
						{uploadDateText}
					</div>
				) : null}
			</div>
		</Link>
	);
}

/**
 * Whether the image has finished loading (or failed to), and the ref to give it.
 *
 * Native listeners rather than `onLoad`/`onError` because React drops those
 * events when the image settles right after mounting, e.g. when it comes from
 * the browser cache.
 */
function useImageSettled() {
	const [imageSettled, setImageSettled] = React.useState(false);

	const imageRef = (image: HTMLImageElement | null) => {
		if (!image) return;
		if (image.complete) {
			setImageSettled(true);
			return;
		}

		const settle = () => setImageSettled(true);
		image.addEventListener("load", settle);
		image.addEventListener("error", settle);

		return () => {
			image.removeEventListener("load", settle);
			image.removeEventListener("error", settle);
		};
	};

	return [imageSettled, imageRef] as const;
}

/**
 * Aspect ratio of the image once it has loaded, "FAILED" if it never will,
 * and the ref to give it.
 */
function useImageAspectRatio() {
	const [aspectRatio, setAspectRatio] = React.useState<
		number | "FAILED" | null
	>(null);

	const imageRef = (image: HTMLImageElement | null) => {
		if (!image) return;

		const measure = () => {
			setAspectRatio(
				image.naturalWidth > 0 && image.naturalHeight > 0
					? image.naturalWidth / image.naturalHeight
					: "FAILED",
			);
		};
		if (image.complete) {
			measure();
			return;
		}

		image.addEventListener("load", measure);
		image.addEventListener("error", measure);

		return () => {
			image.removeEventListener("load", measure);
			image.removeEventListener("error", measure);
		};
	};

	return [aspectRatio, imageRef] as const;
}

/** Touch devices have no hover to reveal the lightbox info with, so a tap on the image toggles it instead. */
function deviceCanHover() {
	return window.matchMedia("(hover: hover)").matches;
}

/** Warms the browser cache so the full-size image is ready by the time the lightbox opens. */
function preloadImage(url: string) {
	if (preloadedImageUrls.has(url)) return;
	preloadedImageUrls.add(url);
	new Image().src = url;
}
