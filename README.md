# Setup & Execution

## Requirements
- Node.js 18+ and npm
- Access to the Firebase project configured in `src/connections/ConnFirebaseServices.js`

## Installation
```bash
npm install
```

## Running in Admin Mode (default UI)
```bash
npm start
```
Opens the admin console at http://localhost:3000.

## Running the QR Display
```bash (new terminal)
npm run start:qr
```
Launches the QR-only view on port 3001 with `REACT_APP_MODE=qr`.

## Production Build
```bash
npm run build
```
Outputs the minified bundle to `build/` for deployment.
