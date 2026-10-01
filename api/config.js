module.exports = function handler(request, response) {
  const config = {
    enabled: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || ''
  };

  response.setHeader('Cache-Control', 'no-store');
  response.status(200).json(config);
};
