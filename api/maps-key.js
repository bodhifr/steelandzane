// Google Maps browser key for address suggestions on /complimentary-shoot.
// The key lives only in the environment (GOOGLE_MAPS_API_KEY, Vercel dashboard
// and .env.local), never in the repo. It is a browser key by design: Google
// Cloud restricts it to our domains and to the Maps JavaScript + Places APIs.

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ key: null });
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json({ key: process.env.GOOGLE_MAPS_API_KEY || null });
};
