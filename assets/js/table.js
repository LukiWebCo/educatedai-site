/* Refresh only the growing transcript; server-rendered content remains the complete fallback. */
(() => {
  const page = document.querySelector("[data-table-live]");
  if (!page || (!page.hasAttribute("data-table-home") && page.dataset.status === "published")) return;
  const lang = document.documentElement.lang === "es" ? "es" : "en";
  const labels = { withheld: page.dataset.withheldLabel, turn: page.dataset.turnLabel };
  let roster = [];
  try {
    roster = JSON.parse(document.querySelector("#table-roster")?.textContent || "[]");
  } catch (error) {
    console.warn("table transcript metadata could not be read", error);
    return;
  }
  const chairs = Object.fromEntries(roster.map((chair) => [chair.id, chair]));
  const feed = page.hasAttribute("data-table-home")
    ? "/table/latest.json"
    : `/table/${encodeURIComponent(page.dataset.date)}.json`;
  const makeRows = (turns) => {
    const list = document.createElement("ol");
    list.className = "turnlist";
    list.dataset.tableTurns = "";
    for (const turn of turns || []) {
      const chair = chairs[turn.chair] || { id: turn.chair, name: {}, avatar: {} };
      const item = document.createElement("li");
      item.className = "turnrow";
      item.dataset.turn = String(turn.n);
      const avatar = document.createElement("span");
      avatar.className = "avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.style.setProperty("--avatar", chair.avatar?.color || "#777");
      avatar.textContent = chair.avatar?.glyph || "?";
      const body = document.createElement("div");
      body.className = "turn__body";
      const meta = document.createElement("div");
      meta.className = "turn__meta";
      const number = document.createElement("span");
      number.textContent = labels.turn.replace("{n}", turn.n);
      const name = document.createElement("strong");
      name.textContent = chair.name?.[lang] || chair.name?.en || chair.id;
      const time = document.createElement("time");
      time.textContent = (turn.at || "").slice(11, 16);
      const stance = document.createElement("span");
      stance.className = "turn__stance";
      stance.textContent = turn.stance || "";
      meta.append(number, name, time, stance);
      const text = document.createElement("p");
      if (turn.status === "withheld") {
        text.textContent = labels.withheld;
      } else if (lang === "es" && !turn.text?.es && turn.text?.en) {
        text.textContent = turn.text.en;
        const note = document.createElement("small");
        note.className = "table__spanish";
        note.textContent = page.dataset.spanishLabel;
        text.append(note);
      } else {
        text.textContent = turn.text?.[lang] || turn.text?.en || "";
      }
      body.append(meta, text);
      const cites = document.createElement("span");
      cites.className = "turn__cites";
      for (const cite of turn.cites || []) {
        const link = cite.url && /^https:\/\//.test(cite.url) ? document.createElement("a") : document.createElement("span");
        link.textContent = [cite.title, cite.ref].filter(Boolean).join(" ");
        if (link.tagName === "A") {
          link.href = cite.url;
          link.rel = "noopener";
        }
        if (cites.childNodes.length) cites.append(", ");
        cites.append(link);
      }
      if (cites.childNodes.length) body.append(cites);
      item.append(avatar, body);
      list.append(item);
    }
    return list;
  };
  const update = async () => {
    try {
      const response = await fetch(feed, { cache: "no-store" });
      if (!response.ok) return;
      const sitting = await response.json();
      const turns = makeRows(sitting.turns);
      page.querySelector("[data-table-turns]")?.replaceWith(turns);
      const details = page.querySelector(".table__rest");
      if (details) {
        const all = sitting.turns || [];
        details.hidden = all.length <= 4;
        details.querySelector("ol")?.replaceWith(makeRows(all.slice(4)));
      }
      page.dataset.status = sitting.status === "published" ? "published" : "in_progress";
    } catch (error) {
      console.warn("table transcript refresh failed", error);
    }
  };
  update();
  window.setInterval(update, 600000);
})();
