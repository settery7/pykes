import GardenCanvas from "../garden/GardenCanvas.jsx";
import { STAGE_LABELS } from "../utils.js";

export default function ProjectCard({ project, onClick, size = 96 }) {
  const stage = Math.min(5, project.growth_stage);

  return (
    <button type="button" className="card project-card" onClick={onClick}>
      <GardenCanvas projectId={project.id} stage={stage} displaySize={size} />
      <div className="body">
        <div className="p-name">{project.name}</div>
        {project.display_name && <div className="p-owner">by {project.display_name}</div>}
        <div className="p-desc">{project.description}</div>
        <div className="p-stage">{STAGE_LABELS[stage]}</div>
      </div>
    </button>
  );
}
