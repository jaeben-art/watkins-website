import { getBaseExecUrl, normalizeImageUrl } from "/assets/js/api.js";
import { enableImageFallbacks, escapeHtml } from "/assets/js/render.js";
import { setFooterYear } from "/assets/js/site.js";

setFooterYear();

const DRIVE_FOLDER_URL =
  "https://drive.google.com/drive/folders/1ecJkywvOvKytD11xucTL1BVeUuEtHhWp?usp=sharing";

const grid = document.getElementById("traveler-grid");

function extractDriveFolderId(folderUrl) {
  const text = String(folderUrl || "").trim();
  if (!text) return "";

  const pathMatch = /\/folders\/([a-zA-Z0-9_-]+)/.exec(text);
  if (pathMatch?.[1]) return pathMatch[1];

  const idMatch = /[?&]id=([a-zA-Z0-9_-]+)/.exec(text);
  if (idMatch?.[1] && text.includes("drive.google.com")) return idMatch[1];

  return "";
}

function buildDriveImagesUrl(folderId, options = {}) {
  const url = new URL(getBaseExecUrl());
  url.searchParams.set("route", "driveImages");
  url.searchParams.set("folderId", folderId);

  if (options.bustCache === true) {
    url.searchParams.set("_", Date.now().toString());
  }

  return url.toString();
}

async function fetchFolderImages(folderId, options = {}) {
  const response = await fetch(buildDriveImagesUrl(folderId, options), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch gallery images (${response.status}).`);
  }

  const json = await response.json();
  return Array.isArray(json?.images)
    ? json.images.map((entry) => normalizeImageUrl(entry)).filter(Boolean)
    : [];
}

async function fetchGalleryImages(folderId) {
  let urls = await fetchFolderImages(folderId, { bustCache: false });
  if (!urls.length) {
    urls = await fetchFolderImages(folderId, { bustCache: true });
  }
  return urls;
}


function extractDriveFileId(imageUrl) {
  const text = String(imageUrl || "").trim();
  if (!text) return "";

  const pathMatch = /\/d\/([a-zA-Z0-9_-]+)/.exec(text);
  if (pathMatch?.[1]) return pathMatch[1];

  const idMatch = /[?&]id=([a-zA-Z0-9_-]+)/.exec(text);
  if (idMatch?.[1]) return idMatch[1];

  return "";
}

function extractResourceKey(imageUrl) {
  const text = String(imageUrl || "").trim();
  if (!text) return "";

  try {
    const parsed = new URL(text);
    return String(parsed.searchParams.get("resourcekey") || "").trim();
  } catch {
    const match = /[?&]resourcekey=([^&]+)/i.exec(text);
    return match?.[1] ? decodeURIComponent(match[1]).trim() : "";
  }
}

function buildThumbUrl(imageUrl) {
  const fileId = extractDriveFileId(imageUrl);
  if (!fileId) return imageUrl;

  const thumb = new URL(`https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1400`);
  const resourceKey = extractResourceKey(imageUrl);
  if (resourceKey) {
    thumb.searchParams.set("resourcekey", resourceKey);
  }

  return thumb.toString();
}

function buildImageCandidates(imageUrl) {
  const fileId = extractDriveFileId(imageUrl);
  if (!fileId) {
    return {
      primary: String(imageUrl || ""),
      fallbacks: [],
    };
  }

  const resourceKey = extractResourceKey(imageUrl);

  const addResourceKey = (url) => {
    if (!resourceKey) return url;

    try {
      const parsed = new URL(url);
      parsed.searchParams.set("resourcekey", resourceKey);
      return parsed.toString();
    } catch {
      return url;
    }
  };

  const candidates = [
    `https://lh3.googleusercontent.com/d/${encodeURIComponent(fileId)}=w1400`,
    addResourceKey(`https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1400`),
    addResourceKey(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=view`),
    addResourceKey(`https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`),
    addResourceKey(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`),
  ].filter(Boolean);

  const unique = [];
  const seen = new Set();

  candidates.forEach((url) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    unique.push(url);
  });

  return {
    primary: unique[0] || String(imageUrl || ""),
    fallbacks: unique.slice(1),
  };
}
function renderLoadingState() {
  if (!grid) return;
  grid.innerHTML = '<p class="empty">Loading gallery photos...</p>';
}

function renderEmptyState() {
  if (!grid) return;
  grid.innerHTML =
    '<p class="empty">Gallery photos will appear here once images are available in the shared folder.</p>';
}

function renderGrid(urls) {
  if (!grid) return;

  if (!Array.isArray(urls) || !urls.length) {
    renderEmptyState();
    return;
  }

  const markup = urls
    .map((url, index) => {
      const full = String(url || "");
      const imageCandidates = buildImageCandidates(full);
      const fallbackCandidates = escapeHtml(JSON.stringify(imageCandidates.fallbacks));

      return (
        `<a class="traveler-photo" href="${escapeHtml(full)}" target="_blank" rel="noopener noreferrer" aria-label="Open traveler photo ${index + 1}">` +
        `<img src="${escapeHtml(imageCandidates.primary)}" alt="Traveler memory ${index + 1}" loading="lazy" referrerpolicy="no-referrer" data-image-fallback="traveler-photo" data-fallback-candidates="${fallbackCandidates}" />` +
        "</a>"
      );
    })
    .join("");

  grid.innerHTML = markup;
  enableImageFallbacks(grid);
}

async function init() {
  if (!grid) return;

  const folderId = extractDriveFolderId(DRIVE_FOLDER_URL);
  if (!folderId) {
    renderEmptyState();
    return;
  }

  renderLoadingState();

  try {
    const urls = await fetchGalleryImages(folderId);
    renderGrid(urls);
  } catch (error) {
    console.warn("Unable to load gallery photos right now.", error);
    renderEmptyState();
  }
}

init();