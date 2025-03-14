import React from "react";

interface MasonryProps {
	children: React.ReactNode | React.ReactNode[];
	columnsCount?: number;
	gutter?: string;
	className?: string;
	style?: React.CSSProperties;
	containerTag?: keyof JSX.IntrinsicElements;
	itemTag?: keyof JSX.IntrinsicElements;
	itemStyle?: React.CSSProperties;
	sequential?: boolean;
}

interface MasonryState {
	columns: React.ReactNode[][];
	childRefs: React.RefObject<HTMLDivElement>[];
	hasDistributed: boolean;
	children?: React.ReactNode | React.ReactNode[];
}

class Masonry extends React.Component<MasonryProps, MasonryState> {
	static defaultProps: Partial<MasonryProps> = {
		columnsCount: 3,
		gutter: "0",
		className: undefined,
		style: {},
		containerTag: "div",
		itemTag: "div",
		itemStyle: {},
		sequential: false,
	};

	constructor(props: MasonryProps) {
		super(props);
		this.state = { columns: [], childRefs: [], hasDistributed: false };
	}

	componentDidUpdate() {
		if (!this.state.hasDistributed && !this.props.sequential) {
			this.distributeChildren();
		}
	}

	static getDerivedStateFromProps(props: MasonryProps, state: MasonryState) {
		const { children, columnsCount } = props;
		const hasColumnsChanged = columnsCount !== state.columns.length;
		if (state && children === state.children && !hasColumnsChanged) return null;
		return {
			...Masonry.getEqualCountColumns(children, columnsCount!),
			children,
			hasDistributed: false,
		};
	}

	shouldComponentUpdate(nextProps: MasonryProps) {
		return (
			nextProps.children !== this.state.children ||
			nextProps.columnsCount !== this.props.columnsCount
		);
	}

	distributeChildren() {
		const { children, columnsCount } = this.props;
		const columnHeights = Array(columnsCount!).fill(0);

		const isReady = this.state.childRefs.every(
			(ref) => ref.current?.getBoundingClientRect().height,
		);

		if (!isReady) return;

		const columns: React.ReactNode[][] = Array.from(
			{ length: columnsCount! },
			() => [],
		);
		let validIndex = 0;
		React.Children.forEach(children, (child) => {
			if (child && React.isValidElement(child)) {
				const childHeight =
					this.state.childRefs[validIndex].current!.getBoundingClientRect()
						.height;
				const minHeightColumnIndex = columnHeights.indexOf(
					Math.min(...columnHeights),
				);
				columnHeights[minHeightColumnIndex] += childHeight;
				columns[minHeightColumnIndex].push(child);
				validIndex++;
			}
		});

		this.setState((p) => ({ ...p, columns, hasDistributed: true }));
	}

	static getEqualCountColumns(
		children: React.ReactNode | React.ReactNode[],
		columnsCount: number,
	) {
		const columns: React.ReactNode[][] = Array.from(
			{ length: columnsCount },
			() => [],
		);
		let validIndex = 0;
		const childRefs: React.RefObject<HTMLDivElement>[] = [];
		React.Children.forEach(children, (child) => {
			if (child && React.isValidElement(child)) {
				const ref = React.createRef<HTMLDivElement>();
				childRefs.push(ref);
				columns[validIndex % columnsCount].push(
					<div
						style={{ display: "flex", justifyContent: "stretch" }}
						key={validIndex}
						ref={ref}
					>
						{child}
					</div>,
				);
				validIndex++;
			}
		});
		return { columns, childRefs };
	}

	renderColumns() {
		const { gutter, itemTag, itemStyle } = this.props;
		return this.state.columns.map((column, i) =>
			React.createElement(
				itemTag!,
				{
					key: i,
					style: {
						display: "flex",
						flexDirection: "column",
						justifyContent: "flex-start",
						alignContent: "stretch",
						flex: 1,
						width: 0,
						gap: gutter,
						...itemStyle,
					},
				},
				column.map((item) => item),
			),
		);
	}

	render() {
		const { gutter, className, style, containerTag } = this.props;

		return React.createElement(
			containerTag!,
			{
				style: {
					display: "flex",
					flexDirection: "row",
					justifyContent: "center",
					alignContent: "stretch",
					boxSizing: "border-box",
					width: "100%",
					gap: gutter,
					...style,
				},
				className,
			},
			this.renderColumns(),
		);
	}
}

export default Masonry;
