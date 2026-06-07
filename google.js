import axios from "axios";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI } from "./config.js";
import { saveTokensToMethod, getTokensFromMethod } from "./db.js";

// ═════════════════════════════════════════════════════════════════════════════
// PART 1 — USER AUTHENTICATION (One time setup per user)
// User connects their Google Calendar to the system.
// Method calls /initiate-auth via workflow, gets back authUrl, redirects user.
// Google redirects back to /oauth/callback, tokens saved to Method user record.
// ═════════════════════════════════════════════════════════════════════════════

// ─── 1a. Generate Auth URL ────────────────────────────────────────────────────
// Called by Method workflow via POST /initiate-auth
// Returns JSON with authUrl — Method navigates user to it

export const initiateAuth = (req, res) => {
  const { accountId, userRecordId, methodApiKey } = req.body;

  if (!accountId || !userRecordId || !methodApiKey) {
    return res.status(400).json({
      success: false,
      status:  "error",
      message: "Missing required fields: accountId, userRecordId, or methodApiKey."
    });
  }

  try {
    const state = Buffer.from(
      JSON.stringify({ accountId, userRecordId, methodApiKey })
    ).toString("base64");

    const authUrl =
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      new URLSearchParams({
        client_id:     GOOGLE_CLIENT_ID,
        redirect_uri:  REDIRECT_URI,
        response_type: "code",
        scope:         "https://www.googleapis.com/auth/calendar.events",
        access_type:   "offline",
        prompt:        "consent select_account",
        state
      });

    console.log(`🔗 Auth URL generated for account: ${accountId}, user: ${userRecordId}`);

    res.status(200).json({
      success: true,
      status:  "ok",
      message: "Authorization URL generated successfully.",
      authUrl
    });

  } catch (err) {
    console.error("❌ initiateAuth error:", err.message);
    res.status(500).json({
      success: false,
      status:  "error",
      message: "Server error generating authorization URL."
    });
  }
};

// ─── 1b. Local Testing Only ───────────────────────────────────────────────────
// Use: http://localhost:4000/oauth/start?accountId=X&userRecordId=Y&methodApiKey=Z
// NOT used in production — Method uses /initiate-auth instead

export const startAuth = (req, res) => {
  const { accountId, userRecordId, methodApiKey } = req.query;

  if (!accountId || !userRecordId || !methodApiKey) {
    return res.status(400).send("Missing required params: accountId, userRecordId, methodApiKey");
  }

  const state = Buffer.from(
    JSON.stringify({ accountId, userRecordId, methodApiKey })
  ).toString("base64");

  const url =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      redirect_uri:  REDIRECT_URI,
      response_type: "code",
      scope:         "https://www.googleapis.com/auth/calendar.events",
      access_type:   "offline",
      prompt:        "consent select_account",
      state
    });

  console.log(`🔗 Local test OAuth start — account: ${accountId}, user: ${userRecordId}`);
  res.redirect(url);
};

// ─── 1c. Google Callback ──────────────────────────────────────────────────────
// Google redirects here after user authenticates.
// Exchanges code for tokens and saves them to the user's Method record.
// This is the ONLY place we write to Method during auth.

export const handleCallback = async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error("OAuth cancelled or error from Google:", error);
      return res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2>❌ Connection Cancelled</h2>
          <p>You cancelled the Google authorization. You can close this window.</p>
        </body></html>
      `);
    }

    if (!state) return res.status(400).send("Missing state parameter.");

    const { accountId, userRecordId, methodApiKey } = JSON.parse(
      Buffer.from(state, "base64").toString()
    );

    console.log(`📥 Callback received — account: ${accountId}, user: ${userRecordId}`);

    // Exchange code for tokens
    const tokenRes = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        code,
        client_id:     GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    "authorization_code"
      })
    );

    const tokens = { ...tokenRes.data, code };
    console.log("✅ Tokens received. Has refresh token:", !!tokens.refresh_token);

    // Save tokens to Method user record
    await saveTokensToMethod(methodApiKey, userRecordId, tokens);

    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2>✅ Google Calendar Connected!</h2>
        <p>Your Google Calendar has been linked successfully.</p>
        <p>You can close this window and return to Method.</p>
      </body></html>
    `);

  } catch (err) {
    console.error("❌ handleCallback error:", err.response?.data || err.message);
    res.status(500).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2>❌ Connection Failed</h2>
        <p>Something went wrong. Please try again or contact support.</p>
        <small>${err.message}</small>
      </body></html>
    `);
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// PART 2 — MEETING CREATION (Separate from auth, triggered independently)
// Can be triggered by:
//   - A contact booking an appointment (via booking page)
//   - A user sending a meeting link manually from Method
// Method calls /create-event via workflow with meeting details.
// Returns full event data — Method handles any field updates from there.
// ═════════════════════════════════════════════════════════════════════════════

// ─── 2a. Create Google Meet Event ────────────────────────────────────────────
// Called by Method workflow via POST /create-event
// Fetches user's tokens from Method, refreshes if expired, creates event.
// Returns all event data in response — no field writes back to Method.
// Method decides what to do with the response (save fields, send email, etc.)

export const createEvent = async (req, res) => {
  try {
    const { methodApiKey, userRecordId, summary, start, end, attendees } = req.body;

    // Validate required fields
    if (!methodApiKey || !userRecordId) {
      return res.status(400).json({
        success: false,
        status:  "error",
        message: "Missing required fields: methodApiKey or userRecordId."
      });
    }

    if (!summary || !start || !end) {
      return res.status(400).json({
        success: false,
        status:  "error",
        message: "Missing required fields: summary, start, or end."
      });
    }

    // Get tokens from Method user record
    const { accessToken, refreshToken, expiry } = await getTokensFromMethod(
      methodApiKey,
      userRecordId
    );

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        status:  "error",
        message: "No Google Calendar connection found. User must connect Google Calendar first."
      });
    }

    // Refresh access token if expired
    let currentAccessToken = accessToken;
    const isExpired = !expiry || new Date(expiry) <= new Date();

    if (isExpired) {
      console.log("🔄 Access token expired, refreshing...");
      const refreshRes = await axios.post(
        "https://oauth2.googleapis.com/token",
        new URLSearchParams({
          client_id:     GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type:    "refresh_token"
        })
      );

      currentAccessToken = refreshRes.data.access_token;
      const newExpiry = new Date(
        Date.now() + refreshRes.data.expires_in * 1000
      ).toISOString();

      // Save refreshed tokens back to Method (necessary for future calls)
      await saveTokensToMethod(methodApiKey, userRecordId, {
        access_token:  currentAccessToken,
        refresh_token: refreshToken,
        expires_in:    refreshRes.data.expires_in,
        code:          null
      });

      console.log("✅ Access token refreshed.");
    }

    // Create Google Calendar event with Meet link
    const eventRes = await axios.post(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
      {
        summary,
        start:     { dateTime: start },
        end:       { dateTime: end },
        attendees: attendees ?? [],
        conferenceData: {
          createRequest: { requestId: "meet-" + Date.now() }
        }
      },
      {
        headers: { Authorization: `Bearer ${currentAccessToken}` }
      }
    );

    const event = eventRes.data;
    const meetLink  = event.conferenceData?.entryPoints?.[0]?.uri ?? null;
    const htmlLink  = event.htmlLink ?? null;
    const eventId   = event.id ?? null;
    const startTime = event.start?.dateTime ?? null;
    const endTime   = event.end?.dateTime ?? null;

    console.log("✅ Event created:", meetLink);

    // Return everything — Method handles field updates, emails, etc.
    res.status(200).json({
      success:   true,
      status:    "ok",
      message:   "Meeting created successfully.",
      meetLink,
      htmlLink,
      eventId,
      summary:   event.summary,
      startTime,
      endTime,
      attendees: event.attendees ?? []
    });

  } catch (err) {
    console.error("❌ createEvent error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      status:  "error",
      message: "Failed to create event.",
      detail:  err.response?.data || err.message
    });
  }
};