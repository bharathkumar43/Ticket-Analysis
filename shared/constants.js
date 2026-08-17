// ---------------------------------------------------------------------------
// Ported (with Jira-only fields removed once Neutara Ticketing replaced Jira as the sole
// live source) from the reference Cowork artifact "jira-hygiene-dashboard.html". Every
// roster email, custom field id, and threshold below was originally copied exactly from
// that file — see README.md for the extraction notes and the NTA migration notes.
//
// UMD-style export so this same file works both in Node (require) and directly
// in the browser via <script src="/shared/constants.js">.
// ---------------------------------------------------------------------------
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.JiraHygieneConstants = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/bmp'];

  // Source: jira-hygiene-dashboard.html lines 640-646
  const TEAMS = {
    ent: ['abhishek.sakala@cloudfuze.com','arun@cloudfuze.com','chaitanya.gupta@cloudfuze.com','chandra.mouli@cloudfuze.com','davidraj.dumpala@cloudfuze.com','ganesh.kondameedi@cloudfuze.com','harshith.kaduluri@cloudfuze.com','lakshmareddy@cloudfuze.com','lakshmi.prasanna@cloudfuze.com','manoj.bathula@cloudfuze.com','pallavi.kosuvaripalli@cloudfuze.com','pranavi@cloudfuze.com'],
    smb: ['abhishikth.yenugula@cloudfuze.com','ajay.singh@cloudfuze.com','ramana.reddy@cloudfuze.com','amulya.anapuram@cloudfuze.com','dathu.kaluvala@cloudfuze.com','habeebunnisa.begum@cloudfuze.com','harika.velidi@cloudfuze.com','meena.lakshmi@cloudfuze.com','neelima.krotta@cloudfuze.com','raghu.yellani@cloudfuze.com','ranadeep.muddam@cloudfuze.com','ravi.hemanth@cloudfuze.com','saikumar.kustapuram@cloudfuze.com','siva.kota@cloudfuze.com','sravan.kesaram@cloudfuze.com','sriram.ramakrishnan@cloudfuze.com','swaroop@cloudfuze.com','vijendar.burgula@cloudfuze.com','vineetha.yenti@cloudfuze.com'],
    qa: ['asma.karim@cloudfuze.com','bhuvana.mosra@cloudfuze.com','ganesh.guda@cloudfuze.com','kamal.basha@cloudfuze.com','kiran.ummenthala@cloudfuze.com','nagalakshmi.mangina@cloudfuze.com','sadia.shaik@cloudfuze.com','soniya.paladugula@cloudfuze.com','soumya.gande@cloudfuze.com'],
    infra: ['gururaj.bhimrao@cloudfuze.com','hymavathi@cloudfuze.com','pavan@cloudfuze.com','bala.raviteja@cloudfuze.com','avagadda.sravani@cloudfuze.com'],
    eng: ['abhinandan.kumar@cloudfuze.com','akhila.aenkoju@cloudfuze.com','akib.mohd@cloudfuze.com','ankit@cloudfuze.com','bhagyashri.deokar@cloudfuze.com','bharath.tummaganti@cloudfuze.com','hemadasu.kantam@cloudfuze.com','jaswanth.adari@cloudfuze.com','lakshmi.adabala@cloudfuze.com','mayank@cloudfuze.com','naved.osama@cloudfuze.com','pragati.pandey@cloudfuze.com','praveen.kothagolla@cloudfuze.com','praveen.v@cloudfuze.com','ravic@cloudfuze.com','ravi.srivastava@cloudfuze.com','rehan.khan@cloudfuze.com','sairaj.kanigicharla@cloudfuze.com','shiva.amuda@cloudfuze.com','shivam.singh@cloudfuze.com','srinu.gudimitla@cloudfuze.com','suraj.kumar@cloudfuze.com','vamsi.malla@cloudfuze.com','vishal.kumar@cloudfuze.com'],
  };
  const TEAM_LABELS = { ent: 'Migration - ENT', smb: 'Migration - SMB', eng: 'Customer Engineering', qa: 'QA', infra: 'Infra', other: 'Unmapped / Other' };
  const ALL_KNOWN_EMAILS = Object.values(TEAMS).flat();

  // Source: lines 670-684 (statuses observed live against Neutara Ticketing; the exact
  // vocabulary may have more values than this small sample turned up, so treat these as
  // best-effort until proven otherwise against a fuller dataset).
  const BLOCKED_STATUSES = ['Blocked', 'On Hold', 'Waiting for L1', 'Waiting for L2', 'Waiting for L3'];
  const WAITING_CUSTOMER_STATUS = 'Waiting for Customer';
  const NEAR_SLA_MS = 4 * 60 * 60 * 1000; // 4 hours

  // Source: line 774 — statuses treated as "done" for the file-backed (Excel upload) path,
  // which has no statusCategory-equivalent field of its own, so it's name-matched. The live
  // NTA path instead uses the ticket's own `status.category === 'done'`, which is more
  // robust — this constant is only consulted for the Excel path.
  const FILE_DONE_STATUSES = ['Resolved', 'Closed'];

  // Source: line 1308 — known shorthand tokens the team actually uses.
  const KNOWN_SHORTHAND = ['OD', 'MD', 'S2T', 'T2T', 'O2O', 'G2O', 'O2G', 'GD', 'SPO', 'SP', 'O365', 'GW', 'SFDC', 'G2T', 'T2G', 'OD2OD', 'MD2MD'];

  // Source: lines 1309-1321 (regex .source strings so this stays JSON-safe / shareable)
  const SECRET_PATTERNS = [
    { label: 'client ID', source: 'client[\\s_-]?id', flags: 'i' },
    { label: 'client secret', source: 'client[\\s_-]?secret', flags: 'i' },
    { label: 'password', source: '\\bpassword\\b', flags: 'i' },
    { label: 'passwd', source: '\\bpasswd\\b', flags: 'i' },
    { label: 'pwd', source: '\\bpwd\\b', flags: 'i' },
    { label: 'secret key', source: 'secret[\\s_-]?key', flags: 'i' },
    { label: 'API key', source: 'api[\\s_-]?key', flags: 'i' },
    { label: 'access token', source: 'access[\\s_-]?token', flags: 'i' },
    { label: 'bearer token', source: '\\bbearer\\s+[A-Za-z0-9\\-_.]{10,}', flags: 'i' },
    { label: 'connection string', source: 'connection[\\s_-]?string', flags: 'i' },
    { label: 'private key', source: '\\bprivate[\\s_-]?key\\b', flags: 'i' },
  ];
  const SECRET_VALUE_AFTER_SOURCE = '[:=]\\s*["\'`]?[A-Za-z0-9\\-_.\\/+]{6,}["\'`]?';

  // Source: line 1322
  const STOPWORDS = ['the','and','for','with','from','that','this','are','was','were','has','have','not','but','all','any','can','will','please','issue','ticket','team','hi','hello','dear','into','onto','your','their','they','them','been','being','also','need','some','more','than','when','what','only','make','sure','request'];

  // Source: line 2160 (retry keywords) and 2857-2859 (reopened statuses/cap)
  const RETRY_KEYWORDS = ['retry', 'conflict', 'not moving', 'stuck', 'not picking'];
  // "Reopened" is a real current status value in Neutara Ticketing, so the live path checks
  // current status directly rather than a changelog (NTA doesn't expose status-change
  // history yet — see README limitations).
  const REOPENED_STATUS_NAMES = ['Reopen', 'Reopened'];
  const REOPENED_CAP = 300;

  // Source: line 2147 / 1949
  const ALL_TICKETS_TEAMS = ['ent', 'smb', 'eng', 'qa', 'infra'];
  const WEEKLY_REPORT_TEAMS = ['ent', 'smb', 'eng'];

  const TEAM_TICKETS_CAP = 3000;

  // Source: lines 2405-2426 — Customer Engineering / QA / Infra "team tab" definitions.
  const TEAM_TAB_DEFS = {
    eng: { label: 'Customer Engineering', hasRcaFix: true },
    qa: { label: 'QA', hasRcaFix: false },
    infra: { label: 'Infra', hasRcaFix: false },
  };
  const TEAM_TAB_CAP = 3000;
  const TEAM_TAB_MONTHLY_CAP = 12;

  const DETAIL_FETCH_CAP = 200;
  const SLA_FETCH_CAP = 250;
  const PERSON_DETAIL_CAP = 1000;
  const DESC_PREVIEW_CAP = 3000;

  // Source: lines 4040-4066 — static "Action items" tab content (not pulled live).
  const ACTION_ITEMS = [
    { no: 1, item: 'Achieve Zero SLA Breaches for the July MBR.', owner: 'Mayank' },
    { no: 2, item: 'Implement duplicate ticket detection with an automated popup.', owner: 'Development Team' },
    { no: 3, item: 'Display previously created matching tickets when duplicates are detected.', owner: 'Development Team' },
    { no: 4, item: 'Reduce SLA breach duration by at least 1 hour for the Purple Team.', owner: 'Ops' },
    { no: 5, item: 'By next month content team need work on messaging, messaging team need work on content, and email team need work on email.', owner: 'Developer Team' },
    { no: 6, item: 'Identify the Top 5 repeated tickets along with their count and priority.', owner: 'Mayank' },
    { no: 7, item: 'Add clear troubleshooting and resolution guidelines to ticket responses.', owner: 'Migration Team/Developer Team' },
    { no: 8, item: 'Automatically flag frequently repeated issues.', owner: 'Mayank' },
    { no: 9, item: 'Analyze Highest and High priority issues requiring code fixes.', owner: 'Mayank' },
    { no: 10, item: 'Reduce manual working that can be automated.', owner: 'Development Team' },
    { no: 11, item: 'Implement upgrade notifications where applicable.', owner: 'Development Team' },
    { no: 12, item: 'Reduce bug leakage by strengthening the testing process.', owner: 'QA Team' },
    { no: 13, item: 'Implement cross-combination fixes while deploying in the production.', owner: 'QA Team' },
    { no: 14, item: 'Calendar events migration based on date range.', owner: 'Engineering' },
  ];
  const PERMANENT_FIX_ITEMS = [
    { ticketId: '12912', owner: 'Ravi S.' },
    { ticketId: '13379', owner: 'Akhila' },
    { ticketId: '13198', owner: 'Shivam' },
    { ticketId: '12737', owner: 'Akib' },
    { ticketId: '12596', owner: 'Vamsi' },
    { ticketId: '12589', owner: 'Abhinandan' },
    { ticketId: '12980', owner: 'Vishal' },
    { ticketId: '12955', owner: 'Rehan' },
    { ticketId: '12731', owner: 'Sai Raj' },
  ];

  // Source: lines 4179-4234 — static "RCA Documents" tab content (not pulled live).
  const RCA_DOCUMENTS = [
    { manager: 'Mayank', subManager: 'Abhishek', project: 'ICS Data', title: 'Internal Delay — GCC High compatibility', ticketId: 'L2B-14175, L2B-14758', date: '2026-08-14',
      summary: 'MS Tenant-to-Tenant messaging migration delayed because the customer\'s destination was GCC High, which CloudFuze had no internal test environment for — fixes for cloud add & user authentication had to be built and validated directly against the customer\'s environment across multiple cycles.',
      link: 'https://cloudfuzecom-my.sharepoint.com/personal/jyoshitha_dhannapaneni_cloudfuze_com/Documents/RCA/Mayank/Abhishek/ICS_Data_Internal_Delay_Report.docx' },
    { manager: 'Mayank', subManager: 'Abhishek', project: 'Cumulus Global', title: 'Large File Conflicts (My Drive → My Drive)', ticketId: 'L2B-14833', date: '2026-08-14',
      summary: 'Large files moved to conflict during migration due to Google Drive API rate limiting and max upload size constraints — not a defect in the migration logic. Files were retried and all migrated successfully. Resolved.',
      link: 'https://cloudfuzecom-my.sharepoint.com/personal/jyoshitha_dhannapaneni_cloudfuze_com/Documents/RCA/Mayank/Abhishek/RCA_Cumulus%20Global.docx' },
    { manager: 'Mayank', subManager: 'Abhishikth', project: 'Mercado Libre', title: 'Migration Kick-off to Execution Timeline Delay', date: '2026-08-14',
      summary: 'Large-scale Meta Workplace → Google Chat migration (5.4M DM spaces, 143k users). Delay driven by customer-side cloud add-on/admin config lag and a scope expansion to include Inactive User DMs partway through. In progress, tracking 25–30 more days.',
      link: 'https://cloudfuzecom-my.sharepoint.com/personal/jyoshitha_dhannapaneni_cloudfuze_com/Documents/RCA/Mayank/Abhishikth/RCA_-_Mercado%202.docx' },
    { manager: 'Mayank', subManager: 'Abhishikth', project: 'Vendasta', title: 'Internal Delay — Outlook→Gmail issues', ticketId: 'L2B-12494, L2B-13810, L2B-14979', date: '2026-08-14',
      summary: 'Three issues: emoji subjects showed as encoded text, sender display names were dropped, and Gmail auto-trims trailing spaces in folder names (breaking hierarchy). All three code-fixed, QA-sanity completed, deployed to production.',
      link: 'https://cloudfuzecom-my.sharepoint.com/personal/jyoshitha_dhannapaneni_cloudfuze_com/Documents/RCA/Mayank/Abhishikth/Vendasta.docx' },
    { manager: 'Mayank', subManager: 'Ajay', project: 'Clariness', title: 'Sanity Check Delay (Slack → Teams)', ticketId: 'CFITS-7940, CFITS-7978, L3B-670, QA-1415', date: '2026-08-14',
      summary: 'Teams authentication showed a blank page instead of confirming success, and status stayed "Not Authenticated" in CloudFuze — a config issue, fixed by dev. Timeline stretched ~2 days because QA found a defect needing L3 support over a long weekend. In final client-side validation.',
      link: 'https://cloudfuzecom-my.sharepoint.com/personal/jyoshitha_dhannapaneni_cloudfuze_com/Documents/RCA/Mayank/Ajay/Clariness-RCA_Slack_to_Teams_Migration.docx' },
    { manager: 'Mayank', subManager: 'Ajay', project: 'Dynamo', title: 'RCA — Dynamo', date: '2026-08-14',
      summary: 'Document content couldn\'t be pulled automatically (large file) — open in SharePoint to read the full write-up.',
      link: 'https://cloudfuzecom-my.sharepoint.com/personal/jyoshitha_dhannapaneni_cloudfuze_com/Documents/RCA/Mayank/Ajay/RCA_DYNAMO.docx' },
    { manager: 'Mayank', subManager: 'Ajay', project: 'Gallagher', title: 'Customization Delay (Slack DM migration)', ticketId: 'L2B-14177, CF-29341, L3B-780, L3B-778', date: '2026-08-14',
      summary: 'DM migration for external & semi-orphaned users required custom handling. Requirements arrived in phases rather than upfront, so each new scenario meant another round of analysis, customization and testing — not a defect. All scenarios now handled and deployed to the client environment.',
      link: 'https://cloudfuzecom-my.sharepoint.com/personal/jyoshitha_dhannapaneni_cloudfuze_com/Documents/RCA/Mayank/Ajay/RCA_Gallagher_Migration.docx' },
    { manager: 'Mayank', subManager: 'Harika', project: 'CGNET', title: 'Files Duplicating at Destination Shared Drive', date: '2026-08-14',
      summary: 'SharePoint → Shared Drive / OneDrive → My Drive migration. Root cause: source libraries configured for "major and minor (draft) versions" duplicated files at destination, while "major versions only" libraries didn\'t — a source-side versioning setting, not a migration defect. Closed, client confirmed.',
      link: 'https://cloudfuzecom-my.sharepoint.com/personal/jyoshitha_dhannapaneni_cloudfuze_com/Documents/RCA/Mayank/Harika/RCA_CGNET.docx' },
    { manager: 'Mayank', subManager: 'Lakshmi Prasanna', project: 'Artnet', title: 'Internal Delay — slow folder picking', ticketId: 'L2B-15556', date: '2026-08-14',
      summary: 'In-Place Archive migration via EWS occasionally returned 500 errors with no response, pushing folders into conflict and requiring repeated retries — a server-side issue on the source. Completed.',
      link: 'https://cloudfuzecom-my.sharepoint.com/personal/jyoshitha_dhannapaneni_cloudfuze_com/Documents/RCA/Mayank/Lakshmi%20Prasanna/Artnet.docx' },
    { manager: 'Mayank', subManager: 'Lakshmi Prasanna', project: 'Info Blox', title: 'Escalation — slow folder picking explained', ticketId: 'L2B-15045', date: '2026-08-14',
      summary: 'Folders stuck in IN_PROGRESS/NOT_STARTED were previously-conflicted folders being repicked — repicking re-verifies every already-picked email one by one (a duplicate-prevention safeguard), which naturally takes longer on large folders (50k+ emails). Not an issue; migration completed.',
      link: 'https://cloudfuzecom-my.sharepoint.com/personal/jyoshitha_dhannapaneni_cloudfuze_com/Documents/RCA/Mayank/Lakshmi%20Prasanna/Info%20Blox.docx' },
    { manager: 'Mayank', subManager: 'Lakshmi Prasanna', project: 'LegalSoft', title: 'Native Google Files Migrated as Office Files', ticketId: 'L2B-14699', date: '2026-08-14',
      summary: 'During delta migrations, Google Sheets/Docs/Slides were recreated as .xlsx/.docx/.pptx instead of native Google format. Root cause: the file-type check relied on an extra signal only present on delta scans and skipped the normal native-file check when that signal was present. Fixed on production.',
      link: 'https://cloudfuzecom-my.sharepoint.com/personal/jyoshitha_dhannapaneni_cloudfuze_com/Documents/RCA/Mayank/Lakshmi%20Prasanna/LegalSoft.docx' },
    { manager: 'Mayank', subManager: 'Lakshmi Prasanna', project: 'Marketcast', title: 'Escalation — missing small attachments', ticketId: 'L2B-15742, L2B-15739', date: '2026-08-14',
      summary: 'Email attachments under 25MB were missing at the destination. Root cause: after posting an email, the returned metadata didn\'t include attachment info, so success wasn\'t being confirmed/recorded. Fixed by separately fetching and verifying attachment metadata after posting.',
      link: 'https://cloudfuzecom-my.sharepoint.com/personal/jyoshitha_dhannapaneni_cloudfuze_com/Documents/RCA/Mayank/Lakshmi%20Prasanna/Market%20Cast.docx' },
    { manager: 'Mayank', subManager: 'Lakshmi Prasanna', project: 'NexusOne', title: 'Internal Delay — missing small attachments', ticketId: 'L2B-15085', date: '2026-08-14',
      summary: 'Same root cause as the Marketcast case: attachments under 25MB weren\'t confirmed as posted because the post-email metadata didn\'t include attachment details. Fixed by separately verifying and recording attachment metadata. Completed.',
      link: 'https://cloudfuzecom-my.sharepoint.com/personal/jyoshitha_dhannapaneni_cloudfuze_com/Documents/RCA/Mayank/Lakshmi%20Prasanna/NexusOne.docx' },
    { manager: 'Mayank', subManager: 'Raghu', project: 'Cloudmetric', title: 'Escalation — calendar timezone discrepancy', ticketId: 'L2B-15632', date: '2026-08-14',
      summary: 'Migrated calendar events showed a 1-hour timezone difference. Root cause: Google Calendar and Outlook apply daylight-saving changes differently, affecting only events created in winter — a platform behavior difference, not a migration defect. Explained to client.',
      link: 'https://cloudfuzecom-my.sharepoint.com/personal/jyoshitha_dhannapaneni_cloudfuze_com/Documents/RCA/Mayank/Raghu/cloudmetric.docx' },
    { manager: 'Mayank', subManager: 'Raghu', project: 'Protecht', title: 'Post-Migration Calendar Sync & Data Discrepancy', ticketId: 'L2B-15838', date: '2026-08-14',
      summary: 'Three issues after Google Calendar → Outlook delta migration: DST display shift (platform behavior, not a bug), external-organizer events reassigned to the migrating user by design, and a "last weekday of month" recurring-event bug (now fixed, code-verified). Open, pending customer confirmation.',
      link: 'https://cloudfuzecom-my.sharepoint.com/personal/jyoshitha_dhannapaneni_cloudfuze_com/Documents/RCA/Mayank/Raghu/RCA_Protecht.docx' },
    { manager: 'Mayank', subManager: 'Sravan', project: 'Inversion', title: 'Folder Timestamp Mismatch (Dropbox limitation)', ticketId: 'L2B-14512', date: '2026-08-14',
      summary: 'Folder modified-dates didn\'t match between Dropbox and Google Drive after migration. Root cause: Dropbox\'s API only exposes timestamps for files, not folders, so the migration approximates using the earliest file\'s timestamp — a source-platform limitation, not a defect. Resolved, client accepted the explanation.',
      link: 'https://cloudfuzecom-my.sharepoint.com/personal/jyoshitha_dhannapaneni_cloudfuze_com/Documents/RCA/Mayank/Sravan/Inversion.docx' },
    { manager: 'Mayank', subManager: 'Sravan', project: 'DME Capital', title: 'Permissions Not Appearing Correctly for Migrated User', date: '2026-08-14',
      summary: 'Egnyte → SharePoint Online migration. Permissions and data had actually migrated correctly; the visibility issue was a SharePoint-side check-out file state, cleared by running the check-in/check-out script. A separate handful of files edited near the cutover were re-migrated. Resolved, client confirmed.',
      link: 'https://cloudfuzecom-my.sharepoint.com/personal/jyoshitha_dhannapaneni_cloudfuze_com/Documents/RCA/Mayank/Sravan/RCA_DME_Capital.docx' },
    { manager: 'Mayank', subManager: 'Sravan', project: 'Netd', title: 'Group Display Name Not Preserved (M365 → M365)', ticketId: 'L3B-664', date: '2026-08-14',
      summary: 'Microsoft 365 group migrations used the group\'s mailNickname instead of its real display name. Root cause: the needed preservation logic simply didn\'t exist yet, so it had to be built (not just patched) — validation was also delayed waiting on the customer\'s Azure AD app registration changes. Resolved.',
      link: 'https://cloudfuzecom-my.sharepoint.com/personal/jyoshitha_dhannapaneni_cloudfuze_com/Documents/RCA/Mayank/Sravan/RCA_Netd.docx' },
  ];

  return {
    IMAGE_TYPES, TEAMS, TEAM_LABELS, ALL_KNOWN_EMAILS,
    BLOCKED_STATUSES, WAITING_CUSTOMER_STATUS,
    NEAR_SLA_MS, FILE_DONE_STATUSES, KNOWN_SHORTHAND, SECRET_PATTERNS, SECRET_VALUE_AFTER_SOURCE,
    STOPWORDS, RETRY_KEYWORDS, REOPENED_STATUS_NAMES, REOPENED_CAP,
    ALL_TICKETS_TEAMS, WEEKLY_REPORT_TEAMS, TEAM_TICKETS_CAP,
    TEAM_TAB_DEFS, TEAM_TAB_CAP, TEAM_TAB_MONTHLY_CAP,
    DETAIL_FETCH_CAP, SLA_FETCH_CAP, PERSON_DETAIL_CAP,
    DESC_PREVIEW_CAP, ACTION_ITEMS, PERMANENT_FIX_ITEMS, RCA_DOCUMENTS,
  };
}));
