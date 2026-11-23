import fs from 'fs';
import path from 'path';

const mode = process.argv[2] || 'post';

if (mode === 'pre') {
  const capConfig = {
    appId: 'com.sag.racetime',
    appName: 'SAG Race Time',
    webDir: 'dist',
    server: {
      androidScheme: 'https',
    },
  };
  fs.writeFileSync('capacitor.config.json', JSON.stringify(capConfig, null, 2) + '\n', 'utf8');
  process.exit(0);
}

// Post-cap-add configuration
const sdkDir = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
if (sdkDir) {
  fs.writeFileSync('android/local.properties', `sdk.dir=${sdkDir}\n`, 'utf8');
}

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
if (fs.existsSync(manifestPath)) {
  let xml = fs.readFileSync(manifestPath, 'utf8');
  const perms = [
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
    '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
    '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
    '<uses-permission android:name="android.permission.WAKE_LOCK" />',
    '<uses-feature android:name="android.hardware.location.gps" android:required="false" />',
  ];
  for (const p of perms) {
    if (!xml.includes(p)) {
      xml = xml.replace('<application', `${p}\n    <application`);
    }
  }
  fs.writeFileSync(manifestPath, xml, 'utf8');
}

const mainActivityPath = 'android/app/src/main/java/com/sag/racetime/MainActivity.java';
if (fs.existsSync(mainActivityPath)) {
  const activityCode = [
    'package com.sag.racetime;',
    '',
    'import android.Manifest;',
    'import android.content.pm.PackageManager;',
    'import android.os.Bundle;',
    'import android.view.WindowManager;',
    'import androidx.core.app.ActivityCompat;',
    'import androidx.core.content.ContextCompat;',
    'import com.getcapacitor.BridgeActivity;',
    '',
    'public class MainActivity extends BridgeActivity {',
    '  @Override',
    '  public void onCreate(Bundle savedInstanceState) {',
    '    super.onCreate(savedInstanceState);',
    '    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);',
    '    if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {',
    '      ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, 1001);',
    '    }',
    '  }',
    '}',
    '',
  ].join('\n');
  fs.writeFileSync(mainActivityPath, activityCode, 'utf8');
}

const gradlePath = 'android/app/build.gradle';
if (fs.existsSync(gradlePath)) {
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  const vCode = process.env.APP_VERSION_CODE || '1';
  const vName = process.env.APP_VERSION_NAME || '1.0.0';
  gradle = gradle
    .replace(/versionCode\s+\d+/, `versionCode ${vCode}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${vName}"`);
  fs.writeFileSync(gradlePath, gradle, 'utf8');
}

const resDir = 'android/app/src/main/res';
const adaptiveDir = path.join(resDir, 'mipmap-anydpi-v26');
if (fs.existsSync(adaptiveDir)) {
  fs.rmSync(adaptiveDir, { recursive: true, force: true });
}

const densities = ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'];
for (const dir of densities) {
  const outDir = path.join(resDir, dir);
  fs.mkdirSync(outDir, { recursive: true });
  const srcIcon = dir === 'mipmap-xxxhdpi' ? 'public/pwa-512x512.png' : 'public/pwa-192x192.png';
  if (fs.existsSync(srcIcon)) {
    fs.copyFileSync(srcIcon, path.join(outDir, 'ic_launcher.png'));
    fs.copyFileSync(srcIcon, path.join(outDir, 'ic_launcher_round.png'));
  }
}

console.log('Android Capacitor project configured cleanly.');
