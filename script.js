const header = document.querySelector("[data-header]");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelectorAll(".site-nav a");
const requestDialog = document.querySelector("[data-request-dialog]");
const requestForm = document.querySelector("[data-paper-request-form]");
const requestButtons = document.querySelectorAll("[data-paper-request]");
const requestCloseButtons = document.querySelectorAll("[data-request-close]");

function setNavigation(open) {
  if (!header || !navToggle) return;
  header.classList.toggle("nav-open", open);
  navToggle.setAttribute("aria-expanded", String(open));
  const label = navToggle.querySelector(".sr-only");
  const korean = document.documentElement.lang === "ko";
  if (label) label.textContent = korean
    ? (open ? "메뉴 닫기" : "메뉴 열기")
    : (open ? "Close navigation" : "Open navigation");
}

if (header && navToggle) {
  navToggle.addEventListener("click", () => {
    setNavigation(!header.classList.contains("nav-open"));
  });

  document.addEventListener("click", (event) => {
    if (!header.classList.contains("nav-open") || header.contains(event.target)) return;
    setNavigation(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !header.classList.contains("nav-open")) return;
    setNavigation(false);
    navToggle.focus();
  });
}

navLinks.forEach((link) => link.addEventListener("click", () => setNavigation(false)));

function openRequestDialog(paperTitle, trigger) {
  if (!requestDialog || !requestForm) return;
  requestDialog.returnFocusTo = trigger;
  const paperSelect = requestForm.elements.paper;
  if (paperSelect && paperTitle) {
    const option = Array.from(paperSelect.options).find((item) => item.value === paperTitle);
    paperSelect.value = option ? paperTitle : "General manuscript request";
  }
  if (typeof requestDialog.showModal === "function") requestDialog.showModal();
  else requestDialog.setAttribute("open", "");
}

function closeRequestDialog() {
  if (!requestDialog) return;
  if (typeof requestDialog.close === "function") requestDialog.close();
  else requestDialog.removeAttribute("open");
  if (requestDialog.returnFocusTo) requestDialog.returnFocusTo.focus();
}

function buildManuscriptRequestEmail(form) {
  const data = new FormData(form);
  const paper = data.get("paper") || "General manuscript request";
  const body = [
    "Private manuscript request",
    "",
    `Requested manuscript: ${paper}`,
    `Name: ${data.get("name") || ""}`,
    `Email: ${data.get("email") || ""}`,
    `Affiliation or organization: ${data.get("affiliation") || ""}`,
    `Role or title: ${data.get("role") || ""}`,
    `Professional profile or website: ${data.get("profile") || ""}`,
    "",
    "Research context or intended use:",
    data.get("purpose") || "",
    "",
    "Data acknowledgement: I have not included patient information, controlled-access data, non-public institutional information, or confidential material.",
  ].join("\n");
  return `mailto:junidude14@gmail.com?subject=${encodeURIComponent(`Manuscript request: ${paper}`)}&body=${encodeURIComponent(body)}`;
}

requestButtons.forEach((button) => {
  button.addEventListener("click", () => openRequestDialog(button.dataset.paperRequest, button));
});

requestCloseButtons.forEach((button) => button.addEventListener("click", closeRequestDialog));

if (requestDialog) {
  requestDialog.addEventListener("click", (event) => {
    if (event.target === requestDialog) closeRequestDialog();
  });
}

if (requestForm) {
  requestForm.addEventListener("submit", (event) => {
    event.preventDefault();
    window.location.href = buildManuscriptRequestEmail(requestForm);
  });
}
