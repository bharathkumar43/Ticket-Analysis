export const TEAMS = {
  "Content Team": [
    "srinu gudimitla",
    "Adari Venkata Jaswanth",
    "Naved",
    "Vishal Kumar",
    "Rehan Khan",
    "Ravi Kumar Srivastava",
    "Akhila",
    "praveen kumar vancharla",
    "Shiva Amuda",
  ],
  "Messaging": [
    "Shivam Singh",
    "Kantam Hemadasu",
    "MOHD AKIB MOHD RABBANI",
    "vamsi malla",
    "abhinandan kumar",
  ],
  "Email": [
    "Lakshmi Adabala",
    "K N V S Raj Kumar",
    "Pragati Pandey",
  ],
};

export const TEAM_NAMES = Object.keys(TEAMS);

// Case-insensitive lookup: given an assignee name from the Excel,
// return which team they belong to (or null)
const _lower = {};
for (const [team, members] of Object.entries(TEAMS)) {
  for (const m of members) _lower[m.toLowerCase()] = team;
}
export function teamOf(assignee) {
  return _lower[(assignee || "").toLowerCase().trim()] ?? null;
}
