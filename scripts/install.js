#!/usr/bin/env node

/**
 * HoraPro Automated Installation Script
 * 
 * This script automates the complete installation process for HoraPro application.
 * It handles dependency installation, Firebase configuration, deployment, and startup.
 * 
 * Usage: npm run install-app
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const readline = require('readline');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisified question function
function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

// Print formatted messages
function print(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function printHeader(message) {
  console.log('\n' + '='.repeat(60));
  print(message, 'bright');
  console.log('='.repeat(60) + '\n');
}

function printSuccess(message) {
  print(`✓ ${message}`, 'green');
}

function printError(message) {
  print(`✗ ${message}`, 'red');
}

function printWarning(message) {
  print(`⚠ ${message}`, 'yellow');
}

function printInfo(message) {
  print(`ℹ ${message}`, 'cyan');
}

// Execute command with error handling
function execCommand(command, options = {}) {
  try {
    // Enhance PATH with npm global prefix for Windows
    let env = options.env || process.env;
    if (process.platform === 'win32' && !options.pathEnhanced) {
      try {
        const npmPrefix = execSync('npm config get prefix', { encoding: 'utf8', stdio: 'pipe' }).trim();
        env = { ...env, PATH: `${npmPrefix};${env.PATH}` };
      } catch {}
    }
    
    const result = execSync(command, {
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : 'inherit',
      windowsHide: true,
      ...options,
      env
    });
    return { success: true, output: result };
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      output: error.stdout || error.stderr || ''
    };
  }
}

// Check if command exists
function commandExists(command) {
  try {
    execSync(`${command} --version`, { stdio: 'pipe', windowsHide: true });
    return true;
  } catch {
    // Try alternative check for Windows
    try {
      execSync(`where ${command}`, { stdio: 'pipe', windowsHide: true });
      return true;
    } catch {
      return false;
    }
  }
}

// Validate Node.js version
function validateNodeVersion() {
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  
  if (majorVersion < 18) {
    printError(`Node.js ${majorVersion}.x detected. Requires Node.js 18 or higher.`);
    return false;
  }
  
  printSuccess(`Node.js ${nodeVersion} (compatible)`);
  return true;
}

// Validate npm
function validateNpm() {
  if (!commandExists('npm')) {
    printError('npm not found. Please install Node.js with npm.');
    return false;
  }
  
  const result = execCommand('npm --version', { silent: true });
  if (result.success) {
    printSuccess(`npm ${result.output.trim()} (installed)`);
    return true;
  }
  
  return false;
}

// Validate Firebase CLI
function validateFirebaseCLI() {
  const result = execCommand('firebase --version', { silent: true });
  if (result.success && result.output) {
    printSuccess(`Firebase CLI ${result.output.trim()} (installed)`);
    return true;
  }
  
  printWarning('Firebase CLI not found.');
  return false;
}

// Install Firebase CLI
async function installFirebaseCLI() {
  printInfo('Installing Firebase CLI globally...');
  const result = execCommand('npm install -g firebase-tools');
  
  if (result.success) {
    printSuccess('Firebase CLI installed successfully');
    return true;
  } else {
    printError('Failed to install Firebase CLI');
    printInfo('Try running: npm install -g firebase-tools');
    return false;
  }
}

// Validate Firebase configuration format
function validateFirebaseConfig(configStr) {
  try {
    // Remove const firebaseConfig = if present
    const cleanStr = configStr.replace(/const\s+firebaseConfig\s*=\s*/, '').trim();
    // Remove trailing semicolon if present
    const jsonStr = cleanStr.replace(/;$/, '');
    
    const config = JSON.parse(jsonStr);
    
    const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    const missingFields = requiredFields.filter(field => !config[field] || config[field].trim() === '');
    
    if (missingFields.length > 0) {
      printError(`Missing required fields: ${missingFields.join(', ')}`);
      return null;
    }
    
    return config;
  } catch (error) {
    printError('Invalid JSON format');
    return null;
  }
}

// Update ConnFirebaseServices.js with configuration
function updateFirebaseConfig(config) {
  const filePath = path.join(process.cwd(), 'src', 'connections', 'ConnFirebaseServices.js');
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Build the config string with proper formatting
    const configLines = [
      'const firebaseConfig = {',
      `  apiKey: "${config.apiKey}",`,
      `  authDomain: "${config.authDomain}",`,
      `  projectId: "${config.projectId}",`,
      `  storageBucket: "${config.storageBucket}",`,
      `  messagingSenderId: "${config.messagingSenderId}",`,
      `  appId: "${config.appId}"`
    ];
    
    // Add optional fields if present
    if (config.databaseURL) {
      configLines.splice(3, 0, `  databaseURL: "${config.databaseURL}",`);
    }
    if (config.measurementId) {
      configLines.push(`,\n  measurementId: "${config.measurementId}"`);
    }
    
    configLines.push('};');
    
    const newConfig = configLines.join('\n');
    
    // Replace the firebaseConfig block
    const configRegex = /const firebaseConfig = \{[\s\S]*?\};/;
    content = content.replace(configRegex, newConfig);
    
    fs.writeFileSync(filePath, content, 'utf8');
    printSuccess('Firebase configuration updated in ConnFirebaseServices.js');
    return true;
  } catch (error) {
    printError(`Failed to update Firebase configuration: ${error.message}`);
    return false;
  }
}

// Install dependencies
function installDependencies() {
  printInfo('Installing project dependencies...');
  const result = execCommand('npm install');
  
  if (!result.success) {
    printError('Failed to install project dependencies');
    return false;
  }
  
  printSuccess('Project dependencies installed');
  return true;
}

// Install functions dependencies
function installFunctionsDependencies() {
  printInfo('Installing Cloud Functions dependencies...');
  const result = execCommand('npm install', { cwd: path.join(process.cwd(), 'functions') });
  
  if (!result.success) {
    printError('Failed to install Cloud Functions dependencies');
    return false;
  }
  
  printSuccess('Cloud Functions dependencies installed');
  return true;
}

// Sync Firebase configuration
function syncFirebaseConfig() {
  printInfo('Synchronizing Firebase configuration across all files...');
  const result = execCommand('npm run sync-firebase-config');
  
  if (!result.success) {
    printError('Failed to sync Firebase configuration');
    return false;
  }
  
  printSuccess('Firebase configuration synchronized');
  return true;
}

// Check Firebase authentication
function checkFirebaseAuth() {
  const result = execCommand('firebase projects:list', { silent: true });
  return result.success;
}

// Firebase login
function firebaseLogin() {
  printInfo('Authenticating with Firebase...');
  printWarning('A browser window will open for authentication.');
  
  const result = execCommand('firebase login');
  
  if (!result.success) {
    printError('Firebase authentication failed');
    return false;
  }
  
  printSuccess('Firebase authentication successful');
  return true;
}

// Deploy Firestore rules
function deployFirestoreRules() {
  printInfo('Deploying Firestore security rules...');
  const result = execCommand('firebase deploy --only firestore:rules');
  
  if (!result.success) {
    printError('Failed to deploy Firestore rules');
    printWarning('You may need to enable Firestore in Firebase Console');
    return false;
  }
  
  printSuccess('Firestore rules deployed successfully');
  return true;
}

// Deploy Cloud Functions
function deployCloudFunctions() {
  printInfo('Deploying Cloud Functions...');
  printWarning('This may take several minutes...');
  
  const result = execCommand('firebase deploy --only functions');
  
  if (!result.success) {
    printError('Failed to deploy Cloud Functions');
    return false;
  }
  
  printSuccess('Cloud Functions deployed successfully');
  return true;
}

// Create admin user via Cloud Function
async function createAdminUser(email, password, displayName = 'Administrator') {
  try {
    // Import Firebase SDK for calling Cloud Function
    const { initializeApp } = require('firebase/app');
    const { getFunctions, httpsCallable } = require('firebase/functions');
    
    // Read Firebase config from ConnFirebaseServices.js
    const connFilePath = path.join(process.cwd(), 'src', 'connections', 'ConnFirebaseServices.js');
    const connContent = fs.readFileSync(connFilePath, 'utf8');
    
    // Extract config object
    const configMatch = connContent.match(/const firebaseConfig = \{[\s\S]*?\};/);
    if (!configMatch) {
      throw new Error('Could not extract Firebase config');
    }
    
    // Parse the config
    const configStr = configMatch[0]
      .replace('const firebaseConfig = ', '')
      .replace(/;$/, '');
    
    // Use eval in controlled environment (we trust our own file)
    const firebaseConfig = eval(`(${configStr})`);
    
    // Initialize Firebase app for installer
    const app = initializeApp(firebaseConfig, 'installer-app');
    const functions = getFunctions(app);
    
    // Call the Cloud Function
    printInfo('Creating admin user account...');
    const createAdmin = httpsCallable(functions, 'createAdminUser');
    
    const result = await createAdmin({
      email,
      password,
      displayName
    });
    
    if (result.data.success) {
      printSuccess(`Admin user created successfully!`);
      printSuccess(`  UID: ${result.data.uid}`);
      printSuccess(`  Email: ${result.data.email}`);
      return true;
    } else {
      printError('Failed to create admin user');
      return false;
    }
    
  } catch (error) {
    printError(`Error creating admin user: ${error.message}`);
    
    // Provide helpful error messages
    if (error.code === 'functions/already-exists') {
      printWarning('An account with this email already exists');
    } else if (error.code === 'functions/invalid-argument') {
      printWarning(error.message);
    } else {
      printWarning('Make sure Cloud Functions are deployed correctly');
    }
    
    return false;
  }
}

// Validate email format
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Start the application
async function startApplication() {
  printInfo('Starting HoraPro application...');
  printInfo('Admin interface will be available at: http://localhost:3000');
  printInfo('QR Display will be available at: http://localhost:3001');
  printWarning('\nPress Ctrl+C to stop the server.\n');
  
  // Start the server without opening browser
  const env = { ...process.env, BROWSER: 'none' };
  const server = spawn('npm', ['start'], { 
    stdio: 'inherit',
    shell: true,
    env
  });
  
  server.on('error', (error) => {
    printError(`Failed to start application: ${error.message}`);
  });
}

// Main installation flow
async function main() {
  printHeader('HoraPro Automated Installation');
  
  // Step 1: Validate requirements
  printHeader('Step 1: Validating System Requirements');
  
  if (!validateNodeVersion()) {
    printError('Installation aborted: Node.js version requirement not met');
    process.exit(1);
  }
  
  if (!validateNpm()) {
    printError('Installation aborted: npm not found');
    process.exit(1);
  }
  
  const hasFirebaseCLI = validateFirebaseCLI();
  
  if (!hasFirebaseCLI) {
    const answer = await question('\nInstall Firebase CLI? (y/n): ');
    if (answer.toLowerCase() === 'y') {
      if (!await installFirebaseCLI()) {
        printError('Installation aborted: Firebase CLI installation failed');
        rl.close();
        process.exit(1);
      }
    } else {
      printError('Installation aborted: Firebase CLI is required');
      rl.close();
      process.exit(1);
    }
  }
  
  // Step 2: Get Firebase configuration
  printHeader('Step 2: Firebase Configuration');
  printInfo('Please paste your Firebase configuration object.');
  printInfo('You can find it in Firebase Console > Project Settings > Your Apps > SDK setup');
  printInfo('Example format:');
  print('{\n  "apiKey": "your-api-key",\n  "authDomain": "your-project.firebaseapp.com",\n  ...\n}', 'yellow');
  
  let config = null;
  let configInput = '';
  
  while (!config) {
    configInput = await question('\nPaste Firebase config (as JSON object): ');
    config = validateFirebaseConfig(configInput);
    
    if (!config) {
      const retry = await question('Invalid configuration. Try again? (y/n): ');
      if (retry.toLowerCase() !== 'y') {
        printError('Installation aborted by user');
        rl.close();
        process.exit(1);
      }
    }
  }
  
  printSuccess(`Configuration validated for project: ${config.projectId}`);
  
  if (!updateFirebaseConfig(config)) {
    const retry = await question('Failed to update configuration. Retry? (y/n): ');
    if (retry.toLowerCase() === 'y' && !updateFirebaseConfig(config)) {
      printError('Installation aborted: Cannot update configuration');
      rl.close();
      process.exit(1);
    }
  }
  
  // Step 3: Install dependencies
  printHeader('Step 3: Installing Dependencies');
  
  if (!installDependencies()) {
    const retry = await question('Failed to install dependencies. Retry? (y/n): ');
    if (retry.toLowerCase() === 'y' && !installDependencies()) {
      printError('Installation aborted: Cannot install dependencies');
      rl.close();
      process.exit(1);
    }
  }
  
  if (!installFunctionsDependencies()) {
    const retry = await question('Failed to install Cloud Functions dependencies. Retry? (y/n): ');
    if (retry.toLowerCase() === 'y' && !installFunctionsDependencies()) {
      printError('Installation aborted: Cannot install Cloud Functions dependencies');
      rl.close();
      process.exit(1);
    }
  }
  
  // Step 4: Sync configuration
  printHeader('Step 4: Synchronizing Configuration');
  
  if (!syncFirebaseConfig()) {
    printWarning('Configuration sync failed, but you can continue manually');
  }
  
  // Step 5: Firebase authentication
  printHeader('Step 5: Firebase Authentication');
  
  if (!checkFirebaseAuth()) {
    printInfo('Not authenticated with Firebase CLI');
    if (!firebaseLogin()) {
      printError('Installation aborted: Firebase authentication failed');
      rl.close();
      process.exit(1);
    }
  } else {
    printSuccess('Already authenticated with Firebase CLI');
  }
  
  // Step 6: Deploy Firestore rules
  printHeader('Step 6: Deploying Firestore Rules');
  
  const deployRules = await question('Deploy Firestore security rules? (y/n): ');
  if (deployRules.toLowerCase() === 'y') {
    if (!deployFirestoreRules()) {
      const continueAnyway = await question('Deployment failed. Continue anyway? (y/n): ');
      if (continueAnyway.toLowerCase() !== 'y') {
        printError('Installation aborted by user');
        rl.close();
        process.exit(1);
      }
    }
  }
  
  // Step 7: Deploy Cloud Functions
  printHeader('Step 7: Deploying Cloud Functions');
  
  const deployFunctions = await question('Deploy Cloud Functions? (y/n): ');
  if (deployFunctions.toLowerCase() === 'y') {
    if (!deployCloudFunctions()) {
      const continueAnyway = await question('Deployment failed. Continue anyway? (y/n): ');
      if (continueAnyway.toLowerCase() !== 'y') {
        printError('Installation aborted by user');
        rl.close();
        process.exit(1);
      }
    }
  }
  
  // Step 7.5: Create admin user
  printHeader('Step 7.5: Create Administrator Account');
  
  const createAdmin = await question('Create administrator account now? (y/n): ');
  if (createAdmin.toLowerCase() === 'y') {
    let adminCreated = false;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (!adminCreated && attempts < maxAttempts) {
      attempts++;
      
      printInfo(`\nAdministrator Account Setup (Attempt ${attempts}/${maxAttempts})`);
      
      // Get admin email
      let adminEmail = '';
      while (!adminEmail || !isValidEmail(adminEmail)) {
        adminEmail = await question('Admin email: ');
        if (!isValidEmail(adminEmail)) {
          printError('Invalid email format. Please try again.');
        }
      }
      
      // Get admin password
      let adminPassword = '';
      while (adminPassword.length < 6) {
        adminPassword = await question('Admin password (min 6 characters): ');
        if (adminPassword.length < 6) {
          printError('Password must be at least 6 characters. Please try again.');
        }
      }
      
      // Get admin display name (optional)
      const adminName = await question('Admin display name (press Enter for "Administrator"): ');
      const displayName = adminName.trim() || 'Administrator';
      
      // Create admin user
      adminCreated = await createAdminUser(adminEmail, adminPassword, displayName);
      
      if (!adminCreated && attempts < maxAttempts) {
        const retry = await question(`\nRetry creating admin account? (y/n): `);
        if (retry.toLowerCase() !== 'y') {
          break;
        }
      }
    }
    
    if (!adminCreated) {
      printWarning('Admin user not created. You can create one later.');
      printInfo('To create admin manually, use the Firebase Console or call the createAdminUser Cloud Function.');
    } else {
      printSuccess('\n✓ Administrator account ready!');
      printInfo('You can now login with these credentials after starting the application.');
    }
  } else {
    printWarning('Skipping admin account creation.');
    printInfo('Note: You will need to create an admin user to access the application.');
  }
  
  // Step 8: Start application
  printHeader('Step 8: Starting Application');
  
  const startNow = await question('Start the application now? (y/n): ');
  rl.close();
  
  if (startNow.toLowerCase() === 'y') {
    await startApplication();
  } else {
    printHeader('Installation Complete!');
    printSuccess('HoraPro has been installed successfully.');
    printInfo('\nTo start the application:');
    print('  npm start          # Admin interface (http://localhost:3000)', 'cyan');
    print('  npm run start:qr   # QR Display (http://localhost:3001)', 'cyan');
    console.log('');
  }
}

// Handle errors and cleanup
process.on('SIGINT', () => {
  print('\n\nInstallation interrupted by user', 'yellow');
  rl.close();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  printError(`\nUnexpected error: ${error.message}`);
  rl.close();
  process.exit(1);
});

// Run the installer
main().catch((error) => {
  printError(`Installation failed: ${error.message}`);
  rl.close();
  process.exit(1);
});
