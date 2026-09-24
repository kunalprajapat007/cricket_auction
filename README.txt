SMART CRICKET AUCTION - DEMO VERSION

This version automatically creates demo data in Firestore the first time it is opened:
- 4 dummy players
- 3 dummy teams
- 1 live demo auction
- viewer/team owner/player roles via anonymous Firebase login

Firebase requirements:
1. Authentication -> Sign-in method -> Anonymous -> Enabled
2. Firestore Database created
3. Run the website through an HTTP server / Live Server, not by opening index.html directly.

Important: This is a college demonstration starter. The bid and role logic is not production-secure and should not be used for real-money auctions.
