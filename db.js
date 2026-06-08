import axios from "axios";

const METHOD_BASE = "https://rest.method.me";

// ═════════════════════════════════════════════════════════════════════════════
// FIND OR CREATE TOKEN RECORD
// ═════════════════════════════════════════════════════════════════════════════

export const findOrCreateTokenRecord = async (methodApiKey, userRecordId) => {
  try {
    // 1️⃣ Search for existing record using linked field syntax
    const searchRes = await axios.post(
      `${METHOD_BASE}/api/v1/tables/CustomOAuthTokens/query`,
      {
        Query: {
          Criteria: [
            {
              Field: "CustomUser.RecordID",
              Operator: "Equals",
              Value: userRecordId
            },
            {
              Field: "Provider",
              Operator: "Equals",
              Value: "Google"
            }
          ]
        }
      },
      {
        headers: { Authorization: `Bearer ${methodApiKey}` }
      }
    );

    if (searchRes.data.length > 0) {
      return searchRes.data[0].RecordID;
    }

    // 2️⃣ Create new record
    const createRes = await axios.post(
      `${METHOD_BASE}/api/v1/tables/CustomOAuthTokens`,
      {
        CustomUser: { RecordID: userRecordId },
        Provider: "Google"
      },
      {
        headers: { Authorization: `Bearer ${methodApiKey}` }
      }
    );

    return createRes.data.RecordID;

  } catch (err) {
    console.error("❌ findOrCreateTokenRecord error:", err.response?.data || err.message);
    throw err;
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// SAVE TOKENS
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
          Authorization: `Bearer ${methodApiKey}`,
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
// GET TOKENS
// ═════════════════════════════════════════════════════════════════════════════

export const getTokensFromMethod = async (methodApiKey, userRecordId) => {
  try {
    const searchRes = await axios.post(
      `${METHOD_BASE}/api/v1/tables/CustomOAuthTokens/query`,
      {
        Query: {
          Criteria: [
            {
              Field: "CustomUser.RecordID",
              Operator: "Equals",
              Value: userRecordId
            },
            {
              Field: "Provider",
              Operator: "Equals",
              Value: "Google"
            }
          ]
        }
      },
      {
        headers: { Authorization: `Bearer ${methodApiKey}` }
      }
    );

    if (searchRes.data.length === 0) {
      return { accessToken: null, refreshToken: null, expiry: null, tokenRecordId: null };
    }

    const record = searchRes.data[0];

    return {
      accessToken: record.AccessToken || null,
      refreshToken: record.RefreshToken || null,
      expiry: record.AccessTokenExpiry || null,
      tokenRecordId: record.RecordID
    };

  } catch (err) {
    console.error("❌ getTokensFromMethod error:", err.response?.data || err.message);
    throw err;
  }
};
