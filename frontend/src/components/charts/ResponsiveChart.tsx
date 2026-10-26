import { Children, cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { isPrinting } from '../../lib/printing';

/**
 * A chart that first mounts while the page is printing — one on a tab that was not open — has no
 * time to measure its container or play its entry animation before the browser takes the page,
 * and would print empty. Give it a size to draw at until it can measure (about a card's width on
 * an A4 page) and draw its series without animating.
 */
const PRINT_SIZE = { width: 640, height: 250 };

type Animatable = { defaultProps?: { isAnimationActive?: unknown } };

/** The series of a chart (lines, bars, areas) with animation off; everything else as it was. */
function withoutAnimation(chart: ReactNode): ReactNode {
  if (!isValidElement<{ children?: ReactNode }>(chart)) {
    return chart;
  }
  const series = Children.map(chart.props.children, (child) =>
    isValidElement(child) && (child.type as Animatable).defaultProps?.isAnimationActive !== undefined
      ? cloneElement(child as ReactElement<{ isAnimationActive?: boolean }>, { isAnimationActive: false })
      : child,
  );
  return cloneElement(chart, undefined, series);
}

export function ResponsiveChart({ children, initialDimension, ...props }: ComponentProps<typeof ResponsiveContainer>) {
  const printing = isPrinting();
  return (
    <ResponsiveContainer {...props} initialDimension={printing ? PRINT_SIZE : initialDimension}>
      {printing ? (withoutAnimation(children) as ReactElement) : children}
    </ResponsiveContainer>
  );
}
