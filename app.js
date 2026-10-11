
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
  getDocs,
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

function message(text, type = "success") {
  const box = $("message");
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
    "auth/user-not-found": "Account nahi mila. Naya account banane ke liye Register confirm karo.",
    "auth/wrong-password": "Password galat hai.",
    "auth/email-already-in-use": "Ye email pehle se registered hai. Login karo.",
    "auth/weak-password": "Password kam se kam 6 characters ka rakho.",
    "auth/too-many-requests": "Bahut attempts hue. Thodi der baad try karo.",
    "auth/network-request-failed": "Internet connection check karo.",
    "auth/requires-recent-login": "Security ke liye dobara login karke try karo.",
    "permission-denied": "Firebase Firestore Rules permission nahi de rahe.",
    "firestore/permission-denied": "Firebase Firestore Rules permission nahi de rahe."
  };

  return errors[error.code] || error.message || "Kuch error aaya. Dobara try karo.";
}

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("pass").value;
  const selectedRole = $("role").value;
  const button = $("loginBtn");

  button.disabled = true;
  button.textContent = "Please wait...";

  try {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      localStorage.setItem("auctionRole", selectedRole);
      message("Login successful!");
    } catch (error) {
      const canRegister = [
        "auth/invalid-credential",
        "auth/user-not-found",
        "auth/invalid-login-credentials"
      ].includes(error.code);

      if (canRegister && confirm("Login nahi hua. Kya is email se naya account banana hai?")) {
        await createUserWithEmailAndPassword(auth, email, password);
        localStorage.setItem("auctionRole", selectedRole);
        message("Account successfully create ho gaya!");
      } else {
        throw error;
      }
    }
  } catch (error) {
    message(friendlyError(error), "error");
  } finally {
    button.disabled = false;
    button.textContent = "Login / Register";
  }
});

onAuthStateChanged(auth, user => {
  currentUser = user;

  if (user) {
    currentRole = localStorage.getItem("auctionRole") || "viewer";

    $("login").hidden = true;
    $("app").hidden = false;
    $("userTools").hidden = false;

    $("profileEmail").textContent = user.email || "Signed-in user";
    $("profileRole").textContent = roleName(currentRole);
    $("currentEmail").textContent = user.email || "No email";
    $("settingsRole").textContent = roleName(currentRole);
    $("welcomeTitle").textContent = `Welcome, ${roleName(currentRole)}`;

    listenToData();
    window.show("dash");
  } else {
    stopListeners();
    $("login").hidden = false;
    $("app").hidden = true;
    $("userTools").hidden = true;
    $("profileMenu").hidden = true;
    $("settingsModal").hidden = true;
  }
});

function roleName(role) {
  return ({
    player: "Player",
    teamOwner: "Team Owner",
    viewer: "Viewer"
  })[role] || "Viewer";
}

window.toggleProfile = function () {
  $("profileMenu").hidden = !$("profileMenu").hidden;
};

window.openSettings = function () {
  $("profileMenu").hidden = true;
  $("currentEmail").textContent = currentUser?.email || "No email";
  $("settingsModal").hidden = false;
};

window.closeSettings = function () {
  $("settingsModal").hidden = true;
};

window.logout = async function () {
  try {
    await signOut(auth);
    localStorage.removeItem("auctionRole");
    message("You have logged out.");
  } catch (error) {
    message(friendlyError(error), "error");
  }
};

$("emailForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser || !currentUser.email) {
    message("Pehle email/password se login karo.", "error");
    return;
  }

  const newEmail = $("newEmail").value.trim();
  const password = $("currentPassword").value;

  if (newEmail === currentUser.email) {
    message("Ye tumhara current email hi hai.", "error");
    return;
  }

  try {
    const credential = EmailAuthProvider.credential(currentUser.email, password);
    await reauthenticateWithCredential(currentUser, credential);
    await verifyBeforeUpdateEmail(currentUser, newEmail);

    message("Verification email bhej diya gaya hai. Inbox mein link open karo.");
    $("emailForm").reset();
    $("settingsModal").hidden = true;
  } catch (error) {
    message(friendlyError(error), "error");
  }
});

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

  $("profileMenu").hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
};

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
      players = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      renderPlayers();
      updateCounts();
    },
    error => message(friendlyError(error), "error")
  );

  unsubscribeTeams = onSnapshot(
    collection(db, "teams"),
    snapshot => {
      teams = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      renderTeams();
      updateCounts();
    },
    error => message(friendlyError(error), "error")
  );

  unsubscribeAuctions = onSnapshot(
    collection(db, "auctions"),
    snapshot => {
      auctions = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
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

function safeText(value) {
  const element = document.createElement("span");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

function renderPlayers() {
  const list = $("plist");

  if (!players.length) {
    list.innerHTML = '<div class="box empty-state">Abhi koi player registered nahi hai. “Register Player” par click karo.</div>';
    return;
  }

  list.innerHTML = players.map(player => `
    <article class="data-card">
      <span class="tag">${safeText(player.category || "Cricket Player")}</span>
      <h3>${safeText(player.name || "Unnamed Player")}</h3>
      <p>Role: ${safeText(player.role || "Not specified")}</p>
      <p>Base Price: ₹${Number(player.basePrice || 0).toLocaleString("en-IN")}</p>
      <p>Status: ${safeText(player.status || "Available")}</p>
    </article>
  `).join("");
}

function renderTeams() {
  const list = $("tlist");

  if (!teams.length) {
    list.innerHTML = '<div class="box empty-state">Abhi koi team nahi hai. “Create Team” par click karo.</div>';
    return;
  }

  list.innerHTML = teams.map(team => `
    <article class="data-card">
      <span class="tag">Cricket Team</span>
      <h3>${safeText(team.name || "Unnamed Team")}</h3>
      <p>Owner: ${safeText(team.ownerEmail || "Not specified")}</p>
      <p>Budget: ₹${Number(team.budget || 0).toLocaleString("en-IN")}</p>
    </article>
  `).join("");
}

window.addPlayer = async function () {
  if (!currentUser) return;

  const name = prompt("Player ka naam enter karo:");
  if (!name || !name.trim()) return;

  const role = prompt("Player role (Batsman/Bowler/All-rounder/Wicketkeeper):", "Batsman");
  if (role === null) return;

  const priceText = prompt("Base price ₹ mein enter karo:", "100000");
  if (priceText === null) return;

  const basePrice = Number(priceText);

  if (!Number.isFinite(basePrice) || basePrice < 0) {
    message("Valid base price enter karo.", "error");
    return;
  }

  try {
    await addDoc(collection(db, "players"), {
      name: name.trim(),
      role: role.trim(),
      category: "Cricket Player",
      basePrice,
      status: "Available",
      createdBy: currentUser.uid,
      createdAt: serverTimestamp()
    });

    message("Player successfully registered!");
  } catch (error) {
    message(friendlyError(error), "error");
  }
};

window.addTeam = async function () {
  if (!currentUser) return;

  const name = prompt("Team ka naam enter karo:");
  if (!name || !name.trim()) return;

  const budgetText = prompt("Team ka budget ₹ mein enter karo:", "10000000");
  if (budgetText === null) return;

  const budget = Number(budgetText);

  if (!Number.isFinite(budget) || budget < 0) {
    message("Valid team budget enter karo.", "error");
    return;
  }

  try {
    await addDoc(collection(db, "teams"), {
      name: name.trim(),
      budget,
      ownerId: currentUser.uid,
      ownerEmail: currentUser.email || "",
      createdAt: serverTimestamp()
    });

    message("Team successfully create ho gayi!");
  } catch (error) {
    message(friendlyError(error), "error");
  }
};

window.startAuction = async function () {
  if (!currentUser) return;

  const availablePlayers = players.filter(player => player.status !== "Sold");

  if (!availablePlayers.length) {
    message("Auction start karne ke liye pehle ek available player register karo.", "error");
    window.show("players");
    return;
  }

  const playerNames = availablePlayers.map(player => player.name).join(", ");
  const chosenName = prompt(`Auction ke liye player ka exact naam enter karo:\n${playerNames}`);

  if (!chosenName) return;

  const player = availablePlayers.find(
    item => item.name.toLowerCase() === chosenName.trim().toLowerCase()
  );

  if (!player) {
    message("Player ka naam list se exact select/enter karo.", "error");
    return;
  }

  try {
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

    await updateDoc(doc(db, "players", player.id), { status: "In Auction" });
    message(`Auction started for ${player.name}!`);
  } catch (error) {
    message(friendlyError(error), "error");
  }
};

function renderAuction() {
  const liveAuction = auctions.find(auction => auction.status === "Live");
  const container = $("live");

  if (!liveAuction) {
    container.className = "box empty-state";
    container.innerHTML = `
      <h3>No live auction right now</h3>
      <p>Register a player, then click “Start Auction”.</p>
    `;
    return;
  }

  container.className = "box auction-card";
  container.innerHTML = `
    <span class="tag">🔴 LIVE NOW</span>
    <h2 style="margin-top:15px">${safeText(liveAuction.playerName)}</h2>
    <p>Base Price: ₹${Number(liveAuction.basePrice || 0).toLocaleString("en-IN")}</p>
    <h1>₹${Number(liveAuction.currentBid || 0).toLocaleString("en-IN")}</h1>
    <p>Highest bidder: ${safeText(liveAuction.highestBidder || "No bids yet")}</p>
    <div class="bid-row">
      <select id="bidTeam">
        <option value="">Select a team</option>
        ${teams.map(team => `<option value="${safeText(team.id)}">${safeText(team.name)}</option>`).join("")}
      </select>
      <button class="primary-btn" id="placeBidBtn">Place Bid +</button>
    </div>
    <p class="muted-note">Each bid increases the current price by ₹10,000.</p>
  `;

  $("placeBidBtn").addEventListener("click", () => placeBid(liveAuction.id));
}

async function placeBid(auctionId) {
  const teamId = $("bidTeam").value;

  if (!teamId) {
    message("Bid karne se pehle team select karo.", "error");
    return;
  }

  const team = teams.find(item => item.id === teamId);
  if (!team) {
    message("Selected team nahi mili.", "error");
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
      const teamData = teamSnapshot.data();

      if (auction.status !== "Live") {
        throw new Error("Ye auction ab live nahi hai.");
      }

      const nextBid = Number(auction.currentBid || 0) + 10000;

      if (nextBid > Number(teamData.budget || 0)) {
        throw new Error("Team ka budget is bid ke liye kam hai.");
      }

      transaction.update(auctionRef, {
        currentBid: nextBid,
        highestBidder: teamData.name,
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

function renderHistory() {
  const history = $("hist");

  if (!auctions.length) {
    history.innerHTML = '<div class="box empty-state">Abhi auction history available nahi hai.</div>';
    return;
  }

  history.innerHTML = [...auctions].reverse().map(auction => `
    <article class="data-card">
      <span class="tag">${safeText(auction.status || "Auction")}</span>
      <h3>${safeText(auction.playerName || "Player")}</h3>
      <p>Final/Current Bid: ₹${Number(auction.currentBid || 0).toLocaleString("en-IN")}</p>
      <p>Highest bidder: ${safeText(auction.highestBidder || "No bids")}</p>
    </article>
  `).join("");
}

document.addEventListener("click", event => {
  if (!event.target.closest(".user-tools")) {
    $("profileMenu").hidden = true;
  }
});
