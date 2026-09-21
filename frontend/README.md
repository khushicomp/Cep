# Branch reporting frontend

React/Vite frontend for manager daily branch reporting and Head Office review, correction decisions, final locking, daily overview, analytics, and report audit history. Employees supply figures offline; there is no employee/task workspace. Existing ADMIN access is limited to transitional central reads.

Use `npm ci` to install dependencies, `npm run dev` for local development, `npm run build` for production output, and `npm run lint` for checks. Configure the API base URL through the existing `VITE_API_URL` environment setting. Keep environment files and build output out of Git.

Phase reviews in the repository root document behavior and verification. Database utility limitations are described in `Bank-backend/DATABASE_UTILITIES.md`. This is local development documentation, not a deployment guide.
