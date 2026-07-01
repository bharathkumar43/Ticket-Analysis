export const MEMBER_PERFORMANCE = [
  // Content Team
  { name: "srinu gudimitla",         team: "Content Team", tickets: 174, resolved: 174, avgResHrs: 55.33,  avgInProgressHrs: 22.89  },
  { name: "Adari Venkata Jaswanth",  team: "Content Team", tickets: 126, resolved: 126, avgResHrs: 36.53,  avgInProgressHrs: 14.99  },
  { name: "Naved",                   team: "Content Team", tickets: 122, resolved: 122, avgResHrs: 49.06,  avgInProgressHrs: 10.29  },
  { name: "Vishal Kumar",            team: "Content Team", tickets: 93,  resolved: 93,  avgResHrs: 94.06,  avgInProgressHrs: 50.51  },
  { name: "Rehan Khan",              team: "Content Team", tickets: 86,  resolved: 86,  avgResHrs: 30.28,  avgInProgressHrs: 8.16   },
  { name: "Ravi Kumar Srivastava",   team: "Content Team", tickets: 80,  resolved: 80,  avgResHrs: 28.72,  avgInProgressHrs: 4.61   },
  { name: "Akhila",                  team: "Content Team", tickets: 71,  resolved: 71,  avgResHrs: 165.53, avgInProgressHrs: 57.43  },
  { name: "praveen kumar vancharla", team: "Content Team", tickets: 48,  resolved: 48,  avgResHrs: 44.67,  avgInProgressHrs: 16.33  },
  { name: "Shiva Amuda",             team: "Content Team", tickets: 4,   resolved: 4,   avgResHrs: 719.27, avgInProgressHrs: 532.79 },
  // Messaging
  { name: "Shivam Singh",            team: "Messaging",    tickets: 66,  resolved: 66,  avgResHrs: 27.13,  avgInProgressHrs: 13.91  },
  { name: "Kantam Hemadasu",         team: "Messaging",    tickets: 55,  resolved: 55,  avgResHrs: 30.09,  avgInProgressHrs: 12.02  },
  { name: "MOHD AKIB MOHD RABBANI",  team: "Messaging",    tickets: 52,  resolved: 52,  avgResHrs: 19.45,  avgInProgressHrs: 3.15   },
  { name: "vamsi malla",             team: "Messaging",    tickets: 38,  resolved: 38,  avgResHrs: 53.88,  avgInProgressHrs: 31.07  },
  { name: "abhinandan kumar",        team: "Messaging",    tickets: 16,  resolved: 16,  avgResHrs: 71.51,  avgInProgressHrs: 17.53  },
  // Email
  { name: "Lakshmi Adabala",         team: "Email",        tickets: 80,  resolved: 80,  avgResHrs: 13.73,  avgInProgressHrs: 2.59   },
  { name: "K N V S Raj Kumar",       team: "Email",        tickets: 63,  resolved: 63,  avgResHrs: 21.82,  avgInProgressHrs: 2.59   },
  { name: "Pragati Pandey",          team: "Email",        tickets: 10,  resolved: 10,  avgResHrs: 511.09, avgInProgressHrs: 323.9  },
];

/** Weighted avg in progress hrs for a team */
export function teamAvgInProgress(teamName) {
  const members = MEMBER_PERFORMANCE.filter((p) => p.team === teamName);
  const totalTickets = members.reduce((s, p) => s + p.tickets, 0);
  if (!totalTickets) return null;
  const weighted = members.reduce((s, p) => s + p.avgInProgressHrs * p.tickets, 0);
  return weighted / totalTickets;
}

/** Lookup a single member by name (case-insensitive) */
export function memberPerf(name) {
  return MEMBER_PERFORMANCE.find((p) => p.name.toLowerCase() === (name || "").toLowerCase()) || null;
}
