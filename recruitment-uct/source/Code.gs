var Recruitment = (function() {
  'use strict';
  const copy = x => JSON.parse(JSON.stringify(x));
  const uid = p => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  const now = () => new Date().toISOString();
  const get = (list, id) => {
    const value = list.find(x => x.id === id);
    if (!value) throw new Error('This record is no longer available.');
    return value;
  };
  const label = {
    new: 'Received',
    review: 'Under review',
    shortlisted: 'Shortlisted',
    booked: 'Interview booked',
    interviewed: 'Interview assessed',
    waitlist: 'Waiting list',
    offered: 'Offer prepared',
    accepted: 'Offer accepted',
    appointed: 'Appointed',
    rejected: 'Unsuccessful',
    on_hold: 'Other role on hold',
    closed_other: 'Appointed in other role',
    withdrawn: 'Withdrawn'
  };
  const active = ['offered', 'accepted', 'appointed'];
  function audit(s, action, applicationId, detail) {
    s.audit.unshift({
      id: uid('evt'),
      at: now(),
      action,
      applicationId: applicationId || null,
      detail,
      actor: s._actor || 'System'
    });
  }
  function mail(s, app, kind, body) {
    const person = get(s.people, app.personId);
    const role = get(s.roles, app.roleId);
    let old = s.messages.find(x => x.appId === app.id && x.kind === kind && ['pending', 'sending', 'delivery_unknown'].includes(x.status));
    if (old) return old;
    let job = {
      id: uid('msg'),
      appId: app.id,
      personId: app.personId,
      roundId: role.roundId,
      kind,
      to: person.email,
      subject: kind + ' · ' + role.title,
      status: 'pending',
      body: body || ('Dear ' + person.name.split(' ')[0] + ',\n\n' + messageBody(kind, role.title) + '\n\nKind regards,\nStay & Connect Recruitment'),
      createdAt: now()
    };
    s.messages.unshift(job);
    return job;
  }
  function messageBody(kind, role) {
    return {
      Receipt: 'We have received your application for ' + role + '. Your application is now available for the recruitment team to review.',
      Invitation: 'You have been shortlisted for ' + role + '. Please use your application portal to select one of the available interview slots.',
      Offer: 'We would like to offer you the ' + role + ' position for this recruitment round. Please accept or decline through your application portal. Only one role can be accepted in this round.',
      Regret: 'Thank you for applying for ' + role + '. Following our review, your application for this role was unsuccessful.',
      Appointment: 'Your appointment to ' + role + ' has been confirmed. The team will communicate the next steps.',
      Information: 'Please provide the additional information requested by the recruitment team for your ' + role + ' application.',
      Booking: 'Your interview booking for ' + role + ' has been recorded. The interview details are available in your application portal.'
    }
    [kind] || 'There is an update to your ' + role + ' application.';
  }
  function person(s, id) {
    return get(s.people, id);
  }
  function role(s, id) {
    return get(s.roles, id);
  }
  function app(s, id) {
    return get(s.applications, id);
  }
  function allocation(s, personId, roundId) {
    return s.allocations.find(x => x.personId === personId && x.roundId === roundId && active.includes(x.status));
  }
  function occupancy(s, roleId) {
    return s.allocations.filter(x => x.roleId === roleId && active.includes(x.status)).length;
  }
  function event(s, a, text) {
    a.timeline.unshift({
      at: now(),
      text
    });
    audit(s, text, a.id, text);
  }
  function eligibility(s, a) {
    if (a.answers.available !== true) return 'Needs review';
    if (role(s, a.roleId).template === 'night' && (a.answers.manualLicence !== true || Number(a.answers.drivingYears) < 2)) return 'Needs review';
    return 'Declared conditions met';
  }
  function checked(s, a) {
    return(a.configuration || role(s, a.roleId)).requirements.filter(x => x.kind !== 'preference').every(x => a.checks[x.id] === true);
  }
  function saveReview(s, id, checks, notes, score) {
    let a = app(s, id);
    if (['appointed', 'closed_other', 'withdrawn'].includes(a.status)) throw new Error('This application is closed.');
    a.checks = copy(checks);
    a.notes = String(notes || '').slice(0, 4000);
    if (score !== undefined) a.score = Number(score);
    if (a.status === 'new') a.status = 'review';
    event(s, a, 'Review saved');
    return a;
  }
  function submit(s, payload) {
    const ids = [...new Set(payload.roleIds || [])];
    if (!ids.length) throw new Error('Select at least one role.');
    if (!payload.name?.trim() || !payload.studentNumber?.trim() || !/^\S+@\S+\.\S+$/.test(payload.email || '')) throw new Error('Add a name, student number and valid email address.');
    for (let id of ids) {
      let r = role(s, id);
      if (r.status !== 'open' || get(s.rounds, r.roundId).status !== 'open' || Date.parse(r.deadline) <= Date.now()) throw new Error('This role is not accepting applications.');
      for (let q of r.questions || []) if (q.required && (payload.custom?.[q.id] === undefined || String(payload.custom[q.id]).trim() === '')) throw new Error('Answer the required question: ' + q.label);
    }
    if (!payload.documents?.length) throw new Error('Upload at least one PDF supporting document.');
    let p = s.people.find(x => x.email.toLowerCase() === payload.email.trim().toLowerCase());
    if (s.people.some(x => x.studentNumber.toUpperCase() === payload.studentNumber.trim().toUpperCase() && x.email.toLowerCase() !== payload.email.trim().toLowerCase())) throw new Error('This applicant identifier is already registered. Contact the recruitment team.');
    if (p && p.studentNumber !== payload.studentNumber.trim().toUpperCase()) throw new Error('Use the identifier already registered to your verified email.');
    if (!p) {
      p = {
        id: uid('person'),
        name: payload.name.trim(),
        studentNumber: payload.studentNumber.trim().toUpperCase(),
        email: payload.email.trim(),
        residence: payload.residence || 'Not supplied',
        phone: payload.phone || 'Not supplied',
        experience: payload.experience || 'Not supplied'
      };
      s.people.push(p);
    }
    let result = [];
    for (let id of ids) {
      let existing = s.applications.find(x => x.personId === p.id && x.roleId === id);
      if (existing) {
        result.push(existing);
        continue;
      }
      let r = role(s, id);
      let a = {
        id: uid('app'),
        reference: 'VAC-' + (++ s.sequence),
        personId: p.id,
        roleId: id,
        status: 'new',
        submittedAt: now(),
        answers: {
          available: payload.available === true,
          manualLicence: payload.manualLicence === true,
          drivingYears: Number(payload.drivingYears || 0),
          motivation: String(payload.motivation || ''),
          scenario: String(payload.scenario || ''),
          custom: copy(payload.custom || {})
        },
        documents: copy(payload.documents),
        checks: {},
        notes: '',
        score: null,
        configuration: copy(r),
        timeline: [{
          at: now(),
          text: 'Application received'
        }]
      };
      s.applications.push(a);
      mail(s, a, 'Receipt');
      audit(s, 'Application received', a.id, a.reference + ' · ' + r.title);
      result.push(a);
    }
    return {
      person: p,
      applications: result
    };
  }
  function shortlist(s, id) {
    let a = app(s, id);
    if (!['new', 'review', 'waitlist'].includes(a.status)) throw new Error('This application cannot be shortlisted from its current stage.');
    if (!checked(s, a) || eligibility(s, a) !== 'Declared conditions met') throw new Error('Complete the required evidence checks and resolve eligibility before shortlisting.');
    a.status = 'shortlisted';
    mail(s, a, 'Invitation');
    event(s, a, 'Shortlisted for interview');
    return a;
  }
  function requestInfo(s, id, detail) {
    let a = app(s, id);
    if (['offered', 'accepted', 'appointed', 'on_hold', 'closed_other', 'withdrawn'].includes(a.status)) throw new Error('This application is closed.');
    a.status = 'review';
    mail(s, a, 'Information', 'Dear ' + person(s, a.personId).name.split(' ')[0] + ',\n\nFor your ' + role(s, a.roleId).title + ' application, please provide:\n' + detail + '\n\nKind regards,\nStay & Connect Recruitment');
    event(s, a, 'Further information requested');
  }
  function reject(s, id, reason) {
    let a = app(s, id);
    if (['appointed', 'accepted', 'closed_other', 'offered'].includes(a.status)) throw new Error('Resolve the active offer or appointment before changing this outcome.');
    a.status = 'rejected';
    a.reason = reason;
    mail(s, a, 'Regret');
    event(s, a, 'Unsuccessful · ' + reason);
  }
  function waitlist(s, id) {
    let a = app(s, id);
    if (!['interviewed', 'review', 'shortlisted'].includes(a.status)) throw new Error('Assess this application before placing it on the waiting list.');
    a.status = 'waitlist';
    event(s, a, 'Added to waiting list');
  }
  function interview(s, id, score, notes) {
    let a = app(s, id);
    if (!['booked', 'shortlisted'].includes(a.status)) throw new Error('This application is not at the interview stage.');
    if (!Number.isFinite(Number(score)) || score < 1 || score > 5) throw new Error('Use an assessment rating from 1 to 5.');
    a.status = 'interviewed';
    a.score = Number(score);
    a.notes = String(notes || a.notes || '');
    event(s, a, 'Interview assessment recorded');
  }
  function prepareOffer(s, id) {
    let a = app(s, id), r = role(s, a.roleId);
    const existing = allocation(s, a.personId, r.roundId);
    if (existing && existing.appId !== id) throw new Error('One-role rule: ' + person(s, a.personId).name + ' already has an active ' + role(s, existing.roleId).title + ' offer or appointment. Resolve it before offering another role.');
    if (existing) return existing;
    if (!['interviewed', 'waitlist'].includes(a.status)) throw new Error('Record the interview assessment before preparing an offer.');
    if (!checked(s, a) || eligibility(s, a) !== 'Declared conditions met') throw new Error('Complete the required verification checks first.');
    if (occupancy(s, r.id) >= r.capacity) throw new Error('All positions for this role are currently reserved or appointed.');
    const placement = {
      id: uid('placement'),
      personId: a.personId,
      roundId: r.roundId,
      appId: id,
      roleId: r.id,
      status: 'offered'
    };
    s.allocations.push(placement);
    a.status = 'offered';
    for (let other of s.applications.filter(x => x.personId === a.personId && x.id !== id && role(s, x.roleId).roundId === r.roundId && !['rejected', 'withdrawn', 'closed_other'].includes(x.status))) {
      other.previousStatus = other.status;
      other.status = 'on_hold';
      event(s, other, 'On hold while another role is offered');
    }
    mail(s, a, 'Offer');
    event(s, a, 'One role reserved · offer prepared');
    return placement;
  }
  function accept(s, id) {
    let a = app(s, id), r = role(s, a.roleId), place = allocation(s, a.personId, r.roundId);
    if (!place || place.appId !== id) throw new Error('This is not the active offer for this round.');
    if (place.status === 'accepted' || place.status === 'appointed') return place;
    if (!s.messages.some(m => m.appId === id && m.kind === 'Offer' && m.status === 'sent')) throw new Error('The offer has not been released yet.');
    place.status = 'accepted';
    a.status = 'accepted';
    event(s, a, 'Candidate accepted the offer');
    return place;
  }
  function appoint(s, id) {
    let a = app(s, id), r = role(s, a.roleId), place = allocation(s, a.personId, r.roundId);
    if (!place || place.appId !== id || !['accepted', 'appointed'].includes(place.status)) throw new Error('The candidate must accept the active offer first.');
    if (place.status === 'appointed') return place;
    place.status = 'appointed';
    a.status = 'appointed';
    for (let other of s.applications.filter(x => x.personId === a.personId && x.id !== id && role(s, x.roleId).roundId === r.roundId && !['withdrawn', 'closed_other'].includes(x.status))) {
      other.status = 'closed_other';
      other.reason = 'Appointed in another role';
      event(s, other, 'Closed · appointed in ' + r.title);
      for (let job of s.messages.filter(m => m.appId === other.id && m.status === 'pending')) job.status = 'cancelled';
    }
    mail(s, a, 'Appointment');
    event(s, a, 'Appointment confirmed');
    return place;
  }
  function decline(s, id) {
    let a = app(s, id), r = role(s, a.roleId), place = allocation(s, a.personId, r.roundId);
    if (!place || place.appId !== id || place.status === 'appointed') throw new Error('An appointed role needs a coordinator-led change.');
    place.status = 'released';
    a.status = 'withdrawn';
    for (let other of s.applications.filter(x => x.personId === a.personId && role(s, x.roleId).roundId === r.roundId && x.status === 'on_hold')) {
      other.status = other.previousStatus || 'interviewed';
      delete other.previousStatus;
      event(s, other, 'Alternative application reopened');
    }
    for (let j of s.messages.filter(m => m.appId === id && m.status === 'pending')) j.status = 'cancelled';
    event(s, a, 'Offer declined · role reservation released');
  }
  function send(s, ids) {
    return sendMessages_(s, ids);
  }
  function availableSlots(s, appId) {
    const a = app(s, appId), r = role(s, a.roleId);
    return s.slots.filter(slot => {
      if (slot.roundId !== r.roundId || (slot.roleId && slot.roleId !== r.id) || Date.parse(slot.start) <= Date.now()) return false;
      const start = Date.parse(slot.start), end = start + slot.duration * 60000;
      return!s.bookings.some(b => {
        if (b.status !== 'confirmed') return false;
        const other = get(s.slots, b.slotId), oa = app(s, b.appId);
        return start < Date.parse(other.start) + other.duration * 60000 && Date.parse(other.start) < end && (other.id === slot.id || oa.personId === a.personId || other.panel.some(member => slot.panel.includes(member)));
      });
    });
  }
  function book(s, appId, slotId) {
    let a = app(s, appId), r = role(s, a.roleId);
    const existing = s.bookings.find(x => x.appId === a.id && x.status === 'confirmed');
    if (existing) {
      if (existing.slotId === slotId) return existing;
      throw new Error('An interview is already booked. Ask the coordinator to reschedule.');
    }
    if (a.status !== 'shortlisted') throw new Error('This application is not ready for booking.');
    if (!s.messages.some(m => m.appId === a.id && m.kind === 'Invitation' && m.status === 'sent')) throw new Error('The interview invitation has not been released yet.');
    let slot = get(s.slots, slotId);
    if (Date.parse(slot.start) <= Date.now()) throw new Error('Choose a future interview slot.');
    if (slot.roundId !== r.roundId || slot.roleId && slot.roleId !== r.id) throw new Error('This slot is not available for this role.');
    if (s.bookings.some(x => x.slotId === slotId && x.status === 'confirmed')) throw new Error('Someone has just taken this slot. Please choose another.');
    const start = Date.parse(slot.start), end = start + slot.duration * 60000;
    for (let b of s.bookings.filter(x => x.status === 'confirmed')) {
      let oa = app(s, b.appId), os = get(s.slots, b.slotId), bs = Date.parse(os.start), be = bs + os.duration * 60000;
      if (start < be && bs < end && (oa.personId === a.personId || os.panel.some(p => slot.panel.includes(p)))) throw new Error('This time overlaps another candidate or panel booking.');
    }
    let booking = {
      id: uid('booking'),
      appId,
      slotId,
      status: 'confirmed',
      calendarState: 'not_created'
    };
    s.bookings.push(booking);
    a.status = 'booked';
    mail(s, a, 'Booking');
    event(s, a, 'Interview slot booked');
    return booking;
  }
  function cancelBooking(s, bookingId) {
    let b = get(s.bookings, bookingId);
    if (b.status !== 'confirmed') return;
    b.status = 'cancelled';
    let a = app(s, b.appId);
    if (a.status === 'booked') a.status = 'shortlisted';
    event(s, a, 'Interview cancelled · slot released');
  }
  function addRole(s, p) {
    const rr = get(s.rounds, p.roundId), template = roleTemplates_()[p.template];
    if (!template || !String(p.title || '').trim() || !Number.isInteger(Number(p.capacity)) || Number(p.capacity) < 1 || Number(p.capacity) > 500) throw new Error('Choose a role template, title and between 1 and 500 positions.');
    if (!Number.isFinite(Date.parse(p.deadline)) || !validPeriod_(p.start, p.end) || Date.parse(p.deadline) > Date.parse(p.end + 'T23:59:59+02:00')) throw new Error('Choose a valid deadline and contract period.');
    if (!Array.isArray(p.team) || !p.team.length || p.team.length > 20) throw new Error('Add at least one reviewer.');
    const requirements = copy(p.requirements || template.requirements), questions = copy(p.questions || []);
    if (!requirements.length || requirements.length > 30 || questions.length > 20) throw new Error('Use 1–30 requirements and no more than 20 additional questions.');
    if (new Set(requirements.map(q => q.id)).size !== requirements.length || new Set(questions.map(q => q.id)).size !== questions.length) throw new Error('Requirement and question identifiers must be unique.');
    for (const q of requirements) if (typeof q.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(q.id) || String(q.label || '').length > 500 || !String(q.label || '').trim() || !['mandatory', 'evidence', 'assessed', 'preference'].includes(q.kind)) throw new Error('A verification requirement is invalid.');
    for (const q of questions) if (typeof q.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(q.id) || String(q.label || '').length > 500 || !String(q.label || '').trim() || !['text', 'number', 'yesno'].includes(q.type)) throw new Error('An additional question is invalid.');
    const r = {
      id: uid('role'),
      roundId: rr.id,
      template: p.template,
      title: String(p.title).trim().slice(0, 150),
      shortTitle: String(p.title).trim().slice(0, 150),
      status: p.status === 'draft' ? 'draft': 'open',
      capacity: Number(p.capacity),
      deadline: p.deadline,
      start: p.start,
      end: p.end,
      description: String(p.description || '').slice(0, 4000),
      team: p.team.map(x => String(x).trim().slice(0, 150)),
      requirements,
      questions
    };
    s.roles.push(r);
    audit(s, r.status === 'draft' ? 'Role saved as draft': 'Role published', null, r.title);
    return r;
  }
  function addRound(s, p) {
    if (!String(p.name || '').trim() || !validPeriod_(p.start, p.end) || !['summer', 'winter', 'internship', 'custom'].includes(p.category)) throw new Error('Add a round name, category and valid contract dates.');
    const r = {
      id: uid('round'),
      name: String(p.name).trim().slice(0, 150),
      season: String(p.season || p.name).slice(0, 150),
      category: p.category,
      start: p.start,
      end: p.end,
      status: 'draft'
    };
    s.rounds.push(r);
    s.activeRoundId = r.id;
    audit(s, 'Recruitment round created', null, r.name);
    return r;
  }
  function publicStatus(s, a) {
    if (a.status === 'offered' && !s.messages.some(m => m.appId === a.id && m.kind === 'Offer' && m.status === 'sent')) return 'Interview assessed';
    if (a.status === 'rejected' && !s.messages.some(m => m.appId === a.id && m.kind === 'Regret' && m.status === 'sent')) return 'Under review';
    return label[a.status] || a.status;
  }
  return {
    copy,
    uid,
    person,
    role,
    app,
    label,
    audit,
    allocation,
    occupancy,
    eligibility,
    checked,
    saveReview,
    submit,
    shortlist,
    requestInfo,
    reject,
    waitlist,
    interview,
    prepareOffer,
    accept,
    appoint,
    decline,
    send,
    availableSlots,
    book,
    cancelBooking,
    addRole,
    addRound,
    publicStatus
  };
})();
/** Stay & Connect recruitment: public application shell, authenticated APIs. */
var LIMITS_ = {
  fileBytes: 2 * 1024 * 1024,
  totalFileBytes: 4 * 1024 * 1024,
  codeMinutes: 10,
  attempts: 5
};
function setupProduction() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email || email !== String(Session.getEffectiveUser().getEmail()).toLowerCase()) throw new Error('Run setupProduction in the editor using the project owner account.');
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty('OWNER_EMAIL') && p.getProperty('OWNER_EMAIL') !== email) throw new Error('Only the configured owner can run setup.');
  return locked_(function() {
    p.setProperty('OWNER_EMAIL', email);
    if (!p.getProperty('AUTH_SECRET')) p.setProperty('AUTH_SECRET', random_() + random_());
    if (!p.getProperty('LIVE_DATABASE_ID')) {
      const book = SpreadsheetApp.create('Stay & Connect — Recruitment accounts and applications');
      const first = book.getSheets()[0];
      first.setName('_State');
      first.appendRow(['Revision', 'Part', 'JSON']);
      book.insertSheet('_Auth').appendRow(['Revision', 'Part', 'JSON']);
      p.setProperty('LIVE_DATABASE_ID', book.getId());
    }
    if (!p.getProperty('LIVE_EVIDENCE_FOLDER_ID')) {
      const folder = DriveApp.createFolder('Stay & Connect — Private recruitment evidence');
      folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      p.setProperty('LIVE_EVIDENCE_FOLDER_ID', folder.getId());
    }
    if (!p.getProperty('LIVE_STATE_POINTER')) saveState_({
      version: 2,
      activeRoundId: null,
      rounds: [],
      roles: [],
      people: [],
      applications: [],
      allocations: [],
      slots: [],
      bookings: [],
      messages: [],
      audit: [],
      sequence: 0,
      _requests: []
    });
    if (!p.getProperty('LIVE_AUTH_POINTER')) writeSnapshot_('_Auth', 'LIVE_AUTH_POINTER', {
      challenges: [],
      sessions: [],
      uploadAttempts: []
    });
    if (!p.getProperty('STAFF_EMAILS')) p.setProperty('STAFF_EMAILS', '[]');
    if (!p.getProperty('CALENDAR_ENABLED')) p.setProperty('CALENDAR_ENABLED', 'false');
    console.log('Setup complete. Live data is separate from the previous showcase database.');
    return {
      ownerEmail: email,
      databaseUrl: 'https://docs.google.com/spreadsheets/d/' + p.getProperty('LIVE_DATABASE_ID') + '/edit'
    };
  });
}
function doGet(e) {
  const page = e && e.parameter && e.parameter.page === 'admin' ? 'Index': 'Applicant';
  let t;
  try {
    t = HtmlService.createTemplateFromFile(page);
  } catch (error) {
    t = HtmlService.createTemplateFromFile(page.toLowerCase());
  }
  t.initialRoundId = String(e && e.parameter && e.parameter.round || '').slice(0, 100);
  return t.evaluate().setTitle('Stay & Connect — Recruitment').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function include_(name) {
  if (!['Brand', 'Styles', 'Client'].includes(name)) throw new Error('Invalid include.');
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
function json_(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}
function props_() {
  return PropertiesService.getScriptProperties();
}
function locked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
function random_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}
function digest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8).map(n => ('0' + (n & 255).toString(16)).slice(-2)).join('');
}
function codeHash_(id, code) {
  return Utilities.computeHmacSha256Signature(id + ':' + code, props_().getProperty('AUTH_SECRET')).map(n => ('0' + (n & 255).toString(16)).slice(-2)).join('');
}
function same_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function email_(value) {
  const e = String(value || '').trim().toLowerCase();
  if (!/^[^\s@<>]{1,128}@[^\s@<>]+\.[^\s@<>]+$/.test(e) || e.length > 254) throw new Error('Enter a valid email address.');
  return e;
}
function validPeriod_(start, end) {
  return /^\d{4}-\d{2}-\d{2}$/.test(start || '') && /^\d{4}-\d{2}-\d{2}$/.test(end || '') && Number.isFinite(Date.parse(start)) && Number.isFinite(Date.parse(end)) && new Date(start).toISOString().slice(0, 10) === start && new Date(end).toISOString().slice(0, 10) === end && start <= end;
}
function roleForEmail_(email) {
  return email === props_().getProperty('OWNER_EMAIL') ? 'owner': JSON.parse(props_().getProperty('STAFF_EMAILS') || '[]').includes(email) ? 'admin': 'applicant';
}
function readSnapshot_(sheetName, key) {
  const p = props_(), pointer = JSON.parse(p.getProperty(key) || 'null');
  if (!pointer || !p.getProperty('LIVE_DATABASE_ID')) throw new Error('Run setupProduction in the Apps Script editor first.');
  const rows = SpreadsheetApp.openById(p.getProperty('LIVE_DATABASE_ID')).getSheetByName(sheetName).getRange(pointer.row, 1, pointer.count, 3).getValues();
  if (rows.some((r, i) => r[0] !== pointer.revision || Number(r[1]) !== i || !String(r[2]).startsWith('JSON:'))) throw new Error('Database snapshot mismatch. Contact the project owner.');
  const data = JSON.parse(rows.map(r => String(r[2]).slice(5)).join(''));
  data._revision = pointer.revision;
  return data;
}
function writeSnapshot_(sheetName, key, data) {
  const p = props_(), sheet = SpreadsheetApp.openById(p.getProperty('LIVE_DATABASE_ID')).getSheetByName(sheetName);
  const revision = Utilities.getUuid();
  data._revision = revision;
  const clean = Recruitment.copy(data);
  delete clean._actor;
  const json = JSON.stringify(clean);
  if (json.length > 4000000) throw new Error('This pilot database has reached its size limit. Archive completed rounds or migrate the database before accepting more applications.');
  const rows = [];
  for (let i = 0; i < json.length;) {
    let end = Math.min(i + 35000, json.length);
    const last = json.charCodeAt(end - 1), next = json.charCodeAt(end);
    if (last >= 0xD800 && last <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) end--;
    rows.push([revision, rows.length, 'JSON:' + json.slice(i, end)]); i = end;
  }
  const row = sheet.getLastRow() + 1;
  if (row + rows.length - 1 > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), Math.max(100, rows.length));
  sheet.getRange(row, 1, rows.length, 3).setNumberFormat('@').setValues(rows);
  SpreadsheetApp.flush();
  p.setProperty(key, JSON.stringify({
    revision,
    row,
    count: rows.length
  }));
  return data;
}
function loadState_() {
  return readSnapshot_('_State', 'LIVE_STATE_POINTER');
}
function saveState_(s) {
  return writeSnapshot_('_State', 'LIVE_STATE_POINTER', s);
}
function authData_() {
  const a = readSnapshot_('_Auth', 'LIVE_AUTH_POINTER'), now = Date.now();
  a.challenges = a.challenges.filter(c => c.created > now - 86400000);
  a.uploadAttempts = (a.uploadAttempts || []).filter(x => x.created > now - 86400000);
  a.sessions = a.sessions.filter(s => s.expires > now && s.lastUsed > now - s.idleMs);
  return a;
}
function saveAuth_(a) {
  return writeSnapshot_('_Auth', 'LIVE_AUTH_POINTER', a);
}
function requestLogin(email) {
  email = email_(email);
  return locked_(function() {
    const a = authData_(), now = Date.now(), recent = a.challenges.filter(c => c.email === email);
    if (recent.some(c => c.created > now - 60000) || recent.filter(c => c.created > now - 3600000).length >= 3 || recent.length >= 6) throw new Error('Too many sign-in requests. Wait before requesting another code.');
    const dayLimit = Math.min(200, Math.max(1, Number(props_().getProperty('LOGIN_DAILY_LIMIT') || 50)));
    if (a.challenges.length >= dayLimit || a.challenges.filter(c => c.created > now - 3600000).length >= 20 || MailApp.getRemainingDailyQuota() <= 20) throw new Error('Email sign-in is temporarily at capacity. Please try later or contact the recruitment team.');
    const id = random_(), code = String(100000 + parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 900000);
    const challenge = {
      id,
      email,
      hash: codeHash_(id, code),
      created: now,
      expires: now + LIMITS_.codeMinutes * 60000,
      attempts: 0,
      used: false,
      sent: false
    };
    a.challenges.push(challenge);
    saveAuth_(a);
    try {
      MailApp.sendEmail({
        to: email,
        subject: 'Your Stay & Connect sign-in code',
        name: 'Stay & Connect Recruitment',
        body: 'Your sign-in code is ' + code + '.\n\nIt expires in 10 minutes. Do not share it. If you did not request this code, ignore this email.'
      });
      challenge.sent = true;
      saveAuth_(a);
    } catch (error) {
      challenge.used = true;
      saveAuth_(a);
      throw new Error('The sign-in email could not be confirmed. Wait one minute before requesting another code.');
    }
    return {
      challengeId: id,
      expiresAt: challenge.expires
    };
  });
}
function verifyLogin(challengeId, code) {
  return locked_(function() {
    const a = authData_(), c = a.challenges.find(x => x.id === String(challengeId || ''));
    if (!c || !c.sent || c.used || c.expires <= Date.now() || c.attempts >= LIMITS_.attempts) throw new Error('The sign-in code is invalid or expired. Request a new code.');
    c.attempts++;
    if (!/^\d{6}$/.test(String(code || '')) || !same_(c.hash, codeHash_(c.id, String(code)))) {
      saveAuth_(a);
      throw new Error('Incorrect sign-in code.');
    }
    c.used = true;
    const token = random_(), role = roleForEmail_(c.email), now = Date.now();
    a.sessions = a.sessions.filter(s => s.email !== c.email || s.created > now - 60000).slice(-500);
    a.sessions.push({
      hash: digest_(token),
      email: c.email,
      issuedRole: role,
      created: now,
      lastUsed: now,
      expires: now + (role === 'applicant' ? 8: 2) * 3600000,
      idleMs: (role === 'applicant' ? 120: 30) * 60000
    });
    saveAuth_(a);
    return {
      token,
      email: c.email,
      role,
      expiresAt: now + (role === 'applicant' ? 8: 2) * 3600000
    };
  });
}
function session_(token) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) throw new Error('AUTH_REQUIRED: Sign in to continue.');
  const a = authData_(), hash = digest_(token), s = a.sessions.find(x => same_(x.hash, hash));
  if (!s || s.expires <= Date.now() || s.lastUsed + s.idleMs <= Date.now()) throw new Error('AUTH_REQUIRED: Your session expired. Sign in again.');
  if (s.issuedRole && s.issuedRole !== roleForEmail_(s.email)) throw new Error('AUTH_REQUIRED: Your account access changed. Sign in again.');
  if (s.lastUsed < Date.now() - 60000) {
    s.lastUsed = Date.now();
    saveAuth_(a);
  }
  return {
    email: s.email,
    role: roleForEmail_(s.email)
  };
}
function admin_(token, ownerOnly) {
  let identity;
  if (token) identity = session_(token);
  else {
    const active = String(Session.getActiveUser().getEmail() || '').toLowerCase();
    if (!active || active !== props_().getProperty('OWNER_EMAIL')) throw new Error('AUTH_REQUIRED: Sign in with an authorised administrator email.');
    identity = {
      email: active,
      role: 'owner'
    };
  }
  if (!['owner', 'admin'].includes(identity.role) || ownerOnly && identity.role !== 'owner') throw new Error('Access denied. This action requires an authorised administrator.');
  return identity;
}
function logout(token) {
  return locked_(function() {
    const a = authData_();
    a.sessions = a.sessions.filter(s => !same_(s.hash, digest_(String(token || ''))));
    saveAuth_(a);
    return {
      ok: true
    };
  });
}
function roleTemplates_() {
  return {
    assistant: {
      title: 'Vacation Receptionist / Assistant',
      capacity: 6,
      description: 'Welcome guests, keep reception records and support accommodation operations.',
      requirements: [
        {
          id: 'availability',
          kind: 'mandatory',
          label: 'Available for the contract period and required shifts'
        },
        {
          id: 'documents',
          kind: 'evidence',
          label: 'Supporting application documents verified'
        },
        {
          id: 'customer',
          kind: 'assessed',
          label: 'Customer care and administrative judgement assessed'
        },
        {
          id: 'residence',
          kind: 'preference',
          label: 'Residence knowledge or leadership experience'
        }
      ]
    },
    night: {
      title: 'Night Manager',
      capacity: 2,
      description: 'Coordinate after-hours operations, staff handovers and urgent situations.',
      requirements: [
        {
          id: 'availability',
          kind: 'mandatory',
          label: 'Available for overnight, weekend and holiday shifts'
        },
        {
          id: 'documents',
          kind: 'evidence',
          label: 'CV, motivation, referees and licence evidence verified'
        },
        {
          id: 'licence',
          kind: 'mandatory',
          label: 'Valid manual licence and at least two years manual driving experience'
        },
        {
          id: 'operations',
          kind: 'assessed',
          label: 'Accommodation experience and reporting judgement assessed'
        }
      ]
    },
    intern: {
      title: 'Intern',
      capacity: 2,
      description: 'Develop practical skills through supervised work and learning.',
      requirements: [
        {
          id: 'availability',
          kind: 'mandatory',
          label: 'Available for the internship period'
        },
        {
          id: 'documents',
          kind: 'evidence',
          label: 'CV and requested supporting documents verified'
        },
        {
          id: 'skills',
          kind: 'assessed',
          label: 'Skills and motivation assessed'
        }
      ]
    },
    custom: {
      title: 'Custom role',
      capacity: 1,
      description: '',
      requirements: [
        {
          id: 'availability',
          kind: 'mandatory',
          label: 'Available for the role period'
        },
        {
          id: 'documents',
          kind: 'evidence',
          label: 'Requested supporting documents verified'
        }
      ]
    }
  };
}
function getConfig_(identity) {
  const p = props_();
  return {
    ownerEmail: p.getProperty('OWNER_EMAIL'),
    actorEmail: identity.email,
    isOwner: identity.role === 'owner',
    emailMode: 'LIVE',
    calendarEnabled: p.getProperty('CALENDAR_ENABLED') === 'true',
    applicantUrl: p.getProperty('APPLICANT_URL') || '',
    contactEmail: p.getProperty('CONTACT_EMAIL') || '',
    staffEmails: JSON.parse(p.getProperty('STAFF_EMAILS') || '[]'),
    templates: roleTemplates_(),
    databaseUrl: 'https://docs.google.com/spreadsheets/d/' + p.getProperty('LIVE_DATABASE_ID') + '/edit',
    folderUrl: 'https://drive.google.com/drive/folders/' + p.getProperty('LIVE_EVIDENCE_FOLDER_ID')
  };
}
function adminView_(s) {
  const view = Recruitment.copy(s);
  delete view._requests;
  delete view._actor;
  view.roles.forEach(r => r._ui = {
    occupancy: Recruitment.occupancy(s, r.id)
  });
  view.applications.forEach(a => a._ui = {
    eligibility: Recruitment.eligibility(s, a),
    checked: Recruitment.checked(s, a),
    publicStatus: Recruitment.publicStatus(s, a)
  });
  return view;
}
function getShowcase(token) {
  return locked_(function() {
    const identity = admin_(token);
    return {
      state: adminView_(loadState_()),
      config: getConfig_(identity)
    };
  });
}
function publicRole_(r) {
  return {
    id: r.id,
    roundId: r.roundId,
    template: r.template,
    title: r.title,
    shortTitle: r.shortTitle,
    description: r.description,
    capacity: r.capacity,
    deadline: r.deadline,
    start: r.start,
    end: r.end,
    requirements: r.requirements.map(q => ({
      id: q.id,
      kind: q.kind,
      label: q.label
    })),
    questions: r.questions
  };
}
function getPublicOpportunities() {
  const s = loadState_(), configured = !!props_().getProperty('APPLICANT_URL');
  const rounds = configured ? s.rounds.filter(r => r.status === 'open').map(r => ({
    id: r.id,
    name: r.name,
    season: r.season,
    category: r.category,
    start: r.start,
    end: r.end
  })): [];
  return {
    rounds,
    roles: s.roles.filter(r => rounds.some(x => x.id === r.roundId) && r.status === 'open' && Date.parse(r.deadline) > Date.now()).map(publicRole_),
    contactEmail: props_().getProperty('CONTACT_EMAIL') || '',
    ready: configured
  };
}
function ownApp_(s, identity, id) {
  const a = Recruitment.app(s, id), p = Recruitment.person(s, a.personId);
  if (p.email.toLowerCase() !== identity.email) throw new Error('Application not available for this account.');
  return a;
}
function candidateView_(s, identity) {
  const p = s.people.find(p => p.email.toLowerCase() === identity.email);
  return {
    email: identity.email,
    person: p ? {
      name: p.name,
      studentNumber: p.studentNumber,
      residence: p.residence,
      phone: p.phone,
      experience: p.experience
    }
    : null,
    applications: p ? s.applications.filter(a => a.personId === p.id).map(a => {
      const r = Recruitment.role(s, a.roleId), round = s.rounds.find(x => x.id === r.roundId), booking = s.bookings.find(b => b.appId === a.id && b.status === 'confirmed');
      const invitation = s.messages.some(m => m.appId === a.id && m.kind === 'Invitation' && m.status === 'sent'), offered = a.status === 'offered' && s.messages.some(m => m.appId === a.id && m.kind === 'Offer' && m.status === 'sent');
      return {
        id: a.id,
        reference: a.reference,
        role: publicRole_(a.configuration || r),
        roundName: round.name,
        status: Recruitment.publicStatus(s, a),
        submittedAt: a.submittedAt,
        answers: a.answers,
        documents: a.documents.map((d, i) => ({
          name: d.name,
          index: i,
          size: d.size || null
        })),
        canBook: a.status === 'shortlisted' && invitation,
        canAccept: offered,
        canDecline: offered || a.status === 'accepted',
        canUpdate: ['new', 'review'].includes(a.status),
        canWithdraw: ['new', 'review', 'shortlisted', 'booked', 'interviewed', 'waitlist', 'on_hold'].includes(a.status),
        informationRequest: a.informationRequest || '',
        booking: booking ? {
          id: booking.id,
          start: s.slots.find(x => x.id === booking.slotId).start,
          duration: s.slots.find(x => x.id === booking.slotId).duration,
          panel: s.slots.find(x => x.id === booking.slotId).panel,
          location: s.slots.find(x => x.id === booking.slotId).location || '',
          meetingUrl: s.slots.find(x => x.id === booking.slotId).meetingUrl || ''
        }
        : null
      };
    }): []
  };
}
function getApplicantHome(token) {
  return locked_(function() {
    const identity = session_(token);
    return candidateView_(loadState_(), identity);
  });
}
function getApplicantSlots(token, appId) {
  return locked_(function() {
    const identity = session_(token), s = loadState_(), a = ownApp_(s, identity, appId);
    if (a.status !== 'shortlisted' || !s.messages.some(m => m.appId === a.id && m.kind === 'Invitation' && m.status === 'sent')) throw new Error('An interview invitation must be released first.');
    return Recruitment.availableSlots(s, appId).map(x => ({
      id: x.id,
      start: x.start,
      duration: x.duration,
      panel: x.panel,
      location: x.location || '',
      meetingUrl: x.meetingUrl || ''
    }));
  });
}
function requestKey_(identity, action, id, payload) {
  if (!/^[-a-zA-Z0-9_]{8,100}$/.test(String(id || ''))) throw new Error('Invalid request identifier.');
  return {
    key: digest_(identity.email + '|' + action + '|' + id),
    fingerprint: digest_(JSON.stringify(payload))
  };
}
function priorRequest_(s, key) {
  const old = (s._requests || []).find(x => x.key === key.key);
  if (old && old.fingerprint !== key.fingerprint) throw new Error('The request identifier was reused for different data.');
  return old;
}
function remember_(s, key, result) {
  s._requests = (s._requests || []).slice(-299);
  s._requests.push({
    key: key.key,
    fingerprint: key.fingerprint,
    result: Recruitment.copy(result === undefined ? null: result)
  });
}
function uploadRate_(identity) {
  const a = authData_(), now = Date.now(), mine = a.uploadAttempts.filter(x => x.email === identity.email);
  if (mine.length >= 6 || mine.filter(x => x.created > now - 3600000).length >= 3 || a.uploadAttempts.length >= 50 || a.uploadAttempts.filter(x => x.created > now - 3600000).length >= 20) throw new Error('The document upload limit has been reached. Wait before trying again or contact recruitment.');
  a.uploadAttempts.push({
    email: identity.email,
    created: now
  });
  saveAuth_(a);
}
function persistWithDocs_(s, documents) {
  try {
    return saveState_(s);
  } catch (error) {
    try {
      const referenced = new Set(loadState_().applications.flatMap(a => a.documents.map(d => d.fileId)));
      for (const d of documents) if (!referenced.has(d.fileId)) DriveApp.getFileById(d.fileId).setTrashed(true);
    } catch (cleanupError) {}
    throw error;
  }
}
function checkedUploads_(uploads) {
  if (!Array.isArray(uploads) || !uploads.length || uploads.length > 3) throw new Error('Upload 1–3 PDF files.');
  let total = 0;
  return uploads.map(d => {
    if (!d || typeof d.base64 !== 'string' || d.base64.length > 2800000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(d.base64)) throw new Error('Invalid PDF upload.');
    const bytes = Utilities.base64Decode(d.base64);
    total += bytes.length;
    if (bytes.length < 5 || bytes.length > LIMITS_.fileBytes || String.fromCharCode.apply(null, bytes.slice(0, 5).map(n => n & 255)) !== '%PDF-') throw new Error('Only PDF files up to 2 MB are supported.');
    if (total > LIMITS_.totalFileBytes) throw new Error('Combined uploads must be under 4 MB.');
    return {
      name: String(d.name || 'document.pdf').replace(/[^\w .()-]/g, '_').slice(0, 120),
      size: bytes.length,
      bytes
    };
  });
}
function validateAnswers_(p, roles) {
  for (const k of['name', 'studentNumber', 'phone', 'residence', 'experience', 'motivation', 'scenario']) if (typeof p[k] !== 'string' || p[k].length > 4000) throw new Error('An application field is missing or too long.');
  if (!p.name.trim() || !p.studentNumber.trim() || !p.motivation.trim() || !p.scenario.trim() || !Number.isFinite(Number(p.drivingYears || 0)) || Number(p.drivingYears || 0) < 0 || Number(p.drivingYears || 0) > 80) throw new Error('Complete the required application fields.');
  if (p.custom !== undefined && (!p.custom || typeof p.custom !== 'object' || Array.isArray(p.custom))) throw new Error('Invalid custom answers.');
  for (const role of roles) for (const q of role.questions || []) {
    const v = p.custom && p.custom[q.id];
    if (q.required && (v === undefined || String(v).trim() === '')) throw new Error('Answer: ' + q.label);
    if (v !== undefined && String(v).length > 2000) throw new Error('An additional answer is too long.');
    if (v !== undefined && String(v).trim() !== '' && q.type === 'number' && !Number.isFinite(Number(v))) throw new Error('Use a number for: ' + q.label);
    if (v !== undefined && String(v).trim() !== '' && q.type === 'yesno' && !['Yes', 'No'].includes(v)) throw new Error('Choose Yes or No for: ' + q.label);
  }
}
function storeUploads_(uploads, reference) {
  const created = [];
  try {
    return uploads.map(d => {
      const f = DriveApp.getFolderById(props_().getProperty('LIVE_EVIDENCE_FOLDER_ID')).createFile(Utilities.newBlob(d.bytes, 'application/pdf', reference + ' — ' + d.name));
      created.push(f);
      return {
        name: d.name,
        size: d.size,
        fileId: f.getId()
      };
    });
  } catch (error) {
    created.forEach(f => {
      try {
        f.setTrashed(true);
      } catch (cleanupError) {}
    });
    throw error;
  }
}
function submitApplicantApplication(token, payload, requestId) {
  return locked_(function() {
    const identity = session_(token), s = loadState_();
    s._actor = identity.email;
    const key = requestKey_(identity, 'submit', requestId, payload), old = priorRequest_(s, key);
    if (old) return old.result;
    if (!payload || !Array.isArray(payload.roleIds) || !payload.roleIds.length || payload.roleIds.length > 6) throw new Error('Select 1–6 roles from one round.');
    const roles = [...new Set(payload.roleIds)].map(id => Recruitment.role(s, id));
    if (new Set(roles.map(r => r.roundId)).size !== 1) throw new Error('Apply to one recruitment round at a time.');
    if (!props_().getProperty('APPLICANT_URL')) throw new Error('The applicant portal is not configured yet.');
    validateAnswers_(payload, roles);
    if (payload.dataUseAcknowledged !== true) throw new Error('Confirm how your application information will be used.');
    const person = s.people.find(p => p.email.toLowerCase() === identity.email);
    if (person && roles.some(r => s.applications.some(a => a.personId === person.id && a.roleId === r.id))) throw new Error('You already applied to a selected role. Review it under My applications.');
    if (person && s.applications.filter(a => a.personId === person.id && Date.parse(a.submittedAt) > Date.now() - 86400000).length >= 6) throw new Error('You have reached the daily application limit.');
    uploadRate_(identity);
    const uploads = checkedUploads_(payload.documents);
    const safe = {
      name: payload.name.trim(),
      studentNumber: payload.studentNumber.trim(),
      email: identity.email,
      phone: payload.phone,
      residence: payload.residence,
      experience: payload.experience,
      motivation: payload.motivation,
      scenario: payload.scenario,
      available: payload.available === true,
      manualLicence: payload.manualLicence === true,
      drivingYears: Number(payload.drivingYears || 0),
      custom: payload.custom || {},
      roleIds: roles.map(r => r.id),
      documents: uploads.map(d => ({
        name: d.name,
        size: d.size
      }))
    };
    const result = Recruitment.submit(s, safe);
    for (const field of ['name','phone','residence','experience']) result.person[field] = safe[field];
    const docs = storeUploads_(uploads, result.applications[0].reference);
    result.applications.forEach(a => {
      a.documents = Recruitment.copy(docs);
      a.dataUseAcknowledgedAt = new Date().toISOString();
    });
    const reply = {
      references: result.applications.map(a => a.reference)
    };
    remember_(s, key, reply);
    persistWithDocs_(s, docs);
    sendMessages_(s, s.messages.filter(m => m.kind === 'Receipt' && result.applications.some(a => a.id === m.appId) && m.status === 'pending').map(m => m.id));
    return reply;
  });
}
function executeApplicantAction(token, action, appId, value, requestId) {
  return locked_(function() {
    const identity = session_(token), s = loadState_();
    s._actor = identity.email;
    let createdDocuments = [];
    const a = ownApp_(s, identity, appId), key = requestKey_(identity, action, requestId, {
      appId,
      value
    }), old = priorRequest_(s, key);
    if (old) return candidateView_(s, identity);
    if (action === 'book') {
      const b = Recruitment.book(s, appId, String(value));
      calendarCreate_(s, b);
    } else if (action === 'accept') Recruitment.accept(s, appId);
    else if (action === 'decline') Recruitment.decline(s, appId);
    else if (action === 'withdraw') {
      if (!['new', 'review', 'shortlisted', 'booked', 'interviewed', 'waitlist', 'on_hold'].includes(a.status)) throw new Error('This application cannot be withdrawn from its current stage.');
      a.status = 'withdrawn';
      for (const b of s.bookings.filter(b => b.appId === a.id && b.status === 'confirmed')) {
        Recruitment.cancelBooking(s, b.id);
        calendarRemove_(b);
      }
      for (const m of s.messages.filter(m => m.appId === a.id && m.status === 'pending')) m.status = 'cancelled';
      Recruitment.audit(s, 'Application withdrawn', a.id, a.reference);
    } else if (action === 'update') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid application update.');
      if (!['new', 'review'].includes(a.status)) throw new Error('Updates are closed after shortlisting. Contact the recruitment team.');
      const r = a.configuration || Recruitment.role(s, a.roleId), p = Recruitment.person(s, a.personId);
      validateAnswers_({
        ...value,
        name: p.name,
        studentNumber: p.studentNumber,
        phone: p.phone,
        residence: p.residence,
        experience: p.experience
      }, [r]);
      let documents = [];
      if (value.documents && value.documents.length) {
        if (a.documents.length + value.documents.length > 5) throw new Error('An application can have no more than five documents.');
        uploadRate_(identity);
        documents = storeUploads_(checkedUploads_(value.documents), a.reference);
        createdDocuments = documents;
      }
      a.answers = {
        available: value.available === true,
        manualLicence: value.manualLicence === true,
        drivingYears: Number(value.drivingYears || 0),
        motivation: value.motivation,
        scenario: value.scenario,
        custom: value.custom || {}
      };
      a.documents.push(...documents);
      a.checks = {};
      a.score = null;
      a.status = 'review';
      a.informationRequest = '';
      Recruitment.audit(s, 'Applicant supplied an update', a.id, a.reference);
    } else throw new Error('Unsupported applicant action.');
    remember_(s, key, {
      ok: true
    });
    persistWithDocs_(s, createdDocuments);
    return candidateView_(s, identity);
  });
}
function executeAdminAction(token, action, args, expectedRevision, requestId) {
  return locked_(function() {
    const identity = admin_(token), s = loadState_();
    s._actor = identity.email;
    if (!Array.isArray(args) || JSON.stringify(args).length > 200000) throw new Error('Invalid administrator request.');
    const key = requestKey_(identity, action, requestId, args), old = priorRequest_(s, key);
    if (old) return {
      state: adminView_(s),
      result: old.result,
      config: getConfig_(identity)
    };
    if (s._revision !== expectedRevision) throw new Error('Another user changed the database. Refresh the workspace before saving again.');
    let result;
    const core = [
      'saveReview',
      'shortlist',
      'requestInfo',
      'reject',
      'waitlist',
      'interview',
      'prepareOffer',
      'appoint',
      'cancelBooking',
      'addRole',
      'addRound',
      'send'
    ];
    if (core.includes(action)) {
      if (['requestInfo', 'reject'].includes(action) && (!String(args[1] || '').trim() || String(args[1]).length > 4000)) throw new Error('Provide a reason or information request.');
      result = Recruitment[action].apply(null, [s].concat(args));
      if (action === 'requestInfo') Recruitment.app(s, args[0]).informationRequest = String(args[1]);
      if (action === 'cancelBooking') {
        const b = s.bookings.find(b => b.id === args[0]);
        if (b) calendarRemove_(b);
      }
      if (action === 'reject') for (const b of s.bookings.filter(b => b.appId === args[0] && b.status === 'confirmed')) {
        Recruitment.cancelBooking(s, b.id);
        calendarRemove_(b);
      }
    } else if (action === 'setActiveRound') {
      if (!s.rounds.some(r => r.id === args[0])) throw new Error('Unknown round.');
      s.activeRoundId = args[0];
    } else if (action === 'setRoundStatus') {
      const r = s.rounds.find(r => r.id === args[0]);
      if (!r || !['draft', 'open', 'closed'].includes(args[1])) throw new Error('Invalid round status.');
      if (args[1] === 'open' && (!props_().getProperty('APPLICANT_URL') || !s.roles.some(x => x.roundId === r.id && x.status === 'open' && Date.parse(x.deadline) > Date.now()))) throw new Error('Configure the applicant URL and publish at least one role with a future deadline first.');
      r.status = args[1];
      Recruitment.audit(s, 'Round status changed', null, r.name + ' · ' + r.status);
    } else if (action === 'setRoleStatus') {
      const r = Recruitment.role(s, args[0]);
      if (r.status !== 'open' && Date.parse(r.deadline) <= Date.now()) throw new Error('The deadline has passed. Create a new role with a valid deadline.');
      r.status = r.status === 'open' ? 'closed': 'open';
      Recruitment.audit(s, 'Role status changed', null, r.title + ' · ' + r.status);
    } else if (action === 'addSlot') {
      const v = args[0];
      if (!s.activeRoundId || !Number.isFinite(Date.parse(v.start)) || Date.parse(v.start) <= Date.now() || !Number.isInteger(+v.duration) || +v.duration < 5 || +v.duration > 180 || !Array.isArray(v.panel) || !v.panel.length) throw new Error('Choose a future slot, 5–180 minutes and at least one panel member.');
      if (v.roleId && Recruitment.role(s, v.roleId).roundId !== s.activeRoundId) throw new Error('The role belongs to another round.');
      result = {
        id: Recruitment.uid('slot'),
        roundId: s.activeRoundId,
        start: v.start,
        duration: +v.duration,
        panel: v.panel.map(x => String(x).trim().slice(0, 150)).filter(Boolean),
        roleId: v.roleId || null,
        location: String(v.location || '').trim().slice(0, 300),
        meetingUrl: String(v.meetingUrl || '').trim().slice(0, 1000)
      };
      if (result.meetingUrl && !/^https:\/\/[^\s<>"']+$/.test(result.meetingUrl)) throw new Error('Use an HTTPS meeting link.');
      if (!result.panel.length || result.panel.length > 20) throw new Error('Choose 1–20 panel members.');
      s.slots.push(result);
      Recruitment.audit(s, 'Interview slot added', null, v.start);
    } else if (action === 'correctIdentifier') {
      admin_(token, true);
      const person = Recruitment.person(s, args[0]), identifier = String(args[1] || '').trim().toUpperCase(), reason = String(args[2] || '').trim();
      if (!/^[A-Z0-9_-]{3,40}$/.test(identifier) || !reason || reason.length > 1000) throw new Error('Enter a valid identifier and a reason for the correction.');
      if (s.people.some(p => p.id !== person.id && p.studentNumber === identifier)) throw new Error('Another account uses this identifier. Resolve that record first.');
      if (s.allocations.some(p => p.personId === person.id && ['offered','accepted','appointed'].includes(p.status))) throw new Error('Resolve active offers or appointments before correcting an identifier.');
      const previous = person.studentNumber; person.studentNumber = identifier;
      for (const a of s.applications.filter(a => a.personId === person.id)) a.checks = {};
      Recruitment.audit(s, 'Applicant identifier corrected', null, previous + ' → ' + identifier + ' · ' + reason);
    } else if (action === 'setSettings') {
      admin_(token, true);
      const v = args[0], url = String(v.applicantUrl || '').trim();
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) throw new Error('Paste the applicant deployment URL ending in /exec, without query parameters.');
      const staff = String(v.staffEmails || '').split(/[\s,;]+/).filter(Boolean).map(email_);
      if (staff.length > 20) throw new Error('Use no more than 20 administrator emails.');
      props_().setProperties({
        APPLICANT_URL: url,
        STAFF_EMAILS: JSON.stringify([...new Set(staff)]),
        CONTACT_EMAIL: v.contactEmail ? email_(v.contactEmail): '',
        CALENDAR_ENABLED: v.calendarEnabled ? 'true': 'false'
      });
      Recruitment.audit(s, 'Settings updated', null, 'Applicant URL, staff access, contact and calendar preferences updated');
    } else if (action === 'confirmDelivery') {
      const m = s.messages.find(m => m.id === args[0]);
      if (!m || !['sending', 'delivery_unknown'].includes(m.status)) throw new Error('This message does not require confirmation.');
      m.status = 'sent';
      m.sentAt = new Date().toISOString();
      m.deliveryNote = 'Administrator confirmed delivery in the sending account.';
      Recruitment.audit(s, 'Email delivery confirmed', m.appId, m.kind);
    } else if (action === 'cleanupCalendar') {
      admin_(token, true);
      let removed = 0;
      for (const b of s.bookings.filter(b => b.eventId)) {
        calendarRemove_(b);
        if (!b.eventId) removed++;
      }
      result = {
        removed
      };
    } else throw new Error('Unsupported administrator action.');
    remember_(s, key, result === undefined ? null: result);
    saveState_(s);
    return {
      state: adminView_(s),
      result: result === undefined ? null: result,
      config: getConfig_(identity)
    };
  });
}
function sendMessages_(s, ids) {
  if (!Array.isArray(ids) || ids.length > 30) throw new Error('Release no more than 30 messages at once.');
  let count = 0, cancelled = 0, unknown = 0;
  for (const id of[...new Set(ids)]) {
    const m = s.messages.find(x => x.id === id);
    if (!m) throw new Error('Unknown message.');
    if (m.status !== 'pending') continue;
    const a = Recruitment.app(s, m.appId), r = Recruitment.role(s, a.roleId), place = Recruitment.allocation(s, a.personId, r.roundId);
    const invalid = m.kind === 'Regret' && (a.status !== 'rejected' || !!place) || m.kind === 'Offer' && (!place || place.appId !== a.id || place.status !== 'offered') || m.kind === 'Invitation' && !['shortlisted', 'booked'].includes(a.status) || m.kind === 'Appointment' && a.status !== 'appointed' || m.kind === 'Information' && a.status !== 'review';
    if (invalid) {
      m.status = 'cancelled';
      cancelled++;
      continue;
    }
    if (MailApp.getRemainingDailyQuota() < 1) {
      m.deliveryNote = 'Daily email quota reached. Still queued.';
      continue;
    }
    const url = props_().getProperty('APPLICANT_URL');
    if (!url) {
      m.deliveryNote = 'Configure the applicant deployment URL before releasing messages.';
      continue;
    }
    m.status = 'sending';
    m.attemptedAt = new Date().toISOString();
    m.actualTo = Recruitment.person(s, a.personId).email;
    m.deliveryMode = 'live';
    saveState_(s);
    try {
      const options = {
        to: m.actualTo,
        subject: m.subject,
        body: m.body + '\n\nOpen your application portal and sign in with this email:\n' + url + '?page=apply&round=' + encodeURIComponent(r.roundId),
        name: 'Stay & Connect Recruitment'
      };
      if (props_().getProperty('CONTACT_EMAIL')) options.replyTo = props_().getProperty('CONTACT_EMAIL');
      MailApp.sendEmail(options);
      m.status = 'sent';
      m.sentAt = new Date().toISOString();
      count++;
      Recruitment.audit(s, 'Recruitment email sent', a.id, m.kind);
    } catch (error) {
      m.status = 'delivery_unknown';
      m.deliveryNote = 'Check the sending account before creating a replacement. No automatic resend.';
      unknown++;
    }
    saveState_(s);
  }
  return {
    count,
    cancelled,
    unknown
  };
}
function calendarCreate_(s, b) {
  if (props_().getProperty('CALENDAR_ENABLED') !== 'true' || b.eventId || b.calendarState === 'creation_unknown') return;
  b.calendarState = 'creation_unknown';
  saveState_(s);
  try {
    const a = Recruitment.app(s, b.appId), slot = s.slots.find(x => x.id === b.slotId), start = new Date(slot.start);
    const event = CalendarApp.getDefaultCalendar().createEvent('Stay & Connect interview · ' + Recruitment.person(s, a.personId).name, start, new Date(start.getTime() + slot.duration * 60000), {
      location: slot.location || '',
      description: (slot.meetingUrl ? slot.meetingUrl + ' · ': '') + Recruitment.role(s, a.roleId).title + ' · ' + a.reference + '. Candidate details are in the admin portal. No guests are automatically invited.'
    });
    b.eventId = event.getId();
    b.calendarState = 'created';
  } catch (error) {
    b.calendarError = 'Calendar creation is uncertain. Inspect the owner calendar before creating a replacement.';
  }
}
function calendarRemove_(b) {
  if (!b.eventId) return;
  try {
    const event = CalendarApp.getDefaultCalendar().getEventById(b.eventId);
    if (event) event.deleteEvent();
    delete b.eventId;
    b.calendarState = 'cancelled';
  } catch (error) {
    b.calendarState = 'cancel_failed';
  }
}
function downloadEvidence(token, appId, index, adminMode) {
  return locked_(function() {
    const s = loadState_();
    if (adminMode) admin_(token);
    else ownApp_(s, session_(token), appId);
    const a = Recruitment.app(s, appId);
    if (!Number.isInteger(index) || index < 0 || index >= a.documents.length || !a.documents[index].fileId) throw new Error('Document not available.');
    const d = a.documents[index], blob = DriveApp.getFileById(d.fileId).getBlob();
    if (blob.getBytes().length > LIMITS_.fileBytes) throw new Error('Document exceeds the download limit.');
    return {
      name: d.name,
      base64: Utilities.base64Encode(blob.getBytes()),
      mime: 'application/pdf'
    };
  });
}
function refreshReports(token) {
  return locked_(function() {
    admin_(token);
    const s = loadState_(), book = SpreadsheetApp.openById(props_().getProperty('LIVE_DATABASE_ID'));
    const tables = {
      Applications: [
        ['Reference', 'Name', 'Email', 'Identifier', 'Round', 'Role', 'Stage', 'Rating'],
        ...s.applications.map(a => {
          const p = Recruitment.person(s, a.personId), r = Recruitment.role(s, a.roleId);
          return [
            a.reference,
            p.name,
            p.email,
            p.studentNumber,
            s.rounds.find(x => x.id === r.roundId).name,
            r.title,
            Recruitment.label[a.status],
            a.score || ''
          ];
        })
      ],
      Communications: [
        ['Kind', 'Recipient', 'Status', 'Sent'],
        ...s.messages.map(m => [m.kind, m.actualTo || m.to, m.status, m.sentAt || ''])
      ],
      Activity: [
        ['Time', 'Action', 'Detail', 'Actor'],
        ...s.audit.map(e => [e.at, e.action, e.detail, e.actor])
      ]
    };
    for (const name of Object.keys(tables)) {
      const sheet = book.getSheetByName(name) || book.insertSheet(name), rows = tables[name].map(row => row.map(v => typeof v === 'string' && /^[=+@-]/.test(v) ? "'" + v: v));
      sheet.clearContents();
      if (rows.length > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length - sheet.getMaxRows());
      sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
    }
    return {
      url: book.getUrl()
    };
  });
}
