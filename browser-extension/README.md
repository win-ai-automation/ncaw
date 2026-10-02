# Netfintax Facebook Helper

This unpacked Chrome extension lets the Content page resolve Facebook video media using the Facebook session already present in the browser. It never reads, exports, stores, or sends Facebook cookies.

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the `browser-extension` directory in this repository.
5. Sign in to Facebook in the same Chrome profile.
6. Open the Netfintax Content page and submit a Facebook video URL.

The helper opens the supplied Facebook URL in a background tab, waits for the page's video element, returns its temporary Facebook CDN media URL to the Content page, and closes the tab. If no media URL is available, the existing Apify path remains the fallback.

Only use the helper for content the signed-in account is authorized to access and process.
