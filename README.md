# HoraPro - Complete Installation & Deployment Guide

Complete guide for installing, configuring and deploying the HoraPro application with Firebase services (Authentication, Firestore, Cloud Functions, FCM Notifications, and Hosting).

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Firebase Configuration](#firebase-configuration)
4. [Cloud Functions Deployment](#cloud-functions-deployment)
5. [Admin User Creation](#admin-user-creation)
6. [System Settings Initialization](#system-settings-initialization)
7. [Multi-Site Hosting Deployment](#multi-site-hosting-deployment)
8. [Mobile App Configuration](#mobile-app-configuration)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software
- **Node.js**: 18.x or higher (tested with 22.18.0)
- **npm**: 10.x or higher
- **Firebase CLI**: 13.x or higher
- **Git**: For version control
- **PowerShell**: For Windows users

### Firebase Account
- Google account with Firebase access
- Firebase project created (or will be created during setup)

### Verify Installations
```powershell
node --version    # Should show v18.x or higher
npm --version     # Should show 10.x or higher
firebase --version # Should show 13.x or higher
```

---

## Initial Setup

### 1. Clone/Download Project
```powershell
cd "C:\Your\Desired\Path"
# Extract or clone the project
cd HoraPro_Web_20-11-2025_21H-00_Sistema_Notificacion_Messaging
```

### 2. Install Dependencies

**Root project dependencies:**
```powershell
npm install
```

**Cloud Functions dependencies:**
```powershell
cd functions
npm install
cd ..
```

**Expected packages:**
- React 19.x
- Firebase SDK 12.x
- react-router-dom
- dayjs
- qrcode
- react-qr-code

---

## Firebase Configuration

### 1. Login to Firebase
```powershell
firebase login
```
- Opens browser for Google authentication
- Select your Firebase account
- Grant necessary permissions

### 2. List Available Projects
```powershell
firebase projects:list
```

### 3. Select/Create Project

**Option A: Use existing project**
```powershell
firebase use your-project-id
```

**Option B: Create new project**
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Add project"
3. Follow the wizard
4. Enable Blaze (pay-as-you-go) plan for Cloud Functions
5. Then select it:
```powershell
firebase use your-new-project-id
```

### 4. Configure Firebase in Code

The project already has Firebase configuration in `src/connections/ConnFirebaseServices.js`. Update with your project details:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};
```

**Get these values from:**
Firebase Console → Project Settings → General → Your apps → Web app config

### 5. Enable Required Firebase Services

In Firebase Console, enable:
- **Authentication** → Sign-in method → Email/Password
- **Firestore Database** → Create database → Start in production mode
- **Cloud Functions** → Enable APIs if prompted
- **Cloud Messaging** → No additional setup needed
- **Hosting** → Will be configured via CLI

---

## Cloud Functions Deployment

### 1. Deploy Firestore Rules
```powershell
firebase deploy --only firestore:rules
```

**Rules include:**
- Public read access to `qrTokens` collection
- Admin-only write access to most collections
- User-specific access to `users/{userId}` documents
- SystemSettings read access for authenticated users

### 2. Enable App Engine (First-time only)

If you see an error about missing App Engine service account:
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project
3. Navigate to App Engine
4. Click "Create Application"
5. Choose your region
6. Wait for setup to complete (2-3 minutes)

### 3. Deploy Cloud Functions
```powershell
firebase deploy --only functions
```

**Functions deployed (6 total):**
- `sendScheduleNotification` - Send individual schedule notifications
- `sendGeneralNotification` - Broadcast to all users with FCM tokens
- `sendPrivateNotification` - Send to specific user
- `scheduleNotifications` - Scheduled function for automatic notifications
- `getSchedulesByUserId` - Fetch user schedules
- `updateScheduleForUser` - Update user schedule data

**Runtime:** Node.js 20

### 4. Verify Deployment
```powershell
firebase functions:list
```
Should show 6 functions with status "ACTIVE"

---

## Admin User Creation

### 1. Create Admin Script

Create `create-admin.js` in project root:

```javascript
const admin = require('firebase-admin');

// Initialize without credentials for local script
const serviceAccount = require('./path-to-service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();
const db = admin.firestore();

async function createAdmin() {
  const email = 'admin@yourdomain.com';
  const password = 'SecurePassword123!';
  
  try {
    // Create user in Authentication
    const userRecord = await auth.createUser({
      email: email,
      password: password,
      emailVerified: true,
    });

    console.log('✓ User created:', userRecord.uid);

    // Set custom claims for admin role
    await auth.setCustomUserClaims(userRecord.uid, { role: 'admin' });
    console.log('✓ Admin role assigned');

    // Create user document in Firestore
    await db.collection('users').doc(userRecord.uid).set({
      email: email,
      role: 'admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      name: 'Administrator',
      isActive: true
    });

    console.log('✓ Firestore document created');
    console.log('\nAdmin Credentials:');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('UID:', userRecord.uid);

  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit(0);
}

createAdmin();
```

### 2. Get Service Account Key

1. Firebase Console → Project Settings → Service Accounts
2. Click "Generate new private key"
3. Save as `service-account-key.json` in project root
4. **IMPORTANT:** Add to `.gitignore` to never commit this file

### 3. Run Admin Creation
```powershell
node create-admin.js
```

Save the credentials shown in output.

---

## System Settings Initialization

### 1. Create Overtime Settings Script

Create `init-overtime.js`:

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function initOvertimeSettings() {
  try {
    await db.collection('SystemSettings').doc('OvertimeRules').set({
      thresholdHours: 40,
      overtimePercent: 50,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✓ Overtime settings initialized');
    console.log('  - Threshold: 40 hours/week');
    console.log('  - Overtime rate: +50%');
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit(0);
}

initOvertimeSettings();
```

### 2. Run Initialization
```powershell
node init-overtime.js
```

---

## Multi-Site Hosting Deployment

### 1. Create Additional Site (QR Display)

In Firebase Console:
1. Go to Hosting
2. Click "Add another site"
3. Enter site ID: `your-project-id-qr`
4. Click Create

### 2. Configure Firebase Targets

Create/update `.firebaserc`:
```json
{
  "projects": {
    "default": "your-project-id"
  },
  "targets": {
    "your-project-id": {
      "hosting": {
        "admin": [
          "your-project-id"
        ],
        "qr": [
          "your-project-id-qr"
        ]
      }
    }
  }
}
```

### 3. Update firebase.json

```json
{
  "hosting": [
    {
      "target": "admin",
      "public": "build-admin",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [
        {
          "source": "**",
          "destination": "/index.html"
        }
      ],
      "headers": [
        {
          "source": "**/*.@(js|css)",
          "headers": [
            {
              "key": "Cache-Control",
              "value": "public, max-age=31536000, immutable"
            }
          ]
        },
        {
          "source": "/index.html",
          "headers": [
            {
              "key": "Cache-Control",
              "value": "no-cache, no-store, must-revalidate"
            }
          ]
        }
      ]
    },
    {
      "target": "qr",
      "public": "build-qr",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [
        {
          "source": "**",
          "destination": "/index.html"
        }
      ],
      "headers": [
        {
          "source": "**/*.@(js|css)",
          "headers": [
            {
              "key": "Cache-Control",
              "value": "public, max-age=31536000, immutable"
            }
          ]
        },
        {
          "source": "/index.html",
          "headers": [
            {
              "key": "Cache-Control",
              "value": "no-cache, no-store, must-revalidate"
            }
          ]
        }
      ]
    }
  ],
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": ["node_modules", ".git", "firebase-debug.log"],
      "runtime": "nodejs20"
    }
  ],
  "firestore": {
    "rules": "firestore.rules"
  }
}
```

### 4. Create Build Script

Create `build-separate.js`:

```javascript
const fs = require('fs');
const { execSync } = require('child_process');

console.log('Starting separate builds...\n');

// Build QR version
console.log('=== Building QR version ===');
const indexPath = './src/index.js';
const originalIndex = fs.readFileSync(indexPath, 'utf8');
const qrIndex = originalIndex.replace(
  'root.render(isQrMode ? <QrApp /> : <App />);',
  'root.render(<QrApp />);'
);
fs.writeFileSync(indexPath, qrIndex);

execSync('npm run build', { stdio: 'inherit' });
fs.renameSync('build', 'build-qr');
console.log('✓ QR build complete\n');

// Build Admin version
console.log('=== Building Admin version ===');
const adminIndex = originalIndex.replace(
  'root.render(isQrMode ? <QrApp /> : <App />);',
  'root.render(<App />);'
);
fs.writeFileSync(indexPath, adminIndex);

execSync('npm run build', { stdio: 'inherit' });
fs.renameSync('build', 'build-admin');
console.log('✓ Admin build complete\n');

// Restore original
fs.writeFileSync(indexPath, originalIndex);
console.log('✓ Original index.js restored');
console.log('\nBoth builds complete!');
```

### 5. Build Both Versions
```powershell
node build-separate.js
```

### 6. Deploy to Hosting
```powershell
# Deploy both sites
firebase deploy --only hosting

# Or deploy individually
firebase deploy --only hosting:admin
firebase deploy --only hosting:qr
```

### 7. Access Your Sites

**Admin App:**
- URL: `https://your-project-id.web.app`
- Features: Full admin dashboard, user management, schedules, notifications

**QR Display:**
- URL: `https://your-project-id-qr.web.app`
- Features: QR code display only, 60-second rotation, requires admin login

---

## Mobile App Configuration

### 1. Flutter App Setup

Navigate to mobile implementation:
```powershell
cd mobile-implementation
```

### 2. Configure Firebase for Android

1. Firebase Console → Project Settings → Add app → Android
2. Android package name: `com.yourdomain.horapro`
3. Download `google-services.json`
4. Place in `android/app/google-services.json`

### 3. Configure Firebase for iOS

1. Firebase Console → Project Settings → Add app → iOS
2. iOS bundle ID: `com.yourdomain.horapro`
3. Download `GoogleService-Info.plist`
4. Place in `ios/Runner/GoogleService-Info.plist`

### 4. Update Dependencies
```powershell
flutter pub get
```

### 5. Build and Run
```powershell
# For Android
flutter run -d android

# For iOS
flutter run -d ios
```

---

## Testing

### 1. Test Admin Login
1. Open `https://your-project-id.web.app`
2. Login with admin credentials
3. Verify access to all pages

### 2. Test QR Display
1. Open `https://your-project-id-qr.web.app`
2. Login with same admin credentials
3. Verify QR code displays and rotates every 60 seconds

### 3. Test User Creation
1. Navigate to "Create User" page
2. Add test user with email/password
3. Verify user appears in Firebase Authentication

### 4. Test Schedules
1. Create schedule for test user
2. Verify schedule appears in user's view
3. Check overtime calculations

### 5. Test Notifications

**General Notification:**
1. Click "Send Notification" in admin
2. Enter title and message
3. Click "Send to All Users"
4. Verify notification sent (check function logs)

**Private Notification:**
1. Select specific user
2. Enter notification details
3. Send and verify delivery

### 6. Test Cloud Functions

Check function logs:
```powershell
firebase functions:log
```

Or in Firebase Console → Functions → Logs

---

## Troubleshooting

### Common Issues

#### "Error loading overtime settings"
**Solution:** Run `init-overtime.js` to create SystemSettings/OvertimeRules document

#### "Missing App Engine service account"
**Solution:** Create App Engine application in Google Cloud Console

#### "Permission denied" in Firestore
**Solution:** Verify Firestore rules are deployed and admin has correct custom claims

#### Both sites show same content
**Solution:** 
1. Clear browser cache (Ctrl+Shift+R)
2. Verify builds in `build-admin/` and `build-qr/` are different
3. Check bundle sizes - they should differ
4. Re-run `node build-separate.js` and redeploy

#### QR code not rotating
**Solution:**
1. Check Firestore rules allow write to `qrTokens` collection
2. Verify browser console for errors
3. Check `qrTokens` collection has documents

#### Notifications not sending
**Solution:**
1. Verify users have `fcmToken` in Firestore
2. Check Cloud Messaging is enabled
3. Review function logs for errors
4. Ensure mobile app has notification permissions

#### Build fails with memory error
**Solution:**
```powershell
$env:NODE_OPTIONS="--max-old-space-size=4096"
npm run build
```

### Debug Commands

```powershell
# Check Firebase login status
firebase login:list

# View current project
firebase use

# List all functions
firebase functions:list

# View function logs
firebase functions:log --only functionName

# View hosting releases
firebase hosting:channel:list

# Check Firestore indexes
firebase firestore:indexes
```

### Performance Optimization

1. **Enable Firestore indexes** for frequently queried fields
2. **Use caching** for static assets (already configured)
3. **Monitor function execution time** and optimize if needed
4. **Set appropriate Firebase rules** to minimize reads/writes

---

## Maintenance

### Regular Updates

```powershell
# Update dependencies
npm update
cd functions && npm update && cd ..

# Update Firebase CLI
npm install -g firebase-tools

# Check for security vulnerabilities
npm audit
npm audit fix
```

### Backup

1. **Firestore:** Use scheduled exports or manual exports via Console
2. **Authentication:** Export user list via Firebase Console
3. **Code:** Commit regularly to Git repository

### Monitoring

1. Firebase Console → Usage and billing
2. Monitor function invocations
3. Check Firestore reads/writes
4. Review hosting bandwidth

---

## Security Best Practices

1. **Never commit:**
   - `service-account-key.json`
   - `.env` files with secrets
   - Firebase config with real API keys (use environment variables)

2. **Use Firestore rules** to restrict data access

3. **Enable MFA** for admin accounts

4. **Regularly update dependencies** for security patches

5. **Monitor Firebase Console** for suspicious activity

6. **Use HTTPS only** (enforced by Firebase Hosting)

---

## Support & Resources

- **Firebase Documentation:** https://firebase.google.com/docs
- **React Documentation:** https://react.dev
- **Flutter Documentation:** https://flutter.dev
- **Firebase Console:** https://console.firebase.google.com

---

## Project Structure

```
HoraPro/
├── src/                          # React application source
│   ├── components/               # Reusable components
│   ├── connections/              # Firebase configuration
│   ├── hooks/                    # Custom React hooks
│   ├── pages/                    # Page components
│   └── utils/                    # Utility functions
├── functions/                    # Cloud Functions
│   ├── index.js                  # Function definitions
│   └── package.json              # Function dependencies
├── mobile-implementation/        # Flutter mobile app
├── public/                       # Static assets
├── build-admin/                  # Admin build output
├── build-qr/                     # QR build output
├── firebase.json                 # Firebase configuration
├── firestore.rules              # Firestore security rules
├── .firebaserc                  # Firebase project settings
├── build-separate.js            # Build script for both sites
├── create-admin.js              # Admin user creation script
├── init-overtime.js             # System settings initialization
└── package.json                 # Project dependencies
```

---

## License

[Your License Here]

## Version

Last updated: November 26, 2025

