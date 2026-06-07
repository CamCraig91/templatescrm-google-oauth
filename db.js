import axios from "axios";

const METHOD_BASE = "https://rest.method.me";

export const saveTokensToMethod = async (methodApiKey, userRecordId, tokens) => {
  try {
    const expiryDate = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    await axios.patch(
      `${METHOD_BASE}/api/v1/tables/Users/${userRecordId}`,
      {
        MeetingAPIAccessToken:                   tokens.access_token,
        MeetingLinkAPIRefreshToken:              tokens.refresh_token,
        MeetingLinkAPIAccessTokenExpiryDateTime: expiryDate,
        MeetingLinkAuthorizationCode:            tokens.code ?? null
      },
      {
        headers: {
          Authorization:  `Bearer ${methodApiKey}`,
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

export const getTokensFromMethod = async (methodApiKey, userRecordId) => {
  try {
    const res = await axios.get(
      `${METHOD_BASE}/api/v1/tables/Users/${userRecordId}`,
      {
        headers: { Authorization: `Bearer ${methodApiKey}` }
      }
    );
    return {
      accessToken:  res.data.MeetingAPIAccessToken,
      refreshToken: res.data.MeetingLinkAPIRefreshToken,
      expiry:       res.data.MeetingLinkAPIAccessTokenExpiryDateTime
    };
  } catch (err) {
    console.error("❌ getTokensFromMethod error:", err.response?.data || err.message);
    throw err;
  }
};