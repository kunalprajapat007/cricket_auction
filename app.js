import {initializeApp} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {getAuth,onAuthStateChanged,signInAnonymously,signOut} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {getFirestore,collection,addDoc,onSnapshot,doc,updateDoc,serverTimestamp,getDoc,setDoc,runTransaction} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {firebaseConfig} from "./firebase-config.js";
const fb=initializeApp(firebaseConfig),auth=getAuth(fb),db=getFirestore(fb);let unsubs=[];
const $=x=>document.getElementById(x), money=n=>"₹"+Number(n||0).toLocaleString("en-IN");
window.login = async (event) => {
  if (event) event.preventDefault();
  try {
    await signInAnonymously(auth);
  } catch(e) {
    alert("Firebase setup required: " + e.message);
  }
};

window.logout = () => signOut(auth);

onAuthStateChanged(auth,async u=>{if(u){$("login").hidden=true;$("app").hidden=false;await saveUserProfile(u);await seedDemoData();listen()}else{$("login").hidden=false;$("app").hidden=true}});
async function saveUserProfile(u){const role=$("role")?.value||"viewer";await setDoc(doc(db,"users",u.uid),{uid:u.uid,role,displayName:role==="teamOwner"?"Demo Team Owner":role==="player"?"Demo Player":"Demo Viewer",updatedAt:serverTimestamp()},{merge:true})}
async function seedDemoData(){
  const marker=doc(db,"settings","demoSeed");
  const seeded=await runTransaction(db,async tx=>{const s=await tx.get(marker);if(s.exists())return false;tx.set(marker,{seeded:true,createdAt:serverTimestamp()});return true});
  if(!seeded)return;
  const players=[
    {name:"Rahul Sharma",role:"Batsman",basePrice:100000,status:"AVAILABLE"},
    {name:"Arjun Patel",role:"All-Rounder",basePrice:150000,status:"AVAILABLE"},
    {name:"Vivek Singh",role:"Bowler",basePrice:120000,status:"PENDING"},
    {name:"Rohan Mehta",role:"Wicket Keeper",basePrice:100000,status:"PENDING"}
  ];
  for(const p of players)await addDoc(collection(db,"players"),{...p,createdAt:serverTimestamp()});
  const teams=[
    {name:"Mumbai Strikers",purse:5000000,spent:0,squad:[]},
    {name:"Ahmedabad Kings",purse:5000000,spent:0,squad:[]},
    {name:"Jaipur Royals",purse:5000000,spent:0,squad:[]}
  ];
  for(const t of teams)await addDoc(collection(db,"teams"),{...t,createdAt:serverTimestamp()});
  await addDoc(collection(db,"auctions"),{name:"Live Demo Auction",playerName:"Rahul Sharma",status:"LIVE",currentBid:250000,highestTeamName:"Mumbai Strikers",createdAt:serverTimestamp()});
}
window.show=id=>["dash","players","teams","auction","history"].forEach(x=>$(x).hidden=x!==id);
function listen(){unsubs.forEach(x=>x());unsubs=[];
unsubs.push(onSnapshot(collection(db,"players"),s=>{let a=s.docs.map(d=>({id:d.id,...d.data()}));$("pc").textContent=a.length;$("plist").innerHTML=a.map(p=>`<div class="player"><b>${p.name}</b><br>${p.role||""}<div class="price">Base Price: ${money(p.basePrice)}</div><small>Status: ${p.status||"PENDING"}</small></div>`).join("")||"No players yet"}));
unsubs.push(onSnapshot(collection(db,"teams"),s=>{let a=s.docs.map(d=>({id:d.id,...d.data()}));$("tc").textContent=a.length;$("tlist").innerHTML=a.map(t=>`<div class="team"><b>🏆 ${t.name}</b><br>Purse: ${money(t.purse)}<br>Spent: ${money(t.spent)}</div>`).join("")||"No teams yet"}));
unsubs.push(onSnapshot(collection(db,"auctions"),s=>{let a=s.docs.map(d=>({id:d.id,...d.data()}));let live=a.filter(x=>x.status==="LIVE");$("bc").textContent=live.length;$("live").innerHTML=live.map(a=>`<h2>🔴 ${a.name}</h2><p>Player: <b>${a.playerName}</b></p><p>Current bid: <b>${money(a.currentBid)}</b></p><p>Highest team: ${a.highestTeamName||"No bid"}</p><button onclick="bid('${a.id}')">Bid + ₹50,000</button><button onclick="sellAuction('${a.id}')">Mark SOLD</button>`).join("")||"No live auction yet.";$("hist").innerHTML=a.filter(x=>x.status==="SOLD").map(x=>`<div class="card">${x.playerName} → ${x.highestTeamName} → ${money(x.currentBid)}</div>`).join("")||"No completed sales"}));}
window.addPlayer=async()=>{let n=prompt("Player name"),r=prompt("Role: Batsman/Bowler/All-Rounder/Wicket Keeper"),p=+prompt("Base price","100000");if(n)await addDoc(collection(db,"players"),{name:n,role:r||"Batsman",basePrice:p||100000,status:"PENDING",createdAt:serverTimestamp()})};
window.addTeam=async()=>{let n=prompt("Team name"),p=+prompt("Virtual purse","5000000");if(n)await addDoc(collection(db,"teams"),{name:n,purse:p||5000000,spent:0,squad:[],createdAt:serverTimestamp()})};
window.startAuction=async()=>{let p=prompt("Player name for this auction");if(p)await addDoc(collection(db,"auctions"),{name:"Cricket Player Auction",playerName:p,status:"LIVE",currentBid:100000,highestTeamName:"No bid",createdAt:serverTimestamp()})};
window.bid=async id=>{const ref=doc(db,"auctions",id);await runTransaction(db,async tx=>{const s=await tx.get(ref);if(!s.exists())return;const d=s.data();tx.update(ref,{currentBid:Number(d.currentBid||0)+50000,highestTeamName:"Demo Team",updatedAt:serverTimestamp()})})};
window.sellAuction=async id=>updateDoc(doc(db,"auctions",id),{status:"SOLD",updatedAt:serverTimestamp()});
