// adapted from https://github.com/cedricdelpoux/react-responsive-masonry

import React from "react";
import { createBreakpoint } from "react-use";
import Masonry from "./Masonry";

const COLUMN_COUNTS = {
	L: 3,
	M: 2,
	S: 1,
};

const useBreakpoint = createBreakpoint({ L: 900, M: 750, S: 350 });

const MasonryResponsive = ({
	children,
}: { children: React.ReactNode | React.ReactNode[] }) => {
	const breakpoint = useBreakpoint() as "L" | "M" | "S";

	const columnsCount = COLUMN_COUNTS[breakpoint];

	return (
		<div>
			{React.Children.map(children, (child, index) =>
				React.cloneElement(child as React.ReactElement, {
					key: index,
					columnsCount,
				}),
			)}
		</div>
	);
};

export function ResponsiveMasonry({ children }: { children: React.ReactNode }) {
	return (
		<MasonryResponsive>
			<Masonry gutter="1rem">{children}</Masonry>
		</MasonryResponsive>
	);
}
