const DEFAULT_BASE_EXEC_URL =
  "https://script.google.com/macros/s/AKfycbwaqdkZ_BRa-0SIb74hDITNkv45KlwXJQZgBwnL-AQGKC4wz7Omy4ZqgVQL_VXdj7ME/exec";
const DEFAULT_BOOKING_UID = "2100119";

const runtimeConfig = window.WSA_SITE_CONFIG || {};
const driveFolderCache = new Map();

export function getBaseExecUrl() {
  return runtimeConfig.baseExecUrl || DEFAULT_BASE_EXEC_URL;
}

function buildRouteUrl(route, params = {}, options = {}) {
  const url = new URL(getBaseExecUrl());
  url.searchParams.set("route", route);

  const cacheBusterEnabled =
    options.bustCache || runtimeConfig.forceFresh === true || runtimeConfig.disableApiCache === true;

  if (cacheBusterEnabled) {
    url.searchParams.set("_", Date.now().toString());
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

export async function fetchTrips(options = {}) {
  const response = await fetch(buildRouteUrl("trips", {}, options), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch trips (${response.status}).`);
  }

  const json = await response.json();
  const rows = Array.isArray(json?.trips) ? json.trips : [];
  const normalized = rows.map(normalizeTrip).filter((trip) => Boolean(trip.trip_id));

  // If cached data comes back without hero images, retry once with a cache-busted request.
  if (!options.bustCache) {
    const hasAnyHero = normalized.some((trip) => Boolean(trip.hero_image_url));
    if (!hasAnyHero) {
      return fetchTrips({ ...options, bustCache: true });
    }
  }

  return normalized;
}


export async function fetchTripMedia(trip) {
  return expandTripMedia(trip);
}

async function expandTripMedia(trip) {
  const folderId = extractDriveFolderId(trip.gallery_folder_url);
  if (!folderId) return trip;

  const cached = driveFolderCache.get(folderId);
  if (cached) {
    return {
      ...trip,
      gallery_image_url: cached,
    };
  }

  try {
    let urls = await fetchDriveFolderImages(folderId, { bustCache: false });

    if (!urls.length) {
      urls = await fetchDriveFolderImages(folderId, { bustCache: true });
    }

    driveFolderCache.set(folderId, urls);

    return {
      ...trip,
      gallery_image_url: urls,
    };
  } catch (error) {
    console.warn("Falling back to base gallery for trip", trip.trip_id, error);
    return trip;
  }
}

async function fetchDriveFolderImages(folderId, options = {}) {
  const response = await fetch(
    buildRouteUrl(
      "driveImages",
      {
        folderId,
      },
      {
        bustCache: options.bustCache === true,
      }
    ),
    {
      method: "GET",
      headers: { Accept: "application/json" },
    }
  );

  if (!response.ok) {
    throw new Error(`Unable to fetch drive images (${response.status}).`);
  }

  const json = await response.json();
  return Array.isArray(json?.images)
    ? json.images.map((entry) => normalizeImageUrl(entry)).filter(Boolean)
    : [];
}

export function normalizeTrip(raw) {
  const status = String(raw?.status || "").trim().toUpperCase();
  const heroImage = normalizeImageUrl(raw?.hero_image_url);
  const title = String(raw?.title || "").trim();
  const tripId = String(raw?.trip_id || "").trim();
  const summary = String(raw?.summary || "").trim();
  const longDescription = String(raw?.long_description || "").trim();
  const slug = toSlug(raw?.slug || title || tripId);
  const bookingUuid = String(raw?.booking_uuid || raw?.booking_id || "").trim();

  const galleryParsed = normalizeGallery(raw?.gallery_image_url);

  return {
    ...raw,
    trip_id: tripId,
    title,
    status,
    summary,
    long_description: longDescription,
    activities_overview: normalizeActivities(raw?.activities_overview),
    important_notes: normalizeImportantNotes(raw?.important_notes),
    booking_uid: DEFAULT_BOOKING_UID,
    booking_uuid: bookingUuid,
    can_book: !status.includes("SOLD"),
    booking_button_text: "Book Now",
    slug,
    hero_image_url: heroImage,
    start_date: String(raw?.start_date || "").slice(0, 10),
    end_date: String(raw?.end_date || "").slice(0, 10),
    final_payment_due_date: String(raw?.final_payment_due_date || "").slice(0, 10),
    gallery_image_url: galleryParsed.images,
    gallery_folder_url: galleryParsed.folderUrl,
  };
}

function normalizeActivities(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }

  const text = String(value || "").trim();
  if (!text) return [];

  return text
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeImportantNotes(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }

  const text = String(value || "").trim();
  if (!text) return [];

  if (text.includes("||")) {
    return text
      .split("||")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (/\r?\n/.test(text)) {
    return text
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [text];
}

function normalizeGallery(value) {
  if (Array.isArray(value)) {
    return {
      images: value.map((entry) => normalizeImageUrl(entry)).filter(Boolean),
      folderUrl: "",
    };
  }

  const text = String(value || "").trim();
  if (!text) return { images: [], folderUrl: "" };

  const folderId = extractDriveFolderId(text);
  if (folderId) {
    return {
      images: [],
      folderUrl: text,
    };
  }

  return {
    images: [normalizeImageUrl(text)].filter(Boolean),
    folderUrl: "",
  };
}

function extractDriveFolderId(folderUrl) {
  const text = String(folderUrl || "").trim();
  if (!text) return "";

  const foldersPathMatch = /\/folders\/([a-zA-Z0-9_-]+)/.exec(text);
  if (foldersPathMatch?.[1]) return foldersPathMatch[1];

  const idQueryMatch = /[?&]id=([a-zA-Z0-9_-]+)/.exec(text);
  if (idQueryMatch?.[1] && text.includes("drive.google.com")) return idQueryMatch[1];

  return "";
}

function extractDriveFileId(url) {
  const text = String(url || "").trim();
  if (!text) return "";

  // Some APIs return raw Drive file IDs without a URL wrapper.
  if (/^[a-zA-Z0-9_-]{20,}$/.test(text)) return text;

  const filePathMatch = /\/file\/d\/([a-zA-Z0-9_-]+)/.exec(text);
  if (filePathMatch?.[1]) return filePathMatch[1];

  const genericPathMatch = /\/d\/([a-zA-Z0-9_-]+)/.exec(text);
  if (genericPathMatch?.[1]) return genericPathMatch[1];

  try {
    const parsed = new URL(text);
    const idParam = parsed.searchParams.get("id");
    if (idParam && (text.includes("drive.google.com") || text.includes("docs.google.com"))) {
      return idParam;
    }
  } catch {
    // Not a URL we can parse with URL(); continue with regex fallback.
  }

  const idQueryMatch = /[?&]id=([a-zA-Z0-9_-]+)/.exec(text);
  if (idQueryMatch?.[1] && (text.includes("drive.google.com") || text.includes("docs.google.com"))) {
    return idQueryMatch[1];
  }

  return "";
}

function extractDriveResourceKey(url) {
  const text = String(url || "").trim();
  if (!text) return "";

  try {
    const parsed = new URL(text);
    const resourceKey = parsed.searchParams.get("resourcekey");
    return resourceKey ? String(resourceKey).trim() : "";
  } catch {
    const match = /[?&]resourcekey=([^&]+)/i.exec(text);
    return match?.[1] ? decodeURIComponent(match[1]).trim() : "";
  }
}

export function normalizeImageUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  // Already a direct hosted image URL.
  if (text.includes("googleusercontent.com") || text.includes("drive.google.com/thumbnail")) {
    return text;
  }

  const fileId = extractDriveFileId(text);
  if (fileId) {
    const thumb = new URL(`https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w2000`);

    const resourceKey = extractDriveResourceKey(text);
    if (resourceKey) {
      thumb.searchParams.set("resourcekey", resourceKey);
    }

    return thumb.toString();
  }

  if (text.includes("drive.google.com") && text.includes("/folders/")) {
    return "";
  }

  return text;
}

export function toSlug(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatDateRange(startDate, endDate, status = "") {
  const start = toPrettyDate(startDate);
  const end = toPrettyDate(endDate);
  const statusKey = String(status || "").trim().toUpperCase();

  if (statusKey === "DAYTRIP") return start || end || "Date coming soon";

  if (start && end) return `${start} - ${end}`;
  return start || end || "Dates coming soon";
}

export function toPrettyDate(yyyyMmDd) {
  const value = String(yyyyMmDd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

