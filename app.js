import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://gstatic.com";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, setDoc, serverTimestamp } from "https://gstatic.com";
import { firebaseConfig } from "./firebase-config.js";

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);

let unsubs = [];

const \$ = (id) => document.getElementById(id);

const money = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN");

// ===============================
// LOGIN / REGISTER
// ===============================
window.login = async (event) => {
  if (event) event.preventDefault();
  
  const email = \$("email")?.value.trim();
  const password = \$("pass")?.value;
  const role = \$("role")?.value || "viewer";

  if (!email || !password) {
    alert("Please enter email and password.");
    return;
  }

  if (password.length < 6) {
    alert("Password must contain at least 6 characters.");
    return;
  }

  try {
    // Existing user login
    await signInWithEmailAndPassword(auth, email, password);
    localStorage.setItem("auctionRole", role);
  } catch (e) {
    // New user registration
    if (e.code === "auth/invalid-credential" || e.code === "auth/user-not-found" || e.code === "auth/wrong-password") {
      try {
        await createUserWithEmailAndPassword(auth, email, password);
        localStorage.setItem("auctionRole", role);
        alert("Account created successfully!");
      } catch (err) {
        alert("Registration failed: " + err.message);
      }
    } else {
      alert("Login failed: " + e.message);
    }
  }
};

// ===============================
// LOGOUT
// ===============================
window.logout = () => {
  signOut(auth);
};

// ===============================
// AUTH STATE
// ===============================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    \$("login").hidden = true;
    \$("app").hidden = false;

    // Create demo data
    await seedDemoData();

    // Start realtime listeners
    listen();
  } else {
    \$("login").hidden = false;
    \$("app").hidden = true;
  }
});

// ===============================
// PAGE NAVIGATION
// ===============================
window.show = (id) => {
  ["dash", "players", "teams", "auction", "history"].forEach((x) => {
    if (\((x)) {\)(x).hidden = x !== id;
    }
  });
};

// ===============================
// DEMO DATA
// ===============================
async function seedDemoData() {
  try {
    // PLAYERS
    await setDoc(doc(db, "players", "demo_player_1"), { name: "Virat Demo", role: "Batsman", basePrice: 100000, status: "PENDING", demo: true }, { merge: true });
    await setDoc(doc(db, "players", "demo_player_2"), { name: "Rohit Demo", role: "Batsman", basePrice: 150000, status: "PENDING", demo: true }, { merge: true });
    await setDoc(doc(db, "players", "demo_player_3"), { name: "Jasprit Demo", role: "Bowler", basePrice: 200000, status: "PENDING", demo: true }, { merge: true });
    await setDoc(doc(db, "players", "demo_player_4"), { name: "Hardik Demo", role: "All-Rounder", basePrice: 250000, status: "PENDING", demo: true }, { merge: true });

    // TEAMS
    await setDoc(doc(db, "teams", "demo_team_1"), { name: "Ahmedabad Warriors", purse: 5000000, spent: 0, squad: [], demo: true }, { merge: true });
    await setDoc(doc(db, "teams", "demo_team_2"), { name: "Mumbai Strikers", purse: 5000000, spent: 0, squad: [], demo: true }, { merge: true });
    await setDoc(doc(db, "teams", "demo_team_3"), { name: "Delhi Challengers", purse: 5000000, spent: 0, squad: [], demo: true }, { merge: true });

    // LIVE AUCTION
    await setDoc(doc(db, "auctions", "demo_auction_1"), { name: "Live Demo Auction", playerName: "Hardik Demo", status: "LIVE", currentBid: 250000, highestTeamName: "No bid", demo: true }, { merge: true });
  } catch (e) {
    console.error("Demo data error:", e);
  }
}

// ===============================
// REAL-TIME DATA
// ===============================
function listen() {
  unsubs.forEach((fn) => fn());
  unsubs = [];

  // PLAYERS
  unsubs.push(
    onSnapshot(collection(db, "players"), (s) => {
      const players = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (("pc")) ("pc").textContent = players.length;
      if (\$("plist")) {
        \$("plist").innerHTML = players.map((p) => `
          <div class="player">
            <b>${p.name}</b><br>
            ${p.role || ""}
            <div class="price">${money(p.basePrice)}</div>
            <small>Status: ${p.status || "PENDING"}</small>
          </div>
        `).join("") || "No players yet";
      }
    }, (e) => { console.error("Players error:", e); })
  );

  // TEAMS
  unsubs.push(
    onSnapshot(collection(db, "teams"), (s) => {
      const teams = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (("tc")) ("tc").textContent = teams.length;
      if (\$("tlist")) {
        \$("tlist").innerHTML = teams.map((t) => `
          <div class="team">
            <b>🏆 ${t.name}</b><br>
            Purse: ${money(t.purse)}<br>
            Spent: ${money(t.spent)}
          </div>
        `).join("") || "No teams yet";
      }
    }, (e) => { console.error("Teams error:", e); })
  );

  // AUCTION
  unsubs.push(
    onSnapshot(collection(db, "auctions"), (s) => {
      const auctions = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      const live = auctions.filter((x) => x.status === "LIVE");
      if (("bc")) ("bc").textContent = live.length;
      if (\$("live")) {
        \$("live").innerHTML = live.map((a) => `
          <h2>🔴 ${a.name}</h2>
          <p>Player: <b>${a.playerName}</b></p>
          <p>Current bid: <b>${money(a.currentBid)}</b></p>
          <p>Highest team: ${a.highestTeamName || "No bid"}</p>
          <button onclick="bid('${a.id}')">Bid + ₹50,000</button>
        `).join("") || "No live auction yet.";
      }

      // HISTORY
      if (\$("hist")) {
        \$("hist").innerHTML = auctions
          .filter((x) => x.status === "SOLD")
          .map((h) => `<div class="box"><b>🏏 ${h.playerName}</b> SOLD to <b>🏆 ${h.highestTeamName}</b> for <span class="price">${money(h.currentBid)}</span></div>`).join("") || "No history yet";
      }
    }, (e) => { console.error("Auction error:", e); })
  );
}

// ===================================================
// GLOBAL CLICK MICRO-ANIMATION EFFECT ENGINE
// ===================================================
window.addEventListener('click', function (event) {
  const rippleEffect = document.createElement('div');
  rippleEffect.className = 'global-click-ripple';
  
  rippleEffect.style.left = `${event.pageX}px`;
  rippleEffect.style.top = `${event.pageY}px`;
  
  document.body.appendChild(rippleEffect);
  
  setTimeout(() => {
    rippleEffect.remove();
  }, 500);
});
