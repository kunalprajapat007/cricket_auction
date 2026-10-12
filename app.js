
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
  sendPasswordResetEmail
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
let players = [];
let teams = [];
let auctions = [];
let unsubscribePlayers = null;
let unsubscribeTeams = null;
let unsubscribeAuctions = null;
let isRegisterMode = false;
let activeModal = null;

// ---------------- MESSAGE ----------------

function message(text, type = "success") {
  const box = $("message");

  if (!box) {
    console.log(text);
    return;
  }

  box.textContent = text;
  box.className = `message ${type}`;
  box.hidden = false;

  clearTimeout(message.timer);

  message.timer = setTimeout(() => {
    box.hidden = true;
  }, 5000);
}

function friendlyError(error) {
  const errors = {
    "auth/invalid-email": "Email address sahi nahi hai.",
    "auth/invalid-credential": "Email ya password galat hai.",
    "auth/user-not-found": "Account nahi mila. Create an account karein.",
    "auth/wrong-password": "Password galat hai.",
    "auth/email-already-in-use": "Ye email pehle se registered hai.",
    "auth/weak-password": "Password kam se kam 6 characters ka hona chahiye.",
    "auth/too-many-requests": "Bahut attempts hue. Thodi der baad try karein.",
    "auth/network-request-failed": "Internet connection check karein.",
    "auth/requires-recent-login": "Dobara login karke try karein.",
    "permission-denied": "Firebase Firestore Rules permission deny kar rahe hain.",
    "firestore/permission-denied": "Firebase Firestore Rules check karein."
  };

  return errors[error?.code] ||
    error?.message ||
    "Kuch galat hua. Dobara try karein.";
}

function safeText(value) {
  const element = document.createElement("span");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

function money(value) {
  return "₹" + Number(value || 0).toLocaleString("en-IN");
}

function emptyState(container, text) {
  if (!container) return;

  container.innerHTML =
    `<div class="box empty-state">${safeText(text)}</div>`;
}

// ---------------- MODAL ----------------

function closeActionModal() {
  if (activeModal) activeModal.remove();
  activeModal = null;
}

function makeModal(title, description = "") {
  closeActionModal();

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.id = "actionModal";

  backdrop.innerHTML = `
    <div class="modal box" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div>
          <span class="eyebrow">SMART CRICKET AUCTION</span>
          <h2>${safeText(title)}</h2>
        </div>
        <button type="button" class="icon-btn"
          data-close-modal aria-label="Close">✕</button>
      </div>

      ${description
        ? `<p class="muted-note">${safeText(description)}</p>`
        : ""}

      <div id="actionModalBody"></div>
    </div>
  `;

  document.body.appendChild(backdrop);
  activeModal = backdrop;

  backdrop.addEventListener("click", event => {
    if (
      event.target === backdrop ||
      event.target.closest("[data-close-modal]")
    ) {
      closeActionModal();
    }
  });

  return $("actionModalBody");
}

function field(
  label,
  id,
  type = "text",
  placeholder = "",
  required = true
) {
  return `
    <label for="${id}">${safeText(label)}</label>
    <input
      id="${id}"
      type="${type}"
      placeholder="${safeText(placeholder)}"
      ${required ? "required" : ""}
      ${type === "number" ? 'min="0" step="any"' : ""}
    >
  `;
}

function selectField(label, id, options) {
  return `
    <label for="${id}">${safeText(label)}</label>
    <select id="${id}" required>
      ${options.map(option => `
        <option value="${safeText(option.value)}">
          ${safeText(option.label)}
        </option>
      `).join("")}
    </select>
  `;
}

function modalForm(title, fieldsHtml, onSubmit, description = "") {
  const body = makeModal(title, description);

  body.innerHTML = `
    <form id="actionForm">
      ${fieldsHtml}
      <button class="primary-btn full-btn" type="submit">Save</button>
    </form>
  `;

  $("actionForm").addEventListener("submit", async event => {
    event.preventDefault();

    const button = event.currentTarget.querySelector(
      'button[type="submit"]'
    );

    button.disabled = true;
    button.textContent = "Please wait...";

    try {
      await onSubmit();
      closeActionModal();
    } catch (error) {
      message(friendlyError(error), "error");
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = "Save";
      }
    }
  });
}

// ---------------- PASSWORD SHOW / HIDE ----------------

window.togglePasswordVisibility = function () {
  const input = $("pass");
  const button = $("eyeIcon");

  if (!input || !button) return;

  const visible = input.type === "password";

  input.type = visible ? "text" : "password";
  button.textContent = visible ? "🙈" : "👁️";

  button.setAttribute(
    "aria-label",
    visible ? "Hide password" : "Show password"
  );
};

// ---------------- FORGOT PASSWORD ----------------

window.handleForgotPassword = async function () {
  const email = $("email")?.value.trim();

  if (!email) {
    message(
      "Pehle email enter karein, phir Forgot Password click karein.",
      "error"
    );
    $("email")?.focus();
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    message("Password reset link aapke email par bhej diya gaya hai.");
  } catch (error) {
    message(friendlyError(error), "error");
  }
};

// ---------------- LOGIN / REGISTER TOGGLE ----------------

window.toggleAuthMode = function () {
  isRegisterMode = !isRegisterMode;

  if ($("authTitle")) {
    $("authTitle").textContent =
      isRegisterMode ? "Create Account" : "Welcome back";
  }

  if ($("loginBtn")) {
    $("loginBtn").textContent =
      isRegisterMode ? "Register Now" : "Login / Register";
  }

  if ($("pass")) {
    $("pass").autocomplete =
      isRegisterMode ? "new-password" : "current-password";

    $("pass").placeholder = isRegisterMode
      ? "Create password (6+ characters)"
      : "Enter password (6+ characters)";
  }

  if ($("toggleText")) {
    $("toggleText").innerHTML = isRegisterMode
      ? 'Already have an account? <span id="authModeLink" style="color:var(--accent);cursor:pointer;text-decoration:underline;font-weight:600;">Login here</span>'
      : 'New here? <span id="authModeLink" style="color:var(--accent);cursor:pointer;text-decoration:underline;font-weight:600;">Create an account</span>';
  }
};

$("toggleText")?.addEventListener("click", event => {
  if (event.target?.id === "authModeLink") {
    window.toggleAuthMode();
  }
});

// ---------------- LOGIN FORM ----------------

$("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("pass").value;
  const selectedRole = $("role")?.value || "viewer";
  const button = $("loginBtn");

  button.disabled = true;
  button.textContent = "Please wait...";

  try {
    if (isRegisterMode) {
      await createUserWithEmailAndPassword(auth, email, password);
      localStorage.setItem("auctionRole", selectedRole);
      message("Account successfully created!");
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
      isRegisterMode ? "Register Now" : "Login / Register";
  }
});

function roleName(role) {
  return {
    player: "Player",
    teamOwner: "Team Owner",
    viewer: "Viewer"
  }[role] || "Viewer";
}

// ---------------- AUTH STATE ----------------

onAuthStateChanged(auth, user => {
  currentUser = user;

  if (user) {
    currentRole = localStorage.getItem("auctionRole") || "viewer";

    if ($("login")) $("login").hidden = true;
    if ($("app")) $("app").hidden = false;
    if ($("userTools")) $("userTools").hidden = false;

    if ($("profileEmail")) {
      $("profileEmail").textContent = user.email || "Signed-in user";
    }

    if ($("profileRole")) {
      $("profileRole").textContent = roleName(currentRole);
    }

    if ($("currentEmail")) {
      $("currentEmail").textContent = user.email || "No email";
    }

    if ($("settingsRole")) {
      $("settingsRole").textContent = roleName(currentRole);
    }

    if ($("welcomeTitle")) {
      $("welcomeTitle").textContent =
        `Welcome, ${roleName(currentRole)}`;
    }

    listenToData();
    window.show("dash");
  } else {
    stopListeners();

    if ($("login")) $("login").hidden = false;
    if ($("app")) $("app").hidden = true;
    if ($("userTools")) $("userTools").hidden = true;
    if ($("profileMenu")) $("profileMenu").hidden = true;
    if ($("settingsModal")) $("settingsModal").hidden = true;
  }
});

// ---------------- PROFILE / SETTINGS ----------------

window.toggleProfile = function () {
  if ($("profileMenu")) {
    $("profileMenu").hidden = !$("profileMenu").hidden;
  }
};

window.openSettings = function () {
  if ($("profileMenu")) $("profileMenu").hidden = true;

  if ($("currentEmail")) {
    $("currentEmail").textContent = currentUser?.email || "No email";
  }

  if ($("settingsModal")) $("settingsModal").hidden = false;
};

window.closeSettings = function () {
  if ($("settingsModal")) $("settingsModal").hidden = true;
};

window.logout = async function () {
  try {
    closeActionModal();
    await signOut(auth);
    localStorage.removeItem("auctionRole");
    message("You have logged out.");
  } catch (error) {
    message(friendlyError(error), "error");
  }
};

// ---------------- CHANGE EMAIL ----------------

$("emailForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser?.email) {
    message("Please login first.", "error");
    return;
  }

  const newEmail = $("newEmail").value.trim();
  const password = $("currentPassword").value;

  if (newEmail === currentUser.email) {
    message("Ye aapka current email hi hai.", "error");
    return;
  }

  try {
    const credential = EmailAuthProvider.credential(
      currentUser.email,
      password
    );

    await reauthenticateWithCredential(currentUser, credential);
    await verifyBeforeUpdateEmail(currentUser, newEmail);

    message(
      "Verification email bhej diya gaya hai. Inbox mein link open karein."
    );

    $("emailForm").reset();
    $("settingsModal").hidden = true;
  } catch (error) {
    message(friendlyError(error), "error");
  }
});

// ---------------- WEBSITE NAVIGATION ----------------

window.show = function (sectionId) {
  const sections = ["dash", "players", "teams", "auction", "history"];

  if (!sections.includes(sectionId)) return;

  sections.forEach(id => {
    const section = $(id);
    if (section) section.hidden = id !== sectionId;
  });

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.section === sectionId
    );
  });

  if ($("profileMenu")) $("profileMenu").hidden = true;

  window.scrollTo({ top: 0, behavior: "smooth" });
};

// ---------------- FIRESTORE LISTENERS ----------------

function stopListeners() {
  unsubscribePlayers?.();
  unsubscribeTeams?.();
  unsubscribeAuctions?.();

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
  if ($("pc")) $("pc").textContent = players.length;
  if ($("tc")) $("tc").textContent = teams.length;
  if ($("bc")) $("bc").textContent = auctions.length;
}

// ---------------- PLAYERS ----------------

function renderPlayers() {
  const container = $("plist");
  if (!container) return;

  if (!players.length) {
    emptyState(
      container,
      "Abhi koi player registered nahi hai. Register Player se shuru karein."
    );
    return;
  }

  container.innerHTML = players.map(player => `
    <article class="box content-card">
      <span class="eyebrow">PLAYER</span>
      <h3>${safeText(player.name || "Unnamed Player")}</h3>
      <p>${safeText(player.role || "Player")}</p>
      <p><strong>Base Price:</strong> ${money(player.basePrice)}</p>
      <p><strong>Status:</strong> ${safeText(player.status || "Available")}</p>
    </article>
  `).join("");
}

// ---------------- TEAMS ----------------

function renderTeams() {
  const container = $("tlist");
  if (!container) return;

  if (!teams.length) {
    emptyState(
      container,
      "Abhi koi team nahi hai. Create Team se team banayein."
    );
    return;
  }

  container.innerHTML = teams.map(team => `
    <article class="box content-card">
      <span class="eyebrow">CRICKET TEAM</span>
      <h3>${safeText(team.name || "Unnamed Team")}</h3>
      <p><strong>Owner:</strong> ${safeText(team.owner || "Not specified")}</p>
      <p><strong>Budget:</strong> ${money(team.budget)}</p>
      <p><strong>Remaining:</strong> ${money(team.remainingBudget ?? team.budget)}</p>
    </article>
  `).join("");
}

// ---------------- LIVE AUCTION ----------------

function renderAuction() {
  const container = $("live");
  if (!container) return;

  const liveAuctions = auctions.filter(
    auction => auction.status === "live"
  );

  if (!liveAuctions.length) {
    emptyState(
      container,
      "Abhi koi live auction nahi hai. Start Auction par click karein."
    );
    return;
  }

  container.innerHTML = liveAuctions.map(auction => {
    const availableTeams = teams.map(team => `
      <option value="${safeText(team.id)}">
        ${safeText(team.name)}
      </option>
    `).join("");

    return `
      <article class="box auction-card">
        <span class="eyebrow">🔴 LIVE AUCTION</span>
        <h3>${safeText(auction.playerName || "Player")}</h3>
        <p><strong>Current bid:</strong> ${money(auction.currentBid)}</p>
        <p><strong>Highest team:</strong> ${safeText(auction.teamName || "No bids yet")}</p>

        ${teams.length ? `
          <form class="bid-form" data-auction-id="${safeText(auction.id)}">
            <label>Choose team</label>
            <select name="teamId" required>${availableTeams}</select>

            <label>Bid amount (₹)</label>
            <input
              name="bidAmount"
              type="number"
              min="${Number(auction.currentBid || 0) + 1}"
              step="1"
              required
            >

            <button class="primary-btn" type="submit">Place Bid</button>
            <button class="secondary-btn" type="button"
              data-sold-id="${safeText(auction.id)}">
              Close Auction
            </button>
          </form>
        ` : `<p>Create a team first to place bids.</p>`}
      </article>
    `;
  }).join("");

  container.querySelectorAll(".bid-form").forEach(form => {
    form.addEventListener("submit", async event => {
      event.preventDefault();

      const data = new FormData(form);

      await placeBid(
        form.dataset.auctionId,
        String(data.get("teamId")),
        Number(data.get("bidAmount"))
      );
    });
  });

  container.querySelectorAll("[data-sold-id]").forEach(button => {
    button.addEventListener("click", () => {
      closeAuction(button.dataset.soldId);
    });
  });
}

// ---------------- AUCTION HISTORY ----------------

function renderHistory() {
  const container = $("hist");
  if (!container) return;

  const completed = auctions.filter(
    auction => auction.status !== "live"
  );

  if (!completed.length) {
    emptyState(container, "Abhi auction history nahi hai.");
    return;
  }

  container.innerHTML = completed
    .slice()
    .sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    })
    .map(auction => `
      <article class="box content-card">
        <span class="eyebrow">AUCTION RECORD</span>
        <h3>${safeText(auction.playerName || "Player")}</h3>
        <p><strong>Winner:</strong> ${safeText(auction.teamName || "No winning team")}</p>
        <p><strong>Final bid:</strong> ${money(auction.currentBid)}</p>
        <p><strong>Status:</strong> ${safeText(auction.status || "Completed")}</p>
      </article>
    `).join("");
}

// ---------------- ADD PLAYER ----------------

window.addPlayer = function () {
  if (!currentUser) {
    message("Please login first.", "error");
    return;
  }

  modalForm(
    "Register Player",
    `
      ${field("Player name", "playerName", "text", "Enter player name")}

      ${selectField("Playing role", "playerRole", [
        { value: "Batsman", label: "Batsman" },
        { value: "Bowler", label: "Bowler" },
        { value: "All-rounder", label: "All-rounder" },
        { value: "Wicketkeeper", label: "Wicketkeeper" }
      ])}

      ${field("Base price (₹)", "basePrice", "number", "e.g. 100000")}
    `,
    async () => {
      const name = $("playerName").value.trim();
      const role = $("playerRole").value;
      const basePrice = Number($("basePrice").value);

      if (!name || !Number.isFinite(basePrice) || basePrice < 0) {
        throw new Error("Player name aur valid base price enter karein.");
      }

      await addDoc(collection(db, "players"), {
        name,
        role,
        basePrice,
        status: "Available",
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });

      message("Player successfully registered!");
    },
    "Player ki details enter karein."
  );
};

// ---------------- ADD TEAM ----------------

window.addTeam = function () {
  if (!currentUser) {
    message("Please login first.", "error");
    return;
  }

  modalForm(
    "Create Team",
    `
      ${field("Team name", "teamName", "text", "Enter team name")}
      ${field("Team owner", "teamOwner", "text", "Owner name", false)}
      ${field("Team budget (₹)", "teamBudget", "number", "e.g. 10000000")}
    `,
    async () => {
      const name = $("teamName").value.trim();
      const owner = $("teamOwner").value.trim() ||
        currentUser.email || "Team Owner";
      const budget = Number($("teamBudget").value);

      if (!name || !Number.isFinite(budget) || budget <= 0) {
        throw new Error("Team name aur budget sahi enter karein.");
      }

      await addDoc(collection(db, "teams"), {
        name,
        owner,
        budget,
        remainingBudget: budget,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });

      message("Team successfully created!");
    },
    "Team name aur available budget enter karein."
  );
};

// ---------------- START AUCTION ----------------

window.startAuction = function () {
  if (!currentUser) {
    message("Please login first.", "error");
    return;
  }

  const availablePlayers = players.filter(player =>
    player.status !== "Sold" &&
    !auctions.some(auction =>
      auction.playerId === player.id && auction.status === "live"
    )
  );

  if (!availablePlayers.length) {
    message(
      "Auction ke liye available player nahi hai. Pehle player register karein.",
      "error"
    );
    return;
  }

  modalForm(
    "Start Auction",
    selectField(
      "Select player",
      "auctionPlayerId",
      availablePlayers.map(player => ({
        value: player.id,
        label: `${player.name || "Player"} — base ${money(player.basePrice)}`
      }))
    ),
    async () => {
      const player = availablePlayers.find(
        item => item.id === $("auctionPlayerId").value
      );

      if (!player) throw new Error("Player select karein.");

      await addDoc(collection(db, "auctions"), {
        playerId: player.id,
        playerName: player.name || "Player",
        currentBid: Number(player.basePrice || 0),
        teamId: "",
        teamName: "",
        status: "live",
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });

      message("Auction start ho gaya!");
      window.show("auction");
    },
    "Jis player ka auction start karna hai use select karein."
  );
};

// ---------------- PLACE BID ----------------

async function placeBid(auctionId, teamId, amount) {
  if (!currentUser) {
    message("Please login first.", "error");
    return;
  }

  const auction = auctions.find(item => item.id === auctionId);

  if (!auction) {
    message("Auction nahi mila.", "error");
    return;
  }

  if (!Number.isFinite(amount) || amount <= Number(auction.currentBid || 0)) {
    message("Bid current bid se zyada honi chahiye.", "error");
    return;
  }

  try {
    await runTransaction(db, async transaction => {
      const auctionRef = doc(db, "auctions", auctionId);
      const teamRef = doc(db, "teams", teamId);

      const auctionSnap = await transaction.get(auctionRef);
      const teamSnap = await transaction.get(teamRef);

      if (!auctionSnap.exists() || !teamSnap.exists()) {
        throw new Error("Auction ya team nahi mili.");
      }

      const latestAuction = auctionSnap.data();
      const latestTeam = teamSnap.data();

      if (latestAuction.status !== "live") {
        throw new Error("Ye auction ab live nahi hai.");
      }

      if (amount <= Number(latestAuction.currentBid || 0)) {
        throw new Error("Kisi aur ne higher bid laga di. Dobara try karein.");
      }

      const remainingBudget = Number(
        latestTeam.remainingBudget ?? latestTeam.budget ?? 0
      );

      if (amount > remainingBudget) {
        throw new Error("Team ka remaining budget is bid ke liye kaafi nahi hai.");
      }

      transaction.update(auctionRef, {
        currentBid: amount,
        teamId,
        teamName: latestTeam.name || "Team",
        updatedAt: serverTimestamp()
      });
    });

    message("Bid successfully placed!");
  } catch (error) {
    message(friendlyError(error), "error");
  }
}

// ---------------- CLOSE AUCTION ----------------

async function closeAuction(auctionId) {
  const auction = auctions.find(item => item.id === auctionId);

  if (!auction) {
    message("Auction nahi mila.", "error");
    return;
  }

  try {
    await runTransaction(db, async transaction => {
      const auctionRef = doc(db, "auctions", auctionId);
      const auctionSnap = await transaction.get(auctionRef);

      if (!auctionSnap.exists()) {
        throw new Error("Auction record nahi mila.");
      }

      const latest = auctionSnap.data();

      if (latest.status !== "live") {
        throw new Error("Auction pehle hi close ho chuka hai.");
      }

      let teamRef = null;
      let teamSnap = null;
      let playerRef = null;
      let playerSnap = null;

      // Saare reads writes se pehle hone chahiye.
      if (latest.teamId) {
        teamRef = doc(db, "teams", latest.teamId);
        teamSnap = await transaction.get(teamRef);
      }

      if (latest.playerId) {
        playerRef = doc(db, "players", latest.playerId);
        playerSnap = await transaction.get(playerRef);
      }

      if (latest.teamId && !teamSnap?.exists()) {
        throw new Error("Winning team nahi mili.");
      }

      if (latest.teamId && teamSnap?.exists()) {
        const teamData = teamSnap.data();
        const remaining = Number(
          teamData.remainingBudget ?? teamData.budget ?? 0
        ) - Number(latest.currentBid || 0);

        if (remaining < 0) {
          throw new Error("Winning team ka budget insufficient hai.");
        }

        transaction.update(teamRef, {
          remainingBudget: remaining
        });
      }

      transaction.update(auctionRef, {
        status: latest.teamId ? "Sold" : "Unsold",
        closedAt: serverTimestamp()
      });

      if (playerRef && playerSnap?.exists()) {
        transaction.update(playerRef, latest.teamId
          ? {
              status: "Sold",
              soldTo: latest.teamName || "",
              soldPrice: Number(latest.currentBid || 0)
            }
          : {
              status: "Unsold"
            }
        );
      }
    });

    message(
      auction.teamId
        ? `Auction close ho gaya. Winner: ${auction.teamName || "Team"}`
        : "Auction close ho gaya. Player unsold raha."
    );
  } catch (error) {
    message(friendlyError(error), "error");
  }
}
