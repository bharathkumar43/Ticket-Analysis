// ---------------------------------------------------------------------------
// Scoring / classification logic — ported (with Jira-only pieces replaced once Neutara
// Ticketing became the sole live source) from jira-hygiene-dashboard.html. UMD export
// (Node + browser).
// ---------------------------------------------------------------------------
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./constants'), require('./rules'));
  } else {
    root.JiraHygieneLogic = factory(root.JiraHygieneConstants, root.JiraHygieneRules);
  }
}(typeof self !== 'undefined' ? self : this, function (C, Rules) {

  const SECRET_PATTERNS = C.SECRET_PATTERNS.map(p => ({ label: p.label, re: new RegExp(p.source, p.flags) }));
  const SECRET_VALUE_AFTER = new RegExp(C.SECRET_VALUE_AFTER_SOURCE);
  const STOPWORDS = new Set(C.STOPWORDS);
  const FILE_DONE_STATUSES = new Set(C.FILE_DONE_STATUSES);

  // Source: line 2209-2212
  function emailToName(email) {
    const local = (email || '').split('@')[0];
    return local.split(/[._]/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || email;
  }

  // Source: line 1324-1339
  function looksLikeShortcutSummary(summary) {
    if (!summary) return { flag: false, matched: null };
    const s = summary.trim();
    for (const code of C.KNOWN_SHORTHAND) {
      const escaped = code.replace(/[- ]/g, '[- ]?');
      const re = new RegExp('(^|[^A-Za-z])(' + escaped + ')($|[^A-Za-z])', 'i');
      const m = s.match(re);
      if (m) return { flag: true, matched: m[2] };
    }
    const tokens = s.split(/[\s|/,:;]+/).filter(Boolean);
    const genericShortcode = /^[A-Za-z]{1,4}(2[A-Za-z]{1,4})?$/;
    const shortcodeTokens = tokens.filter(t => genericShortcode.test(t) && t === t.toUpperCase() && t.length <= 6);
    if (shortcodeTokens.length > 0 && tokens.length <= 8) return { flag: true, matched: shortcodeTokens.join(', ') };
    return { flag: false, matched: null };
  }

  // Source: line 1354-1365
  function descriptionHasSecrets(desc) {
    if (!desc) return { flag: false, matched: null };
    for (const p of SECRET_PATTERNS) {
      const m = p.re.exec(desc);
      if (!m) continue;
      if (p.label === 'bearer token') return { flag: true, matched: p.label };
      const windowEnd = Math.min(desc.length, m.index + m[0].length + 150);
      const nearby = desc.slice(m.index, windowEnd);
      if (SECRET_VALUE_AFTER.test(nearby)) return { flag: true, matched: p.label };
    }
    return { flag: false, matched: null };
  }

  // Source: line 1372-1377
  function hasProperGreeting(desc) {
    if (!desc) return false;
    const cleaned = desc.replace(/<[^>]*>/g, ' ');
    const head = cleaned.slice(0, 400);
    return /\b(hi|hello|dear|greetings|good morning|good afternoon|good evening)\b\s*[,:]?/i.test(head);
  }

  // Source: line 1379-1381
  function extractKeywords(text) {
    return ((text || '').toLowerCase().match(/[a-z]{4,}/g) || []).filter(w => !STOPWORDS.has(w));
  }

  // Source: line 1386-1393
  function summaryMatchesDescription(summary, desc) {
    const sw = new Set(extractKeywords(summary));
    if (sw.size === 0) return { flag: null, shared: [] };
    const dw = new Set(extractKeywords(desc));
    if (dw.size === 0) return { flag: false, shared: [] };
    const shared = [...sw].filter(w => dw.has(w));
    return { flag: shared.length > 0, shared };
  }

  // A ticket's comment list "qualifies" if at least one comment has real substance (>10
  // chars once whitespace-collapsed). NTA comment bodies are plain strings, unlike Jira's
  // Atlassian Document Format — comments/attachments are empty in every ticket sampled so
  // far, so this currently evaluates to false uniformly (honest "no data", not a bug).
  function hasQualifyingComment(f) {
    const items = (f.comment && f.comment.items) || [];
    if (!items.length) return false;
    return items.some(c => {
      const body = typeof c.body === 'string' ? c.body : (typeof c.text === 'string' ? c.text : '');
      return body.replace(/\s+/g, ' ').trim().length > 10;
    });
  }

  // Per-ticket content classification against a Neutara Ticketing pseudo-issue (the shape
  // lib/ntaMapper.js produces: { key, teamKey, fields:{...}, frb, rb }). Replaces the old
  // Jira-only classifyTicketContent, which relied on Jira's ADF description/comments and
  // Service-Management SLA-cycle custom fields that no longer apply.
  function classifyNtaTicket(issue) {
    const f = issue.fields;
    const summary = f.summary || '';
    const desc = typeof f.description === 'string' ? f.description : '';
    const shortcut = looksLikeShortcutSummary(summary);
    const secrets = descriptionHasSecrets(desc);
    const greeting = desc ? hasProperGreeting(desc) : null;
    const alignment = desc ? summaryMatchesDescription(summary, desc) : { flag: null, shared: [] };
    const clean = !shortcut.flag && !secrets.flag && greeting !== false && alignment.flag !== false;
    const descPreview = desc.length > C.DESC_PREVIEW_CAP
      ? desc.slice(0, C.DESC_PREVIEW_CAP) + '\n\n[...truncated for display...]'
      : desc;

    const isClosed = (f.status && f.status.category) === 'done';
    const statusName = (f.status && f.status.name) || '';
    const properCloseStatus = /^closed$/i.test(statusName) || /^done$/i.test(statusName);
    const closesProperly = isClosed ? (properCloseStatus && hasQualifyingComment(f)) : null;
    const atts = f.attachment || [];
    const hasImageAttachment = atts.some(a => C.IMAGE_TYPES.includes((a.mimeType || '').toLowerCase()));
    const hasScreenshot = isClosed ? hasImageAttachment : null;

    const slaBreached = issue.rb; // NTA's sla_breached boolean, mapped straight through

    const isEngTeam = issue.teamKey === 'eng';
    const rcaText = (f.rootCause || '').trim();
    const fixDescText = (f.fixDescription || '').trim();
    const hasRCA = (isEngTeam && isClosed) ? rcaText.length > 0 : null;
    const hasFixDescription = (isEngTeam && isClosed) ? fixDescText.length > 0 : null;

    return {
      key: issue.key, summary, description: descPreview, project: (f.project && f.project.key) || '',
      teamKey: issue.teamKey,
      shortcutSummary: shortcut.flag, shortcutMatch: shortcut.matched,
      secrets: secrets.flag, secretsMatch: secrets.matched,
      greeting, aligned: alignment.flag, alignedShared: alignment.shared, clean,
      isClosed, statusName, closesProperly, hasScreenshot, slaBreached, hasRCA, hasFixDescription,
    };
  }

  // Source: line 1518-1558
  function computePersonReport(person) {
    const tickets = person.tickets;
    const closedTickets = tickets.filter(t => t.isClosed);
    const openCount = tickets.length - closedTickets.length;

    const slaTracked = tickets.filter(t => t.slaBreached !== null);
    const slaBreachedCount = slaTracked.filter(t => t.slaBreached).length;
    const slaWithinCount = slaTracked.length - slaBreachedCount;
    const slaCompliancePct = slaTracked.length ? Math.round((slaWithinCount / slaTracked.length) * 100) : null;

    const shortcutCount = tickets.filter(t => t.shortcutSummary).length;
    const secretsCount = tickets.filter(t => t.secrets).length;
    const greetingTracked = tickets.filter(t => t.greeting !== null);
    const greetingMissingCount = greetingTracked.filter(t => t.greeting === false).length;
    const alignedTracked = tickets.filter(t => t.aligned !== null);
    const misalignedCount = alignedTracked.filter(t => t.aligned === false).length;

    const closingGoodCount = closedTickets.filter(t => t.closesProperly).length;
    const screenshotGoodCount = closedTickets.filter(t => t.hasScreenshot).length;

    const rcaTracked = closedTickets.filter(t => t.hasRCA !== null);
    const rcaGoodCount = rcaTracked.filter(t => t.hasRCA).length;
    const fixDescTracked = closedTickets.filter(t => t.hasFixDescription !== null);
    const fixDescGoodCount = fixDescTracked.filter(t => t.hasFixDescription).length;

    return {
      totalTickets: tickets.length, openCount, closedCount: closedTickets.length,
      slaTrackedCount: slaTracked.length, slaBreachedCount, slaWithinCount, slaCompliancePct,
      shortcutCount, cleanSummaryCount: tickets.length - shortcutCount, secretsCount,
      greetingTrackedCount: greetingTracked.length, greetingMissingCount,
      alignedTrackedCount: alignedTracked.length, misalignedCount,
      closingGoodCount, closingTotal: closedTickets.length,
      screenshotGoodCount, screenshotTotal: closedTickets.length,
      rcaGoodCount, rcaTrackedCount: rcaTracked.length,
      fixDescGoodCount, fixDescTrackedCount: fixDescTracked.length,
    };
  }

  // Source: line 1560-1618 — Section 5 "Per-person hygiene" score. Operates on the pseudo-
  // issue shape (fields.status.category / fields.duedate / fields.attachment) rather than a
  // raw Jira issue — labels/components (Jira-only concepts) are no longer part of the
  // "missing metadata" check since neither NTA nor the Excel export carry them.
  //
  // Every count also retains the *tickets* behind it (touchedIssues/openIssues/staleIssues/
  // missingIssues/overdueIssues/closedIssues/noClosureIssues/screenshotMissingIssues) so a
  // UI can drill down from any number straight to its underlying tickets.
  function computeHygiene(openTouched, closedInWindow, staleDays) {
    const byPerson = {};
    function ensure(name, email) {
      const key = email || name;
      if (!byPerson[key]) {
        byPerson[key] = {
          name, email, team: Rules.classify(email),
          touched: 0, open: 0, stale: 0, missing: 0, overdue: 0, closed: 0, noClosure: 0, screenshots: 0, closedWithAttachmentCheck: 0,
          touchedIssues: [], openIssues: [], staleIssues: [], missingIssues: [], overdueIssues: [], closedIssues: [], noClosureIssues: [], screenshotMissingIssues: [],
        };
      }
      return byPerson[key];
    }

    for (const issue of openTouched) {
      const f = issue.fields;
      const name = f.assignee ? f.assignee.displayName : 'Unassigned';
      const email = f.assignee ? f.assignee.emailAddress : null;
      const p = ensure(name, email);
      p.touched++;
      p.touchedIssues.push(issue);
      const isOpen = f.status && f.status.category !== 'done';
      if (isOpen) {
        p.open++;
        p.openIssues.push(issue);
        if (!f.priority || !f.duedate) { p.missing++; p.missingIssues.push(issue); }
        if (f.duedate && new Date(f.duedate).getTime() < Date.now()) { p.overdue++; p.overdueIssues.push(issue); }
        const upd = f.updated ? (Date.now() - new Date(f.updated).getTime()) / 86400000 : null;
        if (upd !== null && upd > staleDays) { p.stale++; p.staleIssues.push(issue); }
      }
    }

    for (const issue of closedInWindow) {
      const f = issue.fields;
      const name = f.assignee ? f.assignee.displayName : 'Unassigned';
      const email = f.assignee ? f.assignee.emailAddress : null;
      const p = ensure(name, email);
      p.touched++;
      p.touchedIssues.push(issue);
      p.closed++;
      p.closedIssues.push(issue);
      p.closedWithAttachmentCheck++;
      const statusName = (f.status && f.status.name) || '';
      if (!/^closed$/i.test(statusName) && !/^done$/i.test(statusName)) { p.noClosure++; p.noClosureIssues.push(issue); }
      const atts = f.attachment || [];
      const hasImage = atts.some(a => C.IMAGE_TYPES.includes((a.mimeType || '').toLowerCase()));
      if (hasImage) p.screenshots++;
      else p.screenshotMissingIssues.push(issue);
    }

    const rows = Object.values(byPerson).map(p => {
      let score = 100;
      score -= Math.min(30, p.stale * 5);
      score -= Math.min(20, p.missing * 5);
      score -= Math.min(24, p.overdue * 8);
      score -= Math.min(18, p.noClosure * 6);
      const screenshotMisses = p.closedWithAttachmentCheck - p.screenshots;
      score -= Math.min(30, screenshotMisses * 10);
      score = Math.max(0, Math.round(score));
      const screenshotPct = p.closedWithAttachmentCheck > 0 ? Math.round((p.screenshots / p.closedWithAttachmentCheck) * 100) : null;
      return { ...p, score, screenshotPct };
    });

    return rows.filter(r => r.name !== 'Unassigned' || r.touched > 0);
  }

  // Source: line 1620-1624
  function gradeFor(score) {
    if (score >= 80) return ['great', 'Great'];
    if (score >= 55) return ['ok', 'Needs attention'];
    return ['poor', 'Poor'];
  }

  // Source: line 3367-3380 — per-ticket /100 score (used in the downloadable audit).
  function computeTicketScore(t) {
    let score = 100;
    const issues = [];
    if (t.slaBreached === true) { score -= 10; issues.push('SLA breached'); }
    if (t.shortcutSummary) { score -= 15; issues.push('cryptic/shorthand summary'); }
    if (t.secrets) { score -= 25; issues.push('possible leaked credential in description'); }
    if (t.greeting === false) { score -= 10; issues.push('missing greeting'); }
    if (t.aligned === false) { score -= 10; issues.push("description doesn't match summary"); }
    if (t.isClosed && t.closesProperly === false) { score -= 15; issues.push('improper closure/no closing comment'); }
    if (t.isClosed && t.hasScreenshot === false) { score -= 15; issues.push('no screenshot/attachment evidence'); }
    score = Math.max(0, score);
    const comments = issues.length === 0 ? 'All good' : `Issues: ${issues.join(', ')}`;
    return { score, comments };
  }

  // Source: line 3390-3393
  function toTen(rate) {
    if (rate === null || rate === undefined || !isFinite(rate)) return null;
    return Math.max(0, Math.min(10, Math.round(rate * 10)));
  }

  // Source: line 3395-3461 — factor scorecard used for the DOCX/XLSX exports.
  function computePersonFactorScores(person) {
    const r = computePersonReport(person);
    const factors = [];

    const summaryScore = r.totalTickets ? toTen(r.cleanSummaryCount / r.totalTickets) : null;
    factors.push({
      label: 'Summary Quality', score: summaryScore,
      detail: r.totalTickets
        ? `${r.cleanSummaryCount} of ${r.totalTickets} tickets have a clear, descriptive summary (no shorthand/shortcuts)`
        : 'No tickets to assess',
    });

    const secretsRate = r.totalTickets ? 1 - (r.secretsCount / r.totalTickets) : null;
    const greetingRate = r.greetingTrackedCount ? 1 - (r.greetingMissingCount / r.greetingTrackedCount) : 1;
    const alignedRate = r.alignedTrackedCount ? 1 - (r.misalignedCount / r.alignedTrackedCount) : 1;
    const descScore = secretsRate === null ? null : toTen((secretsRate + greetingRate + alignedRate) / 3);
    const descBits = [];
    if (r.secretsCount > 0) descBits.push(`${r.secretsCount} ticket(s) with a possible leaked credential`);
    if (r.greetingMissingCount > 0) descBits.push(`${r.greetingMissingCount} missing a greeting`);
    if (r.misalignedCount > 0) descBits.push(`${r.misalignedCount} description not aligned with the summary`);
    factors.push({
      label: 'Description Quality', score: descScore,
      detail: !r.totalTickets ? 'No tickets to assess'
        : (descBits.length ? descBits.join('; ') : 'Descriptions are well-formed, aligned with the summary, and free of leaked credentials'),
    });

    const slaScore = r.slaTrackedCount ? toTen(r.slaWithinCount / r.slaTrackedCount) : null;
    factors.push({
      label: 'SLA Compliance', score: slaScore,
      detail: r.slaTrackedCount ? `${r.slaWithinCount} of ${r.slaTrackedCount} tracked tickets closed within SLA` : 'No SLA data tracked',
    });

    const closingScore = r.closingTotal ? toTen(r.closingGoodCount / r.closingTotal) : null;
    factors.push({
      label: 'Closing Comments', score: closingScore,
      detail: r.closingTotal ? `${r.closingGoodCount} of ${r.closingTotal} closed tickets closed with a proper comment` : 'No closed tickets to assess',
    });

    const screenshotScore = r.screenshotTotal ? toTen(r.screenshotGoodCount / r.screenshotTotal) : null;
    factors.push({
      label: 'Screenshot Evidence', score: screenshotScore,
      detail: r.screenshotTotal ? `${r.screenshotGoodCount} of ${r.screenshotTotal} closed tickets have screenshot/attachment evidence` : 'No closed tickets to assess',
    });

    if (person.team === 'eng') {
      const rcaFixScore = r.rcaTrackedCount ? toTen((r.rcaGoodCount + r.fixDescGoodCount) / (r.rcaTrackedCount + r.fixDescTrackedCount)) : null;
      factors.push({
        label: 'RCA & Fix Description', score: rcaFixScore,
        detail: r.rcaTrackedCount
          ? `${r.rcaGoodCount} of ${r.rcaTrackedCount} closed tickets have a Root Cause noted; ${r.fixDescGoodCount} of ${r.fixDescTrackedCount} have a Fix Description`
          : 'No closed tickets in this window to assess',
      });
    }

    const applicable = factors.filter(f => f.score !== null);
    const overallScore100 = applicable.length ? Math.round((applicable.reduce((s, f) => s + f.score, 0) / applicable.length) * 10) : null;
    const rating = overallScore100 === null ? 'N.A.' : (overallScore100 >= 85 ? 'Good' : 'Poor');

    return { factors, overallScore100, rating, totalTickets: r.totalTickets };
  }

  // Source: line 780-798 — pseudo-issue -> classified-ticket mapping used by both the
  // Excel-upload path and (for the parts that carry over) the Live NTA path via
  // classifyNtaTicket above for richer content checks.
  function classifyFileTicket(issue) {
    const f = issue.fields;
    const statusName = (f.status && f.status.name) || '';
    return {
      key: issue.key, summary: f.summary || '', project: (f.project && f.project.key) || '',
      isClosed: FILE_DONE_STATUSES.has(statusName), statusName,
      slaBreached: issue.rb, firstRespBreached: issue.frb,
      assignee: f.assignee ? f.assignee.displayName : 'Unassigned',
      assigneeEmail: f.assignee ? (f.assignee.emailAddress || '').toLowerCase() : '',
      reporterName: f.reporter ? f.reporter.displayName : 'Unknown',
      created: f.created, updated: f.updated, resolutiondate: f.resolutiondate,
    };
  }

  // Source: line 805-812 — genuinely source-agnostic (just filters a pseudo-issue array by
  // teamKey + a created/updated date window), despite the name: used by both the Excel
  // path and the Live NTA path.
  function getFileTicketsForTeam(allTicketsData, teamKey, fromStr, toExclusiveStr) {
    return allTicketsData.filter(issue => {
      if (issue.teamKey !== teamKey) return false;
      const f = issue.fields;
      return (f.created && f.created >= fromStr && f.created < toExclusiveStr) ||
             (f.updated && f.updated >= fromStr && f.updated < toExclusiveStr);
    });
  }

  // Source: line 2492-2516
  function monthBuckets(fromStr, toStr) {
    const buckets = [];
    const rangeStart = new Date(fromStr + 'T00:00:00Z');
    const rangeEnd = new Date(toStr + 'T00:00:00Z');
    const rangeEndExclusive = new Date(rangeEnd.getTime() + 86400000);
    const fmt = d => d.toISOString().slice(0, 10);
    let y = rangeStart.getUTCFullYear(), m = rangeStart.getUTCMonth();
    while (true) {
      const monthStart = new Date(Date.UTC(y, m, 1));
      if (monthStart > rangeEnd) break;
      const monthEndExclusive = new Date(Date.UTC(y, m + 1, 1));
      const bucketFrom = monthStart > rangeStart ? monthStart : rangeStart;
      const bucketToExclusive = monthEndExclusive < rangeEndExclusive ? monthEndExclusive : rangeEndExclusive;
      const bucketToInclusive = new Date(bucketToExclusive.getTime() - 86400000);
      buckets.push({
        label: monthStart.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
        fromStr: fmt(bucketFrom), toStr: fmt(bucketToInclusive), toExclusiveStr: fmt(bucketToExclusive),
      });
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return buckets;
  }

  // Source: line 1953-1966
  function getLastCompletedWeekRange(now) {
    now = now || new Date();
    const daysSinceMonday = (now.getDay() + 6) % 7;
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    thisMonday.setDate(thisMonday.getDate() - daysSinceMonday);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    const lastSunday = new Date(thisMonday);
    lastSunday.setDate(thisMonday.getDate() - 1);
    return { from: lastMonday, to: lastSunday };
  }
  function ymdLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  return {
    emailToName, looksLikeShortcutSummary, descriptionHasSecrets, hasProperGreeting,
    extractKeywords, summaryMatchesDescription, hasQualifyingComment,
    classifyNtaTicket, computePersonReport, computeHygiene, gradeFor,
    computeTicketScore, toTen, computePersonFactorScores, classifyFileTicket,
    getFileTicketsForTeam, monthBuckets, getLastCompletedWeekRange, ymdLocal,
  };
}));
