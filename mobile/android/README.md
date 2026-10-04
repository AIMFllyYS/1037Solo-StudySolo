# StudySolo Android browser launcher

This is a small Java launcher for the production StudySolo website. It hands the canonical HTTPS URL to AndroidX Custom Tabs so sign-in, cookies, web content, and learning data stay in the system browser and existing web application.

The launcher intentionally contains no WebView, JavaScript bridge, OAuth client, token forwarding, or local copy of StudySolo data. The first release uses Custom Tabs directly; it does not claim Trusted Web Activity or Digital Asset Links verification.

## Build

Requirements: JDK 17, Android SDK platform 35, and Gradle 8.13.

```powershell
.\gradlew.bat lint testDebugUnitTest assembleRelease
```

`assembleRelease` produces an unsigned APK. Release signing is a separate protected CI job using Android SDK tools; do not put signing properties, keystores, `.env` files, or provider/account credentials in this project.

The version name and code are derived from the StudySolo root `package.json` version. The application ID is `com.solo1037.studysolo`.

## Verification boundaries

The app launches `https://studysolo.1037solo.com/` in the user's system browser. No native sign-in state or cookies are exchanged. TWA/DAL is future work and must not be described as enabled until a release-signed app and production association have both been verified.
