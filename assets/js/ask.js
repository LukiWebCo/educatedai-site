/* Anonymous first-party intake. Never persist the draft or request metadata. */
(function () {
  "use strict";
  var form = document.querySelector("[data-ask]");
  if (!form) return;
  var button = form.querySelector("button"), status = form.querySelector("[data-ask-status]");
  button.disabled = false;
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = "";
    try {
      var response = await fetch(form.dataset.url, {
        method: "POST", credentials: "omit", referrerPolicy: "no-referrer",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({text: form.elements.text.value, lang: form.dataset.lang, website: form.elements.website.value})
      });
      if (!response.ok || !(await response.json()).ok) throw new Error();
      form.reset();
      status.textContent = form.dataset.success;
    } catch (_) {
      status.textContent = form.dataset.error;
    } finally { button.disabled = false; }
  });
}());
