const axios = require('axios');
export default async function handler(req, res) {
  const { code, state: uid, error } = req.query;
  const APP_URL = process.env.APP_URL;
  if (error || !code || !uid) return res.redirect(`${APP_URL}/?status=error&msg=${encodeURIComponent(error || 'Auth failed')}`);
  try {
    const tokenRes = await axios.post('https://auth.tesla.com/oauth2/v3/token', {
      grant_type: 'authorization_code',
      client_id: process.env.TESLA_CLIENT_ID,
      client_secret: process.env.TESLA_CLIENT_SECRET,
      code,
      redirect_uri: `${APP_URL}/api/auth/callback`,
      audience: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
    });
    const { access_token, refresh_token, expires_in } = tokenRes.data;
    const vehiclesRes = await axios.get('https://fleet-api.prd.na.vn.cloud.tesla.com/api/1/vehicles', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const vehicles = vehiclesRes.data?.response;
    if (!vehicles?.length) return res.redirect(`${APP_URL}/?status=error&msg=No+Tesla+found`);
    if (vehicles.length > 1) {
      const vData = encodeURIComponent(JSON.stringify(vehicles.map(v => ({ vin: v.vin, name: v.display_name }))));
      const tData = encodeURIComponent(JSON.stringify({ access_token, refresh_token, expires_in, uid }));
      return res.redirect(`${APP_URL}/?status=pick&v=${vData}&t=${tData}`);
    }
    const v = vehicles[0];
    await axios.post(`${process.env.RAILWAY_URL}/session`, {
      uid, access_token, refresh_token, expires_in,
      vin: v.vin, vehicle_name: v.display_name,
      secret: process.env.INTERNAL_SECRET
    });
    res.redirect(`${APP_URL}/?status=success&vehicle=${encodeURIComponent(v.display_name)}`);
  } catch (err) {
    res.redirect(`${APP_URL}/?status=error&msg=Connection+failed`);
  }
}
