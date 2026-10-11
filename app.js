import { firebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://gstatic.com";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  verifyBeforeUpdateEmail
} from "https://gstatic.com";

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
} from "https://gstatic.com";

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
  if (!box) return;
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

// ===================================================
// DYNAMIC DUAL THEME TOGGLE CONTROLLER
// ===================================================
window.toggleTheme = function() {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const targetTheme = (currentTheme === "light") ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", targetTheme);
  localStorage.setItem("appTheme", targetTheme);
  message(`Theme successfully updated to ${targetTheme.toUpperCase()} mode!`, "success");
};

// Auto-align configuration properties on runtime load
const storedTheme = localStorage.getItem("appTheme") || "dark";
document.documentElement.setAttribute("data-theme", storedTheme);

// ===================================================
// SHOW / HIDE DYNAMIC EMAIL CHANGE BOX CONTAINER
// ===================================================
window.toggleEmailFormView = function() {
  const container = $("emailFormContainer");
  if (container) {
    container.hidden = !container.hidden;
  }
};

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
  $("settingsRole").textContent = roleName(currentRole);
  $("settingsModal").hidden = false;
};

window.closeSettings = function () {
  $("settingsModal").hidden = true;
  if ($("emailFormContainer")) $("emailFormContainer").hidden = true;
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

    message("Verification email bhej diya gaya hai. Inbox mein link open karo.", "success");
    $("emailForm").reset();
    window.closeSettings();
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
      if (typeof renderPlayers === "function") renderPlayers();
      updateCounts();
    },
    error => message(friendlyError(error), "error")
  );

  unsubscribeTeams = onSnapshot(
    collection(db, "teams"),
    snapshot => {
      teams = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      if (typeof renderTeams === "function") renderTeams();
      updateCounts();
    },
    error => message(friendlyError(error), "error")
  );

  unsubscribeAuctions = onSnapshot(
    collection(db, "auctions"),
    snapshot => {
      auctions = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      if (typeof renderAuction === "function") renderAuction();
      if (typeof renderHistory === "function") renderHistory();
      updateCounts();
    },
    error => message(friendlyError(error), "error")
  );
}

function updateCounts() {
  if ($("pc")) $("pc").textContent = players.length;
  if ($("tc")) $("tc").textContent = teams.length;
  
  if ($("bc")) {
    // FIXED ACTIVE AUCTION COUNTER: Sirf active 'LIVE' status filter krega
    const liveAuctionsOnly = auctions.filter(item => item.status === "LIVE");
    $("bc").textContent = liveAuctionsOnly.length;
  }
}

function safeText(value) {
  const element = document.createElement("span");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

function renderPlayers() {
  const list = $("plist");
  if (!list) return;

  if (!players.length) {
    list.innerHTML = '<div class="box empty-state">Abhi koi player registered nahi hai. “Register Player” par click karo.</div>';
    return;
  }

  list.innerHTML = players.map(player => `
    <article class="data-card">
      <span class="tag">${safeText(player.category || "Cricket Player")}</span>
      <h3>${safeText(player.name || "Unnamed Player")}</h3>
      <p>Role: ${safeText(player.role || "Not specified")}</p>
    </article>
  `).join("");
}

// ===================================================
// GLOBAL CLICK DYNAMIC CRICKET-GREEN RIPPLE EFFECT
