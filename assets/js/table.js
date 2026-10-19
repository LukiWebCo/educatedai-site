/* Refresh the server-rendered card so live and static transcripts share one markup. */
(() => {
  const page = document.querySelector("[data-table-live]");
  const homeDiscussion = document.querySelector("[data-home-discussion]");
  if (!page && !homeDiscussion) return;
  if (page && ["published", "failed"].includes(page.dataset.status)) return;
  const desktop = window.matchMedia("(min-width: 900px)");
  const expandDesktop = () => {
    if (desktop.matches) page?.querySelector(".opening-full")?.setAttribute("open", "");
  };
  expandDesktop();
  desktop.addEventListener("change", expandDesktop);
  let previous = null;
  const update = async () => {
    try {
      const feed = homeDiscussion
        ? "/table/latest.json"
        : `/table/${encodeURIComponent(page.dataset.date)}.json`;
      const response = await fetch(feed, { cache: "no-store" });
      if (!response.ok) return;
      const sitting = await response.json();
      const signature = JSON.stringify(sitting);
      if (signature === previous) return;
      const rendered = await fetch(window.location.pathname, { cache: "no-store" });
      if (!rendered.ok) return;
      const documentCopy = new DOMParser().parseFromString(await rendered.text(), "text/html");
      const discussion = documentCopy.querySelector("[data-home-discussion]");
      const currentDiscussion = document.querySelector("[data-home-discussion]");
      if (discussion && currentDiscussion) {
        for (const selector of [
          "[data-home-discussion-status]",
          ".discussion-card__seating",
          ".discussion-card__question",
          ".home-panel__action",
        ]) {
          const replacement = discussion.querySelector(selector);
          if (replacement) currentDiscussion.querySelector(selector)?.replaceWith(replacement);
        }
        currentDiscussion.querySelector(".reader-source")?.remove();
        const readerSource = discussion.querySelector(".reader-source");
        if (readerSource) currentDiscussion.insertBefore(readerSource, currentDiscussion.querySelector(".discussion-card__question"));
        currentDiscussion.dataset.date = discussion.dataset.date;
      }
      if (!page) {
        previous = signature;
        return;
      }
      const card = documentCopy.querySelector("[data-table-live]");
      if (!card) return;
      const expanded = page.querySelector(".opening-full")?.open;
      if (expanded) card.querySelector(".opening-full")?.setAttribute("open", "");
      // Keep an existing film player and its playback/listeners intact.
      for (const selector of ["[data-table-turns]", ".table-seating", ".table__question", ".kicker"]) {
        const replacement = card.querySelector(selector);
        if (replacement) page.querySelector(selector)?.replaceWith(replacement);
      }
      page.querySelector(".table-stopped")?.remove();
      const stopped = card.querySelector(".table-stopped");
      if (stopped) page.insertBefore(stopped, page.querySelector("[data-table-turns]"));
      page.dataset.status = card.dataset.status;
      page.dataset.date = card.dataset.date;
      const readLink = page.querySelector(".btn--ghost");
      const nextLink = card.querySelector(".btn--ghost");
      if (readLink && nextLink) readLink.href = nextLink.href;
      expandDesktop();
      previous = signature;
    } catch (error) {
      console.warn("table transcript refresh failed", error);
    }
  };
  update();
  window.setInterval(update, 600000);
})();

/* Reuse the server's complete, bilingual purse markup during live conversations. */
(() => {
  if (!document.querySelector('[data-purse-live]')) return;
  const update = async () => {
    try {
      const response = await fetch(window.location.pathname, { cache: 'no-store' });
      if (!response.ok) return;
      const copy = new DOMParser().parseFromString(await response.text(), 'text/html');
      const next = copy.querySelector('[data-purse-live]');
      if (next) document.querySelector('[data-purse-live]')?.replaceWith(next);
    } catch (error) { console.warn('purse refresh failed', error); }
  };
  window.setInterval(update, 600000);
})();
