import { formatDateRange, toSlug } from "./api.js";

export function renderTripCard(trip) {
  const status = getDisplayStatus(trip.status);
  const statusClass = statusToClass(status);
  const imageHtml = trip.hero_image_url
    ? `<img class="trip-thumb" src="${escapeHtml(trip.hero_image_url)}" alt="${escapeHtml(trip.title)}" loading="lazy" data-image-fallback="trip-thumb" />`
    : `<div class="trip-thumb" aria-hidden="true"></div>`;

  const description = trip.summary || "More trip details coming soon.";
  const detailSlug = toSlug(trip.slug || trip.trip_id || trip.title);
  const detailTripId = encodeURIComponent(String(trip.trip_id || "").trim());
  const detailHref = `/trip/?slug=${encodeURIComponent(detailSlug)}&tripId=${detailTripId}`;

  return `
    <article class="card">
      ${imageHtml}
      <div class="trip-body">
        <h3>${escapeHtml(trip.title || "Upcoming Adventure")}</h3>
        <p class="trip-meta">${escapeHtml(formatDateRange(trip.start_date, trip.end_date, trip.status))}</p>
        <p class="prose">${escapeHtml(toSnippet(description, 190))}</p>
        ${status ? `<span class="status-pill ${statusClass}">${escapeHtml(status)}</span>` : ""}
        <p><a class="button button-secondary" href="${detailHref}">More Info</a></p>
      </div>
    </article>
  `;
}

export function renderTripGrid(container, trips) {
  if (!container) return;
  if (!trips.length) {
    container.innerHTML = `
      <div class="empty">
        <p class="muted">No trips are currently available. Please check back soon.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = trips.map(renderTripCard).join("\n");
}

function getDriveIdAndResourceKey(src) {
  const text = String(src || "");
  const idMatch = /[?&]id=([a-zA-Z0-9_-]+)/.exec(text) || /\/d\/([a-zA-Z0-9_-]+)/.exec(text);
  const rkMatch = /[?&]resourcekey=([^&]+)/i.exec(text);

  return {
    id: idMatch?.[1] || "",
    rk: rkMatch?.[1] ? decodeURIComponent(rkMatch[1]) : "",
  };
}

function buildDriveCandidates(src) {
  const { id, rk } = getDriveIdAndResourceKey(src);
  if (!id) return [];

  const addRk = (url) => {
    if (!rk) return url;
    const withKey = new URL(url);
    withKey.searchParams.set("resourcekey", rk);
    return withKey.toString();
  };

  const candidates = [
    addRk(`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`),
    addRk(`https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`),
    addRk(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=view`),
    `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w1600`,
  ];

  const seen = new Set();
  return candidates.filter((url) => {
    if (!url || url === src || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function appendCacheBust(url) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("cb", Date.now().toString());
    return parsed.toString();
  } catch {
    const join = String(url || "").includes("?") ? "&" : "?";
    return `${url}${join}cb=${Date.now()}`;
  }
}

function replaceWithFallbackBlock(node) {
  const className = node.getAttribute("data-image-fallback") || "trip-thumb";
  const fallback = document.createElement("div");
  fallback.className = className;
  fallback.setAttribute("aria-hidden", "true");
  node.replaceWith(fallback);
}

export function enableImageFallbacks(scope = document) {
  const nodes = scope.querySelectorAll("img[data-image-fallback]");

  nodes.forEach((node) => {
    // Handle images that already failed before listeners were attached
    // (common for eager-loaded banner images).
    if (node.complete && node.naturalWidth === 0) {
      // Queue to ensure listeners are attached before we trigger fallback flow.
      setTimeout(() => {
        node.dispatchEvent(new Event("error"));
      }, 0);
    }
    node.addEventListener("error", () => {
      const src = node.getAttribute("src") || "";
      const isDrive = src.includes("drive.google.com") || src.includes("googleusercontent.com");

      if (!isDrive) {
        replaceWithFallbackBlock(node);
        return;
      }

      const transientRetryCount = Number(node.getAttribute("data-transient-retries") || "0");
      if (transientRetryCount < 2) {
        node.setAttribute("data-transient-retries", String(transientRetryCount + 1));
        setTimeout(() => {
          node.src = appendCacheBust(src);
        }, 350 * (transientRetryCount + 1));
        return;
      }

      let candidates;
      try {
        candidates = JSON.parse(node.getAttribute("data-fallback-candidates") || "[]");
      } catch {
        candidates = [];
      }

      if (!Array.isArray(candidates) || !candidates.length) {
        candidates = buildDriveCandidates(src);
      }

      const next = candidates.shift();

      if (next) {
        node.setAttribute("data-fallback-candidates", JSON.stringify(candidates));
        node.setAttribute("data-transient-retries", "0");
        node.src = next;
        return;
      }

      replaceWithFallbackBlock(node);
    });
  });
}

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function statusToClass(status) {
  const key = String(status || "").toLowerCase();
  if (key.includes("sold")) return "is-soldout";
  if (key.includes("day trip")) return "is-daytrip";
  if (key.includes("plan") || key.includes("wait")) return "is-planning";
  return "";
}


function getDisplayStatus(status) {
  const key = String(status || "").toLowerCase();
  if (key.includes("sold")) return "Sold Out";
  if (key.includes("daytrip")) return "Day Trip";
  if (key.includes("active")) return "Active";
  return "";
}

function toSnippet(text, maxLength) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}
