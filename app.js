
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
  setDoc,
  runTransaction,
  getDocs
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

// Firebase setup
const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);

let unsubs = [];

const $ = (id) => document.getElementById(id);
const money = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN");

// ===============================
// LOGIN / REGISTER
// ===============================
window.login = async (event) => {
  if (event) event.preventDefault();

  const email = $("email")?.value.trim();
  const password = $("pass")?.value;
  const role = $("role")?.value || "viewer";

  if (!email || !password) {
    alert("Email aur password enter karo.");
    return;
  }

  if (password.length < 6) {
    alert("Password kam se kam 6 characters ka hona chahiye.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    localStorage.setItem("auctionRole", role);
  } catch (error) {
    console.error("Login error:", error.code, error.message);

    if (
      error.code === "auth/invalid-credential" ||
      error.code === "auth/user-not-found"
    ) {
      const register = confirm(
        "Login nahi hua. Kya tum is email se naya account banana chahte ho?"
      );

      if (!register) return;

      try {
        await createUserWithEmailAndPassword(auth, email, password);
        localStorage.setItem("auctionRole", role);
        alert("Account successfully create ho gaya!");
      } catch (e) {
        console.error("Register error:", e.code, e.message);

        if (e.code === "auth/email-already-in-use") {
          alert("Ye email registered hai. Sahi password se login karo.");
        } else {
          alert("Registration failed: " + e.message);
        }
      }
    } else if (error.code === "auth/operation-not-allowed") {
      alert("Firebase Console mein Email/Password enable karo.");
    } else {
      alert("Login failed: " + error.message);
    }
  }
};

// ===============================
// LOGOUT
// ===============================
window.logout = async () => {
  try {
    await signOut(auth);
    localStorage.removeItem("auctionRole");
  } catch (error) {
    alert("Logout failed: " + error.message);
  }
};

// ===============================
// AUTH STATE
// ===============================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    if ($("login")) $("login").hidden = true;
    if ($("app")) $("app").hidden = false;

    try {
      await seedDemoData();
      listen();
      window.show("dash");
    } catch (error) {
      console.error("Dashboard error:", error);
      alert("Dashboard error: " + error.message);
    }
  } else {
    unsubs.forEach((fn) => fn());
    unsubs = [];

    if ($("login")) $("login").hidden = false;
    if ($("app")) $("app").hidden = true;
  }
});

// ===============================
// NAVIGATION
// ===============================
window.show = (id) => {
  ["dash", "players", "teams", "auction", "history"].forEach((tab) => {
    const element = $(tab);
    if (element) element.hidden = tab !== id;
  });
};

// ===============================
// DEMO DATA
// ===============================
async function seedDemoData() {
  const players = [
    {
      id: "demo_player_1",
      name: "Virat Demo",
      role: "Batsman",
      basePrice: 100000
    },
    {
      id: "demo_player_2",
      name: "Rohit Demo",
      role: "Batsman",
      basePrice: 150000
    },
    {
      id: "demo_player_3",
      name: "Jasprit Demo",
      role: "Bowler",
      basePrice: 200000
    },
    {
      id: "demo_player_4",
      name: "Hardik Demo",
      role: "All-Rounder",
      basePrice: 250000
    }
  ];

  for (const p of players) {
    const ref = doc(db, "players", p.id);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(ref, {
        ...p,
        status: "PENDING",
        demo: true
      });
    }
  }

  const teams = [
    ["demo_team_1", "Ahmedabad Warriors"],
    ["demo_team_2", "Mumbai Strikers"],
    ["demo_team_3", "Delhi Challengers"]
  ];

  for (const [id, name] of teams) {
    const ref = doc(db, "teams", id);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(ref, {
        name,
        purse: 5000000,
        spent: 0,
        squad: [],
        demo: true
      });
    }
  }

  const auctionRef = doc(db, "auctions", "demo_auction_1");
  const auctionSnap = await getDoc(auctionRef);

  if (!auctionSnap.exists()) {
    await setDoc(auctionRef, {
      name: "Live Demo Auction",
      playerName: "Hardik Demo",
      playerId: "demo_player_4",
      status: "LIVE",
      currentBid: 250000,
      highestTeamName: "No bid",
      demo: true,
      createdAt: serverTimestamp()
    });
  }
}

// ===============================
// REAL-TIME DATA
// ===============================
function listen() {
  unsubs.forEach((fn) => fn());
  unsubs = [];

  unsubs.push(
    onSnapshot(collection(db, "players"), (snap) => {
      const players = snap.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));

      if ($("pc")) $("pc").textContent = players.length;

      if ($("plist")) {
        $("plist").innerHTML = players.map((p) => `
          <div class="player">
            <b>${p.name || "Player"}</b><br>
            ${p.role || ""}
            <div class="price">${money(p.basePrice)}</div>
            <small>Status: ${p.status || "PENDING"}</small>
          </div>
        `).join("") || "No players yet.";
      }
    }, (e) => console.error("Players error:", e))
  );

  unsubs.push(
    onSnapshot(collection(db, "teams"), (snap) => {
      const teams = snap.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));

      if ($("tc")) $("tc").textContent = teams.length;

      if ($("tlist")) {
        $("tlist").innerHTML = teams.map((t) => `
          <div class="team">
            <b>🏆 ${t.name}</b><br>
            Purse: ${money(t.purse)}<br>
            Spent: ${money(t.spent)}
          </div>
        `).join("") || "No teams yet.";
      }
    }, (e) => console.error("Teams error:", e))
  );

  unsubs.push(
    onSnapshot(collection(db, "auctions"), (snap) => {
      const auctions = snap.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));

      const live = auctions.filter((a) => a.status === "LIVE");

      if ($("bc")) $("bc").textContent = live.length;

      if ($("live")) {
        $("live").innerHTML = live.map((a) => `
          <div class="box">
            <h2>🔴 ${a.name || "Live Auction"}</h2>
            <p>Player: <b>${a.playerName || "Unknown"}</b></p>
            <p>Current bid: <b>${money(a.currentBid)}</b></p>
            <p>Highest team: ${a.highestTeamName || "No bid"}</p>
            <button onclick="bid('${a.id}')">Bid + ₹50,000</button>
          </div>
        `).join("") || "No live auction yet.";
      }

      if ($("hist")) {
        $("hist").innerHTML = auctions
          .filter((a) => a.status === "SOLD")
          .map((a) => `
            <div class="box">
              <b>🏏 ${a.playerName}</b> SOLD to
              <b>🏆 ${a.highestTeamName}</b>
              for <span class="price">${money(a.currentBid)}</span>
            </div>
          `).join("") || "No history yet.";
      }
    }, (e) => console.error("Auctions error:", e))
  );
}

// ===============================
// ADD PLAYER
// ===============================
window.addPlayer = async () => {
  const name = prompt("Player name:");
  if (!name?.trim()) return;

  const role = prompt("Player role:", "Batsman");
  if (!role?.trim()) return;

  const price = Number(prompt("Base price:", "100000"));

  if (!Number.isFinite(price) || price < 0) {
    alert("Valid base price enter karo.");
    return;
  }

  try {
    await addDoc(collection(db, "players"), {
      name: name.trim(),
      role: role.trim(),
      basePrice: price,
      status: "PENDING",
      createdAt: serverTimestamp()
    });
  } catch (e) {
    alert("Player add failed: " + e.message);
  }
};

// ===============================
// ADD TEAM
// ===============================
window.addTeam = async () => {
  const name = prompt("Team name:");
  if (!name?.trim()) return;

  try {
    await addDoc(collection(db, "teams"), {
      name: name.trim(),
      purse: 5000000,
      spent: 0,
      squad: [],
      createdAt: serverTimestamp()
    });
  } catch (e) {
    alert("Team add failed: " + e.message);
  }
};

// ===============================
// START AUCTION
// ===============================
window.startAuction = async () => {
  try {
    const snap = await getDocs(collection(db, "players"));

    const players = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p.status === "PENDING");

    if (!players.length) {
      alert("Koi pending player nahi hai.");
      return;
    }

    const p = players[0];

    await addDoc(collection(db, "auctions"), {
      name: p.name + " Auction",
      playerName: p.name,
      playerId: p.id,
      status: "LIVE",
      currentBid: Number(p.basePrice || 0),
      highestTeamName: "No bid",
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, "players", p.id), {
      status: "LIVE"
    });
  } catch (e) {
    alert("Auction start failed: " + e.message);
  }
};

// ===============================
// PLACE BID
// ===============================
window.bid = async (auctionId) => {
  const teamName = prompt("Team name enter karo:");
  if (!teamName?.trim()) return;

  try {
    const ref = doc(db, "auctions", auctionId);

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);

      if (!snap.exists()) throw new Error("Auction nahi mila.");

      const a = snap.data();

      if (a.status !== "LIVE") {
        throw new Error("Auction live nahi hai.");
      }

      transaction.update(ref, {
        currentBid: Number(a.currentBid || 0) + 50000,
        highestTeamName: teamName.trim(),
        updatedAt: serverTimestamp()
      });
    });
  } catch (e) {
    alert("Bid failed: " + e.message);
  }
};

// ===============================
// CLICK ANIMATION
// ===============================
window.addEventListener("click", (event) => {
  const ripple = document.createElement("div");
  ripple.className = "global-click-ripple";
  ripple.style.left = event.pageX + "px";
  ripple.style.top = event.pageY + "px";
  document.body.appendChild(ripple);

  setTimeout(() => ripple.remove(), 500);
});
