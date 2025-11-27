#!/usr/bin/env node

/**
 * HoraPro Automated Deployment Script
 * 
 * This script automates the deployment process to Firebase Hosting.
 * It handles build validation, deployment options, and post-deploy verification.
 * 
 * Usage: npm run deploy-app
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
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
  console.log('\n' + '='.repeat(70));
  print(message, 'bright');
  console.log('='.repeat(70) + '\n');
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
    try {
      execSync(`where ${command}`, { stdio: 'pipe', windowsHide: true });
      return true;
    } catch {
      return false;
    }
  }
}

// Validate Firebase CLI
function validateFirebaseCLI() {
  const result = execCommand('firebase --version', { silent: true });
  if (result.success && result.output) {
    printSuccess(`Firebase CLI ${result.output.trim()} (installed)`);
    return true;
  }
  
  printError('Firebase CLI not found. Please install: npm install -g firebase-tools');
  return false;
}

// Check Firebase authentication
function checkFirebaseAuth() {
  printInfo('Checking Firebase authentication...');
  const result = execCommand('firebase projects:list', { silent: true });
  
  if (result.success) {
    printSuccess('Authenticated with Firebase CLI');
    return true;
  }
  
  printError('Not authenticated with Firebase CLI');
  return false;
}

// Get current Firebase project
function getCurrentProject() {
  try {
    const firebaserc = path.join(process.cwd(), '.firebaserc');
    if (!fs.existsSync(firebaserc)) {
      printWarning('.firebaserc not found');
      return null;
    }
    
    const config = JSON.parse(fs.readFileSync(firebaserc, 'utf8'));
    const projectId = config.projects?.default;
    
    if (projectId) {
      printSuccess(`Current project: ${projectId}`);
      return projectId;
    }
    
    printWarning('No default project configured');
    return null;
  } catch (error) {
    printError(`Error reading project config: ${error.message}`);
    return null;
  }
}

// Validate Firebase configuration
function validateFirebaseConfig() {
  const filePath = path.join(process.cwd(), 'src', 'connections', 'ConnFirebaseServices.js');
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check if config exists and has required fields
    if (content.includes('apiKey:') && content.includes('projectId:')) {
      printSuccess('Firebase configuration found in ConnFirebaseServices.js');
      return true;
    }
    
    printError('Firebase configuration incomplete or missing');
    return false;
  } catch (error) {
    printError(`Cannot read Firebase configuration: ${error.message}`);
    return false;
  }
}

// Build the React application
function buildApplication() {
  printInfo('Building React application for production...');
  printWarning('This may take a few minutes...');
  
  const startTime = Date.now();
  const result = execCommand('npm run build');
  
  if (!result.success) {
    printError('Build failed');
    return false;
  }
  
  const buildTime = ((Date.now() - startTime) / 1000).toFixed(2);
  printSuccess(`Build completed in ${buildTime}s`);
  
  return true;
}

// Verify build output
function verifyBuildOutput() {
  const buildDir = path.join(process.cwd(), 'build');
  
  if (!fs.existsSync(buildDir)) {
    printError('Build directory not found');
    return false;
  }
  
  try {
    const files = getAllFiles(buildDir);
    const totalSize = files.reduce((sum, file) => {
      const stats = fs.statSync(file);
      return sum + stats.size;
    }, 0);
    
    const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    
    printSuccess(`Build verification:`);
    printInfo(`  Files: ${files.length}`);
    printInfo(`  Total size: ${sizeMB} MB`);
    
    if (totalSize > 10 * 1024 * 1024) {
      printWarning(`  Bundle is large (${sizeMB} MB). Consider code splitting.`);
    }
    
    return true;
  } catch (error) {
    printError(`Build verification failed: ${error.message}`);
    return false;
  }
}

// Helper: Get all files recursively
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  });
  
  return arrayOfFiles;
}

// Deploy to Firebase Hosting
function deployToHosting(target = 'production') {
  const isPreview = target !== 'production';
  
  if (isPreview) {
    const channelName = `preview-${Date.now()}`;
    printInfo(`Deploying to preview channel: ${channelName}`);
    printWarning('Preview deployments expire after 7 days');
    
    const result = execCommand(`firebase hosting:channel:deploy ${channelName}`);
    return result.success;
  } else {
    printInfo('Deploying to production...');
    const result = execCommand('firebase deploy --only hosting');
    return result.success;
  }
}

// Deploy everything (hosting + functions + rules)
function deployEverything() {
  printInfo('Deploying hosting, Cloud Functions, and Firestore rules...');
  printWarning('This may take several minutes...');
  
  const result = execCommand('firebase deploy');
  return result.success;
}

// Deploy hosting and functions
function deployHostingAndFunctions() {
  printInfo('Deploying hosting and Cloud Functions...');
  printWarning('This may take several minutes...');
  
  const result = execCommand('firebase deploy --only hosting,functions');
  return result.success;
}

// Deploy hosting and rules
function deployHostingAndRules() {
  printInfo('Deploying hosting and Firestore rules...');
  
  const result = execCommand('firebase deploy --only hosting,firestore:rules');
  return result.success;
}

// Get deployment URL
function getDeploymentURL(projectId) {
  return `https://${projectId}.web.app`;
}

// Verify deployment (simple HTTP check)
async function verifyDeployment(url) {
  printInfo('Verifying deployment...');
  
  try {
    // Use curl or similar to check if site is accessible
    const result = execCommand(`curl -I ${url}`, { silent: true });
    
    if (result.success && result.output.includes('200')) {
      printSuccess('Deployment is live and accessible');
      return true;
    }
    
    printWarning('Could not verify deployment automatically. Please check manually.');
    return true; // Don't fail the deployment
  } catch {
    printWarning('Verification skipped. Please check the URL manually.');
    return true;
  }
}

// Main deployment flow
async function main() {
  printHeader('HoraPro - Firebase Hosting Deployment');
  
  // Step 1: Pre-deployment validation
  printHeader('Step 1: Pre-deployment Validation');
  
  if (!validateFirebaseCLI()) {
    printError('Deployment aborted: Firebase CLI not found');
    rl.close();
    process.exit(1);
  }
  
  if (!checkFirebaseAuth()) {
    printError('Deployment aborted: Not authenticated with Firebase');
    printInfo('Run: firebase login');
    rl.close();
    process.exit(1);
  }
  
  const projectId = getCurrentProject();
  if (!projectId) {
    printError('Deployment aborted: No Firebase project configured');
    printInfo('Run: firebase use --add');
    rl.close();
    process.exit(1);
  }
  
  if (!validateFirebaseConfig()) {
    printError('Deployment aborted: Firebase configuration invalid');
    rl.close();
    process.exit(1);
  }
  
  // Step 2: Build application
  printHeader('Step 2: Build Application');
  
  const confirmBuild = await question('Build the application for production? (y/n): ');
  if (confirmBuild.toLowerCase() !== 'y') {
    printWarning('Build skipped. Using existing build/ directory.');
    printInfo('Note: Make sure you have run "npm run build" recently.');
  } else {
    if (!buildApplication()) {
      printError('Deployment aborted: Build failed');
      rl.close();
      process.exit(1);
    }
    
    if (!verifyBuildOutput()) {
      const continueAnyway = await question('Build verification failed. Continue? (y/n): ');
      if (continueAnyway.toLowerCase() !== 'y') {
        printError('Deployment aborted by user');
        rl.close();
        process.exit(1);
      }
    }
  }
  
  // Step 3: Deployment options
  printHeader('Step 3: Deployment Options');
  
  print('\nWhat would you like to deploy?', 'cyan');
  print('  1. Hosting only (web app)', 'white');
  print('  2. Hosting + Cloud Functions', 'white');
  print('  3. Hosting + Firestore Rules', 'white');
  print('  4. Everything (Hosting + Functions + Rules)', 'white');
  
  let deployOption = '';
  while (!['1', '2', '3', '4'].includes(deployOption)) {
    deployOption = await question('\nYour choice (1-4): ');
  }
  
  // Step 4: Deployment target
  printHeader('Step 4: Deployment Target');
  
  print('\nWhere would you like to deploy?', 'cyan');
  print('  1. Production (live site)', 'white');
  print('  2. Preview channel (test before live)', 'white');
  
  let targetOption = '';
  while (!['1', '2'].includes(targetOption)) {
    targetOption = await question('\nYour choice (1-2): ');
  }
  
  const isProduction = targetOption === '1';
  
  // Confirmation for production
  if (isProduction) {
    printWarning('\n⚠️  PRODUCTION DEPLOYMENT');
    printWarning('This will update the live site accessible to users.');
    
    const confirmProd = await question('\nAre you sure you want to deploy to PRODUCTION? (yes/no): ');
    if (confirmProd.toLowerCase() !== 'yes') {
      printError('Deployment cancelled by user');
      rl.close();
      process.exit(0);
    }
  }
  
  // Step 5: Execute deployment
  printHeader('Step 5: Deploying to Firebase');
  
  let deploySuccess = false;
  
  if (deployOption === '1') {
    deploySuccess = deployToHosting(isProduction ? 'production' : 'preview');
  } else if (deployOption === '2') {
    if (isProduction) {
      deploySuccess = deployHostingAndFunctions();
    } else {
      printWarning('Preview channels only support hosting. Deploying hosting only.');
      deploySuccess = deployToHosting('preview');
    }
  } else if (deployOption === '3') {
    if (isProduction) {
      deploySuccess = deployHostingAndRules();
    } else {
      printWarning('Preview channels only support hosting. Deploying hosting only.');
      deploySuccess = deployToHosting('preview');
    }
  } else if (deployOption === '4') {
    if (isProduction) {
      deploySuccess = deployEverything();
    } else {
      printWarning('Preview channels only support hosting. Deploying hosting only.');
      deploySuccess = deployToHosting('preview');
    }
  }
  
  if (!deploySuccess) {
    printError('Deployment failed');
    rl.close();
    process.exit(1);
  }
  
  // Step 6: Post-deployment
  printHeader('Step 6: Deployment Complete');
  
  printSuccess('✓ Deployment successful!');
  
  const deploymentURL = getDeploymentURL(projectId);
  print('\n' + '─'.repeat(70), 'cyan');
  print(`  🌐 Your app is live at:`, 'bright');
  print(`     ${deploymentURL}`, 'green');
  print('─'.repeat(70) + '\n', 'cyan');
  
  if (!isProduction) {
    printInfo('This is a preview deployment that expires in 7 days.');
    printInfo('To promote to production: firebase hosting:channel:deploy live');
  }
  
  printInfo('\nUseful commands:');
  print('  View hosting status:  firebase hosting:sites:list', 'cyan');
  print('  View all channels:    firebase hosting:channel:list', 'cyan');
  print('  Delete a channel:     firebase hosting:channel:delete <channel>', 'cyan');
  print('  View logs:            firebase hosting:log', 'cyan');
  
  await verifyDeployment(deploymentURL);
  
  printHeader('🎉 Deployment Process Complete!');
  
  rl.close();
}

// Handle errors and cleanup
process.on('SIGINT', () => {
  print('\n\nDeployment interrupted by user', 'yellow');
  rl.close();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  printError(`\nUnexpected error: ${error.message}`);
  rl.close();
  process.exit(1);
});

// Run the deployment script
main().catch((error) => {
  printError(`Deployment failed: ${error.message}`);
  rl.close();
  process.exit(1);
});
