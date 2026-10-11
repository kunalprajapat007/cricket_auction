
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
  verifyBeforeUpdateEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const $ = id => document.getElementById(id);

let currentUser = null;
let currentRole = "viewer";
let authMode = "login";

let players = [];
let teams = [];
let auctions = [];

let unsubscribePlayers = null;
let unsubscribeTeams = null;
let unsubscribeAuctions = null;

let actionMode = "";
let messageTimer = null;

function message(text, type = "success") {
  const box = $("message");
  if (!box) return;

  box.textContent = text;
  box.className = `message ${type}`;
  box.hidden = false;

  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    box.hidden = true;
  }, 5000);
}

function friendlyError(error) {
  const errors = {
    "auth/invalid-email": "Email address sahi nahi hai.",
    "auth/invalid-credential": "Email ya password galat hai.",
    "auth/invalid-login-credentials": "Email ya password galat hai.",
    "auth/user-not-found": "Account nahi mila. Create Account par click karo.",
    "auth/wrong-password": "Password galat hai.",
    "auth/email-already-in-use": "Ye email pehle se registered hai. Login karo.",
    "auth/weak-password": "Password kam se kam 6 characters ka rakho.",
    "auth/too-many-requests": "Bahut attempts hue. Thodi der baad try karo.",
    "auth/network-request-failed": "Internet connection check karo.",
    "auth/requires-recent-login": "Security ke liye dobara login karke try karo.",
    "auth/operation-not-allowed": "Firebase Console mein Email/Password sign-in enable karo.",
    "auth/invalid-action-code": "Verification link invalid ya expire ho gaya hai.",
    "permission-denied": "Firestore Rules ne permission deny ki hai.",
    "firestore/permission-denied": "Firestore Rules ne permission deny ki hai."
  };

  return errors[error.code] || error.message || "Kuch error aaya. Dobara try karo.";
}

function safeText(value) {
  const span = document.createElement("span");
  span.textContent = String(value ?? "");
  return span.innerHTML;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0
  });
}

function roleName(role) {
  return ({
    player: "Player",
    teamOwner: "Team Owner",
    viewer: "Viewer"
  })[role] || "Viewer";
}

/* ---------------- LOGIN / REGISTER ---------------- */

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";

  $("loginTab").classList.toggle("active", authMode === "login");
  $("registerTab").classList.toggle("active", authMode === "register");

  $("loginBtn").textContent =
    authMode === "login" ? "Login" : "Create New Account";

  $("authHelp").textContent =
    authMode === "login"
      ? "Apna account access karne ke liye Login karo."
      : "Naya account banane ke liye email aur password enter karo.";

  $("pass").autocomplete =
    authMode === "login" ? "current-password" : "new-password";
}

$("loginTab").addEventListener("click", () => setAuthMode("login"));
$("registerTab").addEventListener("click", () => setAuthMode("register"));

$("togglePass").addEventListener("click", () => {
  const password = $("pass");
  const isHidden = password.type === "password";

  password.type = isHidden ? "text" : "password";
  $("togglePass").textContent = isHidden ? "Hide" : "Show";
});

document.querySelectorAll("[data-toggle-password]").forEach(button => {
  button.addEventListener("click", () => {
    const field = $(button.dataset.togglePassword);
    if (!field) return;

    const isHidden = field.type === "password";
    field.type = isHidden ? "text" : "password";
    button.textContent = isHidden ? "Hide" : "Show";
  });
});

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("pass").value;
  const selectedRole = $("role").value;
  const button = $("loginBtn");

  if (!email || !password) {
    message("Email aur password dono enter karo.", "error");
    return;
  }

  button.disabled = true;
  button.textContent =
    authMode === "login" ? "Logging in..." : "Creating account...";

  try {
    if (authMode === "register") {
      await createUserWithEmailAndPassword(auth, email, password);
      localStorage.setItem("auctionRole", selectedRole);
      message("Account successfully create ho gaya!");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      localStorage.setItem("auctionRole", selectedRole);
      message("Login successful!");
    }
  } catch (error) {
    message(friendlyError(error), "error");
  } finally {
    button.disabled = false;
    button.textContent =
      authMode === "login" ? "Login" : "Create New Account";
  }
});

/* ---------------- AUTH STATE ---------------- */

onAuthStateChanged(auth, user => {
  currentUser = user;

  if (user) {
    currentRole = localStorage.getItem("auctionRole") || "viewer";

    $("login").hidden = true;
    $("app").hidden = false;

    $("profileEmail").textContent = user.email || "Signed-in user";
    $("menuEmail").textContent = user.email || "Signed-in user";
    $("profileRole").textContent = roleName(currentRole);
    $("menuRole").textContent = roleName(currentRole);
    $("currentEmail").textContent = user.email || "No email";
    $("settingsRole").textContent = roleName(currentRole);
    $("welcomeTitle").textContent = `Welcome, ${roleName(currentRole)}`;

    listenToData();
    showSection("dash");
  } else {
    stopListeners();

    players = [];
    teams = [];
    auctions = [];

    $("login").hidden = false;
    $("app").hidden = true;
    $("profileMenu").hidden = true;
    $("settingsModal").hidden = true;
    $("actionModal").hidden = true;

    $("loginForm").reset();
    setAuthMode("login");
  }
});

/* ---------------- PROFILE / SETTINGS ---------------- */

$("profileBtn").addEventListener("click", event => {
  event.stopPropagation();
  $("profileMenu").hidden = !$("profileMenu").hidden;
});

$("settingsBtn").addEventListener("click", () => {
  $("profileMenu").hidden = true;
  $("currentEmail").textContent = currentUser?.email || "No email";
  $("settingsModal").hidden = false;
});

$("logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
    localStorage.removeItem("auctionRole");
    message("You have logged out.");
  } catch (error) {
    message(friendlyError(error), "error");
  }
});

$("emailForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser || !currentUser.email) {
    message("Pehle email/password se login karo.", "error");
    return;
  }

  const newEmail = $("newEmail").value.trim();
  const password = $("currentPassword").value;
  const button = $("emailSaveBtn");

  if (newEmail === currentUser.email) {
    message("Ye tumhara current email hi hai.", "error");
    return;
  }

  button.disabled = true;
  button.textContent = "Please wait...";

  try {
    const credential = EmailAuthProvider.credential(
      currentUser.email,
      password
    );

    await reauthenticateWithCredential(currentUser, credential);
    await verifyBeforeUpdateEmail(currentUser, newEmail);

    message("Verification email bhej diya gaya hai. Inbox check karo.");
    $("emailForm").reset();
    $("settingsModal").hidden = true;
  } catch (error) {
    message(friendlyError(error), "error");
  } finally {
    button.disabled = false;
    button.textContent = "Verify New Email";
  }
});

/* ---------------- THEME ---------------- */

function applyTheme(theme) {
  document.body.classList.toggle("light-theme", theme === "light");
  $("themeToggle").textContent = theme === "light" ? "☀️" : "🌙";
  $("themeToggle").title =
    theme === "light" ? "Switch to dark theme" : "Switch to light theme";
  localStorage.setItem("auctionTheme", theme);
}

applyTheme(localStorage.getItem("auctionTheme") || "dark");

$("themeToggle").addEventListener("click", () => {
  const isLight = document.body.classList.contains("light-theme");
  applyTheme(isLight ? "dark" : "light");
});

/* ---------------- NAVIGATION ---------------- */

function showSection(sectionId) {
  const sections = ["dash", "players", "teams", "auction", "history"];
  if (!sections.includes(sectionId)) return;

  sections.forEach(id => {
    $(id).hidden = id !== sectionId;
  });

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.section === sectionId
    );
  });

  $("profileMenu").hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".nav-btn").forEach(button => {
  button.addEventListener("click", () => {
    showSection(button.dataset.section);
  });
});

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => {
    showSection(button.dataset.go);
  });
});

document.addEventListener("click", event => {
  if (!event.target.closest(".user-tools")) {
    $("profileMenu").hidden = true;
  }
});

/* ---------------- DATA LISTENERS ---------------- */

function stopListeners() {
  if (unsubscribePlayers) unsubscribePlayers();
  if (unsubscribeTeams) unsubscribeTeams();
  if (unsubscribeAuctions) unsubscribeAuctions();

  unsubscribePlayers = null;
  unsubscribeTeams = null;
  unsubscribeAuctions = null;
}

function listenToData() {
  stopListeners();

  unsubscribePlayers = onSnapshot(
    collection(db, "players"),
    snapshot => {
      players = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      renderPlayers();
      updateCounts();
      renderActionPlayerOptions();
    },
    error => message(friendlyError(error), "error")
  );

  unsubscribeTeams = onSnapshot(
    collection(db, "teams"),
    snapshot => {
      teams = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      renderTeams();
      updateCounts();
      renderAuction();
    },
    error => message(friendlyError(error), "error")
  );

  unsubscribeAuctions = onSnapshot(
    collection(db, "auctions"),
    snapshot => {
      auctions = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      renderAuction();
      renderHistory();
      updateCounts();
    },
    error => message(friendlyError(error), "error")
  );
}

function updateCounts() {
  $("pc").textContent = players.length;
  $("tc").textContent = teams.length;
  $("bc").textContent = auctions.length;
}

/* ---------------- PLAYER CARDS ---------------- */

function renderPlayers() {
  const list = $("plist");

  if (!players.length) {
    list.innerHTML = `
      <div class="empty-state">
        <h3>No players yet</h3>
        <p>Register your first player to get started.</p>
      </div>`;
    return;
  }

  list.innerHTML = players.map(player => `
    <article class="data-card">
      <span class="tag">${safeText(player.category || "Cricket Player")}</span>
      <h3>${safeText(player.name || "Unnamed Player")}</h3>
      <p>Role: ${safeText(player.role || "Not specified")}</p>
      <p>Base Price: ₹${formatMoney(player.basePrice)}</p>
      <p>Status: ${safeText(player.status || "Available")}</p>
    </article>
  `).join("");
}

/* ---------------- TEAM CARDS ---------------- */

function renderTeams() {
  const list = $("tlist");

  if (!teams.length) {
    list.innerHTML = `
      <div class="empty-state">
        <h3>No teams yet</h3>
        <p>Create your first team to get started.</p>
      </div>`;
    return;
  }

  list.innerHTML = teams.map(team => `
    <article class="data-card">
      <span class="tag">Cricket Team</span>
      <h3>${safeText(team.name || "Unnamed Team")}</h3>
      <p>Owner: ${safeText(team.ownerEmail || "Not specified")}</p>
      <p>Budget: ₹${formatMoney(team.budget)}</p>
    </article>
  `).join("");
}

/* ---------------- CUSTOM ADD FORMS ---------------- */

function openActionModal(mode) {
  if (!currentUser) {
    message("Pehle login karo.", "error");
    return;
  }

  actionMode = mode;
  $("actionForm").reset();

  const fields = $("actionFields");

  if (mode === "player") {
    $("actionTitle").textContent = "Register Player";
    $("actionSubmit").textContent = "Register Player";

    fields.innerHTML = `
      <label for="playerName">Player name</label>
      <input id="playerName" name="playerName" placeholder="Enter player name" required>

      <label for="playerRole">Player role</label>
      <select id="playerRole" name="playerRole" required>
        <option value="Batsman">Batsman</option>
        <option value="Bowler">Bowler</option>
        <option value="All-rounder">All-rounder</option>
        <option value="Wicketkeeper">Wicketkeeper</option>
      </select>

      <label for="playerPrice">Base price (₹)</label>
      <input id="playerPrice" name="playerPrice" type="number" min="0" value="100000" required>
    `;
  } else if (mode === "team") {
    $("actionTitle").textContent = "Create Team";
    $("actionSubmit").textContent = "Create Team";

    fields.innerHTML = `
      <label for="teamName">Team name</label>
      <input id="teamName" name="teamName" placeholder="Enter team name" required>

      <label for="teamBudget">Team budget (₹)</label>
      <input id="teamBudget" name="teamBudget" type="number" min="0" value="10000000" required>
    `;
  } else if (mode === "auction") {
    const available = players.filter(
      player => player.status !== "Sold" && player.status !== "In Auction"
    );

    if (!available.length) {
      message("Auction start karne ke liye pehle available player register karo.", "error");
      showSection("players");
      return;
    }

    $("actionTitle").textContent = "Start Auction";
    $("actionSubmit").textContent = "Start Auction";

    fields.innerHTML = `
      <label for="auctionPlayer">Select player</label>
      <select id="auctionPlayer" name="auctionPlayer" required>
        <option value="">Choose a player</option>
        ${available.map(player => `
          <option value="${safeText(player.id)}">
            ${safeText(player.name)} — ₹${formatMoney(player.basePrice)}
          </option>
        `).join("")}
      </select>
      <p class="muted small-text">Selected player will be marked as In Auction.</p>
    `;
  }

  $("actionModal").hidden = false;
}

function renderActionPlayerOptions() {
  if (!$("actionModal").hidden && actionMode === "auction") {
    openActionModal("auction");
  }
}

document.querySelectorAll("[data-action]").forEach(button => {
  button.addEventListener("click", () => {
    openActionModal(button.dataset.action);
  });
});

document.querySelectorAll("[data-close]").forEach(button => {
  button.addEventListener("click", () => {
    $(button.dataset.close).hidden = true;
  });
});

document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
  backdrop.addEventListener("click", event => {
    if (event.target === backdrop) {
      backdrop.hidden = true;
    }
  });
});

$("actionForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) {
    message("Pehle login karo.", "error");
    return;
  }

  const button = $("actionSubmit");
  button.disabled = true;
  button.textContent = "Please wait...";

  try {
    if (actionMode === "player") {
      const name = $("playerName").value.trim();
      const role = $("playerRole").value;
      const basePrice = Number($("playerPrice").value);

      if (!name || !Number.isFinite(basePrice) || basePrice < 0) {
        throw new Error("Player name aur valid base price enter karo.");
      }

      await addDoc(collection(db, "players"), {
        name,
        role,
        category: "Cricket Player",
        basePrice,
        status: "Available",
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });

      message("Player successfully registered!");
      $("actionModal").hidden = true;
    }

    if (actionMode === "team") {
      const name = $("teamName").value.trim();
      const budget = Number($("teamBudget").value);

      if (!name || !Number.isFinite(budget) || budget < 0) {
        throw new Error("Team name aur valid budget enter karo.");
      }

      await addDoc(collection(db, "teams"), {
        name,
        budget,
        ownerId: currentUser.uid,
        ownerEmail: currentUser.email || "",
        createdAt: serverTimestamp()
      });

      message("Team successfully create ho gayi!");
      $("actionModal").hidden = true;
    }

    if (actionMode === "auction") {
      const playerId = $("auctionPlayer").value;
      const player = players.find(item => item.id === playerId);

      if (!player) {
        throw new Error("Available player select karo.");
      }

      const existingLive = auctions.some(
        auction => auction.status === "Live" && auction.playerId === player.id
      );

      if (existingLive) {
        throw new Error("Is player ka auction pehle se live hai.");
      }

      await addDoc(collection(db, "auctions"), {
        playerId: player.id,
        playerName: player.name,
        basePrice: Number(player.basePrice || 0),
        currentBid: Number(player.basePrice || 0),
        highestBidder: "",
        highestTeamId: "",
        status: "Live",
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, "players", player.id), {
        status: "In Auction"
      });

      message(`Auction started for ${player.name}!`);
      $("actionModal").hidden = true;
      showSection("auction");
    }
  } catch (error) {
    message(friendlyError(error), "error");
  } finally {
    button.disabled = false;

    if (actionMode === "player") button.textContent = "Register Player";
    else if (actionMode === "team") button.textContent = "Create Team";
    else button.textContent = "Start Auction";
  }
});

/* ---------------- LIVE AUCTIONS ---------------- */

function auctionCardHTML(auction) {
  const live = auction.status === "Live";
  const teamOptions = teams.map(team => `
    <option value="${safeText(team.id)}">${safeText(team.name)}</option>
  `).join("");

  return `
    <article class="auction-card">
      <span class="tag ${live ? "live-tag" : ""}">
        ${live ? "🔴 LIVE NOW" : safeText(auction.status || "Auction")}
      </span>
      <h3>${safeText(auction.playerName || "Cricket Player")}</h3>
      <p>Base Price: ₹${formatMoney(auction.basePrice)}</p>
      <div class="auction-price">₹${formatMoney(auction.currentBid)}</div>
      <p>Highest bidder: ${safeText(auction.highestBidder || "No bids yet")}</p>

      ${live ? `
        <div class="bid-row">
          <select id="team-${safeText(auction.id)}" aria-label="Select team">
            <option value="">Select a team</option>
            ${teamOptions}
          </select>
          <button type="button" class="primary-btn bid-button"
                  data-bid-auction="${safeText(auction.id)}">
            Place Bid + ₹10,000
          </button>
        </div>
        ${teams.length ? "" : '<p class="muted-note">Create a team before placing a bid.</p>'}
      ` : ""}
    </article>
  `;
}

function renderAuction() {
  const liveAuctions = auctions.filter(auction => auction.status === "Live");
  const page = $("liveAuctions");
  const dashboard = $("dashboardLive");

  const empty = `
    <div class="empty-state">
      <h3>No live auctions right now</h3>
      <p>Register a player and start an auction to see it here.</p>
    </div>`;

  page.innerHTML = liveAuctions.length
    ? liveAuctions.map(auctionCardHTML).join("")
    : empty;

  dashboard.innerHTML = liveAuctions.length
    ? liveAuctions.slice(0, 3).map(auctionCardHTML).join("")
    : empty;
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-bid-auction]");
  if (!button) return;

  placeBid(button.dataset.bidAuction);
});

async function placeBid(auctionId) {
  if (!currentUser) {
    message("Pehle login karo.", "error");
    return;
  }

  const select = $(`team-${auctionId}`);
  const teamId = select?.value;

  if (!teamId) {
    message("Bid karne se pehle team select karo.", "error");
    return;
  }

  try {
    await runTransaction(db, async transaction => {
      const auctionRef = doc(db, "auctions", auctionId);
      const teamRef = doc(db, "teams", teamId);

      const auctionSnapshot = await transaction.get(auctionRef);
      const teamSnapshot = await transaction.get(teamRef);

      if (!auctionSnapshot.exists() || !teamSnapshot.exists()) {
        throw new Error("Auction ya team nahi mili.");
      }

      const auction = auctionSnapshot.data();
      const team = teamSnapshot.data();

      if (auction.status !== "Live") {
        throw new Error("Ye auction ab live nahi hai.");
      }

      const nextBid = Number(auction.currentBid || 0) + 10000;

      if (nextBid > Number(team.budget || 0)) {
        throw new Error("Team ka budget is bid ke liye kam hai.");
      }

      transaction.update(auctionRef, {
        currentBid: nextBid,
        highestBidder: team.name,
        highestTeamId: teamId,
        lastBidBy: currentUser.uid,
        updatedAt: serverTimestamp()
      });
    });

    message("Bid successfully placed!");
  } catch (error) {
    message(friendlyError(error), "error");
  }
}

/* ---------------- AUCTION HISTORY ---------------- */

function renderHistory() {
  const history = $("hist");

  if (!auctions.length) {
    history.innerHTML = `
      <div class="empty-state">
        <h3>No auction history</h3>
        <p>Auctions will appear here when created.</p>
      </div>`;
    return;
  }

  history.innerHTML = [...auctions].reverse().map(auction => `
    <article class="data-card">
      <span class="tag ${auction.status === "Live" ? "live-tag" : ""}">
        ${safeText(auction.status || "Auction")}
      </span>
      <h3>${safeText(auction.playerName || "Player")}</h3>
      <p>Base Price: ₹${formatMoney(auction.basePrice)}</p>
      <p>Current/Final Bid: ₹${formatMoney(auction.currentBid)}</p>
      <p>Highest bidder: ${safeText(auction.highestBidder || "No bids")}</p>
    </article>
  `).join("");
}
