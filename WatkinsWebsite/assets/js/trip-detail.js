import { fetchTripMedia, fetchTrips, formatDateRange, toPrettyDate, toSlug } from "./api.js";
import { enableImageFallbacks, escapeHtml } from "./render.js";
import { parseSlugFromLocation, setFooterYear } from "./site.js";

function pickDocumentLink(value) {
  if (Array.isArray(value)) {
    const first = value.map((entry) => String(entry || "").trim()).find(Boolean);
    return first || "";
  }

  const text = String(value || "").trim();
  if (!text) return "";

  if (text.includes(",")) {
    return text
      .split(",")
      .map((entry) => entry.trim())
      .find(Boolean) || "";
  }

  return text;
}

function buildBookingHtml(trip) {
  const hasUuid = Boolean(trip.booking_uuid);
  const isSoldOut = !trip.can_book;
  const isActive = String(trip.status || "").trim().toUpperCase() === "ACTIVE";
  const isDayTrip = String(trip.status || "").trim().toUpperCase() === "DAYTRIP";
  const itineraryUrl = pickDocumentLink(trip.document_links || trip.document_link || trip.documents_link);

  if (!hasUuid && !itineraryUrl) {
    return `
      <section class="booking-actions" aria-label="Booking actions">
        <p class="prose">Booking and brochure links are coming soon.</p>
      </section>
    `;
  }

  const bookingFallbackUrl = `https://www.wetravel.com/checkout_embed?uuid=${encodeURIComponent(trip.booking_uuid)}`;
  const brochureFallbackUrl = `https://www.wetravel.com/embed/download_brochure?uuid=${encodeURIComponent(trip.booking_uuid)}`;

  const primaryButtonHtml = isActive
    ? itineraryUrl
      ? `<a class="trip-action-button" href="${escapeHtml(itineraryUrl)}" target="_blank" rel="noopener noreferrer">Itinerary</a>`
      : ""
    : isSoldOut
      ? ""
      : hasUuid
        ? `<a class="trip-action-button" href="${escapeHtml(bookingFallbackUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(trip.booking_button_text || "Book Now")}</a>`
        : "";

  const brochureButtonHtml = hasUuid && !isDayTrip
    ? `<a class="trip-action-button" href="${escapeHtml(brochureFallbackUrl)}" target="_blank" rel="noopener noreferrer">Download Brochure</a>`
    : "";

  return `
    <section class="booking-actions" aria-label="Booking actions">
      ${primaryButtonHtml}
      ${brochureButtonHtml}
      <p class="trip-action-note">Each traveler is responsible for reviewing the <a href="/terms/" class="trip-action-link">Terms and Conditions</a>.</p>
    </section>
  `;
}
function renderTripDetailsLoading(container) {
  container.innerHTML = `
    <div class="section loading-detail" aria-live="polite" aria-label="Loading trip details">
      <div class="skeleton skeleton-line skeleton-meta" style="width: 20%;"></div>
      <div class="skeleton skeleton-line skeleton-title" style="width: 55%; margin-top: 8px;"></div>
      <div class="trip-layout" style="margin-top: 16px;">
        <div class="stack">
          <article class="card" style="padding:16px;">
            <div class="skeleton skeleton-line skeleton-title" style="width: 44%;"></div>
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line" style="width: 86%;"></div>
          </article>
          <article class="card" style="padding:16px;">
            <div class="skeleton skeleton-line skeleton-title" style="width: 40%;"></div>
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line" style="width: 75%;"></div>
          </article>
        </div>
        <aside class="stack">
          <div class="skeleton skeleton-thumb" style="height:240px; border-radius:10px;"></div>
          <article class="card" style="padding:16px;">
            <div class="skeleton skeleton-line skeleton-title" style="width: 52%;"></div>
            <div class="skeleton skeleton-thumb" style="height:170px; border-radius:10px; margin-top: 8px;"></div>
          </article>
        </aside>
      </div>
    </div>
  `;
}
function formatDoubleOccupancyPrice(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("$")) return raw;

  const numeric = Number(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return raw;

  return `$${numeric.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function normalizeNotes(value) {
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
function renderTripDetails(container, trip) {
  const detailText =
    trip.long_description || trip.summary || "Additional details will be posted soon.";
  const finalDue = trip.final_payment_due_date ? toPrettyDate(trip.final_payment_due_date) : "To be announced";
  const doubleOccupancyPrice = formatDoubleOccupancyPrice(trip.price);
  const gallery = Array.isArray(trip.gallery_image_url) ? trip.gallery_image_url : [];
  const activities = Array.isArray(trip.activities_overview) ? trip.activities_overview : [];
  const statusKey = String(trip.status || "").trim().toUpperCase();
  const isActiveTrip = statusKey === "ACTIVE";
  const isDayTrip = statusKey === "DAYTRIP";
  const notes = [
    ...normalizeNotes(trip.important_notes),
    ...(isActiveTrip ? normalizeNotes(trip.active_notes) : []),
  ];
  const statusLabel = isDayTrip ? "Day Trip" : isActiveTrip ? "Leaving Soon!" : statusKey.includes("SOLD") ? "Sold Out" : "";
  const statusClass = isDayTrip ? "is-daytrip" : statusKey.includes("SOLD") ? "is-soldout" : "";
  const pricingNote = isDayTrip
    ? "Full payment is due at sign up and is non-refundable."
    : "*Price shown is for double occupancy.";
  const paymentInfoHtml = isDayTrip
    ? `<p class="prose"><strong>Full Payment:</strong> Due at sign up and non-refundable.</p>`
    : `<p class="prose"><strong>Final Payment Due:</strong> ${escapeHtml(finalDue)}</p>`;
  const depositInfoHtml = isDayTrip
    ? ""
    : `<p class="prose">
               Your deposit holds your seat on any of our trips. Please send your deposit as soon as possible.
             </p>`;
  const insuranceInfoHtml = isDayTrip
    ? ""
    : `<p class="prose">
              Travel insurance information for Diamond Tours can be purchased through
              <a href="https://travelconfident.com" target="_blank" rel="noopener noreferrer">Travel Confident</a>.
              Please check their website for pricing and other information. Insurance can only be purchased through the website.
            </p>`;
  const checkPaymentHtml = isDayTrip
    ? `<p class="prose">
              To pay by check, make it payable to Jesse Watkins and mail it to Watkins Shared Adventures, 215 N 4th St, Cannelton, IN 47520.
            </p>`
    : `<p class="prose">
              To pay with check, make it payable to Diamond Tours and mail them to Watkins Shared Adventures, 215 N 4th St, Cannelton, IN 47520.
            </p>`;

  const hasGalleryFolder = Boolean(String(trip.gallery_folder_url || "").trim());
  const isGalleryLoading = trip.gallery_is_loading === true;
  const galleryHtml = gallery.length
    ? `<div class="gallery">${gallery
        .slice(0, 8)
        .map((url, index) => {
          const safe = escapeHtml(url);
          return `<img src="${safe}" alt="${escapeHtml(trip.title)} photo ${index + 1}" loading="lazy" data-image-fallback="trip-thumb" />`;
        })
        .join("")}</div>`
    : isGalleryLoading
      ? `<div class="empty"><p class="muted">Loading highlights...</p></div>`
      : hasGalleryFolder
        ? `<div class="empty"><p class="muted">Trip highlights are not available yet.</p></div>`
        : `<div class="empty"><p class="muted">Gallery photos will be shared as they are added.</p></div>`;

  const activitiesHtml = activities.length
    ? `<ul class="tag-list">${activities
        .map((activity) => `<li class="tag">${escapeHtml(activity)}</li>`)
        .join("")}</ul>`
    : `<p class="muted">Activities will be posted soon.</p>`;
  const notesInlineHtml = notes.length
    ? `<div class="important-notes-inline">${notes
        .map(
          (note) =>
            `<p class="important-note-item"><strong><span class="important-note-icon" aria-hidden="true">&#128227;</span>${escapeHtml(note)}</strong></p>`
        )
        .join("")}</div>`
    : "";

  const bookingHtml = buildBookingHtml(trip);

  container.innerHTML = `
    <div class="section">
      <p class="eyebrow">${escapeHtml(trip.trip_id || "")}</p>
      <h1>${escapeHtml(trip.title || "Trip")}</h1>
      
      
      
      
      <div class="trip-layout">
        <div class="stack">
          <article class="card" style="padding:16px;">
            <h2>${escapeHtml(formatDateRange(trip.start_date, trip.end_date, trip.status))}</h2>
            ${statusLabel ? `<p><span class="status-pill ${statusClass}">${escapeHtml(statusLabel)}</span></p>` : ""}
            <p class="prose">${escapeHtml(detailText)}</p>
          </article>
          <article class="card" style="padding:16px;">
            <h2>Activities Overview</h2>
            ${activitiesHtml}
          </article>
          <article class="card" style="padding:16px;">
            <h2>Important Info</h2>
            ${paymentInfoHtml}
            ${notesInlineHtml}
            ${insuranceInfoHtml}
            ${depositInfoHtml}
            ${checkPaymentHtml}
            <p class="prose muted"><em>${escapeHtml(pricingNote)}</em></p>
          </article>
        </div>
        <aside class="stack">
          ${doubleOccupancyPrice ? `<p class="trip-price-detail">${escapeHtml(doubleOccupancyPrice)}*</p>` : ""}
          ${bookingHtml}
          ${trip.hero_image_url ? `<img class="trip-thumb trip-detail-hero" src="${escapeHtml(trip.hero_image_url)}" alt="${escapeHtml(trip.title)}" data-image-fallback="trip-thumb" />` : ""}
          <article class="card" style="padding:16px;">
            <h3>Photo Highlights</h3>
            ${galleryHtml}
          </article>
        </aside>
      </div>
    </div>
  `;

  enableImageFallbacks(container);
}

async function init() {
  setFooterYear();

  const contentNode = document.getElementById("trip-detail");
  if (!contentNode) return;

  const params = new URLSearchParams(window.location.search);
  const querySlug = String(params.get("slug") || "").trim();
  const queryTripId = String(params.get("tripId") || params.get("trip") || "").trim();
  const queryTitle = String(params.get("title") || "").trim();
  const routeSlug = String(parseSlugFromLocation() || "").trim();

  renderTripDetailsLoading(contentNode);

  const lookupKeys = new Set(
    [querySlug, routeSlug, queryTripId, queryTitle]
      .map((value) => toSlug(value))
      .filter(Boolean)
  );

  try {
    const trips = await fetchTrips();

    const matchedTrip = trips.find((entry) => {
      const entrySlugRaw = String(entry.slug || "").trim();
      const entryTripIdRaw = String(entry.trip_id || "").trim();
      const entryTitleRaw = String(entry.title || "").trim();

      const entrySlug = toSlug(entrySlugRaw);
      const entryTripIdSlug = toSlug(entryTripIdRaw);
      const entryTitle = toSlug(entryTitleRaw);

      if (queryTripId && (entryTripIdRaw === queryTripId || entryTripIdSlug === toSlug(queryTripId))) {
        return true;
      }

      if (querySlug && (entrySlugRaw === querySlug || entryTripIdRaw === querySlug || entryTitleRaw === querySlug)) {
        return true;
      }

      if (queryTitle && (entryTitleRaw === queryTitle || entryTitle === toSlug(queryTitle))) {
        return true;
      }

      return (
        lookupKeys.has(entrySlug) ||
        lookupKeys.has(entryTripIdSlug) ||
        lookupKeys.has(entryTitle)
      );
    });

    const resolvedTrip = matchedTrip || trips[0] || null;

    if (!resolvedTrip) {
      contentNode.innerHTML = `<div class="section"><div class="empty"><p class="muted">We could not find this trip. <a href="/trips/">Return to Bus Trips</a>.</p></div></div>`;
      return;
    }

    const hasGalleryImages = Array.isArray(resolvedTrip.gallery_image_url) && resolvedTrip.gallery_image_url.length > 0;
    const hasGalleryFolder = Boolean(String(resolvedTrip.gallery_folder_url || "").trim());
    const initialTrip = !hasGalleryImages && hasGalleryFolder
      ? { ...resolvedTrip, gallery_is_loading: true }
      : resolvedTrip;

    renderTripDetails(contentNode, initialTrip);

    fetchTripMedia(resolvedTrip)
      .then((hydratedTrip) => {
        if (!hydratedTrip) return;
        renderTripDetails(contentNode, { ...hydratedTrip, gallery_is_loading: false });
      })
      .catch((error) => {
        console.warn("Unable to hydrate trip media right now.", error);
        renderTripDetails(contentNode, { ...resolvedTrip, gallery_is_loading: false });
      });
  } catch (error) {
    contentNode.innerHTML = `<div class="section"><div class="empty"><p class="muted">Unable to load this trip right now.</p></div></div>`;
    console.error(error);
  }
}

init();
