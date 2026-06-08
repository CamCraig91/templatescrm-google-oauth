import axios from "axios";

const METHOD_BASE = "https://rest.method.me";

// ═════════════════════════════════════════════════════════════════════════════
// SAVE TOKENS — updates the specific CustomOAuthTokens record
// ═════════════════════════════════════════════════════════════════════════════

export const saveTokensToMethod = async (methodApiKey, tokenRecordId, tokens) => {
  try {
    const expiryDate = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const payload = {
      AccessToken: tokens.access_token || "",
      RefreshToken: tokens.refresh_token || "",
      AccessTokenExpiry: expiryDate || "",
      RefreshTokenExpiry: "",
      LastModifiedDate: new Date().toISOString()
    };

    await axios.patch(
      `${METHOD_BASE}/api/v1/tables/CustomOAuthTokens/${tokenRecordId}`,
      payload,
      {
        headers: {
          Authorization: `APIKey ${methodApiKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log(`✅ Tokens saved to CustomOAuthTokens record ${tokenRecordId}`);

  } catch (err) {
    console.error("❌ saveTokensToMethod error:", err.response?.data || err.message);
    throw err;
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// GET TOKENS — loads tokens from the specific CustomOAuthTokens record
// ═════════════════════════════════════════════════════════════════════════════

export const getTokensFromMethod = async (methodApiKey, tokenRecordId) => {
  try {
    const res = await axios.get(
      `${METHOD_BASE}/api/v1/tables/CustomOAuthTokens/${tokenRecordId}`,
      {
        headers: { Authorization: `APIKey ${methodApiKey}` }
      }
    );

    return {
      accessToken: res.data.AccessToken || null,
      refreshToken: res.data.RefreshToken || null,
      expiry: res.data.AccessTokenExpiry || null
    };

  } catch (err) {
    console.error("❌ getTokensFromMethod error:", err.response?.data || err.message);
    throw err;
  }
};
