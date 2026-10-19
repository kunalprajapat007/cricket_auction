# 🏏 Smart Cricket Auction

Welcome to **Smart Cricket Auction**, a dynamic web application built to simulate live cricket player auctions. The platform allows users to manage their accounts, register players, build teams, and participate in real-time bidding rooms.

🌐 **Live Demo:** [kunalprajapat007.github.io/cricket_auction/](https://kunalprajapat007.github.io/cricket_auction/)

---

## ✨ Features

### 🔐 Multi-Role Authentication
* **Custom Accounts:** Login or register using your Email and Password.
* **Role Selection:** Quick-start access by choosing a dedicated role:
  * **Player:** Register into the draft pool.
  * **Team Owner:** Manage budgets and bid on players.
  * **Viewer:** Spectate the auction live.
* **Account Settings:** Live updates for changing email credentials securely.

### 🎛️ Auction Control Center (Dashboard)
* **Overview Analytics:** Real-time counters tracking total registered players, active teams, and completed auctions.
* **Player Draft Room:** Interface to register and list new players.
* **Team Management:** Tools to form new teams, assign managers, and look over existing squads.
* **Live Auction Room:** Real-time bidding arena featuring dynamic price updates.
* **Auction History:** Log entries archiving past auction transactions and draft records.

---

## 🛠️ Project Setup & Firebase Requirements

This project is fully powered by **Firebase** (Authentication & Firestore Database). To host or run your own instance locally, ensure the following steps are met:

### 1. Firebase Authentication Configuration
* Navigate to the **Firebase Console** -> **Authentication** -> **Sign-in method**.
* **Enable Email/Password** authentication.
* *(Optional)* Enable **Anonymous Sign-in** if supporting guest role entries.

### 2. Cloud Firestore Initialization
* Create a **Firestore Database** instance within your Firebase Console.
* Set up database rules that permit secure reading and writing based on user authentication state.

### 3. Local Environment Rule
> [!IMPORTANT]  
> **Do not open `index.html` directly via the file explorer.** 
> Firebase authentication hooks and database streaming will fail over the `file://` protocol. You must run this application through a local web server (e.g., VS Code's **Live Server** extension or an Nginx/Apache instance) yielding an `http://localhost` environment.

---

## 🚀 Future Roadmap / Security Note
While the platform features a complete frontend dashboard infrastructure, ensure that critical bidding calculations, balance checks, and countdown timers are validated through **Firebase Cloud Functions** or strict **Firestore Security Rules** prior to deploying for commercial use with real currency.
