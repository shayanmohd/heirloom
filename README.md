# Heirloom

One question a week for someone you love, answered out loud and kept in their own voice.

- **Play listing:** https://play.google.com/store/apps/details?id=com.mohdshayan.heirloom
- **Site:** https://shayanmohd.github.io/heirloom/
- **Try it in a browser:** https://shayanmohd.github.io/heirloom/play/
- **Privacy policy:** https://shayanmohd.github.io/heirloom/privacy-policy.html

## How it is built

`web/` is the whole app: plain HTML, CSS and JavaScript, no build step and no dependencies. Recordings go
to IndexedDB on the device; everything else lives in `localStorage`. It never touches the network.

`android/` is a thin Kotlin WebView shell that serves `web/` from an app-private https origin, adds the
microphone permission plumbing, file export and the weekly notification scheduler, and declares no
INTERNET permission.

`docs/` is the GitHub Pages site: landing page, privacy policy and a playable copy.

## Build

```sh
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew bundleRelease
```

Signing reads `android/keystore.properties`, which is not in this repository.
