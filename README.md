# Attendance Portal with Supabase

This project is a simple attendance website for capturing employee login and logout times by day and calendar date.

## Features
- Employee database management
- Location-based filtering
- Daily attendance capture by date
- Calendar view for attendance tracking
- Supabase database storage for employees and attendance

## Local development
1. Open the project folder in VS Code.
2. Run the project with Vercel CLI so the `/api/config` endpoint is available:
   ```bash
   cd d:\SF\johnson-control
   vercel link
   vercel dev
   ```
3. Open the local URL printed by `vercel dev`. The linked Vercel project supplies its configured environment variables.

A static server such as `python -m http.server` can display the page, but it cannot run the Vercel API endpoint; database saves will be disabled in that preview.

## Supabase setup
1. Create a new Supabase project.
2. Open the SQL editor in Supabase.
3. Paste the contents of `supabase-schema.sql` and run it.
4. Go to Settings > API and copy the project URL and anon/public key.
5. In Vercel, open the project and go to Settings > Environment Variables.
6. Add these variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
7. Redeploy the project.
8. Refresh the browser.

## Notes
- The browser should never use the Supabase secret/service_role key.
- The app reads the live config from Vercel environment variables through the `/api/config` endpoint.
- Supabase is required to load and save employee and attendance data. If the database is unavailable, the app shows a status message and disables saving.
- The app does not create sample employees. Add real employees through the Employees form and they will be saved to Supabase.
- The app is designed to be expanded later with more modules such as approvals, reports, and branch filters.
