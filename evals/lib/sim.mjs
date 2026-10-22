// The simulated person in a benchmark run: what they say when the agent stops and waits for them.
// Questions asked with AskUserQuestion are answered by answerer.mjs; this covers plain-text turns.
import { existsSync } from 'node:fs';

export const DONE = 'BENCHMARK DONE';

// A browser on this machine hands mailto:, tel: and the like to the owner's real apps (a test once filled in a mail
// in their Outlook), so no build may follow one, submit a form, or open anything through the operating system.
export const NO_HANDOFF = `Never submit a form, and never click, follow or open a mailto:, tel:, sms: or any other non-http link
  in a browser, whatever script drives it: on this machine it goes to the owner's real mail app. Check
  such links by reading their href only. Never open a URL or file with the operating system (start, explorer,
  Start-Process, cmd /c start, open, xdg-open).`;

// Appended to the agent's system prompt. Only the harness rules: the skill decides everything else.
export function rules(work) {
  return [
    `This is a benchmark run of a website skill. The person you work for is simulated, and you work in ${work}: put the new site in its own folder there.`,
    'Questions asked with the question tool are answered at once. Plain-text questions get a reply when your turn ends.',
    'There is no address or host yet, and nothing may be published: never push, deploy or publish, and skip the hosting step.',
    `When the audit (with --draft) says Ready to ship, you are finished: end your last message with the line "${DONE}".`,
    NO_HANDOFF.replace(/\s+/g, ' '),
    'Give that rule, word for word, to any agent you start (a reviewer, for one).',
  ].join(' ');
}

// The whole job for an agent that can't talk to anyone (a subagent started by another session): the skill to
// use, the person's first message and all their answers up front, and where to write what it would have asked.
// lock: a folder that marks the one headless-browser slot a machine shares (made with mkdir, removed with rmdir).
// When a lock helper sits next to it (locked.mjs: waits for the lock, runs one command, always releases), each
// browser script is one call through it; otherwise the agent takes and releases the lock itself.
// site: the folder under work/ that already holds their site (a change request); serve: the command that serves
// their old site (a redesign).
export function task(scenario, work, runDir, lock, { site, serve } = {}) {
  const skill = `${work}/.claude/skills/one-shot-site`.replace(/\\/g, '/');
  const a = scenario.answers || {};
  const l = lock && lock.replace(/\\/g, '/');
  // the owner file marks the lock as this run's, so a script runs, and a release happens, only with its own lock
  const me = scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  const own = `${l}/owner-${me}`;
  const helper = l && `${l.replace(/\/[^/]*\/?$/, '')}/locked.mjs`;
  const helped = helper && existsSync(helper);
  // a reviewer the builder starts runs the skill's browser scripts too, so it gets the same rules
  const forAgents = `How to run on this machine: start every command that runs one of the skill's scripts with ONE_SHOT_HISTORY=off. ${NO_HANDOFF.replace(/\s+/g, ' ')}${helped ? ` One browser at a time: every script that opens a browser runs through the lock helper, one Bash call each, with the Bash tool's timeout set to 600000: ONE_SHOT_HISTORY=off node "${helper}" evals-${me} node <the script and its options>. Exit code 75 means it was busy and nothing ran: run the same command again. Close any preview server you start.` : ''}`;
  const browser = helped
    ? `- One browser at a time on this machine. Every script that opens a browser (look, film, audit, study, mockup,
  photos, images og and icon, palette --sheet) runs through the lock helper, one Bash call each, with the Bash
  tool's timeout set to 600000:
  \`ONE_SHOT_HISTORY=off node "${helper}" evals-${me} node ${skill}/scripts/look.mjs dist --widths 390,1440\`
  It waits for the browser (up to 8 minutes), runs the script and always releases it. Exit code 75 ("Busy … run
  the same command again") means nothing ran: run the same command again. Never start a browser script any other
  way, never touch the lock folder yourself, never run two of these at once, and close any preview server when the
  command ends. To learn a script's options, read the comment at the top of the file: run without arguments, a
  browser script still opens a browser.
`
    : lock
    ? `- One browser at a time on this machine. Every script that opens a browser (look, film, audit, study, mockup,
  photos, images og and icon, palette --sheet) runs inside the shared lock, in two Bash calls, each with the Bash
  tool's timeout set to 600000:
  1. take the lock (it waits 30 s first, so others get a turn between your scripts, and gives up after about 7
     minutes; when it doesn't print "locked", run it again):
     \`for i in $(seq 27); do [ $i -gt 2 ] && mkdir "${l}" 2>/dev/null && { touch "${own}"; echo locked; break; }; sleep 15; done\`
  2. right away, the script and the release in one command, which only runs with your own lock:
     \`if [ -f "${own}" ]; then timeout 540 node … ; code=$?; rm -f "${own}"; rmdir "${l}"; exit $code; else echo "No lock: take it first"; fi\`
  Never run a browser script unless step 1 printed "locked", never remove a lock you didn't take, never run two of
  these at once, and close any preview server when the command ends. To learn a script's options, read the comment
  at the top of the file: run without arguments, a browser script still opens a browser.
`
    : '';
  return `# Benchmark run: ${scenario.name}

You are building a website with the one-shot-site skill, as one run of its benchmark. Read
\`${skill}/SKILL.md\` and follow it step by step, with SKILL_DIR = \`${skill}\`. Use only that copy of
the skill: not the Skill tool, not ~/.claude/skills, not any other checkout.

${site
    ? `Their site is already in \`${work.replace(/\\/g, '/')}/${site}\`: you built it for them earlier with this skill (its brief is in
\`.one-shot/brief.md\` there, its history in git). Work in that folder; don't start a new site.`
    : `Work in \`${work.replace(/\\/g, '/')}\` and put the site in a new folder there.`}
${serve ? `\nTheir current site is served on this machine at http://127.0.0.1:${serve.match(/--port (\d+)/)[1]}/. If it doesn't
answer, start it in the background first (\`${serve}\`) and stop it when you are done.\n` : ''}
## The person

Their first message: "${scenario.query}"

You can't reach them, and nobody else either: never use AskUserQuestion or any other way of asking. Their answers
are below. Each time the skill says to ask something, write the question exactly as you would ask it (multiple
choice, the recommended answer first) into \`${runDir.replace(/\\/g, '/')}/interview.md\`, then take the answer from
below; when the answers don't cover it, take your recommendation and say so there. Each time the skill says to
show them something (variants, sheets, mockups), look at it yourself, note in interview.md what you would show
and ask, and go with your recommendation.

${Object.entries(a).filter(([k]) => k !== 'material').map(([k, v]) => `- ${LABELS[k] || k}: ${v}`).join('\n')}
- Their material: ${a.material || '(none)'}

## Rules for this run

- Nothing gets published: never push, deploy, publish or create a repository anywhere. Skip the step that ships
  the site (hosting and publishing).
- There is no address yet: run the audit with --draft. You are finished when it says Ready to ship.
- The email and web addresses in their material are made up for this benchmark (.example). Use them as given, as
  you would a real one. The audit's made-up-address fail is expected: allow that rule in .one-shot/allow.json, with
  a line in the brief saying why. Allow nothing else to get past the audit.
- This site must not join the machine's history of recent sites (it would steer other runs' first screens):
  start every command that runs one of the skill's scripts with \`ONE_SHOT_HISTORY=off\`, as in
  \`ONE_SHOT_HISTORY=off node ${skill}/scripts/audit.mjs … --draft\`.
- ${NO_HANDOFF}
${browser}- When the skill has you start another agent (the reviewer, for one), it works on this machine too: after the
  lines the skill gives it, add this paragraph word for word${helped ? '' : lock ? ', then the one-browser rule above' : ''}:
  > ${forAgents}
- Keep your scratch files (screenshots, notes, helper scripts) in \`${runDir.replace(/\\/g, '/')}/scratch\`, not in a scratchpad or
  temp folder: other builds run on this machine at the same time.
- End with a short report: the site folder, the audit verdict, and anything that went wrong or was skipped.
`;
}

export const LABELS = { pick: 'When you show options', purpose: "What it's for", feel: 'How it should feel', colours: 'Colours', motion: 'Movement', goal: 'What a visitor should do', extras: 'Extras', languages: 'Languages', likes: 'What I like about that site' };

// state: { replies, materialSent }. Returns the next message, or null when the run should end.
export function reply(scenario, state, lastText = '', maxReplies = 8) {
  if (lastText.includes(DONE) || state.replies >= maxReplies) return null;
  state.replies++;
  if (!state.materialSent) {
    state.materialSent = true;
    const a = scenario.answers || {};
    const picks = Object.entries(a).filter(([k]) => k !== 'material').map(([k, v]) => `${LABELS[k] || k}: ${v}`);
    return [
      picks.length ? `My answers, in case you need them: ${picks.join('. ')}.` : '',
      a.material ? `What I have: ${a.material}` : '',
      'Anything else is up to you.',
    ].filter(Boolean).join('\n\n');
  }
  return 'Looks good. For anything you would ask me, go with what you recommend (for the first screens, your recommended one). Carry on to the end without waiting for me, and don\'t publish anything.';
}
