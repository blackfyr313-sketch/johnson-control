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
3. For a new project, paste and run `supabase-schema.sql`.
4. For an existing project, run `supabase-location-migration.sql` to create the locations table, backfill current employee locations, and link employees to locations. Do not rerun the original schema just for this update.
5. Go to Settings > API and copy the project URL and anon/public key.
6. In Vercel, open the project and go to Settings > Environment Variables.
7. Add these variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
8. Redeploy the project.
9. Refresh the browser.

## Notes
- The browser should never use the Supabase secret/service_role key.
- The app reads the live config from Vercel environment variables through the `/api/config` endpoint.
- Supabase is required to load and save employee and attendance data. If the database is unavailable, the app shows a status message and disables saving.
- The app does not create sample employees. Add real employees through the Employees form and they will be saved to Supabase.
- Add locations in the Locations tab before assigning employees to them.
- The app is designed to be expanded later with more modules such as approvals, reports, and branch filters.
