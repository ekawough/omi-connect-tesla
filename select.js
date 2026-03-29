const axios = require('axios');
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { vin, vehicle_name, access_token, refresh_token, expires_in, uid } = req.body;
  try {
    await axios.post(`${process.env.RAILWAY_URL}/session`, {
      uid, access_token, refresh_token, expires_in,
      vin, vehicle_name,
      secret: process.env.INTERNAL_SECRET
    });
    res.json({ status: 'ok' });
  } catch {
    res.status(500).json({ error: 'Failed' });
  }
}
