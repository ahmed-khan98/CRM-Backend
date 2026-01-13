import fetch from "node-fetch";

const {
  PAYPAL_BASE_URL,
  PAYPAL1_CLIENT_ID,
  PAYPAL1_CLIENT_SECRET,
  PAYPAL2_CLIENT_ID,
  PAYPAL2_CLIENT_SECRET,
  PAYPAL3_CLIENT_ID,
  PAYPAL3_CLIENT_SECRET,
} = process.env;

export async function generateAccessToken(merchantType) {
  console.log(merchantType, "=========merchantType");
  let CLIENT_ID, CLIENT_SECRET;

  const type = merchantType?.trim();

  if (type === "Kinatech Business Solutions LLC") {
    CLIENT_ID = PAYPAL1_CLIENT_ID;
    CLIENT_SECRET = PAYPAL1_CLIENT_SECRET;
  } else if (type === "Pay Kinetic") {
    CLIENT_ID = PAYPAL2_CLIENT_ID;
    CLIENT_SECRET = PAYPAL2_CLIENT_SECRET;
  } else if (type === "SA Pro Solution LLC") {
    CLIENT_ID = PAYPAL3_CLIENT_ID;
    CLIENT_SECRET = PAYPAL3_CLIENT_SECRET;
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(`MISSING_API_CREDENTIALS for ${merchantType}`);
  }

  try {
    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
      "base64"
    );

    const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
      method: "POST",
      body: "grant_type=client_credentials",
      // headers: { Authorization: `Basic ${auth}` },
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded", // Yeh line lazmi add karein
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error_description || "Failed to authenticate with PayPal"
      );
    }

    return data.access_token;
  } catch (error) {
    console.error("Failed to generate Access Token:", error);
    throw new Error("Failed to authenticate with PayPal");
  }
}
