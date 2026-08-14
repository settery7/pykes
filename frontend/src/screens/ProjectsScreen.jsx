import { useApp } from "../AppContext.js";
import ProjectCard from "../components/ProjectCard.jsx";

export default function ProjectsScreen() {
  const { myProjects, isMobile, goTo } = useApp();
  const gridCols = isMobile ? "1fr" : "repeat(2, 1fr)";

  return (
    <div>
      <div className="page-header">
        <h1>My projects</h1>
        <button type="button" className="btn btn-primary" onClick={() => goTo("newProject")}>New project</button>
      </div>

      {myProjects.length === 0 && (
        <div className="empty-state">No projects yet. Start one to grow your first garden.</div>
      )}

      <div className="cards-grid" style={{ gridTemplateColumns: gridCols }}>
        {myProjects.map((p) => (
          <ProjectCard key={p.id} project={p} onClick={() => goTo("project", { ownerId: p.owner_id, slug: p.slug })} />
        ))}
      </div>
    </div>
  );
}
