// Pykes sprout mark. Pixel geometry on a 12x12 grid — keep integer coords.
// Source of truth: design_handoff_pykes_ui/logo/README.md
const PX = [
  [5, 4, 2, 8],
  [1, 2, 4, 1], [0, 3, 5, 1], [1, 4, 4, 1], [3, 5, 2, 1],
  [7, 0, 4, 1], [7, 1, 5, 1], [7, 2, 4, 1], [7, 3, 2, 1],
];

const GREEN = "#3ec27a";
const INK = "#0d2618";

export default function PykesMark({ size = 24, variant = "tile", color, decorative = false }) {
  const fill = color ?? (variant === "tile" ? INK : GREEN);
  const cells = PX.map(([x, y, w, h], i) => (
    <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />
  ));
  // Paired with a visible "Pykes" wordmark at every call site, so the mark is
  // decorative there — labelling it too would read the name twice.
  const label = decorative
    ? { "aria-hidden": "true" }
    : { role: "img", "aria-label": "Pykes" };

  if (variant === "glyph") {
    return (
      <svg className="pykes-mark" width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" {...label}>
        {cells}
      </svg>
    );
  }

  return (
    <svg className="pykes-mark" width={size} height={size} viewBox="0 0 32 32" shapeRendering="crispEdges" {...label}>
      <rect width="32" height="32" rx="7" fill={GREEN} />
      <g transform="translate(5 5) scale(1.8333)">{cells}</g>
    </svg>
  );
}
