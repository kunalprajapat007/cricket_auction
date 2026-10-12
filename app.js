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

// Mode state maintain karne ke liye
let isRegisterMode = false;

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
    "auth/invalid-email": "The email address is invalid.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/user-not-found": "Account not found. Please switch to register mode to create a new account.",
    "auth/wrong-password": "Incorrect password.",
    "auth/email-already-in-use": "This email is already registered. Please login instead.",
    "auth/weak-password": "Password should be at least 6 characters long.",
    "auth/too-many-requests": "Too many attempts. Please try again after some time.",
    "auth/network-request-failed": "Please check your internet connection.",
    "auth/requires-recent-login": "For security reasons, please login again and retry.",
    "permission-denied": "Firebase Firestore Rules permission denied.",
    "firestore/permission-denied": "Firebase Firestore Rules permission denied."
  };

  return errors[error.code] || error.message || "An error occurred. Please try again.";
}

// ---- FEATURE 1: SHOW/HIDE PASSWORD TOGGLE ----
window.togglePasswordVisibility = function () {
  const passwordInput = $("pass");
  const eyeIcon = $("eyeIcon");
  
  if (!passwordInput || !eyeIcon) return;
  
  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    eyeIcon.textContent = "🙈"; 
  } else {
    passwordInput.type = "password";
    eyeIcon.textContent = "👁️"; 
  }
};

// ---- FEATURE 2: FORGOT PASSWORD ACTION ----
window.handleForgotPassword = async function () {
  const email = $("email").value.trim();
  
  if (!email) {
    message("Please enter your email address in the input field first!", "error");
    return;
  }
  
  try {
    await sendPasswordResetEmail(auth, email);
    message("A password reset link has been sent to your email!");
  } catch (error) {
    message(friendlyError(error), "error");
  }
};

// ---- FEATURE 3: SWITCH LOGIN / REGISTER MODE ----
window.toggleAuthMode = function () {
  isRegisterMode = !isRegisterMode;
  
  const formTitle = $("authTitle");
  const submitBtn = $("loginBtn");
  const switchToggleText = $("toggleText");
  
  if (isRegisterMode) {
    if (formTitle) formTitle.textContent = "Create Account";
    if (submitBtn) submitBtn.textContent = "Register Now";
    if (switchToggleText) {
      switchToggleText.innerHTML = 'Already have an account? <span onclick="toggleAuthMode()" style="color: var(--accent); cursor: pointer; text-decoration: underline; font-weight: 600;">Login here</span>';
    }
  } else {
    if (formTitle) formTitle.textContent = "Welcome back";
    if (submitBtn) submitBtn.textContent = "Login / Register";
    if (switchToggleText) {
      switchToggleText.innerHTML = 'New here? <span onclick="toggleAuthMode()" style="color: var(--accent); cursor: pointer; text-decoration: underline; font-weight: 600;">Create an account</span>';
    }
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
    if (isRegisterMode) {
      // Register Mode
      await createUserWithEmailAndPassword(auth, email, password);
      localStorage.setItem("auctionRole", selectedRole);
      message("Account successfully created!");
    } else {
      // Login Mode
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

        // POPUP KO HATAKAR YAHAN DIRECT WEBSITE PAR MESSAGE DIKHA DIYA HAI
        if (canRegister) {
          message("Login failed. If you don't have an account, click 'Create an account' below to register.", "error");
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    message(friendlyError(error), "error");
  } finally {
    button.disabled = false;
    button.textContent = isRegisterMode ? "Register Now" : "Login / Register";
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
    message("Please login with your email and password first.", "error");
    return;
  }

  const newEmail = $("newEmail").value.trim();
  const password = $("currentPassword").value;

  if (newEmail === currentUser.email) {
    message("This is already your current email address.", "error");
    return;
  }

  try {
    const credential = EmailAuthProvider.credential(currentUser.email, password);
    await reauthenticateWithCredential(currentUser, credential);
    await verifyBeforeUpdateEmail(currentUser, newEmail);

    message("A verification email has been sent. Please open the link in your inbox.");
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
