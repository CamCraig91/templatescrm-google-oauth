import axios from "axios";

const METHOD_BASE = "https://rest.method.me";

// ═════════════════════════════════════════════════════════════════════════════
// SAVE TOKENS TO METHOD — FINAL VERSION
// ═════════════════════════════════════════════════════════════════════════════

export const saveTokensToMethod = async (methodApiKey, userRecordId, tokens) => {
  try {
    const expiryDate = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const payload = {
      MeetingAPIAccessToken:                   tokens.access_token || "",
      MeetingLinkAPIRefreshToken:              tokens.refresh_token || "",
      MeetingLinkAPIAccessTokenExpiryDateTime: expiryDate || "",
      // Optional — Google does NOT provide refresh token expiry
      MeetingLinkAPIRefreshTokenExpiryDateTime: ""
    };

    console.log("📤 Saving tokens to Method:", {
      userRecordId,
      access: tokens.access_token?.slice(0, 6) + "...",
      refresh: tokens.refresh_token?.slice(0, 6) + "...",
      expiryDate
    });

    await axios.patch(
      `${METHOD_BASE}/api/v1/tables/Users/${userRecordId}`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${methodApiKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log(`✅ Tokens saved to Method for user record ${userRecordId}`);

  } catch (err) {
    console.error("❌ saveTokensToMethod error:", err.response?.data || err.message);
    throw err;
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// GET TOKENS FROM METHOD — FINAL VERSION
// ═════════════════════════════════════════════════════════════════════════════

export const getTokensFromMethod = async (methodApiKey, userRecordId) => {
  try {
    const res = await axios.get(
      `${METHOD_BASE}/api/v1/tables/Users/${userRecordId}`,
      {
        headers: { Authorization: `Bearer ${methodApiKey}` }
      }
    );

    return {
      accessToken:  res.data.MeetingAPIAccessToken || null,
      refreshToken: res.data.MeetingLinkAPIRefreshToken || null,
      expiry:       res.data.MeetingLinkAPIAccessTokenExpiryDateTime || null
    };

  } catch (err) {
    console.error("❌ getTokensFromMethod error:", err.response?.data || err.message);
    throw err;
  }
};
