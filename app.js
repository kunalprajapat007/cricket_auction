
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  verifyBeforeUpdateEmail
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  runTransaction,
  serverTimestamp,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

/*
  IMPORTANT:
  firebase-config.js must export your existing Firebase config like this:
  export const firebaseConfig = { ...your Firebase web config... };
  Keep your real apiKey and other Firebase values in that file.
*/
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentRole = "viewer";
let authMode = "login";
let players = [];
let teams = [];
let auctions = [];
let history = [];
let unsubscribePlayers = null;
let unsubscribeTeams = null;
let unsubscribeAuctions = null;
let unsubscribeHistory = null;
let messageTimer = null;

const money = (amount) =>
  "₹" + Number(amount || 0).toLocaleString("en-IN");

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function showMessage(text, type = "success") {
  const box = $("message");
  if (!box) return;

  clearTimeout(messageTimer);
  box.textContent = text;
  box.className = `message ${type}`;
  box.hidden = false;

  messageTimer = setTimeout(() => {
    box.hidden = true;
  }, 5000);
}

function friendlyError(error) {
  const code = error?.code || "";

  const errors = {
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/requires-recent-login": "Please log in again and retry this action.",
    "permission-denied": "Firebase permission denied. Check your Firestore rules.",
    "unavailable": "Service temporarily unavailable. Please try again."
  };

  return errors[code] || error?.message || "Something went wrong. Please try again.";
}

function openModal(id) {
  const modal = $(id);
  if (modal) modal.hidden = false;
}

window.closeModal = function (id) {
  const modal = $(id);
  if (modal) modal.hidden = true;
};

window.backdropClose = function (event, id) {
  if (event.target.id === id) window.closeModal(id);
};

window.togglePassword = function (id, button) {
  const input = $(id);
  if (!input) return;

  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  button.textContent = isHidden ? "Hide" : "Show";
  button.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
};

function applyTheme(theme) {
  const selectedTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = selectedTheme;

  try {
    localStorage.setItem("auctionTheme", selectedTheme);
  } catch {}

  const button = $("themeToggle");
  if (button) {
    button.textContent = selectedTheme === "dark"
      ? "☀️ Light Theme"
      : "🌙 Dark Theme";
  }
}

let savedTheme = "dark";
try {
  savedTheme = localStorage.getItem("auctionTheme") || "dark";
} catch {}
applyTheme(savedTheme);

window.toggleTheme = function () {
  const current = document.documentElement.dataset.theme || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
};

window.toggleProfileMenu = function (force) {
  const menu = $("profileMenu");
  if (!menu) return;

  if (typeof force === "boolean") {
    menu.hidden = !force;
  } else {
    menu.hidden = !menu.hidden;
  }
};

window.show = function (page) {
  const allowedPages = ["dash", "players", "teams", "auction", "history"];
  if (!allowedPages.includes(page)) page = "dash";

  allowedPages.forEach((name) => {
    const section = $(`page-${name}`);
    if (section) section.hidden = name !== page;
  });

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  if ($("welcomeTitle")) {
    const titles = {
      dash: "Dashboard",
      players: "Players",
      teams: "Teams",
      auction: "Live Auctions",
      history: "Auction History"
    };
    $("welcomeTitle").textContent = titles[page];
  }

  window.toggleProfileMenu(false);
};

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";

  $("authTitle").textContent = authMode === "login" ? "Welcome Back" : "Create Account";
  $("authSubtitle").textContent = authMode === "login"
    ? "Sign in to continue to your dashboard."
    : "Create an account to join the auction.";
  $("loginBtn").textContent = authMode === "login" ? "Sign In" : "Create Account";
  $("authSwitchText").textContent = authMode === "login"
    ? "Don't have an account?"
    : "Already have an account?";
  $("authSwitch").textContent = authMode === "login" ? "Create account" : "Sign in";
  $("pass").autocomplete = authMode === "login" ? "current-password" : "new-password";
}

window.toggleAuthMode = function () {
  setAuthMode(authMode === "login" ? "register" : "login");
};

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("pass").value;
  const role = $("role").value;
  const button = $("loginBtn");

  button.disabled = true;
  button.textContent = authMode === "login" ? "Signing in..." : "Creating account...";

  try {
    if (authMode === "register") {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      currentRole = role;

      try {
        localStorage.setItem(`auctionRole_${result.user.uid}`, role);
      } catch {}

      showMessage("Account created successfully.", "success");
    } else {
      const result = await signInWithEmailAndPassword(auth, email, password);

      let storedRole = "viewer";
      try {
        storedRole = localStorage.getItem(`auctionRole_${result.user.uid}`) || "viewer";
      } catch {}

      currentRole = storedRole;
      showMessage("Login successful.", "success");
    }
  } catch (error) {
    showMessage(friendlyError(error), "error");
  } finally {
    button.disabled = false;
    button.textContent = authMode === "login" ? "Sign In" : "Create Account";
  }
});

function stopListeners() {
  [unsubscribePlayers, unsubscribeTeams, unsubscribeAuctions, unsubscribeHistory]
    .forEach((unsubscribe) => {
      if (typeof unsubscribe === "function") unsubscribe();
    });

  unsubscribePlayers = null;
  unsubscribeTeams = null;
  unsubscribeAuctions = null;
  unsubscribeHistory = null;
}

function setSignedInUI(user) {
  $("login").hidden = Boolean(user);
  $("app").hidden = !user;
  $("userTools").hidden = !user;

  if (user) {
    const email = user.email || "Signed-in user";
    $("headerEmail").textContent = email;
    $("menuEmail").textContent = email;
    $("currentEmail").textContent = email;
    $("settingsRole").textContent = `Role: ${currentRole}`;
    $("menuRole").textContent = `Role: ${currentRole}`;
  } else {
    $("profileMenu").hidden = true;
    $("settingsModal").hidden = true;
    $("customModal").hidden = true;
  }
}

onAuthStateChanged(auth, (user) => {
  stopListeners();
  currentUser = user;

  if (!user) {
    currentRole = "viewer";
    setSignedInUI(null);
    return;
  }

  try {
    currentRole = localStorage.getItem(`auctionRole_${user.uid}`) || "viewer";
  } catch {
    currentRole = "viewer";
  }

  setSignedInUI(user);
  subscribeToData();
  window.show("dash");
});

window.logout = async function () {
  try {
    await signOut(auth);
    showMessage("You have been logged out.", "success");
  } catch (error) {
    showMessage(friendlyError(error), "error");
  }
};

window.openSettings = function () {
  if (!currentUser) {
    showMessage("Please sign in first.", "error");
    return;
  }

  $("currentEmail").textContent = currentUser.email || "—";
  $("settingsRole").textContent = `Role: ${currentRole}`;
  $("newEmail").value = "";
  $("currentPassword").value = "";
  openModal("settingsModal");
  window.toggleProfileMenu(false);
};

$("emailForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser || !currentUser.email) return;

  const newEmail = $("newEmail").value.trim();
  const password = $("currentPassword").value;
  const button = $("changeEmailBtn");

  if (!newEmail || !password) {
    showMessage("Enter the new email and current password.", "error");
    return;
  }

  if (newEmail.toLowerCase() === currentUser.email.toLowerCase()) {
    showMessage("The new email is the same as your current email.", "error");
    return;
  }

  button.disabled = true;
  button.textContent = "Processing...";

  try {
    const credential = EmailAuthProvider.credential(currentUser.email, password);
    await reauthenticateWithCredential(currentUser, credential);
    await verifyBeforeUpdateEmail(currentUser, newEmail);

    showMessage("Verification email sent. Open it to confirm your new email address.", "success");
    $("currentPassword").value = "";
    $("newEmail").value = "";
  } catch (error) {
    showMessage(friendlyError(error), "error");
  } finally {
    button.disabled = false;
    button.textContent = "Change Email";
  }
});

function subscribeToData() {
  const playersQuery = collection(db, "players");
  const teamsQuery = collection(db, "teams");
  const auctionsQuery = collection(db, "auctions");
  const historyQuery = query(collection(db, "history"), orderBy("createdAt", "desc"), limit(100));

  unsubscribePlayers = onSnapshot(playersQuery, (snapshot) => {
    players = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderPlayers();
    updateCounts();
  }, (error) => showMessage(friendlyError(error), "error"));

  unsubscribeTeams = onSnapshot(teamsQuery, (snapshot) => {
    teams = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderTeams();
    updateCounts();
    renderAuction();
  }, (error) => showMessage(friendlyError(error), "error"));

  unsubscribeAuctions = onSnapshot(auctionsQuery, (snapshot) => {
    auctions = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderAuction();
    updateCounts();
  }, (error) => showMessage(friendlyError(error), "error"));

  unsubscribeHistory = onSnapshot(historyQuery, (snapshot) => {
    history = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderHistory();
  }, (error) => {
    // If the history collection is not created yet, show an empty history.
    history = [];
    renderHistory();
  });
}

function updateCounts() {
  $("pc").textContent = players.length;
  $("tc").textContent = teams.length;
  $("bc").textContent = auctions.filter((auction) => auction.status === "Live").length;
}

function canManage() {
  return currentRole === "teamOwner" || currentRole === "viewer" || currentRole === "player";
}

/* Players */

function renderPlayers() {
  const container = $("plist");
  if (!players.length) {
    container.innerHTML = `<div class="empty-state">No players added yet. Click “Add Player” to create the first player.</div>`;
    return;
  }

  container.innerHTML = players.map((player) => `
    <article class="data-card">
      <h3>🏏 ${escapeHtml(player.name || "Unnamed Player")}</h3>
      <p><strong>Role:</strong> ${escapeHtml(player.role || "Not specified")}</p>
      <p><strong>Base Price:</strong> ${money(player.basePrice)}</p>
      <p><strong>Status:</strong> <span class="tag">${escapeHtml(player.status || "Available")}</span></p>
      ${player.teamName ? `<p><strong>Team:</strong> ${escapeHtml(player.teamName)}</p>` : ""}
    </article>
  `).join("");
}

window.addPlayer = function () {
  if (!currentUser) return;

  $("customModalTitle").textContent = "Add Player";
  $("customModalBody").innerHTML = `
    <form id="playerForm">
      <label for="playerName">Player Name</label>
      <input id="playerName" required maxlength="80" placeholder="Enter player name">

      <label for="playerRole">Playing Role</label>
      <select id="playerRole" required>
        <option value="Batsman">Batsman</option>
        <option value="Bowler">Bowler</option>
        <option value="All-Rounder">All-Rounder</option>
        <option value="Wicket-Keeper">Wicket-Keeper</option>
      </select>

      <label for="playerBasePrice">Base Price (₹)</label>
      <input id="playerBasePrice" type="number" min="0" step="1" value="100000" required>

      <button class="primary-btn full-btn" type="submit">Save Player</button>
    </form>
  `;

  $("playerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("playerName").value.trim();
    const role = $("playerRole").value;
    const basePrice = Number($("playerBasePrice").value);

    if (!name || !Number.isFinite(basePrice) || basePrice < 0) {
      showMessage("Enter valid player details.", "error");
      return;
    }

    try {
      await addDoc(collection(db, "players"), {
        name,
        role,
        basePrice,
        status: "Available",
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });

      window.closeModal("customModal");
      showMessage("Player added successfully.", "success");
    } catch (error) {
      showMessage(friendlyError(error), "error");
    }
  });

  openModal("customModal");
};

/* Teams */

function renderTeams() {
  const container = $("tlist");
  if (!teams.length) {
    container.innerHTML = `<div class="empty-state">No teams added yet. Click “Add Team” to create a team.</div>`;
    return;
  }

  container.innerHTML = teams.map((team) => `
    <article class="data-card">
      <h3>🛡️ ${escapeHtml(team.name || "Unnamed Team")}</h3>
      <p><strong>Owner:</strong> ${escapeHtml(team.ownerEmail || "Not specified")}</p>
      <p><strong>Budget:</strong> ${money(team.budget)}</p>
      <p><strong>Players bought:</strong> ${Number(team.playersBought || 0)}</p>
    </article>
  `).join("");
}

window.addTeam = function () {
  if (!currentUser) return;

  $("customModalTitle").textContent = "Add Team";
  $("customModalBody").innerHTML = `
    <form id="teamForm">
      <label for="teamName">Team Name</label>
      <input id="teamName" required maxlength="80" placeholder="Enter team name">

      <label for="teamBudget">Team Budget (₹)</label>
      <input id="teamBudget" type="number" min="0" step="1" value="10000000" required>

      <button class="primary-btn full-btn" type="submit">Save Team</button>
    </form>
  `;

  $("teamForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("teamName").value.trim();
    const budget = Number($("teamBudget").value);

    if (!name || !Number.isFinite(budget) || budget < 0) {
      showMessage("Enter valid team details.", "error");
      return;
    }

    try {
      await addDoc(collection(db, "teams"), {
        name,
        budget,
        ownerUid: currentUser.uid,
        ownerEmail: currentUser.email || "",
        playersBought: 0,
        createdAt: serverTimestamp()
      });

      window.closeModal("customModal");
      showMessage("Team added successfully.", "success");
    } catch (error) {
      showMessage(friendlyError(error), "error");
    }
  });

  openModal("customModal");
};

/* Auction creation */

window.startAuction = function () {
  if (!currentUser) return;

  const availablePlayers = players.filter((player) => player.status === "Available");
  if (!availablePlayers.length) {
    showMessage("There are no available players. Add a player or finish an existing auction first.", "error");
    return;
  }

  $("customModalTitle").textContent = "Start Auction";
  $("customModalBody").innerHTML = `
    <form id="auctionForm">
      <label for="auctionPlayer">Select Player</label>
      <select id="auctionPlayer" required>
        ${availablePlayers.map((player) => `
          <option value="${escapeHtml(player.id)}">
            ${escapeHtml(player.name)} — ${money(player.basePrice)}
          </option>
        `).join("")}
      </select>

      <label for="auctionBasePrice">Starting Bid (₹)</label>
      <input id="auctionBasePrice" type="number" min="0" step="1" required>

      <button class="primary-btn full-btn" type="submit">Start Live Auction</button>
    </form>
  `;

  const playerSelect = $("auctionPlayer");
  const baseInput = $("auctionBasePrice");

  function updateBasePrice() {
    const selected = availablePlayers.find((player) => player.id === playerSelect.value);
    baseInput.value = Number(selected?.basePrice || 0);
  }

  playerSelect.addEventListener("change", updateBasePrice);
  updateBasePrice();

  $("auctionForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const playerId = playerSelect.value;
    const selectedPlayer = availablePlayers.find((player) => player.id === playerId);
    const startingBid = Number(baseInput.value);

    if (!selectedPlayer || !Number.isFinite(startingBid) || startingBid < 0) {
      showMessage("Please select a player and enter a valid starting bid.", "error");
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const playerRef = doc(db, "players", playerId);
        const playerSnapshot = await transaction.get(playerRef);

        if (!playerSnapshot.exists() || playerSnapshot.data().status !== "Available") {
          throw new Error("This player is no longer available for auction.");
        }

        const newAuctionRef = doc(collection(db, "auctions"));
        transaction.set(newAuctionRef, {
          playerId,
          playerName: selectedPlayer.name,
          basePrice: startingBid,
          currentBid: startingBid,
          highestBid: startingBid,
          highestTeamId: "",
          highestTeamName: "",
          status: "Live",
          createdBy: currentUser.uid,
          createdAt: serverTimestamp()
        });

        transaction.update(playerRef, { status: "In Auction" });
      });

      window.closeModal("customModal");
      showMessage("Live auction started.", "success");
      window.show("auction");
    } catch (error) {
      showMessage(friendlyError(error), "error");
    }
  });

  openModal("customModal");
};

/* Render every live auction, not only the first one */

function renderAuction() {
  const container = $("live");
  const liveAuctions = auctions.filter((auction) => auction.status === "Live");

  if (!liveAuctions.length) {
    container.innerHTML = `<div class="empty-state">No live auctions right now. Click “Start Auction” to begin.</div>`;
    return;
  }

  container.innerHTML = liveAuctions.map((auction) => {
    const teamOptions = teams.map((team) => `
      <option value="${escapeHtml(team.id)}">${escapeHtml(team.name)}</option>
    `).join("");

    return `
      <article class="data-card auction-card">
        <span class="tag"><span class="live-dot"></span> LIVE</span>
        <h3>🏏 ${escapeHtml(auction.playerName || "Player")}</h3>
        <p>Starting bid: <strong>${money(auction.basePrice)}</strong></p>
        <p>Current highest bid</p>
        <div class="price">${money(auction.currentBid ?? auction.highestBid ?? auction.basePrice)}</div>
        <p><strong>Highest team:</strong> ${escapeHtml(auction.highestTeamName || "No bids yet")}</p>
        <div class="bid-row">
          <select id="team-${escapeHtml(auction.id)}" aria-label="Select team">
            <option value="">Select a team</option>
            ${teamOptions}
          </select>
          <button class="primary-btn" onclick="placeBid('${escapeHtml(auction.id)}')">Place Bid</button>
        </div>
        <div class="card-actions">
          <button class="secondary-btn" onclick="finishAuction('${escapeHtml(auction.id)}')">Finish Auction</button>
        </div>
      </article>
    `;
  }).join("");
}

window.placeBid = async function (auctionId) {
  if (!currentUser) return;

  const teamSelect = $(`team-${auctionId}`);
  const teamId = teamSelect?.value;

  if (!teamId) {
    showMessage("Select a team before placing a bid.", "error");
    return;
  }

  const selectedTeam = teams.find((team) => team.id === teamId);
  if (!selectedTeam) {
    showMessage("Selected team could not be found.", "error");
    return;
  }

  const auctionRef = doc(db, "auctions", auctionId);
  const teamRef = doc(db, "teams", teamId);

  try {
    await runTransaction(db, async (transaction) => {
      const auctionSnapshot = await transaction.get(auctionRef);
      const teamSnapshot = await transaction.get(teamRef);

      if (!auctionSnapshot.exists()) throw new Error("Auction not found.");
      if (!teamSnapshot.exists()) throw new Error("Team not found.");

      const auction = auctionSnapshot.data();
      const team = teamSnapshot.data();

      if (auction.status !== "Live") throw new Error("This auction is no longer live.");

      const currentBid = Number(auction.currentBid ?? auction.highestBid ?? auction.basePrice ?? 0);
      const nextBid = currentBid + Math.max(1, Math.ceil(currentBid * 0.05));
      const budget = Number(team.budget || 0);

      if (budget < nextBid) {
        throw new Error("This team does not have enough budget for the next bid.");
      }

      transaction.update(auctionRef, {
        currentBid: nextBid,
        highestBid: nextBid,
        highestTeamId: teamId,
        highestTeamName: team.name,
        lastBidBy: currentUser.uid,
        lastBidAt: serverTimestamp()
      });

      transaction.set(doc(collection(db, "history")), {
        auctionId,
        playerId: auction.playerId || "",
        playerName: auction.playerName || "Player",
        teamId,
        teamName: team.name || "Team",
        amount: nextBid,
        action: "Bid",
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });
    });

    showMessage("Bid placed successfully.", "success");
  } catch (error) {
    showMessage(friendlyError(error), "error");
  }
};

window.finishAuction = async function (auctionId) {
  if (!currentUser) return;

  const auctionRef = doc(db, "auctions", auctionId);

  try {
    await runTransaction(db, async (transaction) => {
      const auctionSnapshot = await transaction.get(auctionRef);
      if (!auctionSnapshot.exists()) throw new Error("Auction not found.");

      const auction = auctionSnapshot.data();
      if (auction.status !== "Live") throw new Error("This auction has already finished.");

      const playerRef = auction.playerId ? doc(db, "players", auction.playerId) : null;
      const teamRef = auction.highestTeamId ? doc(db, "teams", auction.highestTeamId) : null;

      const playerSnapshot = playerRef ? await transaction.get(playerRef) : null;
      const teamSnapshot = teamRef ? await transaction.get(teamRef) : null;

      transaction.update(auctionRef, {
        status: "Completed",
        completedAt: serverTimestamp()
      });

      if (playerRef && playerSnapshot?.exists()) {
        transaction.update(playerRef, {
          status: teamSnapshot?.exists() ? "Sold" : "Unsold",
          teamId: teamSnapshot?.exists() ? auction.highestTeamId : "",
          teamName: teamSnapshot?.exists() ? (teamSnapshot.data().name || "") : "",
          soldPrice: teamSnapshot?.exists() ? Number(auction.currentBid || auction.basePrice || 0) : 0
        });
      }

      if (teamRef && teamSnapshot?.exists()) {
        const team = teamSnapshot.data();
        const finalPrice = Number(auction.currentBid || auction.basePrice || 0);
        transaction.update(teamRef, {
          budget: Math.max(0, Number(team.budget || 0) - finalPrice),
          playersBought: Number(team.playersBought || 0) + 1
        });
      }

      transaction.set(doc(collection(db, "history")), {
        auctionId,
        playerId: auction.playerId || "",
        playerName: auction.playerName || "Player",
        teamId: auction.highestTeamId || "",
        teamName: auction.highestTeamName || "",
        amount: Number(auction.currentBid || auction.basePrice || 0),
        action: teamSnapshot?.exists() ? "Sold" : "Unsold",
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });
    });

    showMessage("Auction finished.", "success");
  } catch (error) {
    showMessage(friendlyError(error), "error");
  }
};

/* History */

function renderHistory() {
  const container = $("hist");

  if (!history.length) {
    container.innerHTML = `<div class="empty-state">No auction history available yet.</div>`;
    return;
  }

  container.innerHTML = history.map((item) => {
    let dateText = "Date unavailable";
    if (item.createdAt?.toDate) {
      dateText = item.createdAt.toDate().toLocaleString();
    }

    return `
      <article class="data-card">
        <h3>📋 ${escapeHtml(item.playerName || "Auction activity")}</h3>
        <p><strong>Action:</strong> <span class="tag">${escapeHtml(item.action || "Bid")}</span></p>
        <p><strong>Team:</strong> ${escapeHtml(item.teamName || "No team")}</p>
        <p><strong>Amount:</strong> ${money(item.amount)}</p>
        <p><strong>Date:</strong> ${escapeHtml(dateText)}</p>
      </article>
    `;
  }).join("");
}
