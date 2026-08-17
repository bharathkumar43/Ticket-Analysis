// ---------------------------------------------------------------------------
// Team-classification rules — source-agnostic (Node + browser, UMD export).
// Replaces shared/jql.js now that Jira (and its query language) is gone: the two
// genuinely generic helpers (classify/retryMatch) moved here, plus the new
// department->team mapping used for Neutara Ticketing (NTA) data.
// ---------------------------------------------------------------------------
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./constants'));
  } else {
    root.JiraHygieneRules = factory(root.JiraHygieneConstants);
  }
}(typeof self !== 'undefined' ? self : this, function (C) {

  // Classifies an assignee email against the confirmed team rosters in shared/constants.js.
  function classify(email) {
    if (!email) return 'other';
    const e = email.toLowerCase();
    for (const key of Object.keys(C.TEAMS)) {
      if (C.TEAMS[key].includes(e)) return key;
    }
    return 'other';
  }

  function retryMatch(summary) {
    const s = (summary || '').toLowerCase();
    return C.RETRY_KEYWORDS.some(k => s.includes(k));
  }

  // NTA's `current_department` field is the real team-boundary signal (almost every ticket
  // lives under one space, "TESTIN"/CloudFuze Board, so spaceKey can't distinguish teams).
  // Confirmed mapping: Dev -> Customer Engineering, Infra -> Infra, QA -> QA. "Migration"
  // doesn't itself distinguish ENT vs SMB, so it falls back to the email roster (the same
  // mechanism the old CFITS-project logic used). Migration-Customer/Pre-Sales/unknown are
  // left unmapped ('other') until a team decision is made for them.
  function departmentToTeamKey(department, assigneeEmail) {
    switch (department) {
      case 'Dev': return 'eng';
      case 'Infra': return 'infra';
      case 'QA': return 'qa';
      case 'Migration': {
        const rosterTeam = classify(assigneeEmail);
        return (rosterTeam === 'ent' || rosterTeam === 'smb') ? rosterTeam : 'other';
      }
      default: return 'other'; // Migration-Customer, Pre-Sales, null/unknown
    }
  }

  return { classify, retryMatch, departmentToTeamKey };
}));
