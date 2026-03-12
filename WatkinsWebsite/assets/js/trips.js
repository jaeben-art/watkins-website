import { fetchTrips } from "./api.js";
import { enableImageFallbacks, renderTripGrid } from "./render.js";
import { setFooterYear } from "./site.js";

function renderTripsLoading(container) {
  container.classList.add("loading-grid");
  container.setAttribute("aria-live", "polite");
  container.setAttribute("aria-label", "Loading bus trips");
  container.innerHTML = `
    ${Array.from({ length: 6 })
      .map(
        () => `
          <article class="card loading-card" aria-hidden="true">
            <div class="skeleton skeleton-thumb"></div>
            <div class="trip-body">
              <div class="skeleton skeleton-line skeleton-title"></div>
              <div class="skeleton skeleton-line skeleton-meta"></div>
              <div class="skeleton skeleton-line"></div>
              <div class="skeleton skeleton-line"></div>
              <div class="skeleton skeleton-button"></div>
            </div>
          </article>
        `
      )
      .join("")}
  `;
}

async function init() {
  setFooterYear();

  const listContainer = document.getElementById("trip-list");
  if (!listContainer) return;

  renderTripsLoading(listContainer);

  try {
    const trips = await fetchTrips();
    const sorted = trips
      .filter((trip) => trip.status !== "EXPIRED")
      .sort((a, b) => String(a.start_date || "").localeCompare(String(b.start_date || "")));

    renderTripGrid(listContainer, sorted);
    listContainer.classList.remove("loading-grid");
    listContainer.removeAttribute("aria-live");
    listContainer.removeAttribute("aria-label");
    enableImageFallbacks(listContainer);
  } catch (error) {
    listContainer.classList.remove("loading-grid");
    listContainer.removeAttribute("aria-live");
    listContainer.removeAttribute("aria-label");
    listContainer.innerHTML = `<div class="empty"><p class="muted">Unable to load trip data at this time.</p></div>`;
    console.error(error);
  }
}

init();