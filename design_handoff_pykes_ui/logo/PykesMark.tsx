type Props = { size?: number; variant?: "tile" | "glyph"; color?: string };

// Pykes sprout mark. Pixel geometry on a 12x12 grid — keep integer coords.
const PX: [number, number, number, number][] = [
  [5, 4, 2, 8],
  [1, 2, 4, 1], [0, 3, 5, 1], [1, 4, 4, 1], [3, 5, 2, 1],
  [7, 0, 4, 1], [7, 1, 5, 1], [7, 2, 4, 1], [7, 3, 2, 1],
];

export function PykesMark({ size = 24, variant = "tile", color }: Props) {
  const green = "#3ec27a";
  const ink = "#0d2618";
  const cells = PX.map(([x, y, w, h], i) => (
    <rect key={i} x={x} y={y} width={w} height={h} fill={color ?? (variant === "tile" ? ink : green)} />
  ));

  if (variant === "glyph") {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" role="img" aria-label="Pykes">
        {cells}
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" shapeRendering="crispEdges" role="img" aria-label="Pykes">
      <rect width={32} height={32} rx={7} fill={green} />
      <g transform="translate(5 5) scale(1.8333)">{cells}</g>
    </svg>
  );
}
