export const PROJECT_ESCALATIONS = [
  {
    manager: "Sravan Kesaram",
    project: "INVERSON GROUP SERVICES",
    combination: "Dropbox to Google Shared Drive/My Drive",
    issues: "Sanity checks took long time. [QA-1307] Sanitary Testing for NetD Tech Services. [QA-1304] Sanitary Testing for Inversion.",
    phase: "Cloud-adding Done",
  },
  {
    manager: "Sravan Kesaram",
    project: "NETd Tech Services",
    combination: "MS to MS",
    issues: "",
    phase: "Cloud-adding inProgress",
  },
  {
    manager: "Sravan Kesaram",
    project: "INVERSON GROUP SERVICES",
    combination: "Dropbox to Google Shared Drive/MyDrive",
    issues: "Customer changed the CloudFuze portal password and raised a security concern, requesting a separate username, while the migration team requires a different password.",
    phase: "Cloud-adding Done",
  },
  {
    manager: "Sravan Kesaram",
    project: "Botz",
    combination: "Teams to Slack",
    issues: "Due to a Slack import issue, migrated messages will appear at the end in Slack. Due to this, customer has not yet confirmed the migration.",
    phase: "Kick-off Done",
  },
  {
    manager: "Abhishikth",
    project: "Mercado",
    combination: "Meta to Chat",
    issues: "Identifying the total number of DMs has been delayed and currently migration is in progress.",
    phase: "One time migration",
  },
  {
    manager: "Abhishikth",
    project: "Estee",
    combination: "Dropbox to Sharepoint/OneDrive",
    issues: "Permissions limitation has been observed due to SharePoint.",
    phase: "Validation/Post migration support",
  },
  {
    manager: "Abhishek",
    project: "Cumulus Global",
    combination: "Google to Google",
    issues: "Long size files — dev had no clarity and shared a competitor's blog as a Google limitation. After multiple loops they were able to migrate.",
    phase: "One time migration",
  },
  {
    manager: "Abhishek",
    project: "Peak Mining",
    combination: "MS to MS",
    issues: "Permissions issue — multiple code changes led to escalations and extension of project.",
    phase: "One time migration",
  },
  {
    manager: "Abhishek",
    project: "ICS Data",
    combination: "MS to MS",
    issues: "These are .us GCC accounts where the existing code was not available — took time to fix the issues and still fixing on the go.",
    phase: "Before Onetime Migration",
  },
  {
    manager: "Lakshmi Prasanna",
    project: "Washington Post",
    combination: "Box to Sharepoint",
    issues: "Drive changes are not up to date which is a blocker for the Delta migration. Delta migration scheduled on 16th May.",
    phase: "One time migration",
  },
  {
    manager: "Lakshmi Prasanna",
    project: "The Perfume Shop",
    combination: "NFS to Sharepoint",
    issues: "Client is stating workbook links are converted which is a default SPO feature. Mismatch of members in groups in the destination.",
    phase: "Pilot Migration",
  },
  {
    manager: "Ajay Singh",
    project: "Manhattan Associates",
    combination: "Slack to Teams",
    issues: "Multiple escalations over 9–10 months: channel replies missing → DEV fixed → pilot showed duplicate replies → DEV fixed → images replaced → DEV fixed → 3 pilot runs → 3rd one-time migration completed successfully.",
    phase: "Completed & decommissioned",
  },
  {
    manager: "Raghu",
    project: "Mountain Christian Church",
    combination: "",
    issues: "Customer inadvertently cancelled a user being migrated while validating reports in Cloud UI. Rectified with Dev team support.",
    phase: "One time migration",
  },
  {
    manager: "Raghu",
    project: "Protech Group",
    combination: "",
    issues: "Customer raised data protection concerns when server details were shared via email for cloud configuration. Asked about MFA mechanisms for data export security.",
    phase: "Cloud-adding",
  },
];

/**
 * Determines which team tab a project escalation belongs to based on its migration combination.
 * Returns "Content Team" | "Email" | "Messaging" | null (if combination is empty/unrecognised)
 */
export function projectTeam(combination) {
  if (!combination || combination.trim() === "") return null;
  const c = combination.toLowerCase().trim();
  if (/slack|teams|meta|google chat|hangout/.test(c)) return "Messaging";
  if (c === "ms to ms") return "Email";
  return "Content Team"; // Dropbox, Box, NFS, Google Drive, SharePoint, OneDrive
}
