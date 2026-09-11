const query = new URLSearchParams(window.location.search);
const styles = { tabler: "Tabler Outline", duotone: "Phosphor Duotone", fill: "Phosphor Fill" };
let pack = Object.hasOwn(styles, query.get("pack")) ? query.get("pack") : "duotone";
let theme = query.get("theme") === "dark" ? "dark" : "light";
let screen = query.get("screen") === "inventory" ? "inventory" : "settings";
let activeTab = "Settings";
let restTimer = true;
let toastTimer;
document.documentElement.dataset.embedded = String(query.get("embedded") === "1");
const navItems = [
  ["Today", "Dumbbell"],
  ["Runs", "Footprints"],
  ["History", "CalendarDays"],
  ["Progress", "TrendingUp"],
  ["Settings", "Settings"],
];

function icon(key, detail = false) {
  return window.ICON_STUDY.assets[pack][key].replace(
    'class="glyph"',
    `class="glyph${detail ? " detail" : ""}"`,
  );
}

function row(key, title, options = {}) {
  const avatar = options.profile ? `<span class="avatar">${icon(key)}</span>` : icon(key);
  return `<li><button type="button" class="row${options.danger ? " danger" : ""}" data-action="${options.action || "sample"}">${avatar}<span class="row-label">${title}</span>${options.meta ? `<span class="row-meta">${options.meta}</span>` : ""}${icon("ChevronRight", true)}</button></li>`;
}

function group(title, rows) {
  return `<section><h2 class="section-title">${title}</h2><ul class="rows">${rows}</ul></section>`;
}

function settings() {
  return `<ul class="rows">${row("User", "Your profile", { profile: true })}</ul>
    ${group("Training", row("ClipboardList", "Programme") + row("MapPin", "Gyms and machines") + row("BookOpen", "Exercise library") + `<li><div class="row">${icon("Timer")}<span class="timer-label"><span class="row-label">Rest timer</span><button type="button" class="info-button" aria-label="About the rest timer" data-action="info">${icon("Info")}</button></span><button type="button" class="switch" role="switch" aria-label="Rest timer" aria-checked="${restTimer}" data-action="timer"><span class="switch-track" aria-hidden="true"></span></button></div></li>` + row("Sparkles", "AI coach"))}
    ${group("Preferences", row("SunMoon", "Appearance", { meta: theme === "dark" ? "Dark" : "Light", action: "appearance" }))}
    ${group("Account", row("KeyRound", "Password") + row("Link2", "Coach access"))}
    ${group("App", row("Download", "Install Overload"))}
    <ul class="rows">${row("LogOut", "Sign out")}${row("Trash", "Delete account", { danger: true })}</ul>
    <p class="sample-note">Icon mockup · sample Settings. Tap navigation to compare selected states.</p>`;
}

function inventory() {
  return `<p class="inventory-intro">Every interface symbol used on main. The same family covers navigation, Settings and the smaller controls.</p>
    <div class="size-study" aria-label="Settings icon at 18, 20 and 24 pixels">${[18, 20, 24].map((size) => `<div data-size="${size}">${icon("Settings")}<span>${size} px</span></div>`).join("")}</div>
    <ul class="symbol-grid">${window.ICON_STUDY.inventory.map((item) => `<li>${icon(item.key)}<span>${item.label}</span></li>`).join("")}</ul>`;
}

function paint() {
  document.documentElement.dataset.overloadMode = theme;
  document.documentElement.dataset.pack = pack;
  document.title = `Overload · ${styles[pack]}`;
  document.querySelector("#pack").value = pack;
  document.querySelector("#theme").textContent = `Switch to ${theme === "dark" ? "light" : "dark"}`;
  document.querySelector("#page-title").textContent =
    screen === "inventory" ? "Icon inventory" : "Settings";
  document.querySelector("#content").innerHTML = screen === "inventory" ? inventory() : settings();
  paintNavigation();
}

function paintNavigation() {
  document.querySelector("#navigation").innerHTML = navItems
    .map(
      ([label, key]) =>
        `<button type="button" class="nav-tab" data-tab="${label}"${activeTab === label ? ' aria-current="page"' : ""}><span class="nav-icon">${icon(key)}</span><span>${label}</span></button>`,
    )
    .join("");
}

function notify(message) {
  const toast = document.querySelector("#toast");
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3500);
}

document.querySelector("#navigation").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-tab]");
  if (!tab) return;
  activeTab = tab.dataset.tab;
  for (const button of document.querySelectorAll("[data-tab]")) {
    if (button.dataset.tab === activeTab) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  notify(`${activeTab} selected state · Settings stays visible for comparison.`);
});

document.querySelector("#content").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "timer") {
    restTimer = !restTimer;
    button.setAttribute("aria-checked", String(restTimer));
  } else if (button.dataset.action === "appearance") {
    theme = theme === "dark" ? "light" : "dark";
    paint();
    document.querySelector('[data-action="appearance"]').focus({ preventScroll: true });
  } else if (button.dataset.action === "info") {
    notify("Counts down the exercise’s rest target after a set is saved.");
  } else {
    notify("Preview only · this row does not change your account.");
  }
});

document.querySelector("#pack").addEventListener("change", (event) => {
  pack = event.target.value;
  paint();
});
document.querySelector("#theme").addEventListener("click", () => {
  theme = theme === "dark" ? "light" : "dark";
  paint();
});
window.addEventListener("message", (event) => {
  if (
    event.source !== window.parent ||
    event.origin !== window.location.origin ||
    event.data?.type !== "icon-study"
  )
    return;
  if (["light", "dark"].includes(event.data.theme)) theme = event.data.theme;
  if (["settings", "inventory"].includes(event.data.screen)) screen = event.data.screen;
  paint();
});
paint();
