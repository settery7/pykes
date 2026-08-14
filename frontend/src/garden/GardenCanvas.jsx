import { useEffect, useRef } from "react";
import { drawGarden, strHash } from "./gardenRenderer.js";

const RESOLUTION = 160; // internal drawing grid; CSS size only scales the display

export default function GardenCanvas({ projectId, stage, displaySize = 160 }) {
  const canvasRef = useRef(null);
  const prevStageRef = useRef(stage);
  const rafRef = useRef(null);
  const clampedStage = Math.min(5, stage);
  const seed = strHash(projectId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const grew = stage > prevStageRef.current;
    prevStageRef.current = stage;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (grew && !reducedMotion) {
      const start = performance.now();
      const duration = 900;
      const step = (t) => {
        const progress = Math.min(1, (t - start) / duration);
        drawGarden(ctx, { stage: clampedStage, seed, progress, size: RESOLUTION });
        if (progress < 1) rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    } else {
      drawGarden(ctx, { stage: clampedStage, seed, progress: 1, size: RESOLUTION });
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [stage, clampedStage, seed]);

  return (
    <canvas
      ref={canvasRef}
      width={RESOLUTION}
      height={RESOLUTION}
      className="garden-canvas"
      style={{ width: displaySize, height: displaySize }}
    />
  );
}
