const fs = require('fs');
const { execSync } = require('child_process');

console.log('Starting separate builds...\n');

// Build QR version
console.log('=== Building QR version ===');
// Modify index.js for QR
const indexPath = './src/index.js';
const originalIndex = fs.readFileSync(indexPath, 'utf8');
const qrIndex = originalIndex.replace(
  'root.render(isQrMode ? <QrApp /> : <App />);',
  'root.render(<QrApp />);'
);
fs.writeFileSync(indexPath, qrIndex);

// Build
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

// Build
execSync('npm run build', { stdio: 'inherit' });
fs.renameSync('build', 'build-admin');
console.log('✓ Admin build complete\n');

// Restore original
fs.writeFileSync(indexPath, originalIndex);
console.log('✓ Original index.js restored');
console.log('\nBoth builds complete!');
