import { fetchTrips, formatDateRange, toSlug } from "./api.js";
import { enableImageFallbacks, escapeHtml } from "./render.js";
import { setFooterYear } from "./site.js";

function isFeaturedEligible(trip) {
  const status = String(trip?.status || "").toUpperCase();
  if (status === "EXPIRED") return false;
  if (status.includes("SOLD")) return false;
  return true;
}

function renderFeaturedTripLoading(container) {
  container.innerHTML = `
    <article class="featured-trip loading-card" aria-hidden="true">
      <div class="featured-trip-media">
        <div class="skeleton skeleton-thumb"></div>
      </div>
      <div class="featured-trip-content">
        <div class="skeleton skeleton-line skeleton-meta" style="width: 28%;"></div>
        <div class="skeleton skeleton-line skeleton-title" style="width: 72%;"></div>
        <div class="skeleton skeleton-line skeleton-meta" style="width: 46%;"></div>
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line" style="width: 88%;"></div>
        <div class="skeleton skeleton-button" style="width: 52%;"></div>
      </div>
    </article>
  `;
}

function renderFeaturedTrip(container, trip) {
  if (!trip) {
    container.innerHTML = '<div class="empty"><p class="muted">No featured trip is available right now.</p></div>';
    return;
  }

  const detailText = trip.long_description || trip.summary || "Details coming soon.";
  const activities = Array.isArray(trip.activities_overview)
    ? trip.activities_overview.filter(Boolean)
    : [];
  const activitiesHtml = activities.length
    ? activities.map((item) => `<li class="tag">${escapeHtml(item)}</li>`).join("")
    : '<li class="tag">Activities coming soon</li>';
  const detailSlug = toSlug(trip.slug || trip.trip_id || trip.title);
  const detailTripId = encodeURIComponent(String(trip.trip_id || "").trim());
  const detailTitle = encodeURIComponent(String(trip.title || "").trim());
  const detailHref = `/trip/?slug=${encodeURIComponent(detailSlug)}&tripId=${detailTripId}&title=${detailTitle}`;

  container.innerHTML = `
    <article class="featured-trip">
      <div class="featured-trip-media">
        ${
          trip.hero_image_url
            ? `<img class="featured-trip-image" src="${escapeHtml(trip.hero_image_url)}" alt="${escapeHtml(
                trip.title || "Featured trip"
              )}" loading="lazy" data-image-fallback="trip-thumb" />`
            : '<div class="trip-thumb" aria-hidden="true"></div>'
        }
      </div>
      <div class="featured-trip-content">
        <p class="eyebrow">Featured Trip</p>
        <h3>${escapeHtml(trip.title || "Upcoming Adventure")}</h3>
        <p class="trip-meta">${escapeHtml(formatDateRange(trip.start_date, trip.end_date))}</p>
        ${trip.status ? `<span class="status-pill">${escapeHtml(trip.status)}</span>` : ""}
        <p class="prose">${escapeHtml(detailText)}</p>
        <ul class="tag-list">${activitiesHtml}</ul>
        <p><a class="button" href="${detailHref}">View Full Trip Details</a></p>
      </div>
    </article>
  `;

  enableImageFallbacks(container);
}

async function init() {
  setFooterYear();
  enableImageFallbacks(document);

  const featuredContainer = document.getElementById("featured-trip");
  if (!featuredContainer) return;

  renderFeaturedTripLoading(featuredContainer);

  try {
    const trips = await fetchTrips();
    const eligible = trips.filter(isFeaturedEligible);
    const featured = eligible.length
      ? eligible[Math.floor(Math.random() * eligible.length)]
      : null;

    renderFeaturedTrip(featuredContainer, featured);
  } catch (error) {
    featuredContainer.innerHTML = `<div class="empty"><p class="muted">Unable to load the featured trip right now.</p></div>`;
    console.error(error);
  }
}

init();