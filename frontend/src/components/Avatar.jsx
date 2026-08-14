import { strHash } from "../garden/gardenRenderer.js";

export default function Avatar({ user, size = 32, onClick }) {
  if (!user) return null;
  const hue = strHash(user.id) % 360;
  const name = user.display_name || user.username || "?";
  const initial = name.charAt(0).toUpperCase();
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      className="avatar"
      onClick={onClick}
      aria-label={onClick ? `Open ${name}'s profile` : undefined}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: user.avatar_url ? undefined : `oklch(0.5 0.09 ${hue})`,
        cursor: onClick ? "pointer" : undefined,
      }}
    >
      {user.avatar_url ? <img src={user.avatar_url} alt="" /> : initial}
    </Tag>
  );
}
