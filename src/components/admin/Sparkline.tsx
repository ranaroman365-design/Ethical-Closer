/**
 * Sparkline — minimal SVG line chart for inline trend visualization.
 * Used in Conversion Intelligence stage table & channel rows.
 */
import { useMemo } from "react";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  className?: string;
}

export function Sparkline({
  values,
  width = 64,
  height = 18,
  stroke = "currentColor",
  fill,
  className,
}: SparklineProps) {
  const { d, area, last, isUp } = useMemo(() => {
    if (!values.length) return { d: "", area: "", last: 0, isUp: true };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const stepX = values.length > 1 ? width / (values.length - 1) : width;
    const points = values.map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / span) * (height - 2) - 1;
      return [x, y] as const;
    });
    const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const areaPath = `${path} L${width},${height} L0,${height} Z`;
    return {
      d: path,
      area: areaPath,
      last: points[points.length - 1][1],
      isUp: values[values.length - 1] >= values[0],
    };
  }, [values, width, height]);

  if (!values.length) return null;

  return (
    <svg
      className={`ci-spark ${className ?? ""}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ color: stroke, overflow: "visible" }}
    >
      {fill && <path d={area} fill={fill} opacity={0.18} />}
      <path className="line" d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={last} r={1.8} fill="currentColor" />
    </svg>
  );
}
