export function setFooterYear() {
  const yearNode = document.getElementById("year");
  if (!yearNode) return;
  yearNode.textContent = String(new Date().getFullYear());
}

export function parseSlugFromLocation(pathname = window.location.pathname) {
  const normalized = String(pathname || "").replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);

  if (segments[0] === "trips" && segments[1]) {
    return decodeURIComponent(segments[1]);
  }

  const params = new URLSearchParams(window.location.search);
  const querySlug = params.get("slug") || params.get("tripId") || params.get("trip") || "";
  if (querySlug) return decodeURIComponent(querySlug);

  const hash = String(window.location.hash || "").replace(/^#/, "");
  if (hash.startsWith("slug=")) {
    return decodeURIComponent(hash.slice(5));
  }

  return "";
}