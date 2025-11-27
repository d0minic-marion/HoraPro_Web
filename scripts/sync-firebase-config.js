const fs = require('fs');
const path = require('path');

console.log('\n==============================================');
console.log('Firebase Configuration Sync Tool');
console.log('==============================================\n');

const configFilePath = path.join(__dirname, '..', 'src', 'connections', 'ConnFirebaseServices.js');
const firebasercPath = path.join(__dirname, '..', '.firebaserc');
const androidConfigPath = path.join(__dirname, '..', 'mobile-implementation', 'android', 'app', 'google-services.json.template');
const iosConfigPath = path.join(__dirname, '..', 'mobile-implementation', 'ios', 'Runner', 'GoogleService-Info.plist.template');

function extractFirebaseConfig() {
  console.log('Step 1: Reading Firebase configuration from ConnFirebaseServices.js...');
  
  if (!fs.existsSync(configFilePath)) {
    console.error('Error: ConnFirebaseServices.js not found!');
    process.exit(1);
  }

  const content = fs.readFileSync(configFilePath, 'utf8');
  
  const configMatch = content.match(/const firebaseConfig\s*=\s*({[\s\S]*?});/);
  
  if (!configMatch) {
    console.error('Error: Could not find firebaseConfig in ConnFirebaseServices.js');
    process.exit(1);
  }

  let configString = configMatch[1];
  
  try {
    const config = eval('(' + configString + ')');
    
    if (!config.apiKey || !config.projectId || !config.storageBucket) {
      console.error('Error: Firebase configuration is incomplete!');
      console.error('Please make sure all fields are filled in ConnFirebaseServices.js:');
      console.error('  - apiKey');
      console.error('  - authDomain');
      console.error('  - projectId');
      console.error('  - storageBucket');
      console.error('  - messagingSenderId');
      console.error('  - appId');
      process.exit(1);
    }

    console.log('Configuration extracted successfully!');
    console.log(`  Project ID: ${config.projectId}`);
    console.log(`  Storage Bucket: ${config.storageBucket}`);
    
    return config;
  } catch (error) {
    console.error('Error: Failed to parse firebaseConfig. Please check the syntax.');
    console.error(error.message);
    process.exit(1);
  }
}

function updateFirebaserc(config) {
  console.log('\nStep 2: Updating .firebaserc...');
  
  const firebasercContent = {
    projects: {
      default: config.projectId
    }
  };

  fs.writeFileSync(firebasercPath, JSON.stringify(firebasercContent, null, 2) + '\n', 'utf8');
  console.log('  .firebaserc updated successfully!');
}

function updateAndroidConfig(config) {
  console.log('\nStep 3: Updating Android google-services.json...');
  
  const androidDir = path.dirname(androidConfigPath);
  if (!fs.existsSync(androidDir)) {
    console.log('  Skipping: mobile-implementation/android directory not found');
    return;
  }

  const androidConfig = {
    project_info: {
      project_number: config.messagingSenderId || "",
      project_id: config.projectId,
      storage_bucket: config.storageBucket
    },
    client: [
      {
        client_info: {
          mobilesdk_app_id: "1:${config.messagingSenderId}:android:REPLACE_WITH_YOUR_ANDROID_APP_ID",
          android_client_info: {
            package_name: "com.horapro.mobile"
          }
        },
        oauth_client: [],
        api_key: [
          {
            current_key: config.apiKey
          }
        ],
        services: {
          appinvite_service: {
            other_platform_oauth_client: []
          }
        }
      }
    ],
    configuration_version: "1"
  };

  fs.writeFileSync(androidConfigPath, JSON.stringify(androidConfig, null, 2) + '\n', 'utf8');
  console.log('  google-services.json updated successfully!');
  console.log('  NOTE: You may need to update mobilesdk_app_id with your actual Android App ID from Firebase Console');
}

function updateiOSConfig(config) {
  console.log('\nStep 4: Updating iOS GoogleService-Info.plist...');
  
  const iosDir = path.dirname(iosConfigPath);
  if (!fs.existsSync(iosDir)) {
    console.log('  Skipping: mobile-implementation/ios directory not found');
    return;
  }

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CLIENT_ID</key>
	<string>REPLACE_WITH_YOUR_IOS_CLIENT_ID.apps.googleusercontent.com</string>
	<key>REVERSED_CLIENT_ID</key>
	<string>com.googleusercontent.apps.REPLACE_WITH_REVERSED_CLIENT_ID</string>
	<key>API_KEY</key>
	<string>${config.apiKey}</string>
	<key>GCM_SENDER_ID</key>
	<string>${config.messagingSenderId || ''}</string>
	<key>PLIST_VERSION</key>
	<string>1</string>
	<key>BUNDLE_ID</key>
	<string>com.horapro.mobile</string>
	<key>PROJECT_ID</key>
	<string>${config.projectId}</string>
	<key>STORAGE_BUCKET</key>
	<string>${config.storageBucket}</string>
	<key>IS_ADS_ENABLED</key>
	<false></false>
	<key>IS_ANALYTICS_ENABLED</key>
	<false></false>
	<key>IS_APPINVITE_ENABLED</key>
	<true></true>
	<key>IS_GCM_ENABLED</key>
	<true></true>
	<key>IS_SIGNIN_ENABLED</key>
	<true></true>
	<key>GOOGLE_APP_ID</key>
	<string>REPLACE_WITH_YOUR_IOS_APP_ID</string>
</dict>
</plist>
`;

  fs.writeFileSync(iosConfigPath, plistContent, 'utf8');
  console.log('  GoogleService-Info.plist updated successfully!');
  console.log('  NOTE: You need to update CLIENT_ID, REVERSED_CLIENT_ID, and GOOGLE_APP_ID from Firebase Console');
}

function createConfigurationMarker() {
  const markerPath = path.join(__dirname, '..', '.firebase-configured');
  const timestamp = new Date().toISOString();
  fs.writeFileSync(markerPath, `Configuration completed at: ${timestamp}\n`, 'utf8');
}

function validateConfiguration(config) {
  console.log('\nStep 5: Validating configuration...');
  
  const warnings = [];
  const errors = [];

  if (config.apiKey.length < 20) {
    errors.push('API Key seems too short');
  }

  if (!config.authDomain.includes('.firebaseapp.com') && !config.authDomain.includes('.web.app')) {
    warnings.push('Auth Domain format might be incorrect (should end with .firebaseapp.com or .web.app)');
  }

  if (!config.storageBucket.includes('.firebasestorage.app') && !config.storageBucket.includes('.appspot.com')) {
    warnings.push('Storage Bucket format might be incorrect');
  }

  if (errors.length > 0) {
    console.log('\n  ERRORS:');
    errors.forEach(err => console.log(`    - ${err}`));
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log('\n  WARNINGS:');
    warnings.forEach(warn => console.log(`    - ${warn}`));
  } else {
    console.log('  Configuration looks good!');
  }
}

function main() {
  try {
    const config = extractFirebaseConfig();
    
    validateConfiguration(config);
    
    updateFirebaserc(config);
    
    updateAndroidConfig(config);
    
    updateiOSConfig(config);
    
    createConfigurationMarker();

    console.log('\n==============================================');
    console.log('Firebase Configuration Sync Completed!');
    console.log('==============================================');
    console.log('\nFiles updated:');
    console.log('  - .firebaserc');
    
    // Check if mobile configs were updated
    const androidDir = path.dirname(androidConfigPath);
    const iosDir = path.dirname(iosConfigPath);
    
    if (fs.existsSync(androidDir)) {
      console.log('  - mobile-implementation/android/app/google-services.json.template');
    }
    if (fs.existsSync(iosDir)) {
      console.log('  - mobile-implementation/ios/Runner/GoogleService-Info.plist.template');
    }
    
    if (fs.existsSync(androidDir) || fs.existsSync(iosDir)) {
      console.log('\nNext steps for mobile apps:');
      if (fs.existsSync(androidDir)) {
        console.log('  1. For Android: Rename google-services.json.template to google-services.json');
        console.log('  2. Update mobilesdk_app_id with your Android App ID from Firebase Console');
      }
      if (fs.existsSync(iosDir)) {
        console.log('  3. For iOS: Rename GoogleService-Info.plist.template to GoogleService-Info.plist');
        console.log('  4. Update CLIENT_ID, REVERSED_CLIENT_ID, and GOOGLE_APP_ID from Firebase Console');
      }
      console.log('  5. See mobile-implementation/README.md for complete setup instructions');
    }
    
    console.log('\nYour web app is ready to use!\n');

  } catch (error) {
    console.error('\nFatal Error:', error.message);
    process.exit(1);
  }
}

main();
