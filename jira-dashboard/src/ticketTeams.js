// Team rosters for the "Tickets by Team" report — who belongs to which team,
// so open/SLA-breached ticket counts can be grouped automatically by assignee.
export const TICKET_TEAMS = {
  "Customer Engineering": [
    "Lakshmi Adabala", "K N V S Raj Kumar", "Mayank Jain", "Naved", "Ankit",
    "Kantam Hemadasu", "Pragati Pandey", "abhinandan kumar",
    "praveen kumar vancharla", "srinu gudimitla",
    "Adari Venkata Jaswanth", "Asma Karim", "Bhagyashri vitthal deokar",
    "MOHD AKIB MOHD RABBANI", "Ravi Kumar Srivastava", "Shivam Singh",
  ],
  "SMB - Migration Team": [
    "Chinthala Ravi Hemanth", "Vijendar Burgula", "Lakshmi Triveni Meena",
    "Alamuru Ramana Reddy", "dathu", "Devarapu Kota siva",
    "Lakshmi Harika Velidi", "Raghu Kumar", "Abhishek Sakala", "ajay singh",
    "Amulya Anapuram", "Habeebunnisa Begum", "Krotta Neelima",
    "Ranadeep Muddam", "Saikumar Kustapuram", "Sravan Kesaram",
    "sriram ramakrishnan", "swaroop", "Vineetha Yenti",
  ],
  "ENT - Migration Team": [
    "Lakshma Reddy Naredla", "Pallavi K", "Harshith Kaduluri",
    "kondameedi ganesh", "Davidraj Dumpala", "Arun Kandula", "Manoj Bathula",
    "Abhishikth Yenugula", "chandra mouli", "Pranavi", "Chaitanya Gupta",
    "Lakshmi Prasanna",
  ],
};

const _lower = {};
for (const [team, members] of Object.entries(TICKET_TEAMS)) {
  for (const m of members) _lower[m.toLowerCase().trim()] = team;
}

// Case-insensitive lookup: given an assignee name from ticket data,
// return which team they belong to (or null if not rostered).
export function ticketTeamOf(assignee) {
  return _lower[(assignee || "").toLowerCase().trim()] ?? null;
}
