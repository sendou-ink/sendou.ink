import clsx from "clsx";
import { Check, Clipboard, Dot, Trash2, TriangleAlert, X } from "lucide-react";
import type { RenderStats } from "picocad2-web";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Form, Link, type MetaFunction, useLoaderData } from "react-router";
import { Alert } from "~/components/Alert";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { OrganizationSearch } from "~/components/elements/OrganizationSearch";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { UserSearch } from "~/components/elements/UserSearch";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { tournamentOrganizationPage } from "~/features/tournament-organization/tournament-organization-urls";
import type { CustomFieldRenderProps } from "~/form/FormField";
import { SendouForm } from "~/form/SendouForm";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { useDebounce } from "~/hooks/useDebounce";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	navIconUrl,
	PICOCAD2_WEB_VIEWER_URL,
	SENDOU_INK_DISCORD_URL,
	TROPHIES_PAGE,
	userPage,
} from "~/utils/urls";
import { action } from "../actions/trophies.new.server";
import { Trophy, TrophyContextProvider } from "../components/Trophy";
import {
	analyzeTrophyModel,
	mergePeakRenderStats,
	type TrophyModelAnalysis,
} from "../core/model-analysis";
import {
	loader,
	type NewTrophyLoaderData,
} from "../loaders/trophies.new.server";
import {
	TROPHY_APPROVALS_REQUIRED,
	TROPHY_DECLINE_REASON_MAX_LENGTH,
	TROPHY_MODEL_RECOMMENDED_MAX_DRAW_CALLS,
	TROPHY_MODEL_RECOMMENDED_MAX_EFFECTS,
	TROPHY_MODEL_RECOMMENDED_MAX_POLYS,
	TROPHY_PENDING_PER_USER_LIMIT,
} from "../trophies-constants";
import {
	createTrophyFormSchema,
	pendingTrophyActionSchema,
	updateTrophyFormSchema,
} from "../trophies-schemas";
import {
	compressTrophyModel,
	decompressTrophyModel,
	useProgressiveRender,
	useTrophyTermsAgreement,
} from "../trophies-utils";
import styles from "./trophies.new.module.css";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: "trophies",
	breadcrumb: () => ({
		imgPath: navIconUrl("trophies"),
		href: TROPHIES_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "New trophy",
		ogTitle: "Submit a new trophy",
		location: args.location,
		description: "Submit a new trophy for review.",
	});
};

export default function NewTrophyPage() {
	const { t } = useTranslation(["trophies"]);
	const data = useLoaderData<typeof loader>();

	return (
		<Main halfWidth>
			<SendouTabs>
				<SendouTabList>
					<SendouTab id="upload">{t("trophies:new.tabs.upload")}</SendouTab>
					<SendouTab
						id="update"
						isDisabled={data.editableTrophies.length === 0}
					>
						{t("trophies:new.tabs.update")}
					</SendouTab>
					<SendouTab id="pending" number={data.pendingTrophies.length}>
						{t("trophies:new.tabs.pending")}
					</SendouTab>
					<SendouTab id="reviewed">{t("trophies:new.tabs.reviewed")}</SendouTab>
				</SendouTabList>
				<SendouTabPanel id="upload">
					{data.ownUnreviewedCount >= TROPHY_PENDING_PER_USER_LIMIT ? (
						<Alert variation="WARNING">
							{t("trophies:new.form.limitReached", {
								limit: TROPHY_PENDING_PER_USER_LIMIT,
							})}
						</Alert>
					) : (
						<TrophyTermsGate>
							<NewTrophyForm key={data.ownUnreviewedCount} />
						</TrophyTermsGate>
					)}
				</SendouTabPanel>
				<SendouTabPanel id="update">
					{data.ownUnreviewedCount >= TROPHY_PENDING_PER_USER_LIMIT ? (
						<Alert variation="WARNING">
							{t("trophies:new.form.limitReached", {
								limit: TROPHY_PENDING_PER_USER_LIMIT,
							})}
						</Alert>
					) : (
						<UpdateTrophyTab key={data.ownUnreviewedCount} />
					)}
				</SendouTabPanel>
				<SendouTabPanel id="pending">
					<TrophyList items={data.pendingTrophies} listKind="pending" />
				</SendouTabPanel>
				<SendouTabPanel id="reviewed">
					<TrophyList items={data.reviewedTrophies} listKind="reviewed" />
				</SendouTabPanel>
			</SendouTabs>
		</Main>
	);
}

function TrophyTermsGate({ children }: { children: React.ReactNode }) {
	const { t } = useTranslation(["trophies"]);
	const { hasAgreedToTerms, agreeToTerms } = useTrophyTermsAgreement();

	if (hasAgreedToTerms) return children;

	return (
		<div className={styles.terms}>
			<h2 className={styles.termsTitle}>{t("trophies:new.terms.title")}</h2>
			<p>{t("trophies:new.terms.intro")}</p>
			<div>
				<p className={styles.termsGroupTitle}>
					{t("trophies:new.terms.oneOff.title")}
				</p>
				<ul className={styles.termsList}>
					<li>{t("trophies:new.terms.trustedOrg")}</li>
					<li>{t("trophies:new.terms.oneOff.pastTournaments")}</li>
					<li>{t("trophies:new.terms.oneOff.projectedTeams")}</li>
					<li>{t("trophies:new.terms.oneOff.signedUpTeams")}</li>
				</ul>
			</div>
			<div>
				<p className={styles.termsGroupTitle}>
					{t("trophies:new.terms.series.title")}
				</p>
				<ul className={styles.termsList}>
					<li>{t("trophies:new.terms.trustedOrg")}</li>
					<li>{t("trophies:new.terms.series.consistentTeams")}</li>
				</ul>
			</div>
			<div>
				<p className={styles.termsDisclaimer}>
					{t("trophies:new.terms.disclaimer")}
				</p>
				<p>
					<Trans t={t} i18nKey="trophies:new.terms.preApproval">
						If you are unsure if your tournament is eligible, feel free to
						acquire a pre-approval by creating a pre-approval request in the
						<a
							href={SENDOU_INK_DISCORD_URL}
							target="_blank"
							rel="noopener noreferrer"
						>
							Discord server
						</a>
						.
					</Trans>
				</p>
			</div>
			<SendouButton className={styles.termsAgreeButton} onPress={agreeToTerms}>
				{t("trophies:new.terms.agree")}
			</SendouButton>
		</div>
	);
}

function NewTrophyForm() {
	const { t } = useTranslation(["trophies"]);

	return (
		<SendouForm schema={createTrophyFormSchema}>
			{({ FormField }) => (
				<>
					<FormField name="name" />
					<FormField name="organizationId">
						{({ error, value, onChange }: CustomFieldRenderProps) => (
							<OrganizationField
								error={error}
								value={value as number | null}
								onChange={onChange}
							/>
						)}
					</FormField>
					<FormField name="model">
						{({ name, error, value, onChange }: CustomFieldRenderProps) => (
							<ModelField
								name={name}
								error={error}
								value={value as string}
								onChange={onChange}
							/>
						)}
					</FormField>
					<FormField name="description" />
					<FormMessage type="info">
						{t("trophies:new.form.creatorNotice")}
					</FormMessage>
				</>
			)}
		</SendouForm>
	);
}

function UpdateTrophyTab() {
	const { t } = useTranslation(["trophies"]);
	const data = useLoaderData<typeof loader>();
	const [selectedId, setSelectedId] = React.useState<number | null>(null);

	const selectedTrophy = data.editableTrophies.find((t) => t.id === selectedId);

	return (
		<div className={styles.updateContainer}>
			<SendouSelect
				label={t("trophies:new.update.selectLabel")}
				items={data.editableTrophies}
				search={{ placeholder: t("trophies:new.update.searchPlaceholder") }}
				selectedKey={selectedId}
				onSelectionChange={(key) => setSelectedId(key as number)}
			>
				{(trophy) => (
					<SendouSelectItem
						key={trophy.id}
						id={trophy.id}
						textValue={trophy.name}
					>
						{trophy.name}
					</SendouSelectItem>
				)}
			</SendouSelect>
			{selectedTrophy ? (
				<UpdateTrophyForm key={selectedTrophy.id} trophy={selectedTrophy} />
			) : null}
		</div>
	);
}

function UpdateTrophyForm({
	trophy,
}: {
	trophy: NewTrophyLoaderData["editableTrophies"][number];
}) {
	const decompressedModel = decompressTrophyModel(trophy.model) ?? "";

	return (
		<SendouForm
			schema={updateTrophyFormSchema}
			defaultValues={{
				targetTrophyId: trophy.id,
				name: trophy.name,
				model: decompressedModel,
				organizationId: trophy.organizationId,
				managerId: trophy.managerId,
				description: "",
			}}
		>
			{({ FormField }) => (
				<>
					<FormField name="name" />
					<FormField name="organizationId">
						{({ error, value, onChange }: CustomFieldRenderProps) => (
							<OrganizationField
								error={error}
								value={value as number | null}
								onChange={onChange}
							/>
						)}
					</FormField>
					<FormField name="managerId">
						{({ error, value, onChange }: CustomFieldRenderProps) => (
							<ManagerField
								error={error}
								value={value as number | null}
								onChange={onChange}
							/>
						)}
					</FormField>
					<FormField name="model">
						{({ name, error, value, onChange }: CustomFieldRenderProps) => (
							<ModelField
								name={name}
								error={error}
								value={value as string}
								onChange={onChange}
							/>
						)}
					</FormField>
					<FormField name="description" />
				</>
			)}
		</SendouForm>
	);
}

function ManagerField({
	error,
	value,
	onChange,
}: {
	error?: string;
	value: number | null;
	onChange: (value: number | null) => void;
}) {
	const { t } = useTranslation(["forms"]);

	return (
		<div>
			<Label required>{t("forms:labels.trophyManager")}</Label>
			<UserSearch
				initialUserId={value ?? undefined}
				onChange={(user) => onChange(user?.id ?? null)}
			/>
			{error ? <FormMessage type="error">{error}</FormMessage> : null}
		</div>
	);
}

function ModelField({
	name,
	error,
	value,
	onChange,
}: {
	name: string;
	error?: string;
	value: string;
	onChange: (value: string) => void;
}) {
	const { t } = useTranslation(["forms", "trophies"]);
	const [preview, setPreview] = React.useState(() => buildModelPreview(value));
	const [peak, setPeak] = React.useState<{
		model: string;
		stats: RenderStats;
	} | null>(null);

	useDebounce(() => setPreview(buildModelPreview(value)), 500, [value]);

	const reportRenderStats = (stats: RenderStats) => {
		const model = preview.compressedModel;
		setPeak((prev) => {
			const previousStats = prev?.model === model ? prev.stats : null;
			const merged = mergePeakRenderStats(previousStats, stats);
			return merged === previousStats ? prev : { model, stats: merged };
		});
	};

	const peakStats = peak?.model === preview.compressedModel ? peak.stats : null;

	return (
		<div>
			<Label htmlFor={name} required>
				{t("forms:labels.trophyModel")}
			</Label>
			<textarea
				id={name}
				className={styles.modelTextarea}
				value={value ?? ""}
				onChange={(e) => onChange(e.target.value)}
				spellCheck={false}
			/>
			<FormMessage type="info">
				{t("forms:bottomTexts.trophyModel")}
				<a
					href={PICOCAD2_WEB_VIEWER_URL}
					target="_blank"
					rel="noopener noreferrer"
				>
					{" "}
					PicoCAD2 Web Viewer
				</a>
			</FormMessage>
			{error ? <FormMessage type="error">{error}</FormMessage> : null}
			{preview.compressedModel ? (
				<TrophyContextProvider>
					<div className={styles.previewThemes}>
						{(["light", "dark"] as const).map((theme) => (
							<div
								key={theme}
								className={styles.previewTheme}
								data-theme={theme}
							>
								<span className={styles.previewThemeLabel}>
									{t(`trophies:new.form.preview.${theme}`)}
								</span>
								<Trophy
									model={preview.compressedModel}
									className={styles.trophyPreview}
									preview
									tier={1}
								/>
								<Trophy
									model={preview.compressedModel}
									className={styles.trophyPreview}
									onRenderStats={reportRenderStats}
								/>
							</div>
						))}
					</div>
				</TrophyContextProvider>
			) : null}
			<ModelSpecs analysis={preview.analysis} peakStats={peakStats} />
		</div>
	);
}

function buildModelPreview(model: string) {
	if (!model) return { compressedModel: "", analysis: null };

	return {
		compressedModel: compressTrophyModel(model),
		analysis: analyzeTrophyModel(model),
	};
}

function ModelSpecs({
	analysis,
	peakStats,
}: {
	analysis: TrophyModelAnalysis | null;
	peakStats: RenderStats | null;
}) {
	const { t } = useTranslation(["trophies"]);

	const enforcedStatus = (passes: boolean) =>
		analysis ? (passes ? "pass" : "fail") : null;
	const recommendedStatus = (withinLimit: boolean) =>
		analysis ? (withinLimit ? "pass" : "warn") : null;

	const drawCalls = peakStats?.drawCalls ?? analysis?.drawCalls ?? 0;
	const polyCount = peakStats?.polyCount ?? analysis?.polyCount ?? 0;

	return (
		<div className={styles.modelSpecs}>
			<div>
				<div className={styles.termsGroupTitle}>
					{t("trophies:new.specs.required")}
				</div>
				<ul className={styles.specList}>
					<SpecItem status={enforcedStatus(!!analysis?.cameraTargetCentered)}>
						{t("trophies:new.specs.cameraTarget")}
					</SpecItem>
					<SpecItem status={enforcedStatus(!!analysis?.backgroundIsAlpha)}>
						{t("trophies:new.specs.background")}
					</SpecItem>
					<SpecItem>{t("trophies:new.specs.centered")}</SpecItem>
					<SpecItem>{t("trophies:new.specs.zoom")}</SpecItem>
					<SpecItem>{t("trophies:new.specs.angles")}</SpecItem>
					<SpecItem>{t("trophies:new.specs.noStandaloneFlag")}</SpecItem>
					<SpecItem>{t("trophies:new.specs.noTrademarked")}</SpecItem>
				</ul>
			</div>
			<div>
				<div className={styles.termsGroupTitle}>
					{t("trophies:new.specs.recommended")}
				</div>
				<ul className={styles.specList}>
					<SpecItem
						status={recommendedStatus(
							drawCalls <= TROPHY_MODEL_RECOMMENDED_MAX_DRAW_CALLS,
						)}
						detail={
							analysis
								? t("trophies:new.specs.currentValue", {
										value: drawCalls,
									})
								: undefined
						}
					>
						{t("trophies:new.specs.drawCalls", {
							value: TROPHY_MODEL_RECOMMENDED_MAX_DRAW_CALLS,
						})}
					</SpecItem>
					<SpecItem
						status={recommendedStatus(
							polyCount <= TROPHY_MODEL_RECOMMENDED_MAX_POLYS,
						)}
						detail={
							analysis
								? t("trophies:new.specs.currentValue", {
										value: polyCount,
									})
								: undefined
						}
					>
						{t("trophies:new.specs.polys", {
							value: TROPHY_MODEL_RECOMMENDED_MAX_POLYS,
						})}
					</SpecItem>
					<SpecItem
						status={recommendedStatus(
							!!analysis &&
								analysis.effectsCount <= TROPHY_MODEL_RECOMMENDED_MAX_EFFECTS,
						)}
						detail={
							analysis
								? t("trophies:new.specs.currentValue", {
										value: analysis.effectsCount,
									})
								: undefined
						}
					>
						{t("trophies:new.specs.effects", {
							value: TROPHY_MODEL_RECOMMENDED_MAX_EFFECTS,
						})}
					</SpecItem>
				</ul>
			</div>
		</div>
	);
}

function SpecItem({
	children,
	status,
	detail,
}: {
	children: React.ReactNode;
	status?: "pass" | "fail" | "warn" | null;
	detail?: string;
}) {
	return (
		<li className={styles.specItem}>
			{status === "pass" ? (
				<Check className={clsx(styles.specIcon, styles.specIconPass)} />
			) : status === "fail" ? (
				<X className={clsx(styles.specIcon, styles.specIconFail)} />
			) : status === "warn" ? (
				<TriangleAlert className={clsx(styles.specIcon, styles.specIconWarn)} />
			) : (
				<Dot className={styles.specIcon} />
			)}
			<span>
				{children}
				{detail ? <span className={styles.specDetail}> {detail}</span> : null}
			</span>
		</li>
	);
}

function OrganizationField({
	error,
	value,
	onChange,
}: {
	error?: string;
	value: number | null;
	onChange: (value: number | null) => void;
}) {
	const { t } = useTranslation(["forms"]);

	return (
		<div>
			<Label required>{t("forms:labels.trophyOrganization")}</Label>
			<OrganizationSearch
				initialOrganizationId={value ?? undefined}
				onChange={(org) => onChange(org?.id ?? null)}
			/>
			{error ? <FormMessage type="error">{error}</FormMessage> : null}
		</div>
	);
}

function TrophyList({
	items,
	listKind,
}: {
	items: NewTrophyLoaderData["pendingTrophies"];
	listKind: "pending" | "reviewed";
}) {
	const { t } = useTranslation(["trophies"]);
	const data = useLoaderData<typeof loader>();
	const visibleCount = useProgressiveRender(items.length, listKind);

	if (items.length === 0) {
		return (
			<Alert>
				{listKind === "pending"
					? t("trophies:new.pending.empty")
					: t("trophies:new.reviewed.empty")}
			</Alert>
		);
	}

	return (
		<TrophyContextProvider>
			<div className={styles.pendingList}>
				{items.slice(0, visibleCount).map((item) => (
					<TrophyListRow
						key={item.id}
						pending={item}
						currentUserId={data.currentUserId}
						canReview={data.canReview}
					/>
				))}
			</div>
		</TrophyContextProvider>
	);
}

function TrophyListRow({
	pending,
	currentUserId,
	canReview,
}: {
	pending: NewTrophyLoaderData["pendingTrophies"][number];
	currentUserId: number;
	canReview: boolean;
}) {
	const { t } = useTranslation(["trophies", "common"]);
	const { submit, state } = useActionSubmit(pendingTrophyActionSchema);

	const isOwner = pending.submitterUserId === currentUserId;
	const isDeclined = pending.declinedAt !== null;
	const isAccepted = pending.acceptedAt !== null;
	const isReviewed = isDeclined || isAccepted;
	const alreadyApproved = pending.approvals.some(
		(a) => a.userId === currentUserId,
	);

	const handleDelete = () => {
		submit("DELETE", { pendingTrophyId: pending.id });
	};

	const handleApprove = () => {
		submit("APPROVE", { pendingTrophyId: pending.id });
	};

	const [previewOpen, setPreviewOpen] = React.useState(false);

	const [analysis] = React.useState(() =>
		analyzeTrophyModel(decompressTrophyModel(pending.model) ?? ""),
	);

	const [peakStats, setPeakStats] = React.useState<RenderStats | null>(null);
	const reportRenderStats = (stats: RenderStats) =>
		setPeakStats((prev) => mergePeakRenderStats(prev, stats));

	const drawCalls = peakStats?.drawCalls ?? analysis?.drawCalls ?? 0;
	const polyCount = peakStats?.polyCount ?? analysis?.polyCount ?? 0;

	return (
		<div className={styles.pendingItem} data-testid="pending-trophy">
			<button
				type="button"
				className={styles.trophyPreviewButton}
				onClick={() => setPreviewOpen(true)}
			>
				<Trophy model={pending.model} preview />
			</button>
			<SendouDialog
				heading={pending.name}
				isOpen={previewOpen}
				onClose={() => setPreviewOpen(false)}
				showCloseButton
			>
				<Trophy
					model={pending.model}
					className={styles.trophyPreview}
					onRenderStats={reportRenderStats}
				/>
			</SendouDialog>
			<div className={styles.pendingMain}>
				<div className={styles.pendingHeader}>
					{pending.target ? (
						<span className={styles.editingBadge}>
							{t("trophies:new.update.editing")}
						</span>
					) : null}
					{pending.target &&
					pending.submitterUserId !== pending.target.managerId ? (
						<span className={styles.notManagerBadge}>
							{t("trophies:new.pending.notFromManager")} (
							{pending.submitterUsername})
						</span>
					) : null}
					<span className={styles.pendingName}>{pending.name}</span>
					<span className={styles.pendingMeta}>
						{pending.manager?.discordId ? (
							<Link to={userPage({ discordId: pending.manager.discordId })}>
								{pending.manager.username}
							</Link>
						) : pending.submitterDiscordId ? (
							<Link to={userPage({ discordId: pending.submitterDiscordId })}>
								{pending.submitterUsername}
							</Link>
						) : (
							pending.submitterUsername
						)}
						{pending.organizationName ? (
							<>
								{" • "}
								{pending.organizationSlug ? (
									<Link
										to={tournamentOrganizationPage({
											organizationSlug: pending.organizationSlug,
										})}
									>
										{pending.organizationName}
									</Link>
								) : (
									pending.organizationName
								)}
							</>
						) : null}
					</span>
				</div>
				{analysis ? (
					<div className={styles.pendingSpecs}>
						<span
							className={clsx({
								[styles.pendingSpecsWarn]:
									drawCalls > TROPHY_MODEL_RECOMMENDED_MAX_DRAW_CALLS,
							})}
						>
							{t("trophies:new.specs.stats.drawCalls", {
								value: drawCalls,
							})}
						</span>
						<span
							className={clsx({
								[styles.pendingSpecsWarn]:
									polyCount > TROPHY_MODEL_RECOMMENDED_MAX_POLYS,
							})}
						>
							{t("trophies:new.specs.stats.polys", {
								value: polyCount,
							})}
						</span>
						<span
							className={clsx({
								[styles.pendingSpecsWarn]:
									analysis.effectsCount > TROPHY_MODEL_RECOMMENDED_MAX_EFFECTS,
							})}
						>
							{t("trophies:new.specs.stats.effects", {
								value: analysis.effectsCount,
							})}
						</span>
						{!analysis.cameraTargetCentered ? (
							<span className={styles.pendingSpecsError}>
								{t("trophies:new.specs.stats.cameraTargetOff")}
							</span>
						) : null}
						{!analysis.backgroundIsAlpha ? (
							<span className={styles.pendingSpecsError}>
								{t("trophies:new.specs.stats.backgroundNotAlpha")}
							</span>
						) : null}
					</div>
				) : null}
				{pending.target ? (
					<PendingTrophyDiff pending={pending} target={pending.target} />
				) : null}
				{pending.description ? (
					<div className={styles.pendingDescription}>{pending.description}</div>
				) : null}
				{pending.approvals.length > 0 && !isDeclined ? (
					<div className={styles.accepted}>
						<p>
							{t("trophies:new.pending.approvalProgress", {
								current: pending.approvals.length,
								required: TROPHY_APPROVALS_REQUIRED,
							})}
						</p>
						<p>
							{canReview
								? `(${pending.approvals.map((a) => a.username).join(", ")})`
								: ""}
						</p>
					</div>
				) : null}
				{isDeclined ? (
					<div className={styles.declined}>
						<p>
							{pending.declinedByUsername
								? t("trophies:new.pending.declinedBy", {
										name: pending.declinedByUsername,
									})
								: t("trophies:new.pending.declined")}
						</p>
						<div>{pending.declineReason}</div>
					</div>
				) : null}
				<div className={styles.pendingActions}>
					{canReview && !isReviewed ? (
						<>
							<SendouButton
								size="small"
								onPress={handleApprove}
								isDisabled={state !== "idle" || alreadyApproved}
							>
								{alreadyApproved
									? t("trophies:new.pending.approved")
									: t("trophies:new.pending.approve")}
							</SendouButton>
							<DeclineButton pendingTrophyId={pending.id} />
							<SendouButton
								variant="outlined"
								size="small"
								shape="square"
								icon={<Clipboard size={16} />}
								onPress={() =>
									navigator.clipboard.writeText(
										decompressTrophyModel(pending.model ?? "{}") ?? "",
									)
								}
							/>
						</>
					) : null}
					{isOwner || canReview ? (
						<SendouButton
							variant="minimal-destructive"
							size="small"
							shape="square"
							onPress={handleDelete}
							isDisabled={state !== "idle"}
							icon={<Trash2 size={16} />}
						/>
					) : null}
				</div>
			</div>
		</div>
	);
}

function DeclineButton({ pendingTrophyId }: { pendingTrophyId: number }) {
	const { t } = useTranslation(["trophies"]);
	const [isOpen, setIsOpen] = React.useState(false);
	const [reason, setReason] = React.useState("");
	const { submit, fetcher } = useActionSubmit(pendingTrophyActionSchema);
	const id = React.useId();

	React.useEffect(() => {
		if (fetcher.state === "idle" && fetcher.data === null && isOpen) {
			setIsOpen(false);
			setReason("");
		}
	}, [fetcher.state, fetcher.data, isOpen]);

	return (
		<>
			<SendouButton
				variant="outlined-destructive"
				size="small"
				onPress={() => setIsOpen(true)}
			>
				{t("trophies:new.pending.decline")}
			</SendouButton>
			{isOpen ? (
				<SendouDialog
					heading={t("trophies:new.pending.declineHeading")}
					isOpen={isOpen}
					onClose={() => setIsOpen(false)}
					showCloseButton
				>
					<Form
						method="post"
						className={styles.dialogForm}
						onSubmit={(e) => {
							e.preventDefault();
							submit("DECLINE", { pendingTrophyId, reason });
						}}
					>
						<div>
							<Label
								htmlFor={id}
								required
								valueLimits={{
									current: reason.length,
									max: TROPHY_DECLINE_REASON_MAX_LENGTH,
								}}
							>
								{t("trophies:new.pending.declineReason")}
							</Label>
							<textarea
								id={id}
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								maxLength={TROPHY_DECLINE_REASON_MAX_LENGTH}
								required
							/>
						</div>
						<SendouButton
							type="submit"
							variant="destructive"
							isDisabled={!reason.trim() || fetcher.state !== "idle"}
						>
							{t("trophies:new.pending.decline")}
						</SendouButton>
					</Form>
				</SendouDialog>
			) : null}
		</>
	);
}

function PendingTrophyDiff({
	pending,
	target,
}: {
	pending: NewTrophyLoaderData["pendingTrophies"][number];
	target: NonNullable<NewTrophyLoaderData["pendingTrophies"][number]["target"]>;
}) {
	const { t } = useTranslation(["trophies", "forms"]);

	const newManagerId = pending.managerId ?? pending.submitterUserId;
	const newManagerName =
		pending.manager?.username ?? pending.submitterUsername ?? "?";

	const fields: Array<{
		label: string;
		oldValue: React.ReactNode;
		newValue: React.ReactNode;
		changed: boolean;
	}> = [
		{
			label: t("forms:labels.trophyName"),
			oldValue: target.name,
			newValue: pending.name,
			changed: target.name !== pending.name,
		},
		{
			label: t("forms:labels.trophyOrganization"),
			oldValue: target.organizationName ?? "—",
			newValue: pending.organizationName ?? "—",
			changed: target.organizationId !== pending.organizationId,
		},
		{
			label: t("forms:labels.trophyManager"),
			oldValue: target.managerUsername ?? "—",
			newValue: newManagerName,
			changed: target.managerId !== newManagerId,
		},
		{
			label: t("forms:labels.trophyModel"),
			oldValue: "-----",
			newValue: "-----",
			changed: target.model !== pending.model,
		},
	];

	const changedFields = fields.filter((field) => field.changed);
	if (changedFields.length === 0) return null;

	return (
		<div className={styles.diffGrid}>
			<div className={styles.diffHeader}>{t("trophies:new.update.before")}</div>
			<div className={styles.diffHeader}>{t("trophies:new.update.after")}</div>
			{changedFields.map((field) => (
				<React.Fragment key={field.label}>
					<div className={styles.diffField}>
						<span className={styles.diffLabel}>{field.label}</span>
						<span className={clsx(styles.diffValue, styles.diffOld)}>
							{field.oldValue}
						</span>
					</div>
					<div className={styles.diffField}>
						<span className={styles.diffLabel}>{field.label}</span>
						<span className={styles.diffValue}>{field.newValue}</span>
					</div>
				</React.Fragment>
			))}
		</div>
	);
}
