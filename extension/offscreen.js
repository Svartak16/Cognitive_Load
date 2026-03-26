// Runs inside offscreen page — has full WASM support
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "PREDICT_URL") return;

  predictURL(msg.url)
    .then(result => sendResponse({ success: true, result }))
    .catch(err  => sendResponse({ success: false, error: err.message }));

  return true; // keep message channel open for async response
});