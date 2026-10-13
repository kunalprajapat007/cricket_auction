import { firebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  verifyBeforeUpdateEmail,
  sendPasswordResetEmail,
  updateProfile,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = id => document.getElementById(id);

const TEAM_BUDGET = 1000000000; // ₹100 crore
const BID_INCREMENT = 30000;    // ₹30,000 per click

let currentUser = null;
let currentRole = "viewer";
let players = [];
let teams = [];
let auctions = [];
let stopPlayers = null;
let stopTeams = null;
let stopAuctions = null;
let registerMode = false;
let settingsTab = "profile";
let migratedTeams = new Set();

const isViewer = () => currentRole === "viewer";

function showMessage(text, type = "success") {
  const box = $("message");

  if (!box) {
    console.log(text);
    return;
  }

  box.textContent = text;
  box.className = `message ${type}`;
  box.hidden = false;

  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => {
    box.hidden = true;
  }, 4500);
}

function errorText(error) {
  const errors = {
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/user-not-found": "Account not found.",
    "auth/wrong-password": "Your current password is incorrect.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Password must contain at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/requires-recent-login": "Please sign in again to complete this action.",
    "permission-denied": "Access denied. Check your Firebase Firestore Rules.",
    "firestore/permission-denied": "Access denied. Check your Firebase Firestore Rules."
  };

  return errors[error?.code] || error?.message || "Something went wrong.";
}

function safe(value) {
  const span = document.createElement("span");
  span.textContent = String(value ?? "");
  return span.innerHTML;
}

function money(value) {
  return "₹" + Number(value || 0).toLocaleString("en-IN");
}

function roleLabel(role) {
  return {
    player: "Player",
    teamOwner: "Team Owner",
    viewer: "Viewer"
  }[role] || "Viewer";
}

function liveAuctions() {
  return auctions.filter(item => item.status === "live");
}

function stopDataListeners() {
  stopPlayers?.();
  stopTeams?.();
  stopAuctions?.();

  stopPlayers = null;
  stopTeams = null;
  stopAuctions = null;
}

function requireEditor() {
  if (!currentUser) {
    showMessage("Please sign in first.", "error");
    return false;
  }

  if (isViewer()) {
    showMessage("Viewer access is read-only.", "error");
    return false;
  }

  return true;
}

// ---------------- THEME ----------------

function addThemeStyles() {
  if ($("auctionThemeStyles")) return;

  const style = document.createElement("style");
  style.id = "auctionThemeStyles";

  style.textContent = `
    body.theme-light {
      background: #f4f6fb !important;
      color: #182033 !important;
      color-scheme: light;
    }

    body.theme-light .box,
    body.theme-light .modal,
    body.theme-light .card,
    body.theme-light .content-card,
    body.theme-light .auction-card,
    body.theme-light .data-card {
      background: #ffffff !important;
      color: #182033 !important;
      border-color: #dce2ed !important;
    }

    body.theme-light input,
    body.theme-light select {
      background: #ffffff !important;
      color: #182033 !important;
      border-color: #ccd4e2 !important;
    }

    [hidden] { display: none !important; }

    .settings-tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin: 16px 0;
    }

    .settings-tabs button {
      cursor: pointer;
      padding: 9px 12px;
      border-radius: 8px;
    }

    .settings-content label {
      display: block;
      margin: 12px 0 6px;
    }

    .settings-content input,
    .settings-content select {
      width: 100%;
      box-sizing: border-box;
      padding: 11px;
      margin-bottom: 8px;
    }

    .settings-content button { margin-top: 10px; }

    .full-btn {
      width: 100%;
      margin-top: 14px;
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 16px;
      overflow-y: auto;
      background: rgba(0,0,0,.65);
    }

    .modal {
      width: min(100%, 480px);
      max-height: 90vh;
      overflow-y: auto;
      padding: 22px;
      border-radius: 14px;
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .icon-btn { cursor: pointer; }

    .viewer-note {
      padding: 10px 14px;
      border-radius: 8px;
      margin: 12px 0;
    }

    .clickable-card {
      cursor: pointer;
      transition: transform .18s, border-color .18s;
    }

    .clickable-card:hover {
      transform: translateY(-3px);
      border-color: var(--accent);
    }

    /* Player/team details: full-screen page, not popup */
    .detail-fullscreen {
      position: fixed;
      inset: 0;
      z-index: 10000;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      overflow-y: auto;
      padding: clamp(18px, 4vw, 48px);
      background: var(--bg, #0b1020);
      color: var(--text, #ffffff);
    }

    .detail-fullscreen-inner {
      width: min(100%, 1100px);
      margin: 0 auto;
    }

    .detail-fullscreen .detail-row {
      padding: 18px 4px;
      font-size: clamp(15px, 1.6vw, 19px);
    }

    .detail-fullscreen .detail-row strong {
      text-align: right;
      overflow-wrap: anywhere;
    }

    .detail-fullscreen .detail-page-title {
      font-size: clamp(28px, 4vw, 44px);
      margin: 0;
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      gap: 15px;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
    }

    .detail-row span:first-child { color: var(--muted); }

    .bid-action-btn {
      width: 100%;
      margin-top: 12px;
      padding: 14px;
      font-size: 16px;
    }

    .bid-form { margin-top: 16px; }
    .bid-form label { margin-top: 12px; }
    .bid-form select { margin-bottom: 5px; }
  `;

  document.head.appendChild(style);
}

function applyTheme(theme) {
  const chosen = theme === "light" ? "light" : "dark";

  document.body.classList.toggle("theme-light", chosen === "light");
  document.documentElement.style.colorScheme = chosen;
  localStorage.setItem("auctionTheme", chosen);

  const selector = $("themeChoice");
  if (selector) selector.value = chosen;
}

function changeTheme(theme) {
  applyTheme(theme);
  showMessage(`Theme changed to ${theme}.`);
}

addThemeStyles();
applyTheme(localStorage.getItem("auctionTheme") || "dark");

// ---------------- AUTH FORM ----------------

window.togglePasswordVisibility = function () {
  const input = $("pass");
  const eye = $("eyeIcon");

  if (!input || !eye) return;

  input.type = input.type === "password" ? "text" : "password";
  eye.textContent = input.type === "password" ? "👁️" : "🙈";
};

window.handleForgotPassword = async function () {
  const email = $("email")?.value.trim();

  if (!email) {
    showMessage("Enter your email address first.", "error");
    $("email")?.focus();
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showMessage("Password reset instructions have been sent to your email.");
  } catch (error) {
    showMessage(errorText(error), "error");
  }
};

window.toggleAuthMode = function () {
  registerMode = !registerMode;

  if ($("authTitle")) {
    $("authTitle").textContent = registerMode ? "Create Account" : "Welcome back";
  }

  if ($("loginBtn")) {
    $("loginBtn").textContent = registerMode ? "Register Now" : "Login";
  }

  if ($("pass")) {
    $("pass").autocomplete = registerMode ? "new-password" : "current-password";
    $("pass").placeholder = registerMode ? "Create password" : "Enter password";
  }

  if ($("toggleText")) {
    $("toggleText").innerHTML = registerMode
      ? 'Already have an account? <span id="authModeLink" style="cursor:pointer;text-decoration:underline">Login here</span>'
      : 'New here? <span id="authModeLink" style="cursor:pointer;text-decoration:underline">Create an account</span>';
  }
};

$("toggleText")?.addEventListener("click", event => {
  if (event.target?.id === "authModeLink") {
    window.toggleAuthMode();
  }
});

$("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("email")?.value.trim();
  const password = $("pass")?.value;
  const selectedRole = $("role")?.value || "viewer";
  const button = $("loginBtn");

  if (!email || !password) {
    showMessage("Enter your email and password.", "error");
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Please wait...";
  }

  try {
    if (registerMode) {
      const result = await createUserWithEmailAndPassword(auth, email, password);

      await setDoc(doc(db, "users", result.user.uid), {
        email,
        role: selectedRole,
        name: "",
        createdAt: serverTimestamp()
      });

      currentRole = selectedRole;
      localStorage.setItem("auctionRole", selectedRole);
      showMessage("Account created successfully.");
    } else {
      await signInWithEmailAndPassword(auth, email, password);

      currentRole = selectedRole;
      localStorage.setItem("auctionRole", selectedRole);
      showMessage("Sign in successful.");
    }
  } catch (error) {
    showMessage(errorText(error), "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = registerMode ? "Register Now" : "Login";
    }
  }
});
// ---------------- AUTH STATE ----------------

onAuthStateChanged(auth, async user => {
  currentUser = user;

  if (!user) {
    stopDataListeners();

    if ($("login")) $("login").hidden = false;
    if ($("app")) $("app").hidden = true;
    if ($("userTools")) $("userTools").hidden = true;
    if ($("profileMenu")) $("profileMenu").hidden = true;
    if ($("settingsModal")) $("settingsModal").hidden = true;

    return;
  }

  currentRole = localStorage.getItem("auctionRole") || "viewer";

  if ($("login")) $("login").hidden = true;
  if ($("app")) $("app").hidden = false;
  if ($("userTools")) $("userTools").hidden = false;

  if ($("profileEmail")) $("profileEmail").textContent = user.email || "";
  if ($("currentEmail")) $("currentEmail").textContent = user.email || "";
  if ($("profileRole")) $("profileRole").textContent = roleLabel(currentRole);
  if ($("settingsRole")) $("settingsRole").textContent = roleLabel(currentRole);

  if ($("welcomeTitle")) {
    $("welcomeTitle").textContent =
      `Welcome${user.displayName ? ", " + user.displayName : ""}`;
  }

  await loadUserProfile();
  listenToData();
  updateRoleInterface();
  window.show("dash");
});

// ---------------- USER PROFILE ----------------

async function loadUserProfile() {
  if (!currentUser) return;

  try {
    const snapshot = await getDoc(doc(db, "users", currentUser.uid));

    if (snapshot.exists()) {
      const data = snapshot.data();

      if (data.name && !currentUser.displayName) {
        await updateProfile(currentUser, { displayName: data.name });
      }
    }
  } catch (error) {
    console.warn("Profile loading:", error);
  }

  if ($("profileName")) {
    $("profileName").textContent =
      currentUser.displayName || currentUser.email || "User";
  }

  if ($("profileEmail")) $("profileEmail").textContent = currentUser.email || "";
}

function updateRoleInterface() {
  document.querySelectorAll("[data-editor-only]").forEach(element => {
    element.hidden = isViewer();
  });

  document.querySelectorAll("[data-viewer-only]").forEach(element => {
    element.hidden = !isViewer();
  });

  const note = $("viewerNotice");

  if (note) {
    note.hidden = !isViewer();
    note.textContent = isViewer()
      ? "Viewer mode: You can view players, teams and auctions, but cannot make changes."
      : "";
  }

  if ($("profileRole")) $("profileRole").textContent = roleLabel(currentRole);
}

// ---------------- PROFILE MENU ----------------

window.toggleProfile = function () {
  const menu = $("profileMenu");
  if (menu) menu.hidden = !menu.hidden;
};

window.openSettings = function () {
  if ($("profileMenu")) $("profileMenu").hidden = true;
  renderSettings();

  if ($("settingsModal")) $("settingsModal").hidden = false;
};

window.closeSettings = function () {
  if ($("settingsModal")) $("settingsModal").hidden = true;
};

window.logout = async function () {
  try {
    await signOut(auth);
    localStorage.removeItem("auctionRole");
    showMessage("You have signed out.");
  } catch (error) {
    showMessage(errorText(error), "error");
  }
};

// ---------------- SETTINGS ----------------

function renderSettings() {
  const modal = $("settingsModal");

  if (!modal) {
    showMessage("Settings container was not found in the HTML.", "error");
    return;
  }

  modal.innerHTML = `
    <div class="modal-backdrop" id="settingsBackdrop">
      <div class="modal box" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div>
            <span class="eyebrow">ACCOUNT PREFERENCES</span>
            <h2>Settings</h2>
          </div>
          <button type="button" class="icon-btn" id="settingsClose">✕</button>
        </div>

        <div class="settings-tabs">
          <button type="button" data-settings-tab="profile">Profile</button>
          <button type="button" data-settings-tab="email">Change Email</button>
          <button type="button" data-settings-tab="password">Change Password</button>
          <button type="button" data-settings-tab="appearance">Appearance</button>
        </div>

        <div class="settings-content" id="settingsContent"></div>
      </div>
    </div>
  `;

  $("settingsClose").addEventListener("click", window.closeSettings);

  $("settingsBackdrop").addEventListener("click", event => {
    if (event.target.id === "settingsBackdrop") window.closeSettings();
  });

  modal.querySelectorAll("[data-settings-tab]").forEach(button => {
    button.addEventListener("click", () => {
      settingsTab = button.dataset.settingsTab;
      renderSettingsTab();
    });
  });

  renderSettingsTab();
}

function renderSettingsTab() {
  const content = $("settingsContent");
  if (!content) return;

  if (settingsTab === "profile") {
    content.innerHTML = `
      <div class="setting-panel">
        <h3>Profile Details</h3>
        <p><strong>Email:</strong> ${safe(currentUser?.email || "")}</p>
        <p><strong>Role:</strong> ${safe(roleLabel(currentRole))}</p>

        <form id="nameForm">
          <label for="displayNameInput">Full Name</label>
          <input id="displayNameInput" maxlength="80"
            value="${safe(currentUser?.displayName || "")}"
            placeholder="Enter your full name" required>
          <button type="submit" class="primary-btn full-btn">Save Name</button>
        </form>
      </div>
    `;

    $("nameForm").addEventListener("submit", async event => {
      event.preventDefault();
      const name = $("displayNameInput").value.trim();

      if (!name) {
        showMessage("Please enter your name.", "error");
        return;
      }

      try {
        await updateProfile(currentUser, { displayName: name });

        await setDoc(doc(db, "users", currentUser.uid), {
          name,
          email: currentUser.email || "",
          role: currentRole,
          updatedAt: serverTimestamp()
        }, { merge: true });

        if ($("profileName")) $("profileName").textContent = name;
        if ($("welcomeTitle")) $("welcomeTitle").textContent = `Welcome, ${name}`;

        showMessage("Your name has been updated.");
        renderSettingsTab();
      } catch (error) {
        showMessage(errorText(error), "error");
      }
    });

    return;
  }

  if (settingsTab === "email") {
    content.innerHTML = `
      <div class="setting-panel">
        <h3>Change Email Address</h3>
        <p>Current email: ${safe(currentUser?.email || "")}</p>
        <form id="changeEmailForm">
          <label for="settingsNewEmail">New Email Address</label>
          <input id="settingsNewEmail" type="email" required>
          <label for="emailPassword">Current Password</label>
          <input id="emailPassword" type="password" required>
          <button class="primary-btn full-btn" type="submit">Send Verification Email</button>
        </form>
      </div>
    `;

    $("changeEmailForm").addEventListener("submit", async event => {
      event.preventDefault();

      const newEmail = $("settingsNewEmail").value.trim();
      const password = $("emailPassword").value;

      if (!currentUser?.email || newEmail === currentUser.email) {
        showMessage("Enter a different email address.", "error");
        return;
      }

      try {
        const credential = EmailAuthProvider.credential(currentUser.email, password);
        await reauthenticateWithCredential(currentUser, credential);
        await verifyBeforeUpdateEmail(currentUser, newEmail);

        showMessage("Verification email sent. Check your new inbox.");
        $("changeEmailForm").reset();
      } catch (error) {
        showMessage(errorText(error), "error");
      }
    });

    return;
  }

  if (settingsTab === "password") {
    content.innerHTML = `
      <div class="setting-panel">
        <h3>Change Password</h3>
        <form id="changePasswordForm">
          <label for="oldPassword">Current Password</label>
          <input id="oldPassword" type="password" required>
          <label for="newPassword">New Password</label>
          <input id="newPassword" type="password" minlength="6" required>
          <label for="confirmPassword">Confirm New Password</label>
          <input id="confirmPassword" type="password" minlength="6" required>
          <button class="primary-btn full-btn" type="submit">Update Password</button>
        </form>
      </div>
    `;

    $("changePasswordForm").addEventListener("submit", async event => {
      event.preventDefault();

      const oldPassword = $("oldPassword").value;
      const newPassword = $("newPassword").value;
      const confirmPassword = $("confirmPassword").value;

      if (newPassword.length < 6) {
        showMessage("New password must contain at least 6 characters.", "error");
        return;
      }

      if (newPassword !== confirmPassword) {
        showMessage("The new passwords do not match.", "error");
        return;
      }

      try {
        const credential = EmailAuthProvider.credential(currentUser.email, oldPassword);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, newPassword);

        showMessage("Password updated successfully.");
        $("changePasswordForm").reset();
      } catch (error) {
        showMessage(errorText(error), "error");
      }
    });

    return;
  }

  if (settingsTab === "appearance") {
    content.innerHTML = `
      <div class="setting-panel">
        <h3>Appearance</h3>
        <label for="themeChoice">Choose Theme</label>
        <select id="themeChoice">
          <option value="dark">Dark Theme</option>
          <option value="light">Light Theme</option>
        </select>
        <button class="primary-btn full-btn" id="saveTheme" type="button">Apply Theme</button>
      </div>
    `;

    $("themeChoice").value = localStorage.getItem("auctionTheme") || "dark";

    $("saveTheme").addEventListener("click", () => {
      changeTheme($("themeChoice").value);
    });
  }
}
// ---------------- NAVIGATION ----------------

window.show = function (sectionId) {
  const sections = ["dash", "players", "teams", "auction", "history"];
  if (!sections.includes(sectionId)) return;

  sections.forEach(id => {
    const section = $(id);
    if (section) section.hidden = id !== sectionId;
  });

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.section === sectionId);
  });

  if ($("profileMenu")) $("profileMenu").hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// ---------------- LIVE DATA ----------------

function listenToData() {
  stopDataListeners();

  stopPlayers = onSnapshot(
    collection(db, "players"),
    snapshot => {
      players = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      renderPlayers();
      updateCounts();
    },
    error => showMessage(errorText(error), "error")
  );

  stopTeams = onSnapshot(
    collection(db, "teams"),
    snapshot => {
      teams = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      renderTeams();
      updateCounts();
      migrateExistingTeamBudgets();
    },
    error => showMessage(errorText(error), "error")
  );

  stopAuctions = onSnapshot(
    collection(db, "auctions"),
    snapshot => {
      auctions = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      renderAuctions();
      renderHistory();
      updateCounts();
    },
    error => showMessage(errorText(error), "error")
  );
}

// Existing team budgets ko ₹100 crore par set karta hai.
async function migrateExistingTeamBudgets() {
  for (const team of teams) {
    if (migratedTeams.has(team.id)) continue;
    migratedTeams.add(team.id);

    if (
      Number(team.budget) === TEAM_BUDGET &&
      Number(team.remainingBudget) <= TEAM_BUDGET
    ) {
      continue;
    }

    try {
      await updateDoc(doc(db, "teams", team.id), {
        budget: TEAM_BUDGET,
        remainingBudget: TEAM_BUDGET,
        budgetUpdatedAt: serverTimestamp()
      });
    } catch (error) {
      console.warn("Could not update team budget:", team.id, error);
    }
  }
}

function updateCounts() {
  if ($("pc")) $("pc").textContent = players.length;
  if ($("tc")) $("tc").textContent = teams.length;

  const count = liveAuctions().length;

  if ($("bc")) $("bc").textContent = count;
  if ($("liveAuctionCount")) $("liveAuctionCount").textContent = count;
  if ($("auctionCount")) $("auctionCount").textContent = count;
}

// ---------------- FULL-SCREEN DETAILS PAGE ----------------

function showDetails(title, rows) {
  document.getElementById("detailModal")?.remove();

  const page = document.createElement("section");
  page.id = "detailModal";
  page.className = "detail-fullscreen";
  page.setAttribute("role", "region");
  page.setAttribute("aria-label", `${title} details`);

  page.innerHTML = `
    <div class="detail-fullscreen-inner">
      <div class="modal-header"
        style="margin-bottom:28px;padding-bottom:18px;border-bottom:1px solid var(--border)">
        <h1 class="detail-page-title">${safe(title)}</h1>
        <button type="button" class="icon-btn" id="detailClose"
          aria-label="Back to list">← Back</button>
      </div>

      <div class="detail-page-grid">
        ${rows.map(([label, value]) => `
          <div class="detail-row">
            <span>${safe(label)}</span>
            <strong>${safe(value)}</strong>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  document.body.appendChild(page);
  document.body.style.overflow = "hidden";

  const close = () => {
    page.remove();
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKeyDown);
  };

  const onKeyDown = event => {
    if (event.key === "Escape") close();
  };

  $("detailClose").addEventListener("click", close);
  document.addEventListener("keydown", onKeyDown);
}

function playerDetails(player) {
  const activeAuction = auctions.find(
    item => item.playerId === player.id && item.status === "live"
  );

  showDetails(player.name || "Player Details", [
    ["Player Name", player.name || "Unnamed Player"],
    ["Playing Role", player.role || "Not specified"],
    ["Base Price", money(player.basePrice ?? BID_INCREMENT)],
    ["Status", player.status || "Available"],
    ["Sold To", player.soldTo || "Not sold"],
    ["Sold Price", player.soldPrice ? money(player.soldPrice) : "—"],
    ["Live Auction", activeAuction ? "Yes" : "No"],
    ["Current Bid", activeAuction ? money(activeAuction.currentBid) : "—"]
  ]);
}

function teamDetails(team) {
  showDetails(team.name || "Team Details", [
    ["Team Name", team.name || "Unnamed Team"],
    ["Owner", team.owner || "Not specified"],
    ["Total Budget", money(team.budget ?? TEAM_BUDGET)],
    ["Remaining Budget", money(team.remainingBudget ?? team.budget ?? TEAM_BUDGET)],
    ["Spent Budget", money(
      Number(team.budget ?? TEAM_BUDGET) -
      Number(team.remainingBudget ?? team.budget ?? TEAM_BUDGET)
    )]
  ]);
}

// ---------------- PLAYER LIST ----------------

function renderPlayers() {
  const container = $("plist");
  if (!container) return;

  if (!players.length) {
    container.innerHTML =
      `<div class="box empty-state">No players have been registered yet.</div>`;
    return;
  }

  container.innerHTML = players.map(player => `
    <article class="box content-card data-card clickable-card"
      data-player-details="${safe(player.id)}"
      tabindex="0" role="button"
      aria-label="View ${safe(player.name || "player")} details">
      <span class="eyebrow">PLAYER · CLICK FOR DETAILS</span>
      <h3>${safe(player.name || "Unnamed Player")}</h3>
      <p>${safe(player.role || "Player")}</p>
      <p><strong>Base Price:</strong> ${money(player.basePrice ?? BID_INCREMENT)}</p>
      <p><strong>Status:</strong> ${safe(player.status || "Available")}</p>
    </article>
  `).join("");

  container.querySelectorAll("[data-player-details]").forEach(card => {
    const open = () => {
      const player = players.find(item => item.id === card.dataset.playerDetails);
      if (player) playerDetails(player);
    };

    card.addEventListener("click", open);

    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  });
}

// ---------------- TEAM LIST ----------------

function renderTeams() {
  const container = $("tlist");
  if (!container) return;

  if (!teams.length) {
    container.innerHTML =
      `<div class="box empty-state">No teams have been created yet.</div>`;
    return;
  }

  container.innerHTML = teams.map(team => `
    <article class="box content-card data-card clickable-card"
      data-team-details="${safe(team.id)}"
      tabindex="0" role="button"
      aria-label="View ${safe(team.name || "team")} details">
      <span class="eyebrow">TEAM · CLICK FOR DETAILS</span>
      <h3>${safe(team.name || "Unnamed Team")}</h3>
      <p><strong>Owner:</strong> ${safe(team.owner || "Not specified")}</p>
      <p><strong>Budget:</strong> ${money(team.budget ?? TEAM_BUDGET)}</p>
      <p><strong>Remaining:</strong> ${money(team.remainingBudget ?? team.budget ?? TEAM_BUDGET)}</p>
    </article>
  `).join("");

  container.querySelectorAll("[data-team-details]").forEach(card => {
    const open = () => {
      const team = teams.find(item => item.id === card.dataset.teamDetails);
      if (team) teamDetails(team);
    };

    card.addEventListener("click", open);

    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  });
}

// ---------------- LIVE AUCTIONS + BIDDING ----------------

function renderAuctions() {
  const container = $("live");
  if (!container) return;

  const active = liveAuctions();

  if (!active.length) {
    container.innerHTML =
      `<div class="box empty-state">There are currently no live auctions.</div>`;
    return;
  }

  container.innerHTML = active.map(auction => {
    const currentBid = Number(auction.currentBid || 0);
    const nextBid = currentBid + BID_INCREMENT;

    return `
      <article class="box auction-card">
        <span class="eyebrow">LIVE AUCTION</span>
        <h3>${safe(auction.playerName || "Player")}</h3>

        <p><strong>Current Bid:</strong> ${money(currentBid)}</p>
        <p><strong>Highest Bidder:</strong> ${safe(auction.teamName || "No bids yet")}</p>
        <p><strong>Next Bid:</strong> ${money(nextBid)}</p>

        ${!isViewer() ? `
          <form class="bid-form" data-auction-id="${safe(auction.id)}">
            <label>Select Team</label>
            <select name="teamId" required>
              <option value="">Choose a team</option>
              ${teams.map(team => `
                <option value="${safe(team.id)}">
                  ${safe(team.name)} — Remaining
                  ${money(team.remainingBudget ?? team.budget ?? TEAM_BUDGET)}
                </option>
              `).join("")}
            </select>

            <button type="submit" class="primary-btn bid-action-btn">
              Bid ${money(BID_INCREMENT)} · Total ${money(nextBid)}
            </button>

            <button type="button" class="secondary-btn full-btn"
              data-close-auction="${safe(auction.id)}">
              Close Auction
            </button>
          </form>
        ` : `
          <p class="viewer-note">View-only mode. Bidding is disabled.</p>
        `}
      </article>
    `;
  }).join("");

  container.querySelectorAll(".bid-form").forEach(form => {
    form.addEventListener("submit", async event => {
      event.preventDefault();

      if (!requireEditor()) return;

      const data = new FormData(form);
      const teamId = String(data.get("teamId") || "");
      const auction = auctions.find(item => item.id === form.dataset.auctionId);

      if (!teamId || !auction) {
        showMessage("Select a team.", "error");
        return;
      }

      // First bid ₹30,000; every next bid increases by ₹30,000.
      const amount = Number(auction.currentBid || 0) + BID_INCREMENT;
      const button = form.querySelector('button[type="submit"]');

      button.disabled = true;
      button.textContent = "Submitting bid...";

      try {
        await placeBid(form.dataset.auctionId, teamId, amount);
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.textContent =
            `Bid ${money(BID_INCREMENT)} · Total ${money(amount)}`;
        }
      }
    });
  });

  container.querySelectorAll("[data-close-auction]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!requireEditor()) return;

      if (window.confirm("Are you sure you want to close this auction?")) {
        await closeAuction(button.dataset.closeAuction);
      }
    });
  });
}
async function placeBid(auctionId, teamId, amount) {
  if (!requireEditor()) return;

  try {
    await runTransaction(db, async transaction => {
      const auctionRef = doc(db, "auctions", auctionId);
      const teamRef = doc(db, "teams", teamId);

      const auctionSnap = await transaction.get(auctionRef);
      const teamSnap = await transaction.get(teamRef);

      if (!auctionSnap.exists() || !teamSnap.exists()) {
        throw new Error("Auction or team not found.");
      }

      const auction = auctionSnap.data();
      const team = teamSnap.data();

      if (auction.status !== "live") {
        throw new Error("This auction is no longer live.");
      }

      const currentBid = Number(auction.currentBid || 0);

      if (amount !== currentBid + BID_INCREMENT) {
        throw new Error("The bid has changed. Please try again.");
      }

      const remaining = Number(
        team.remainingBudget ?? team.budget ?? TEAM_BUDGET
      );

      if (amount > remaining) {
        throw new Error("This team does not have enough remaining budget.");
      }

      transaction.update(auctionRef, {
        currentBid: amount,
        teamId,
        teamName: team.name || "Team",
        updatedAt: serverTimestamp()
      });
    });

    showMessage(`Bid placed successfully: ${money(amount)}.`);
  } catch (error) {
    showMessage(errorText(error), "error");
  }
}

// ---------------- START AUCTION ----------------

window.startAuction = function () {
  if (!requireEditor()) return;

  const available = players.filter(player =>
    player.status !== "Sold" &&
    !auctions.some(auction =>
      auction.playerId === player.id && auction.status === "live"
    )
  );

  if (!available.length) {
    showMessage("No available players. Register a player first.", "error");
    return;
  }

  openFormModal(
    "Start Auction",
    `
      <label for="auctionPlayer">Select Player</label>
      <select id="auctionPlayer" required>
        ${available.map(player => `
          <option value="${safe(player.id)}">
            ${safe(player.name)} — Starting price ${money(BID_INCREMENT)}
          </option>
        `).join("")}
      </select>

      <p class="muted-note">
        Starting bid: ${money(BID_INCREMENT)}.
        Each click increases the bid by ${money(BID_INCREMENT)}.
      </p>
    `,
    async () => {
      const player = available.find(
        item => item.id === $("auctionPlayer").value
      );

      if (!player) throw new Error("Please select a player.");

      await addDoc(collection(db, "auctions"), {
        playerId: player.id,
        playerName: player.name || "Player",
        currentBid: 0,
        teamId: "",
        teamName: "",
        status: "live",
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });

      showMessage("Auction started successfully.");
      window.show("auction");
    }
  );
};

// ---------------- CLOSE AUCTION ----------------

async function closeAuction(auctionId) {
  if (!requireEditor()) return;

  try {
    await runTransaction(db, async transaction => {
      const auctionRef = doc(db, "auctions", auctionId);
      const auctionSnap = await transaction.get(auctionRef);

      if (!auctionSnap.exists()) {
        throw new Error("Auction not found.");
      }

      const auction = auctionSnap.data();

      if (auction.status !== "live") {
        throw new Error("This auction has already been closed.");
      }

      let teamRef = null;
      let teamSnap = null;
      let playerRef = null;
      let playerSnap = null;

      if (auction.teamId) {
        teamRef = doc(db, "teams", auction.teamId);
        teamSnap = await transaction.get(teamRef);
      }

      if (auction.playerId) {
        playerRef = doc(db, "players", auction.playerId);
        playerSnap = await transaction.get(playerRef);
      }

      if (auction.teamId && !teamSnap?.exists()) {
        throw new Error("Winning team not found.");
      }

      if (auction.teamId && teamSnap?.exists()) {
        const team = teamSnap.data();
        const remaining = Number(
          team.remainingBudget ?? team.budget ?? TEAM_BUDGET
        ) - Number(auction.currentBid || 0);

        if (remaining < 0) {
          throw new Error("The winning team does not have enough budget.");
        }

        transaction.update(teamRef, {
          budget: TEAM_BUDGET,
          remainingBudget: remaining
        });
      }

      transaction.update(auctionRef, {
        status: auction.teamId ? "Sold" : "Unsold",
        closedAt: serverTimestamp()
      });

      if (playerRef && playerSnap?.exists()) {
        transaction.update(
          playerRef,
          auction.teamId
            ? {
                status: "Sold",
                soldTo: auction.teamName || "",
                soldPrice: Number(auction.currentBid || 0)
              }
            : { status: "Unsold" }
        );
      }
    });

    showMessage("Auction closed successfully.");
  } catch (error) {
    showMessage(errorText(error), "error");
  }
}

// ---------------- DYNAMIC FORM MODAL ----------------
// Ye modal sirf forms ke liye hai.
// Player/Team ki details full-screen page par khulti hain.

function openFormModal(title, fieldsHtml, onSubmit) {
  document.getElementById("dynamicActionModal")?.remove();

  const backdrop = document.createElement("div");
  backdrop.id = "dynamicActionModal";
  backdrop.className = "modal-backdrop";

  backdrop.innerHTML = `
    <div class="modal box" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>${safe(title)}</h2>
        <button type="button" class="icon-btn" id="actionClose">✕</button>
      </div>

      <form id="dynamicActionForm">
        ${fieldsHtml}
        <button type="submit" class="primary-btn full-btn">Save</button>
      </form>
    </div>
  `;

  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();

  $("actionClose").addEventListener("click", close);

  backdrop.addEventListener("click", event => {
    if (event.target === backdrop) close();
  });

  $("dynamicActionForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!requireEditor()) return;

    const button = event.currentTarget.querySelector(
      'button[type="submit"]'
    );

    button.disabled = true;
    button.textContent = "Saving...";

    try {
      await onSubmit();
      close();
    } catch (error) {
      showMessage(errorText(error), "error");
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = "Save";
      }
    }
  });
}

// ---------------- ADD PLAYER ----------------

window.addPlayer = function () {
  if (!requireEditor()) return;

  openFormModal(
    "Register Player",
    `
      <label for="newPlayerName">Player Name</label>
      <input id="newPlayerName" required maxlength="100">

      <label for="newPlayerRole">Playing Role</label>
      <select id="newPlayerRole" required>
        <option value="Batsman">Batsman</option>
        <option value="Bowler">Bowler</option>
        <option value="All-rounder">All-rounder</option>
        <option value="Wicketkeeper">Wicketkeeper</option>
      </select>

      <label>Base Price</label>
      <input value="${money(BID_INCREMENT)}" readonly>

      <p class="muted-note">
        The starting auction price is fixed at ${money(BID_INCREMENT)}.
      </p>
    `,
    async () => {
      const name = $("newPlayerName").value.trim();
      const role = $("newPlayerRole").value;

      if (!name) throw new Error("Enter a valid player name.");

      await addDoc(collection(db, "players"), {
        name,
        role,
        basePrice: BID_INCREMENT,
        status: "Available",
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });

      showMessage("Player registered successfully.");
    }
  );
};

// ---------------- ADD TEAM ----------------

window.addTeam = function () {
  if (!requireEditor()) return;

  openFormModal(
    "Create Team",
    `
      <label for="newTeamName">Team Name</label>
      <input id="newTeamName" required maxlength="100">

      <label for="newTeamOwner">Owner Name</label>
      <input id="newTeamOwner" maxlength="100">

      <label>Team Budget</label>
      <input value="${money(TEAM_BUDGET)}" readonly>
    `,
    async () => {
      const name = $("newTeamName").value.trim();
      const owner = $("newTeamOwner").value.trim() ||
        currentUser.displayName ||
        currentUser.email ||
        "Team Owner";

      if (!name) throw new Error("Enter a valid team name.");

      await addDoc(collection(db, "teams"), {
        name,
        owner,
        budget: TEAM_BUDGET,
        remainingBudget: TEAM_BUDGET,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });

      showMessage("Team created with a ₹100 crore budget.");
    }
  );
};

// ---------------- AUCTION HISTORY ----------------

function renderHistory() {
  const container = $("hist");
  if (!container) return;

  const finished = auctions.filter(item => item.status !== "live");

  if (!finished.length) {
    container.innerHTML =
      `<div class="box empty-state">No completed auctions yet.</div>`;
    return;
  }

  container.innerHTML = finished
    .slice()
    .sort((a, b) =>
      (b.closedAt?.seconds || 0) - (a.closedAt?.seconds || 0)
    )
    .map(auction => `
      <article class="box content-card data-card">
        <span class="eyebrow">AUCTION HISTORY</span>
        <h3>${safe(auction.playerName || "Player")}</h3>
        <p><strong>Winner:</strong> ${safe(auction.teamName || "No winning team")}</p>
        <p><strong>Final Bid:</strong> ${money(auction.currentBid)}</p>
        <p><strong>Status:</strong> ${safe(auction.status)}</p>
      </article>
    `).join("");
}
