const frames = [...document.querySelectorAll("iframe")];
const screenSelect = document.querySelector("#screen");
const deviceSelect = document.querySelector("#device");
let theme = "light";

function syncPreviews() {
  document.documentElement.dataset.overloadMode = theme;
  for (const button of document.querySelectorAll("[data-theme]")) {
    button.setAttribute("aria-pressed", String(button.dataset.theme === theme));
  }
  for (const frame of frames) {
    frame.contentWindow.postMessage(
      { type: "icon-study", theme, screen: screenSelect.value },
      window.location.origin,
    );
  }
  for (const link of document.querySelectorAll(".direction-footer a")) {
    const url = new URL(link.href);
    url.searchParams.set("theme", theme);
    url.searchParams.set("screen", screenSelect.value);
    link.href = url.href;
  }
}

for (const button of document.querySelectorAll("[data-theme]")) {
  button.addEventListener("click", () => {
    theme = button.dataset.theme;
    syncPreviews();
  });
}
for (const frame of frames) frame.addEventListener("load", syncPreviews);
screenSelect.addEventListener("change", syncPreviews);
deviceSelect.addEventListener("change", () => {
  document.querySelector(".comparisons").dataset.device = deviceSelect.value;
  document.querySelector("#view-note").textContent =
    deviceSelect.value === "phone"
      ? "Actual-size SVGs. Scroll inside each screen to see every Settings row."
      : "Actual-size viewports. On a smaller screen, scroll each preview sideways to inspect the whole layout.";
});
