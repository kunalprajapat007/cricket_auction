
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
  setDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  runTransaction
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
    // Existing account se login
    await signInWithEmailAndPassword(auth, email, password);
    localStorage.setItem("auctionRole", role);

  } catch (error) {
    console.error("Login error:", error.code, error.message);

    // Agar account nahi mila, toh registration ka option
    if (
      error.code === "auth/invalid-credential" ||
      error.code === "auth/user-not-found"
    ) {
      const register = confirm(
        "Login nahi hua. Email/password check karo.\n\n" +
        "Kya tum is email se naya account banana chahte ho?"
      );

      if (!register) return;

      try {
        await createUserWithEmailAndPassword(auth, email, password);
        localStorage.setItem("auctionRole", role);
        alert("Account successfully create ho gaya!");

      } catch (registerError) {
        console.error("Register error:", registerError.code);

        if (registerError.code === "auth/email-already-in-use") {
          alert("Ye email pehle se registered hai. Sahi password enter karo.");
        } else if (registerError.code === "auth/operation-not-allowed") {
          alert("Firebase Console mein Email/Password enable karo.");
        } else if (registerError.code === "auth/weak-password") {
          alert("Password aur strong rakho.");
        } else {
          alert("Registration failed: " + registerError.message);
        }
      }

    } else if (error.code === "auth/operation-not-allowed") {
      alert("Firebase Console mein Email/Password sign-in enable karo.");
    } else if (error.code === "auth/invalid-email") {
      alert("Valid email address enter karo.");
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
      alert("Dashboard load nahi hua: " + error.message);
    }
  } else {
    unsubs.forEach((unsubscribe) => unsubscribe());
    unsubs = [];

    if ($("login")) $("login").hidden = false;
    if ($("app")) $("app").hidden = true;
  }
});

// ===============================
// PAGE NAVIGATION
// ===============================
window.show = (id) => {
  const tabs = ["dash", "players", "teams", "auction", "history"];

  tabs.forEach((tab) => {
    const element = $(tab);
    if (element) element.hidden = tab !== id;
  });

  document.querySelectorAll("nav button").forEach((button) => {
    button.classList.toggle(
      "active",
      button.getAttribute("onclick") === `show('${id}')`
    );
  });
};

// ===============================
// DEMO DATA
// Existing data ko baar-baar overwrite nahi karega
// ===============================
async function seedDemoData() {
  const players = [
    {
      id: "demo_player_1",
      data: {
        name: "Virat Demo",
        role: "Batsman",
        basePrice: 100000,
        status: "PENDING",
        demo: true
      }
    },
    {
      id: "demo_player_2",
      data: {
        name: "Rohit Demo",
        role: "Batsman",
        basePrice: 150000,
        status: "PENDING",
        demo: true
      }
    },
    {
      id: "demo_player_3",
      data: {
        name: "Jasprit Demo",
        role: "Bowler",
        basePrice: 200000,
        status: "PENDING",
        demo: true
      }
    },
    {
      id: "demo_player_4",
      data: {
        name: "Hardik Demo",
        role: "All-Rounder",
        basePrice: 250000,
        status: "PENDING",
        demo: true
      }
    }
  ];

  for (const player of players) {
    const ref = doc(db, "players", player.id);
    const existing = await getDoc(ref);

    if (!existing.exists()) {
      await setDoc(ref, player.data);
    }
  }

  const teams = [
    { id: "demo_team_1", name: "Ahmedabad Warriors" },
    { id: "demo_team_2", name: "Mumbai Strikers" },
    { id: "demo_team_3", name: "Delhi Challengers" }
  ];

  for (const team of teams) {
    const ref = doc(db, "teams", team.id);
    const existing = await getDoc(ref);

    if (!existing.exists()) {
      await setDoc(ref, {
        name: team.name,
        purse: 5000000,
        spent: 0,
        squad: [],
        demo: true
      });
    }
  }

  const auctionRef = doc(db, "auctions", "demo_auction_1");
  const auction = await getDoc(auctionRef);

  if (!auction.exists()) {
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
// REAL-TIME LISTENERS
// ===============================
function listen() {
  unsubs.forEach((unsubscribe) => unsubscribe());
  unsubs = [];

  unsubs.push(
    onSnapshot(
      collection(db, "players"),
      (snapshot) => {
        const players = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data()
        }));

        if ($("pc")) $("pc").textContent = players.length;

        if ($("plist")) {
          $("plist").innerHTML = players.map((p) => `
            <div class="player">
              <b>${p.name || "Unnamed player"}</b><br>
              ${p.role || ""}
              <div class="price">${money(p.basePrice)}</div>
              <small>Status: ${p.status || "PENDING"}</small>
            </div>
          `).join("") || "No players yet.";
        }
      },
      (error) => console.error("Players error:", error)
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, "teams"),
      (snapshot) => {
        const teams = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data()
        }));

        if ($("tc")) $("tc").textContent = teams.length;

        if ($("tlist")) {
          $("tlist").innerHTML = teams.map((t) => `
            <div class="team">
              <b>🏆 ${t.name || "Unnamed team"}</b><br>
              Purse: ${money(t.purse)}<br>
              Spent: ${money(t.spent)}
            </div>
          `).join("") || "No teams yet.";
        }
      },
      (error) => console.error("Teams error:", error)
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, "auctions"),
      (snapshot) => {
        const auctions = snapshot.docs.map((d) => ({
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
              <button onclick="bid('${a.id}')">
                Bid + ₹50,000
              </button>
            </div>
          `).join("") || "No live auction yet.";
        }

        if ($("hist")) {
          $("hist").innerHTML = auctions
            .filter((a) => a.status === "SOLD")
            .map((a) => `
              <div class="box">
                <b>🏏 ${a.playerName || "Player"}</b>
                SOLD to
                <b>🏆 ${a.highestTeamName || "Unknown team"}</b>
                for
                <span class="price">${money(a.currentBid)}</span>
              </div>
            `).join("") || "No history yet.";
        }
      },
      (error) => console.error("Auction error:", error)
    )
  );
}

// ===============================
// REGISTER PLAYER
// ===============================
window.addPlayer = async () => {
  const name = prompt("Player ka naam enter karo:");
  if (!name || !name.trim()) return;

  const role = prompt(
    "Player role enter karo (Batsman/Bowler/All-Rounder):",
    "Batsman"
  );
  if (!role) return;

  const priceInput = prompt("Base price enter karo:", "100000");
  if (priceInput === null) return;

  const basePrice = Number(priceInput);

  if (!Number.isFinite(basePrice) || basePrice < 0) {
    alert("Valid base price enter karo.");
    return;
  }

  try {
    await addDoc(collection(db, "players"), {
      name: name.trim(),
      role: role.trim(),
      basePrice,
      status: "PENDING",
      createdAt: serverTimestamp()
    });

    alert("Player successfully registered!");
  } catch (error) {
    alert("Player add nahi hua: " + error.message);
  }
};

// ===============================
// CREATE TEAM
// ===============================
window.addTeam = async () => {
  const name = prompt("Team ka naam enter karo:");
  if (!name || !name.trim()) return;

  try {
    await addDoc(collection(db, "teams"), {
      name: name.trim(),
      purse: 5000000,
      spent: 0,
      squad: [],
      createdAt: serverTimestamp()
    });

    alert("Team successfully create ho gayi!");
  } catch (error) {
    alert("Team create nahi hui: " + error.message);
  }
};

// ===============================
// START ANOTHER AUCTION
// ===============================
window.startAuction = async () => {
  try {
    const snapshot = await getDocs(collection(db, "players"));

    const players = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p.status === "PENDING");

    if (players.length === 0) {
      alert("Koi pending player nahi hai. Pehle player register karo.");
      return;
    }

    const player = players[0];

    await addDoc(collection(db, "auctions"), {
      name: player.name + " Auction",
      playerName: player.name,
      playerId: player.id,
      status: "LIVE",
      currentBid: Number(player.basePrice || 0),
      highestTeamName: "No bid",
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, "players", player.id), {
      status: "LIVE"
    });

    alert(player.name + " ka auction start ho gaya!");
  } catch (error) {
    alert("Auction start nahi hua: " + error.message);
  }
};

// ===============================
// PLACE BID
// ===============================
window.bid = async (auctionId) => {
  const teamName = prompt("Bid karne wali team ka exact naam enter karo:");
  if (!teamName || !teamName.trim()) return;

  try {
    const auctionRef = doc(db, "auctions", auctionId);

    await runTransaction(db, async (transaction) => {
      const auctionSnap = await transaction.get(auctionRef);

      if (!auctionSnap.exists()) {
        throw new Error("Auction nahi mila.");
      }

      const auction = auctionSnap.data();

      if (auction.status !== "LIVE") {
        throw new Error("Ye auction ab LIVE nahi hai.");
      }

      transaction.update(auctionRef, {
        currentBid: Number(auction.currentBid || 0) + 50000,
        highestTeamName: teamName.trim(),
        updatedAt: serverTimestamp()
      });
    });

  } catch (error) {
    alert("Bid failed: " + error.message);
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
