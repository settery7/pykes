export const STAGE_LABELS = ["Bare soil", "Sprouting", "Blooming", "Growing wild", "Small woods", "Full garden"];
export const POST_TYPES = ["update", "idea", "bug", "shipped", "release"];

export function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function fmtTimeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24);
  return d + "d ago";
}
