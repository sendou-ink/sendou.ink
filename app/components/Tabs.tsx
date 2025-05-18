import clsx from "clsx";
import type * as React from "react";

// shares styles with SubNav.tsx

export function Tabs({
	children,
	className,
	compact = false,
}: {
	children: React.ReactNode;
	className?: string;
	compact?: boolean;
}) {
	return (
		<div className={clsx("sub-nav__container", className, { compact })}>
			{children}
		</div>
	);
}

export function Tab({
	children,
	className,
	active,
	onClick,
	testId,
}: {
	children: React.ReactNode;
	className?: string;
	active: boolean;
	onClick: () => void;
	testId?: string;
}) {
	// TODO: improve semantic html here, maybe could use tab component from Headless UI?
	return (
		<div
			className={clsx("sub-nav__link__container", { active })}
			onClick={onClick}
			tabIndex={0}
			// biome-ignore lint/a11y/useSemanticElements: this component is deprecated
			role="button"
			aria-pressed="false"
			data-testid={testId}
		>
			<div className={clsx("sub-nav__link", className)}>{children}</div>
			<div className="sub-nav__border-guy" />
		</div>
	);
}
