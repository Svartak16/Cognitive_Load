/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  phishing.js — Complete detection engine                    ║
 * ║  Ported 1:1 from phishing_final.py (Python → JS)           ║
 * ║  Includes: constants, feature extraction, rule scorer,      ║
 * ║            ONNX model prediction, hybrid blending           ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * USAGE in background.js:
 *   importScripts("ort.min.js", "phishing.js");
 *   const result = await predictURL("https://example.com");
 */

// ─────────────────────────────────────────────────────────────────
// SECTION 1 — CONSTANTS  (mirrors Section 1 of main.py exactly)
// ─────────────────────────────────────────────────────────────────

const TRUSTED_DOMAINS = new Set([
  "google.com", "gmail.com", "google.co.in", "google.co.uk",
  "github.com", "microsoft.com", "apple.com", "icloud.com",
  "amazon.com", "amazon.in", "facebook.com", "instagram.com",
  "twitter.com", "x.com", "linkedin.com", "youtube.com",
  "netflix.com", "paypal.com", "wikipedia.org", "stackoverflow.com",
  "reddit.com", "dropbox.com", "yahoo.com", "ebay.com",
  "whatsapp.com", "telegram.org", "zoom.us", "slack.com",
  "notion.so", "figma.com", "discord.com", "flipkart.com",
  "paytm.com", "razorpay.com", "chase.com", "wellsfargo.com",
  "bankofamerica.com", "citibank.com", "hdfc.com", "sbi.co.in",
]);

const KNOWN_BRANDS = [
  "paypal", "amazon", "google", "facebook", "apple", "microsoft",
  "netflix", "instagram", "twitter", "whatsapp", "linkedin", "youtube",
  "dropbox", "github", "yahoo", "ebay", "chase", "wellsfargo",
  "bankofamerica", "citibank", "hdfc", "icici", "sbi", "flipkart",
  "paytm", "razorpay", "steam", "coinbase", "binance", "metamask",
  "dhl", "fedex", "usps", "blockchain",
];

const SUSPICIOUS_TLDS = new Set([
  ".xyz", ".top", ".click", ".gq", ".ml", ".cf", ".tk", ".pw",
  ".cc", ".su", ".biz", ".info", ".club", ".online", ".site",
  ".website", ".space", ".live", ".stream", ".download", ".win",
  ".loan", ".men", ".work", ".party", ".date", ".faith", ".racing",
]);

const URL_SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly",
  "short.link", "cutt.ly", "rb.gy", "is.gd", "tiny.cc",
]);

const LOGIN_TERMS = [
  "login", "signin", "sign-in", "log-in", "account",
  "username", "password", "credential", "auth", "verify",
  "secure", "update", "confirm", "banking", "wallet",
];

// Lookalike char map — mirrors Python LOOKALIKE str.maketrans
const LOOKALIKE_MAP = {
  "0": "o", "1": "l", "3": "e", "4": "a",
  "5": "s", "6": "g", "7": "t", "@": "a", "!": "i",
};

// FEATURE_COLUMNS — must match EXACT order from main.py Section 3
// Any change here will break the ONNX model input
const FEATURE_COLUMNS = [
  "is_https", "domain_length", "url_length", "path_length", "subdomain_count",
  "suspicious_tld", "brand_similarity", "confusion_score", "has_numbers_in_domain",
  "has_login_terms", "has_secure_terms", "has_ip_address", "has_at_symbol",
  "is_url_shortener", "double_slash_in_path", "hex_chars_count", "dot_count",
  "hyphen_count", "path_depth", "has_port", "query_length", "special_chars_count",
  "digit_ratio", "sus_tld_brand", "no_https_login", "long_suspicious",
  "multi_subdomain_brand", "tld_length", "subdomain_length", "url_entropy",
];

// ─────────────────────────────────────────────────────────────────
// SECTION 2 — FEATURE HELPERS  (mirrors Section 2 of main.py)
// ─────────────────────────────────────────────────────────────────

/** mirrors _clean() */
function _clean(domain) {
  return domain.toLowerCase().replace("www.", "").trim();
}

/** mirrors _normalize() — replaces lookalike chars */
function _normalize(text) {
  return text.toLowerCase().split("").map(c => LOOKALIKE_MAP[c] || c).join("");
}

/**
 * Simple sequence similarity ratio — mirrors difflib.SequenceMatcher
 * Not identical but close enough for brand detection
 */
function _similarityRatio(a, b) {
  if (a === b) return 1.0;
  const longer  = Math.max(a.length, b.length);
  if (longer === 0) return 1.0;
  let matches = 0;
  const bChars = b.split("");
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) matches++;
  }
  // also count common chars regardless of position
  const aSet = new Set(a.split(""));
  const common = bChars.filter(c => aSet.has(c)).length;
  return (matches * 0.6 + common * 0.4) / longer;
}

/** mirrors _brand_sim() */
function _brandSim(domain) {
  const cd = _clean(domain);
  if (TRUSTED_DOMAINS.has(cd)) return false;

  const clean = _normalize(cd.replace(/[^a-z0-9]/g, ""));
  const normCd = _normalize(cd);

  for (const brand of KNOWN_BRANDS) {
    const ratio = _similarityRatio(clean, brand);
    if (ratio > 0.75 && ratio < 1.0) return true;
    if (normCd.includes(brand) && cd.length > brand.length + 3) return true;
  }
  return false;
}

/** mirrors _confusion() */
function _confusion(domain) {
  const cd = _clean(domain);
  if (TRUSTED_DOMAINS.has(cd)) return 0.0;

  let score   = 0.0;
  const digits  = (cd.match(/\d/g)  || []).length;
  const hyphens = (cd.match(/-/g)   || []).length;

  if (digits  >= 2) score += Math.min(digits,  4) * 0.8;
  if (hyphens >= 2) score += Math.min(hyphens, 3) * 1.0;
  if (cd.length > 30) score += 2.0;

  const normCd = _normalize(cd);
  for (const brand of KNOWN_BRANDS) {
    if (normCd.includes(brand) && cd.length > brand.length + 2) {
      score += 2.5;
      break;
    }
  }
  return Math.min(parseFloat(score.toFixed(2)), 10.0);
}

// ─────────────────────────────────────────────────────────────────
// SECTION 3 — URL FEATURE EXTRACTOR  (mirrors Section 3 of main.py)
// ─────────────────────────────────────────────────────────────────

/** mirrors _zero_features() */
function _zeroFeatures() {
  const f = {};
  for (const col of FEATURE_COLUMNS) f[col] = 0;
  return f;
}

/**
 * extract_url_features() — ported 1:1 from main.py
 * Returns a dict with 30 features in FEATURE_COLUMNS order.
 * No page fetch — pure URL string analysis.
 */
function extractURLFeatures(url) {
  try {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    const parsed   = new URL(url);
    const hostname = parsed.hostname || "";
    const path     = parsed.pathname || "";
    const query    = parsed.search   || "";
    const domain   = hostname.replace("www.", "");
    const parts    = domain.split(".");
    const tld      = parts.length > 1 ? "." + parts[parts.length - 1] : "";
    const subdomainCount = Math.max(0, parts.length - 2);

    // Core features
    const isHttps    = url.startsWith("https://") ? 1 : 0;
    const domLen     = domain.length;
    const urlLen     = url.length;
    const pathLen    = path.length;
    const hasNums    = /\d/.test(domain) ? 1 : 0;
    const susTld     = SUSPICIOUS_TLDS.has(tld.toLowerCase()) ? 1 : 0;
    const brandS     = _brandSim(domain) ? 1 : 0;
    const conf       = _confusion(domain);
    const urlLow     = url.toLowerCase();
    const hasLogin   = LOGIN_TERMS.some(k => urlLow.includes(k)) ? 1 : 0;
    const hasSecure  = LOGIN_TERMS.some(k => urlLow.includes(k)) ? 1 : 0;  // same as hasLogin (mirrors Python)
    const isShortener = URL_SHORTENERS.has(domain) ? 1 : 0;

    // Strong individual signals
    const hasIp       = /^\d{1,3}(\.\d{1,3}){3}$/.test(domain) ? 1 : 0;
    const hasAt       = url.includes("@") ? 1 : 0;
    const doubleSlash = path.includes("//") ? 1 : 0;
    const hexChars    = Math.min((url.match(/%[0-9a-fA-F]{2}/g) || []).length, 20);
    const dotCount    = (domain.match(/\./g) || []).length;
    const hyphenCount = (domain.match(/-/g)  || []).length;
    const pathDepth   = Math.min((path.match(/\//g) || []).length, 10);
    const hasPort     = parsed.port ? 1 : 0;
    const queryLen    = Math.min(query.length, 200);
    const specialChars = Math.min((url.match(/[!$&'()*+,;=]/g) || []).length, 20);
    const digitRatio  = parseFloat(
      (domain.split("").filter(c => /\d/.test(c)).length / Math.max(domain.length, 1)).toFixed(3)
    );

    // Compound signals — mirrors main.py exactly
    const susTldBrand         = (susTld && brandS) ? 1 : 0;
    const noHttpsLogin        = (!isHttps && hasLogin) ? 1 : 0;
    const longSuspicious      = (urlLen > 100 && susTld) ? 1 : 0;
    const multiSubdomainBrand = (subdomainCount > 2 && brandS) ? 1 : 0;

    // Metadata
    const tldLen       = tld.length;
    const subdomainLen = parts.length > 2 ? parts.slice(0, -2).join(".").length : 0;
    const urlEntropy   = parseFloat(
      Math.min(urlLen / 200 + hasNums * 0.2 + subdomainCount * 0.1, 1.0).toFixed(3)
    );

    // Return in EXACT FEATURE_COLUMNS order — DO NOT reorder
    return {
      is_https:              isHttps,
      domain_length:         domLen,
      url_length:            urlLen,
      path_length:           pathLen,
      subdomain_count:       subdomainCount,
      suspicious_tld:        susTld,
      brand_similarity:      brandS,
      confusion_score:       conf,
      has_numbers_in_domain: hasNums,
      has_login_terms:       hasLogin,
      has_secure_terms:      hasSecure,
      has_ip_address:        hasIp,
      has_at_symbol:         hasAt,
      is_url_shortener:      isShortener,
      double_slash_in_path:  doubleSlash,
      hex_chars_count:       hexChars,
      dot_count:             dotCount,
      hyphen_count:          hyphenCount,
      path_depth:            pathDepth,
      has_port:              hasPort,
      query_length:          queryLen,
      special_chars_count:   specialChars,
      digit_ratio:           digitRatio,
      sus_tld_brand:         susTldBrand,
      no_https_login:        noHttpsLogin,
      long_suspicious:       longSuspicious,
      multi_subdomain_brand: multiSubdomainBrand,
      tld_length:            tldLen,
      subdomain_length:      subdomainLen,
      url_entropy:           urlEntropy,
    };

  } catch (e) {
    return _zeroFeatures();
  }
}

// ─────────────────────────────────────────────────────────────────
// SECTION 4 — RULE-BASED SCORER  (mirrors _rule_score() in main.py)
// ─────────────────────────────────────────────────────────────────

/**
 * Deterministic weighted rule engine.
 * Same weights as main.py _rule_score() method.
 */
function ruleScore(f) {
  let score = 0;

  if (f.brand_similarity)              score += 30;
  if (f.confusion_score > 3)           score += 25;
  if (f.has_ip_address)                score += 25;
  if (f.suspicious_tld)                score += 15;
  if (f.has_at_symbol)                 score += 15;
  if (f.no_https_login)                score += 15;
  if (f.sus_tld_brand)                 score += 15;
  if (f.has_login_terms)               score += 10;
  if (f.is_url_shortener)              score += 10;
  if (f.double_slash_in_path)          score += 10;
  if (f.hex_chars_count > 3)           score += 10;
  if (f.url_length > 100)              score +=  5;
  if (f.subdomain_count > 3)           score +=  5;
  if (f.has_port)                      score +=  5;
  if (!f.is_https)                     score += 20;
  if (f.platform_phishing)     score += 40;  // HIGH — platform hosting phishing
  if (f.subdomain_brand_login) score += 30;  // HIGH — brand + login in subdomain

  return score;
}

// ─────────────────────────────────────────────────────────────────
// SECTION 5 — ONNX MODEL  (loads phishing_model.onnx once)
// ─────────────────────────────────────────────────────────────────

let _onnxSession  = null;

// ⚠️  Paste the threshold printed during Python training here
// e.g. if Python printed "Tuned threshold: 0.20", set this to 0.20
const THRESHOLD = 0.15;

async function _loadModel() {
  if (_onnxSession) return _onnxSession;
  const modelUrl  = chrome.runtime.getURL("phishing_model.onnx");
  _onnxSession    = await ort.InferenceSession.create(modelUrl);
  return _onnxSession;
}

async function _runModel(featuresArray) {
  const session = await _loadModel();
  const tensor  = new ort.Tensor("float32", Float32Array.from(featuresArray), [1, 30]);

  // Input name must match what skl2onnx generated — usually "float_input"
  const feeds  = { float_input: tensor };
  const output = await session.run(feeds);

  // Get probability of class 1 (phishing)
  // skl2onnx outputs: "output_label" and "output_probability"
  const probMap = output.output_probability || output[Object.keys(output).find(k => k.includes("prob"))];

  if (probMap && probMap.data) {
    // ONNX probability map is a sequence — index 1 = P(phishing)
    return parseFloat(probMap.data[1]);
  }

  // Fallback: try raw output array
  const raw = output[Object.keys(output)[0]].data;
  return parseFloat(raw[1] ?? raw[0]);
}

// ─────────────────────────────────────────────────────────────────
// SECTION 6 — HYBRID PREDICTOR  (mirrors predict_url() in main.py)
// ─────────────────────────────────────────────────────────────────

/**
 * Main prediction function — call this from background.js
 * Mirrors PhishingDetector.predict_url() exactly:
 *   1. Trusted domain whitelist bypass
 *   2. Extract 30 URL features
 *   3. Rule score
 *   4. ML model probability
 *   5. Blend (35% rule + 65% ML)
 *   6. ML override for MALICIOUS
 *
 * @param {string} url
 * @returns {Promise<object>} result with decision, confidence, reason etc.
 */
async function predictURL(url) {

  // ── Step 1: Trusted domain whitelist bypass ───────────────────
  // Mirrors: if domain in TRUSTED_DOMAINS → return SAFE immediately
  try {
    const parsed = new URL(url.startsWith("http") ? url : "https://" + url);
    const domain = parsed.hostname.replace("www.", "");
    if (TRUSTED_DOMAINS.has(domain)) {
      return {
        decision:             "SAFE",
        confidence:           99,
        risk_score:           0,
        phishing_probability: 0.0,
        reason:               "trusted domain — whitelisted",
        recommended_action:   "ALLOW",
        source:               "whitelist",
        ml_label:             "SAFE",
      };
    }
  } catch (e) { /* unparseable URL — continue */ }

  // ── Step 2: Extract 30 features ──────────────────────────────
  const urlFeat = extractURLFeatures(url);

  // ── Step 3: Rule score ────────────────────────────────────────
  const ruleS = ruleScore(urlFeat);

  // ── Step 4: ML model ─────────────────────────────────────────
  let pPhish  = 0.0;
  let mlLabel = "SAFE";

  try {
    const featArray = FEATURE_COLUMNS.map(col => urlFeat[col]);
    pPhish = await _runModel(featArray);

    if      (pPhish >= THRESHOLD)        mlLabel = "MALICIOUS";
    else if (pPhish >= THRESHOLD * 0.6)  mlLabel = "SUSPICIOUS";
    else                                 mlLabel = "SAFE";

  } catch (e) {
    // Model failed — fall back to rule score only
    console.warn("[phishing.js] ONNX model error:", e);
    mlLabel = ruleS >= 60 ? "MALICIOUS" : ruleS >= 30 ? "SUSPICIOUS" : "SAFE";
    pPhish  = Math.min(ruleS / 100.0, 1.0);
  }

  // ── Step 5: Blend (35% rule + 65% ML) ────────────────────────
  const ruleP  = Math.min(ruleS / 100.0, 1.0);
  const finalP = 0.35 * ruleP + 0.65 * pPhish;

  let finalLabel;
  if      (finalP >= 0.55) finalLabel = "MALICIOUS";
  else if (finalP >= 0.30) finalLabel = "SUSPICIOUS";
  else                     finalLabel = "SAFE";

  // ── Step 6: ML override for non-trusted domains ───────────────
  if (mlLabel === "MALICIOUS") finalLabel = "MALICIOUS";

  // ── Build reason string ───────────────────────────────────────
  const reasons = [];
  if (urlFeat.brand_similarity)        reasons.push("brand spoofing");
  if (urlFeat.has_ip_address)          reasons.push("IP as domain");
  if (urlFeat.suspicious_tld)          reasons.push("suspicious TLD");
  if (urlFeat.has_at_symbol)           reasons.push("@ in URL");
  if (!urlFeat.is_https)               reasons.push("no HTTPS");
  if (urlFeat.confusion_score > 3)     reasons.push(`confusion score ${urlFeat.confusion_score.toFixed(1)}`);
  if (urlFeat.no_https_login)          reasons.push("login form without HTTPS");
  if (urlFeat.is_url_shortener)        reasons.push("URL shortener");
  if (urlFeat.has_ip_address)          reasons.push("IP address as domain");
  if (!reasons.length)                 reasons.push("no major risk signals");

  const ACTION_MAP = { MALICIOUS: "BLOCK", SUSPICIOUS: "WARN", SAFE: "ALLOW" };

  // ── Subdomain keyword analysis ─────────────────────────────
// Catches phishing hosted on legit platforms (gitbook, blogspot etc.)
const PHISHING_HOSTING_PLATFORMS = new Set([
  "gitbook.io", "blogspot.com", "github.io", "netlify.app",
  "vercel.app", "web.app", "firebaseapp.com", "pages.dev",
  "weebly.com", "wixsite.com", "squarespace.com", "mystrikingly.com",
  "carrd.co", "glitch.me", "replit.dev",
]);

const SUSPICIOUS_SUBDOMAIN_KEYWORDS = [
  "login", "signin", "verify", "secure", "account", "update",
  "confirm", "banking", "wallet", "password", "credential",
  "recovery", "support", "alert", "suspended", "unlock",
  "validate", "auth", "checkout", "payment",
];

const rootDomain = parts.slice(-2).join(".");
const subdomainStr = parts.slice(0, -2).join(".").toLowerCase();

const isPhishingPlatform = PHISHING_HOSTING_PLATFORMS.has(rootDomain);
const subdomainHasLoginKeyword = SUSPICIOUS_SUBDOMAIN_KEYWORDS.some(
  k => subdomainStr.includes(k)
);
const subdomainHasBrand = KNOWN_BRANDS.some(
  b => _normalize(subdomainStr).includes(b)
);

// High risk: phishing keyword in subdomain on hosting platform
const platformPhishing = int(isPhishingPlatform && (subdomainHasLoginKeyword || subdomainHasBrand));

// Medium risk: any subdomain with brand + login keyword combo
const subdomainBrandLogin = int(subdomainHasBrand && subdomainHasLoginKeyword);

  return {
    decision:             finalLabel,
    confidence:           Math.round(finalP * 100),
    risk_score:           ruleS,
    phishing_probability: parseFloat(pPhish.toFixed(3)),
    reason:               reasons.slice(0, 3).join("; "),
    recommended_action:   ACTION_MAP[finalLabel],
    source:               "hybrid v3 (rule + ONNX)",
    ml_label:             mlLabel,
    features:             urlFeat,   // available for popup to show breakdown
    platform_phishing:     platformPhishing,
    subdomain_brand_login: subdomainBrandLogin,
  };
}

// ─────────────────────────────────────────────────────────────────
// SECTION 7 — EXPORT  (makes functions available to background.js)
// ─────────────────────────────────────────────────────────────────

// These are available globally since background.js uses importScripts()
// predictURL()          ← main function, call this
// extractURLFeatures()  ← available if you need raw features
// ruleScore()           ← available if you need rule score only
