# Attendance Portal with Supabase

This project is a simple attendance website for capturing employee login and logout times by day and calendar date.

## Features
- Employee database management
- Location-based filtering
- Daily attendance capture by date
- Calendar view for attendance tracking
- Supabase-ready storage

## Local preview
1. Open the project folder in VS Code.
2. Run a static server:
   ```bash
   cd d:\SF
   py -3 -m http.server 8000
   ```
3. Open `http://localhost:8000` in the browser.

## Supabase setup
1. Create a new Supabase project.
2. Open the SQL editor in Supabase.
3. Paste the contents of `supabase-schema.sql` and run it.
4. Go to Settings > API and copy the project URL and anon/public key.
5. Open `config.js` and replace the placeholder values:
   ```js
   window.SUPABASE_CONFIG = {
     enabled: true,
     url: 'https://YOUR_PROJECT_REF.supabase.co',
     anonKey: 'YOUR_SUPABASE_ANON_KEY'
   };
   ```
6. Refresh the browser.

## Notes
- If Supabase is not enabled, the site still works in local browser storage for quick testing.
- The app is designed to be expanded later with more modules such as approvals, reports, and branch filters.
