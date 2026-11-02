# Server Runbook: Fixing High CPU on the NIB KYC Server

**For:** the person who administers the IIS and PostgreSQL server.

**Time needed:** about 1 hour, including a short outage for the deployment and the PostgreSQL restart.

## The problem

Node and PostgreSQL reach almost 100% CPU and the system stops responding. The main cause is a missing database index, not the server size or the number of users.

Branch users are about 95% of accounts. Every sidebar badge and dashboard card they load filters the `KYC` table by `branchId`, which had no index, so PostgreSQL did far more work than it should have for each count. Pages also reloaded this data too often and fetched more than they needed.

Measured with a copy of the production backup on an 8-thread laptop, for the sidebar counts only:

| 60 simultaneous users | Before | After the index |
|---|---|---|
| Sidebar refreshes per second | 6 | 896 |
| Median wait | 16 seconds | 52 ms |

Expect a large improvement rather than these exact numbers, because the live server also handles logins, page loads and file downloads.

## Before you start

- [ ] Plan steps 4 and 5 for outside working hours, because both cause a short outage.
- [ ] Have the `postgres` password ready. PowerShell commands below will ask for it.
- [ ] Have the new code on the server. It includes `prisma/manual/2026-11-01_kyc_branch_counts_index.sql`.

Open PowerShell as Administrator and set these values. **Check the version and database name first.** `NibteraKYC` is the name recorded in the production backup.

```powershell
Get-Service postgresql*          # Shows the service name, e.g. postgresql-x64-18

$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$pgDump = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
$db = "NibteraKYC"
$app = "D:\path\to\Nib-Bank-Kyc"   # Change this to the real application folder
```

## Commands you must not run on this database

| Command | Why |
|---|---|
| `npx prisma migrate deploy` | The migration history does not match the database, so it is likely to fail. |
| `npx prisma migrate dev` | It may offer to reset the database, which erases all data. |
| `npx prisma db push` | It is not needed here, and it builds indexes in a way that blocks writes. |
| `npx prisma db seed` | It is not needed and could change live data. |

## Step 1: Take a backup

Store the backup somewhere safe, outside the application folder, because it contains customer data.

```powershell
& $pgDump -U postgres -h localhost -F c -f "D:\Backups\kyc-before-performance-fix.backup" $db
```

## Step 2: Record the current state

Run this while the system is busy, and save the output to compare in step 7.

```powershell
& $psql -U postgres -h localhost -d $db -c "SELECT seq_scan, seq_tup_read, idx_scan FROM pg_stat_user_tables WHERE relname = 'KYC';"
& $psql -U postgres -h localhost -d $db -c "SELECT state, count(*), max(now() - query_start) AS longest FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1;"
```

Run the first command again 60 seconds later. If `seq_tup_read` climbs by millions, the missing index is confirmed as the cause.

## Step 3: Create the index

**This is the most important step, and it can be done first.** It does not block users and does not need the new code. It took about 2 seconds on the laptop, and may take longer on a busy server.

```powershell
& $psql -U postgres -h localhost -d $db -f "$app\prisma\manual\2026-11-01_kyc_branch_counts_index.sql"
```

Confirm that the index is valid:

```powershell
& $psql -U postgres -h localhost -d $db -c "SELECT c.relname, i.indisvalid FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = 'KYC_branchId_status_isExceptional_isResubmitted_active_idx';"
```

`indisvalid` must be `t`. If it is `f`, remove the index and run the file again:

```powershell
& $psql -U postgres -h localhost -d $db -c 'DROP INDEX CONCURRENTLY "KYC_branchId_status_isExceptional_isResubmitted_active_idx";'
```

CPU should fall within a few minutes as new queries start using the index.

## Step 4: Deploy the new code

This causes a short outage. Stop the application however it is normally stopped, then:

```powershell
cd $app
# Update the code here, e.g. git pull, or copy in the new release.

$env:NODE_ENV = ""     # An empty value makes sure build tools are installed
npm ci
npm run build
```

Keep the existing `.env` file. Start the application again, or run `iisreset` if IIS manages it.

### What users will notice

- Sidebar and dashboard totals can be up to 30 seconds out of date.
- Returning to the browser tab refreshes data at most once a minute, and the current page no longer reloads by itself. Badges still update every 2 minutes.
- Very large exports run two at a time, so a third one waits its turn and may take longer.

## Step 5: Tune PostgreSQL

These are starting values for a server with 16 GB of RAM where PostgreSQL shares the machine with Node.

First check what is currently set, and note the values so you can compare later:

```powershell
& $psql -U postgres -h localhost -c "SELECT name, setting, unit FROM pg_settings WHERE name IN ('shared_buffers','effective_cache_size','work_mem','maintenance_work_mem','random_page_cost','max_connections','shared_preload_libraries');"
```

Apply the settings:

```powershell
& $psql -U postgres -h localhost -c "ALTER SYSTEM SET shared_buffers = '2GB';"
& $psql -U postgres -h localhost -c "ALTER SYSTEM SET effective_cache_size = '10GB';"
& $psql -U postgres -h localhost -c "ALTER SYSTEM SET work_mem = '16MB';"
& $psql -U postgres -h localhost -c "ALTER SYSTEM SET maintenance_work_mem = '512MB';"
```

**Only if the database is on an SSD:**

```powershell
& $psql -U postgres -h localhost -c "ALTER SYSTEM SET random_page_cost = 1.1;"
```

**Optional but recommended:** this records which queries use the most time, which makes future problems much easier to find. If `shared_preload_libraries` already has a value, add to it rather than replacing it.

```powershell
& $psql -U postgres -h localhost -c "ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';"
```

Restart PostgreSQL. This causes a short outage, so stop the application first. Use the service name from "Before you start".

```powershell
Restart-Service postgresql-x64-18
```

If you enabled `pg_stat_statements`, turn it on for the database:

```powershell
& $psql -U postgres -h localhost -d $db -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"
```

## Step 6: Check the IIS and application settings

These settings are not in the code repository, so they need to be checked on the server.

### Number of Node processes

Check `web.config` in the site folder.

- **IIS forwards to one Node process** (Application Request Routing, usually to port 4000): this is the setup assumed below.
- **iisnode with `nodeProcessCountPerApplication`:** each process opens its own database connections and runs its own background jobs. A value of `0` means one process per CPU core, so 10 here. Set it to `1` unless there is a reason to run more.

### Database connection limit

Prisma opens about 21 connections per process by default on 10 cores. Keep the total below PostgreSQL's `max_connections` (normally 100). In `.env`, add these options to the end of `DATABASE_URL`, keeping any options already there:

```text
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/NibteraKYC?schema=public&connection_limit=20&pool_timeout=20
```

With more than one Node process, set `connection_limit` to 80 divided by the number of processes. Restart the application after changing `.env`.

### Automatic cleanup settings

The cleanup job **permanently deletes documents**. In the backup, the saved setting has it off. Check that nothing on the server overrides that:

```powershell
Select-String -Path "$app\.env" -Pattern "AUTO_PURGE|AUTO_ARCHIVE"
Get-ChildItem Env: | Where-Object Name -Match "AUTO_PURGE|AUTO_ARCHIVE"
```

Also check any environment variables set in IIS or `web.config`. If any of these appear, confirm that they are intended.

## Step 7: Confirm the fix

Run these during a busy period.

**The new index is being used.** `idx_scan` should keep rising:

```powershell
& $psql -U postgres -h localhost -d $db -c "SELECT idx_scan FROM pg_stat_user_indexes WHERE indexrelname = 'KYC_branchId_status_isExceptional_isResubmitted_active_idx';"
```

**The full table scans have dropped.** Run this twice, 60 seconds apart. `seq_tup_read` should climb far more slowly than in step 2. It will not stop completely, because head-office and district totals still read many rows:

```powershell
& $psql -U postgres -h localhost -d $db -c "SELECT seq_scan, seq_tup_read, idx_scan FROM pg_stat_user_tables WHERE relname = 'KYC';"
```

**Queries are no longer piling up.** The `active` count should be low and `longest` should be short, usually under a few seconds:

```powershell
& $psql -U postgres -h localhost -d $db -c "SELECT state, count(*), max(now() - query_start) AS longest FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1;"
```

**Check the application as a user:**

- [ ] A branch user can log in, and the sidebar badges and home page cards show numbers.
- [ ] A KYC officer can open their queue, open a case and preview a document.
- [ ] Case actions, such as approving or returning a case, still work.
- [ ] Branch Monitoring and District Monitoring load, and the officer table shows names.
- [ ] Case Archive CSV export downloads with the expected number of rows.
- [ ] A case ZIP download includes its documents.
- [ ] Head Office Follow-Up and the Follow-Up report both open.
- [ ] Logging out works, and the old session cannot be reused.

**Check the Node process:** in Task Manager, a single Node process at about 10% of total CPU is fully using one core on a 10-core server. If that stays constant during normal use, see "Known remaining heavy areas".

## Step 8: Security follow-up (urgent)

The previous code loaded complete user records with each case, and those records appear to have been sent to the browsers of people viewing case lists and case pages. They included `password` and `refreshToken` hashes. **The new code removes these fields, so deploy it as soon as possible.**

Report this to your security team so they can decide on these actions:

1. **Confirm the exposure:** on the old version, if it is still available, check the case list response in the browser's developer tools (Network tab).
2. **Force password resets:** the password hashes may have been visible to any user who could view a case list. Decide whether every user, or only privileged accounts, must reset.
3. **End all sessions:** this logs everyone out, so do it outside working hours and only if the security team asks for it:

   ```sql
   UPDATE "User" SET "sessionId" = NULL, "refreshToken" = NULL, "refreshTokenExpiry" = NULL;
   ```

4. **Change any passwords shared in chats or documents**, including super admin accounts.

## If something goes wrong

| Problem | What to do |
|---|---|
| The new release misbehaves | Restore the previous release and restart it. **Leave the index in place**, because the old code benefits from it too. |
| The index causes a problem | Run the `DROP INDEX CONCURRENTLY` command from step 3. |
| PostgreSQL will not start after step 5 | Check the logs in the PostgreSQL `data\log` folder. In `data\postgresql.auto.conf`, remove the setting that caused the error, then start the service. |
| A PostgreSQL setting should be undone | Run `ALTER SYSTEM RESET setting_name;` and restart PostgreSQL. |
| `Too many clients` errors | Lower `connection_limit` as described in step 6. |

## Known remaining heavy areas

These are not fixed yet. Look here first if CPU stays high after this work.

| Area | Current behaviour | Possible fix |
|---|---|---|
| Very large exports | A 72,000-row export still takes about 5.5 seconds and 58 MB. | Stream the CSV from the server. |
| Officer Performance and Officer Reports | They load full case data, including comment history. | Calculate the figures in SQL. |
| Audit log search | A search takes 10 to 15 seconds and scans the whole log. | Add a text search index, or limit the date range. |
| District director totals | They use case-insensitive matching, which cannot use the normal index. The 30-second cache reduces the impact. | Match exact names. |
| Bundle ZIP downloads | They use maximum compression on files that are already compressed. | Lower the compression level. |
| `SessionAuditLog` size | About 4.5 million rows came from the old logout bug. New logouts no longer add to this. | Archive or remove old rows under your retention policy. |
