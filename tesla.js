export default function handler(req, res) {
  const { uid } = req.query;
  if (!uid) return res.status(400).send('Missing uid');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.TESLA_CLIENT_ID,
    redirect_uri: `${process.env.APP_URL}/api/auth/callback`,
    scope: 'openid offline_access vehicle_device_data vehicle_cmds vehicle_charging_cmds',
    state: uid,
    audience: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
  });
  res.redirect(`https://auth.tesla.com/oauth2/v3/authorize?${params}`);
}
